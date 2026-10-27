/**
 * Native exact-Q execution trace.
 *
 * This module executes the same expression AST as the core evaluator and
 * records checkpoints at the granularity where the value is actually produced.
 * It does not read Storyboard beats: presentation remains a separate projection.
 */

import type { Matrix } from '../core/matrix.js';
import { Q, formatNumber } from '../core/rational.js';
import type { OperationRecord, OperationType, RuntimeValue } from '../core/protocol.js';
import { parseExpression, evaluateExpression } from '../core/expression.js';
import type { MatrixLibrary } from '../core/expression.js';
import type { NativeCheckpoint, NativeOperation, NativeTrace, RunId, ValueId, ValueSnapshot } from './types.js';

interface BuildNativeTraceOptions {
  runId: RunId;
  expression: string;
  library: MatrixLibrary;
  durationMs?: number;
}

interface NativeContext {
  operations: NativeOperation[];
  checkpoints: Record<string, NativeCheckpoint>;
  values: Record<ValueId, ValueSnapshot>;
  idsByLabel: Map<string, ValueId>;
  granularity: 'operation' | 'cell';
}

const ZERO = Q.of(0);

function cloneMatrix(matrix: Matrix, name = matrix.name): Matrix {
  return {
    name,
    rows: matrix.rows,
    cols: matrix.cols,
    data: matrix.data.map((row) => row.map((cell) => cell)),
  };
}

function snapshotMatrix(matrix: Matrix, id: ValueId, label = matrix.name): ValueSnapshot {
  return {
    id,
    label,
    kind: 'matrix',
    shape: { rows: matrix.rows, cols: matrix.cols },
    dtype: 'Q',
    preview: `${label} · ${matrix.rows}×${matrix.cols}`,
    matrix: cloneMatrix(matrix, label),
  };
}

function snapshotScalar(value: RuntimeValue & { kind: 'scalar' }, id: ValueId): ValueSnapshot {
  return {
    id,
    label: value.label,
    kind: 'scalar',
    dtype: 'Q',
    preview: formatNumber(value.value),
    scalar: formatNumber(value.value),
  };
}

function snapshotValue(value: RuntimeValue, id: ValueId): ValueSnapshot {
  if (value.kind === 'matrix') return snapshotMatrix(value.matrix, id, value.label);
  return snapshotScalar(value, id);
}

function idFor(value: RuntimeValue, context: NativeContext): ValueId {
  const existing = context.idsByLabel.get(value.label);
  if (existing) return existing;
  const id = `native-${context.operations.length}-${value.label}`;
  context.values[id] = snapshotValue(value, id);
  context.idsByLabel.set(value.label, id);
  return id;
}

function makeCheckpoint(
  context: NativeContext,
  operationId: string,
  label: string,
  complete: boolean,
): NativeCheckpoint {
  const index = context.operations.length;
  const matrixValueIds = Object.values(context.values).filter((value) => value.kind === 'matrix').map((value) => value.id);
  const scalarValueIds = Object.values(context.values).filter((value) => value.kind === 'scalar').map((value) => value.id);
  const checkpoint: NativeCheckpoint = {
    id: `checkpoint-${index + 1}`,
    index,
    operationId,
    label,
    values: { ...context.values },
    matrixValueIds,
    scalarValueIds,
    complete,
    createdAtIso: new Date().toISOString(),
  };
  context.checkpoints[checkpoint.id] = checkpoint;
  return checkpoint;
}

function pushOperation(
  context: NativeContext,
  operation: Omit<NativeOperation, 'index' | 'checkpointId'>, 
  complete: boolean,
): void {
  const index = context.operations.length;
  const checkpoint = makeCheckpoint(context, operation.id, operation.label, complete);
  context.operations.push({
    ...operation,
    index,
    checkpointId: checkpoint.id,
    resultValueId: operation.resultValueId ?? checkpoint.matrixValueIds[checkpoint.matrixValueIds.length - 1],
  });
}

function matrixOperand(record: OperationRecord, position: number): Matrix | null {
  const value = record.operands[position];
  return value?.kind === 'matrix' ? value.matrix : null;
}

function partialMatrix(record: OperationRecord, cells: Q[][]): Matrix {
  return {
    name: record.resultValue.kind === 'matrix' ? record.resultValue.label : record.label,
    rows: cells.length,
    cols: cells[0]?.length ?? 0,
    data: cells,
  };
}

function emptyCells(rows: number, cols: number): Q[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ZERO));
}

function matmulCell(a: Matrix, b: Matrix, row: number, col: number): Q {
  let sum = ZERO;
  for (let k = 0; k < a.cols; k++) {
    sum = sum.add((a.data[row]?.[k] ?? ZERO).mul(b.data[k]?.[col] ?? ZERO));
  }
  return sum;
}

function cellValue(record: OperationRecord, row: number, col: number): Q | null {
  const a = matrixOperand(record, 0);
  if (!a) return null;
  if (record.type === 'add' || record.type === 'subtract' || record.type === 'hadamard') {
    const b = matrixOperand(record, 1);
    if (!b) return null;
    const left = a.data[row]?.[col] ?? ZERO;
    const right = b.data[row]?.[col] ?? ZERO;
    if (record.type === 'add') return left.add(right);
    if (record.type === 'subtract') return left.sub(right);
    return left.mul(right);
  }
  if (record.type === 'scale') {
    return (a.data[row]?.[col] ?? ZERO).mul(record.scalar ?? Q.of(1));
  }
  if (record.type === 'transpose') {
    return a.data[col]?.[row] ?? ZERO;
  }
  return null;
}

function canDecompose(record: OperationRecord): boolean {
  if (record.resultValue.kind !== 'matrix') return false;
  if (record.type === 'matmul') {
    const a = matrixOperand(record, 0);
    const b = matrixOperand(record, 1);
    return Boolean(a && b);
  }
  if (record.type === 'add' || record.type === 'subtract' || record.type === 'hadamard') {
    return Boolean(matrixOperand(record, 0) && matrixOperand(record, 1));
  }
  if (record.type === 'scale' || record.type === 'transpose') {
    return Boolean(matrixOperand(record, 0));
  }
  return false;
}

function emitDecomposed(context: NativeContext, record: OperationRecord): void {
  const result = record.resultValue;
  if (result.kind !== 'matrix') return;
  const rows = result.matrix.rows;
  const cols = result.matrix.cols;
  const operandIds = record.operands.map((operand) => idFor(operand, context));
  const cells = emptyCells(rows, cols);
  const resultIdPrefix = `native-op-${context.operations.length}-cell`;
  context.granularity = 'cell';

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const value = record.type === 'matmul'
        ? matmulCell(matrixOperand(record, 0)!, matrixOperand(record, 1)!, row, col)
        : cellValue(record, row, col) ?? (result.matrix.data[row]?.[col] ?? ZERO);
      cells[row]![col] = value;
      const partial = partialMatrix(record, cells.map((line) => line.map((cell) => cell)));
      const snapshotId = `${resultIdPrefix}-${row}-${col}`;
      context.values[snapshotId] = snapshotMatrix(partial, snapshotId, `${record.resultValue.label}[${row + 1},${col + 1}]`);
      const operation: Omit<NativeOperation, 'index' | 'checkpointId'> = {
        id: `native-op-${context.operations.length + 1}`,
        kind: 'cell',
        op: record.type,
        label: `${record.semantic} [${row + 1},${col + 1}]`,
        expression: `${record.expr}[${row + 1},${col + 1}]`,
        operands: operandIds,
        coordinates: { row, col },
        resultValueId: snapshotId,
      };
      pushOperation(context, operation as Omit<NativeOperation, 'index' | 'checkpointId'>, false);
    }
  }

  const finalId = `native-op-${context.operations.length}-result`;
  context.values[finalId] = snapshotMatrix(result.matrix, finalId, result.label);
  context.idsByLabel.set(result.label, finalId);
  const finalOperation: Omit<NativeOperation, 'index' | 'checkpointId'> = {
    id: `native-op-${context.operations.length + 1}`,
    kind: 'result',
    op: record.type,
    label: `${record.semantic} complete`,
    expression: record.expr,
    operands: operandIds,
    resultValueId: finalId,
  };
  pushOperation(context, finalOperation, true);
}

function emitOperation(context: NativeContext, record: OperationRecord): void {
  const operandIds = record.operands.map((operand) => idFor(operand, context));
  const resultId = `native-op-${context.operations.length + 1}-result`;
  context.values[resultId] = snapshotValue(record.resultValue, resultId);
  context.idsByLabel.set(record.resultValue.label, resultId);
  const operation: Omit<NativeOperation, 'index' | 'checkpointId'> = {
    id: `native-op-${context.operations.length + 1}`,
    kind: 'operation',
    op: record.type,
    label: record.semantic,
    expression: record.expr,
    operands: operandIds,
    resultValueId: resultId,
  };
  pushOperation(context, operation, true);
}

export function buildNativeTrace({ runId, expression, library, durationMs }: BuildNativeTraceOptions): NativeTrace | null {
  const started = performance.now();
  const parsed = parseExpression(expression, library);
  if (!parsed.ok) return null;
  const evaluation = evaluateExpression(parsed.ast, library, { record: true });
  const context: NativeContext = {
    operations: [],
    checkpoints: {},
    values: {},
    idsByLabel: new Map(),
    granularity: 'operation',
  };

  for (const [name, matrix] of Object.entries(library)) {
    const id = `native-input-${name}`;
    context.values[id] = snapshotMatrix(matrix, id, name);
    context.idsByLabel.set(name, id);
  }

  for (const record of evaluation.ops) {
    if (canDecompose(record)) emitDecomposed(context, record);
    else emitOperation(context, record);
  }

  if (!evaluation.ops.length) {
    const inputValue = evaluation.result;
    const id = idFor(inputValue, context);
    const checkpoint = makeCheckpoint(context, 'native-input', 'Input value', true);
    context.operations.push({
      id: 'native-input',
      index: 0,
      kind: 'input',
      op: 'input',
      label: inputValue.label,
      expression,
      operands: [],
      resultValueId: id,
      checkpointId: checkpoint.id,
    });
  }

  return {
    schemaVersion: 1,
    runId,
    engine: { id: 'exact-q', version: 1, backend: 'ts' },
    granularity: context.granularity,
    durationMs: durationMs ?? Math.max(1, performance.now() - started),
    operations: context.operations,
    checkpoints: context.checkpoints,
  };
}
