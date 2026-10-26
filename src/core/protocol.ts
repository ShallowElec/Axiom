/**
 * Core protocols shared by computation, debugging and presentation.
 *
 * The invariant: a computation produces plain, serializable-ish data and never
 * knows how it will be drawn. Storyboards and Scenes consume these protocols.
 */

import type { Matrix } from './matrix.js';
import type { Q } from './rational.js';

export interface Shape {
  rows: number;
  cols: number;
}

/* ------------------------------------------------------------------ *
 * Runtime values inside the current exact algebra engine
 * ------------------------------------------------------------------ */

export interface MatrixRuntimeValue {
  kind: 'matrix';
  matrix: Matrix;
  label: string;
  expr: string;
  origin?: 'input' | 'computed';
}

export interface ScalarRuntimeValue {
  kind: 'scalar';
  value: Q;
  label: string;
  expr: string;
}

export type RuntimeValue = MatrixRuntimeValue | ScalarRuntimeValue;

export function isMatrixRuntimeValue(value: RuntimeValue): value is MatrixRuntimeValue {
  return value.kind === 'matrix';
}

export function isScalarRuntimeValue(value: RuntimeValue): value is ScalarRuntimeValue {
  return value.kind === 'scalar';
}

/* ------------------------------------------------------------------ *
 * Operations
 * ------------------------------------------------------------------ */

/**
 * The operation types understood by the story compiler today. The debug
 * registry and future generic math IR will extend this union.
 */
export type OperationType =
  | 'add'
  | 'subtract'
  | 'hadamard'
  | 'scale'
  | 'matmul'
  | 'transpose'
  | 'kron'
  | 'inverse'
  | 'rref'
  | 'rank'
  | 'determinant'
  | 'trace'
  | 'solve'
  | 'power'
  | 'adjugate'
  | 'concat'
  | 'copy'
  | 'identity'
  | 'generic';

export interface OperationRecord {
  id: string;
  type: OperationType;
  label: string;
  expr: string;
  semantic: string;
  operands: RuntimeValue[];
  resultValue: RuntimeValue;
  /** Scalar for scale operations. */
  scalar?: Q;
  scalarLabel?: string;
  /** True when the scale was produced by division. */
  division?: boolean;
  /** Exponent for matrix powers. */
  exponent?: number;
  isRoot?: boolean;
}

export interface EvaluationResult {
  result: RuntimeValue;
  ops: OperationRecord[];
}

/* ------------------------------------------------------------------ *
 * Computation traces
 * ------------------------------------------------------------------ */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface TraceValueRef {
  id: string;
  label: string;
  kind: 'matrix' | 'scalar';
  dtype: 'Q';
  shape?: Shape;
  preview: string;
}

export type TraceStepKind = 'input' | 'operation' | 'cell' | 'row-op' | 'result';

export interface TraceHighlight {
  panel: string;
  cell?: [number, number];
  role: 'source' | 'target' | 'result';
}

export interface TraceStep {
  id: string;
  index: number;
  kind: TraceStepKind;
  title: string;
  detail?: string;
  highlights?: TraceHighlight[];
  payload?: JsonValue;
}

export type TraceStatus = 'ok' | 'error';

/**
 * The deliberately small transport format for the debug console and future
 * process boundaries. Larger value stores can be attached by id later.
 */
export interface ComputationTrace {
  schemaVersion: 1;
  runId: string;
  operationId: string;
  label: string;
  startedAt: string;
  durationMs: number;
  status: TraceStatus;
  error?: string;
  inputs: TraceValueRef[];
  outputs: TraceValueRef[];
  steps: TraceStep[];
  tags?: string[];
}
