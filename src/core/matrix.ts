import { Q, ZERO, ONE, formatNumber } from './rational.js';
import type { RationalInput } from './rational.js';

/* ------------------------------------------------------------------ *
 * Matrix data model
 * ------------------------------------------------------------------ */

export type CellInput = RationalInput;
export type MatrixRowInput = readonly CellInput[];
export type MatrixInput = Matrix | readonly MatrixRowInput[];

export interface Matrix {
  name: string;
  rows: number;
  cols: number;
  data: Q[][];
}

/** A matrix object as it lives in a project library. */
export interface StoredMatrix extends Matrix {
  id: string;
  note: string;
  shape: string;
}

export interface Pivot {
  row: number;
  col: number;
}

export interface MatrixShape {
  rows: number;
  cols: number;
}

export type RowOperationType = 'swap' | 'scale' | 'add';

export interface RowOperationStep {
  type: RowOperationType;
  target: number;
  source: number;
  factor: Q;
  eliminated?: Q;
  pivotCol: number;
  pivotRow?: number;
  before: Q[][];
  after: Q[][];
  beforeTarget: Q[];
  afterTarget: Q[];
}

export interface RowReductionTrail {
  matrix: Matrix;
  steps: RowOperationStep[];
  pivots: Pivot[];
  rank: number;
}

export interface InverseReduction extends RowReductionTrail {
  augmented: Matrix;
  inverse: Matrix;
}

export interface SolveResult {
  x: Matrix;
  trail: RowReductionTrail;
  augmented: Matrix;
}

export interface NullspaceResult {
  basis: Q[][];
  matrix: Matrix | null;
  free: number[];
}

export interface ColumnSpaceResult {
  basis: Q[][];
  columns: number[];
  matrix: Matrix;
}

export interface BlockPlacement {
  block: Matrix;
  blockRow: number;
  blockCol: number;
  rowOffset: number;
  colOffset: number;
}

export interface BlockAssembly {
  matrix: Matrix;
  placements: BlockPlacement[];
  rowHeights: number[];
  colWidths: number[];
  rowOffsets: number[];
  colOffsets: number[];
}

export interface LUDecomposition {
  P: Matrix;
  L: Matrix;
  U: Matrix;
  swaps: number;
  singular: boolean;
  steps: Array<{ type: 'swap' | 'eliminate'; target: number; source: number; factor?: Q }>;
  permutationSign: 1 | -1;
}

export interface QRNumeric {
  Q: number[][];
  R: number[][];
  numeric: true;
}

export interface ComplexValue {
  re: number;
  im: number;
}

export interface EigenResult {
  complex: boolean;
  values: ComplexValue[];
  discriminant: number;
  trace: number;
  determinant: number;
}

/* ------------------------------------------------------------------ *
 * Construction
 * ------------------------------------------------------------------ */

export function isMatrix(value: unknown): value is Matrix {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Matrix>;
  return Array.isArray(candidate.data) && typeof candidate.rows === 'number' && typeof candidate.cols === 'number';
}

export function matrixFromRows(rows: readonly MatrixRowInput[], name = 'A'): Matrix {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('矩阵至少需要一行');
  const cols = rows[0]?.length ?? 0;
  if (!cols) throw new Error('矩阵至少需要一列');
  if (rows.some((row) => row.length !== cols)) throw new Error('每一行的列数必须相同');
  return {
    name,
    rows: rows.length,
    cols,
    data: rows.map((row) => row.map((value: CellInput) => Q.of(value))),
  };
}

export function matrix(
  rows: number,
  cols: number,
  values?: readonly CellInput[] | readonly MatrixRowInput[],
  name = 'A',
): Matrix {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error('矩阵尺寸必须是正整数');
  }
  if (values && Array.isArray(values[0])) {
    return matrixFromRows(values as readonly MatrixRowInput[], name);
  }
  const flat = (values as readonly CellInput[] | undefined) ?? new Array<CellInput>(rows * cols).fill(0);
  if (flat.length !== rows * cols) throw new Error('元素数量与矩阵尺寸不符');
  const data: Q[][] = [];
  for (let r = 0; r < rows; r++) {
    data.push(flat.slice(r * cols, (r + 1) * cols).map((value) => Q.of(value)));
  }
  return { name, rows, cols, data };
}

export function zeros(rows: number, cols: number, name = 'O'): Matrix {
  return matrix(rows, cols, new Array<CellInput>(rows * cols).fill(0), name);
}

export function ones(rows: number, cols: number, name = 'J'): Matrix {
  return matrix(rows, cols, new Array<CellInput>(rows * cols).fill(1), name);
}

export function identity(n: number, name = 'I'): Matrix {
  return matrix(
    n,
    n,
    Array.from({ length: n * n }, (_, i) => (Math.floor(i / n) === i % n ? 1 : 0)),
    name,
  );
}

export function diagonal(values: readonly CellInput[], name = 'D'): Matrix {
  const n = values.length;
  return matrix(
    n,
    n,
    Array.from({ length: n * n }, (_, i) => {
      const r = Math.floor(i / n);
      const c = i % n;
      return r === c ? values[r] ?? 0 : 0;
    }),
    name,
  );
}

export function cloneMatrix(input: Matrix, name: string = input.name): Matrix {
  return {
    name,
    rows: input.rows,
    cols: input.cols,
    data: input.data.map((row) => row.map((value) => value.clone())),
  };
}

export function sameShape(a: Matrix, b: Matrix): boolean {
  return a.rows === b.rows && a.cols === b.cols;
}

export function shapeOf(value: Matrix): MatrixShape {
  return { rows: value.rows, cols: value.cols };
}

export function shapeLabel(value: Matrix | null | undefined): string {
  return value ? `${value.rows}×${value.cols}` : '';
}

export function matrixEquals(a: Matrix, b: Matrix): boolean {
  if (!sameShape(a, b)) return false;
  return a.data.every((row, r) => row.every((value, c) => value.eq(b.data[r]?.[c] ?? NaN)));
}

export function assertSameShape(a: Matrix, b: Matrix, operation = '运算'): void {
  if (!sameShape(a, b)) {
    throw new Error(
      `${operation}要求形状相同：${a.name} 是 ${a.rows}×${a.cols}，${b.name} 是 ${b.rows}×${b.cols}`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Elementary operations
 * ------------------------------------------------------------------ */

export function add(a: Matrix, b: Matrix): Matrix {
  assertSameShape(a, b, '矩阵加法');
  return {
    name: 'A+B',
    rows: a.rows,
    cols: a.cols,
    data: a.data.map((row, r) => row.map((value, c) => value.add(b.data[r]?.[c] ?? ZERO))),
  };
}

export function subtract(a: Matrix, b: Matrix): Matrix {
  assertSameShape(a, b, '矩阵减法');
  return {
    name: 'A−B',
    rows: a.rows,
    cols: a.cols,
    data: a.data.map((row, r) => row.map((value, c) => value.sub(b.data[r]?.[c] ?? ZERO))),
  };
}

export function hadamard(a: Matrix, b: Matrix): Matrix {
  assertSameShape(a, b, 'Hadamard 乘积');
  return {
    name: 'A⊙B',
    rows: a.rows,
    cols: a.cols,
    data: a.data.map((row, r) => row.map((value, c) => value.mul(b.data[r]?.[c] ?? ZERO))),
  };
}

export function hadamardPower(a: Matrix, exponent: number): Matrix {
  return {
    ...cloneMatrix(a),
    name: `${a.name}^∘${exponent}`,
    data: a.data.map((row) => row.map((value) => value.pow(exponent))),
  };
}

export function scale(a: Matrix, scalar: RationalInput): Matrix {
  const k = Q.of(scalar);
  return {
    ...cloneMatrix(a),
    name: `${formatNumber(k)}${a.name}`,
    data: a.data.map((row) => row.map((value) => value.mul(k))),
  };
}

export function divide(a: Matrix, scalar: RationalInput): Matrix {
  return scale(a, Q.of(scalar).pow(-1));
}

export function addScalar(a: Matrix, scalar: RationalInput): Matrix {
  const k = Q.of(scalar);
  return {
    ...cloneMatrix(a),
    data: a.data.map((row) => row.map((value) => value.add(k))),
  };
}

export function matmul(a: Matrix, b: Matrix, name = 'AB'): Matrix {
  if (a.cols !== b.rows) {
    throw new Error(
      `矩阵乘法要求 A 的列数 = B 的行数：${a.rows}×${a.cols} 与 ${b.rows}×${b.cols} 不相容`,
    );
  }
  const data: Q[][] = [];
  for (let r = 0; r < a.rows; r++) {
    const row: Q[] = [];
    for (let c = 0; c < b.cols; c++) {
      let sum = ZERO;
      for (let k = 0; k < a.cols; k++) {
        sum = sum.add((a.data[r]?.[k] ?? ZERO).mul(b.data[k]?.[c] ?? ZERO));
      }
      row.push(sum);
    }
    data.push(row);
  }
  return { name, rows: a.rows, cols: b.cols, data };
}

export function transpose(a: Matrix): Matrix {
  return {
    name: `${a.name}ᵀ`,
    rows: a.cols,
    cols: a.rows,
    data: Array.from({ length: a.cols }, (_, r) =>
      Array.from({ length: a.rows }, (_, c) => (a.data[c]?.[r] ?? ZERO).clone()),
    ),
  };
}

export function trace(a: Matrix): Q {
  if (a.rows !== a.cols) throw new Error('只有方阵才有迹（trace）');
  let sum = ZERO;
  for (let i = 0; i < a.rows; i++) sum = sum.add(a.data[i]?.[i] ?? ZERO);
  return sum;
}

export function hadamardTrace(a: Matrix): Q {
  return trace(a);
}

export function minorMatrix(a: Matrix, skipRow: number, skipCol: number): Matrix {
  return {
    name: `M${skipRow + 1}${skipCol + 1}`,
    rows: a.rows - 1,
    cols: a.cols - 1,
    data: a.data
      .filter((_, r) => r !== skipRow)
      .map((row) => row.filter((_, c) => c !== skipCol)),
  };
}

export function minor(a: Matrix, skipRow: number, skipCol: number): Q {
  return determinant(minorMatrix(a, skipRow, skipCol));
}

export function cofactor(a: Matrix, r: number, c: number): Q {
  const value = minor(a, r, c);
  return (r + c) % 2 === 0 ? value : value.neg();
}

export function cofactorMatrix(a: Matrix): Matrix {
  if (a.rows !== a.cols) throw new Error('只有方阵才有余子式矩阵');
  return {
    name: `cof(${a.name})`,
    rows: a.rows,
    cols: a.cols,
    data: a.data.map((row, r) => row.map((_, c) => cofactor(a, r, c))),
  };
}

export function adjugate(a: Matrix): Matrix {
  return transpose(cofactorMatrix(a));
}

/* ------------------------------------------------------------------ *
 * Determinant & inversion (exact)
 * ------------------------------------------------------------------ */

export function determinant(input: Matrix): Q {
  if (input.rows !== input.cols) throw new Error('行列式只对方阵有定义');
  const n = input.rows;
  if (n === 0) return ONE;
  if (n === 1) return (input.data[0]?.[0] ?? ZERO).clone();
  if (n === 2) {
    const a = input.data[0]?.[0] ?? ZERO;
    const b = input.data[0]?.[1] ?? ZERO;
    const c = input.data[1]?.[0] ?? ZERO;
    const d = input.data[1]?.[1] ?? ZERO;
    return a.mul(d).sub(b.mul(c));
  }
  const a = input.data.map((row) => row.map((value) => value.clone()));
  let sign = ONE;
  let det = ONE;
  for (let k = 0; k < n; k++) {
    let pivot = k;
    while (pivot < n && (a[pivot]?.[k] ?? ZERO).isZero) pivot++;
    if (pivot === n) return ZERO;
    if (pivot !== k) {
      const temp = a[pivot] as Q[];
      a[pivot] = a[k] as Q[];
      a[k] = temp;
      sign = sign.neg();
    }
    const pv = a[k]?.[k] ?? ZERO;
    det = det.mul(pv);
    for (let r = k + 1; r < n; r++) {
      if ((a[r]?.[k] ?? ZERO).isZero) continue;
      const factor = (a[r]?.[k] ?? ZERO).div(pv);
      for (let c = k; c < n; c++) {
        a[r]![c] = (a[r]?.[c] ?? ZERO).sub(factor.mul(a[k]?.[c] ?? ZERO));
      }
    }
  }
  return det.mul(sign);
}

/** A row-reduction trail used by every elimination story and debug trace. */
export function rowReduceTrail(input: Matrix, options: { pivotLimit?: number } = {}): RowReductionTrail {
  const pivotLimit = options.pivotLimit ?? input.cols;
  const rows = input.rows;
  const cols = input.cols;
  const a = input.data.map((row) => row.map((value) => value.clone()));
  const steps: RowOperationStep[] = [];
  const pivots: Pivot[] = [];

  const record = (
    step: Omit<RowOperationStep, 'after' | 'beforeTarget' | 'afterTarget'> & { before: Q[][] },
  ): void => {
    const after = a.map((row) => row.map((value) => value.clone()));
    steps.push({
      ...step,
      after,
      beforeTarget: step.before[step.target] ?? [],
      afterTarget: after[step.target] ?? [],
    });
  };

  let row = 0;
  for (let col = 0; col < Math.min(cols, pivotLimit) && row < rows; col++) {
    let pivot = row;
    while (pivot < rows && (a[pivot]?.[col] ?? ZERO).isZero) pivot++;
    if (pivot === rows) continue;
    if (pivot !== row) {
      const before = a.map((line) => line.map((value) => value.clone()));
      const tmp = a[pivot] as Q[];
      a[pivot] = a[row] as Q[];
      a[row] = tmp;
      record({ type: 'swap', target: row, source: pivot, factor: ONE, pivotCol: col, pivotRow: row, before });
    }
    const pivotValue = a[row]?.[col] ?? ZERO;
    if (!pivotValue.isOne) {
      const before = a.map((line) => line.map((value) => value.clone()));
      for (let c = 0; c < cols; c++) {
        a[row]![c] = (a[row]?.[c] ?? ZERO).div(pivotValue);
      }
      record({
        type: 'scale',
        target: row,
        source: row,
        factor: pivotValue,
        pivotCol: col,
        pivotRow: row,
        before,
      });
    }
    for (let r = 0; r < rows; r++) {
      if (r === row || (a[r]?.[col] ?? ZERO).isZero) continue;
      const before = a.map((line) => line.map((value) => value.clone()));
      const factor = a[r]?.[col] ?? ZERO;
      for (let c = 0; c < cols; c++) {
        a[r]![c] = (a[r]?.[c] ?? ZERO).sub(factor.mul(a[row]?.[c] ?? ZERO));
      }
      record({
        type: 'add',
        target: r,
        source: row,
        factor: factor.neg(),
        eliminated: factor,
        pivotCol: col,
        pivotRow: row,
        before,
      });
    }
    pivots.push({ row, col });
    row++;
  }

  return {
    matrix: { ...input, data: a },
    steps,
    pivots,
    rank: pivots.length,
  };
}

export function rref(input: Matrix): Matrix {
  return rowReduceTrail(input).matrix;
}

export function rank(input: Matrix): number {
  return rowReduceTrail(input).rank;
}

function augmentedInverseInput(input: Matrix): Matrix {
  const n = input.rows;
  return {
    name: `[${input.name} | I]`,
    rows: n,
    cols: 2 * n,
    data: input.data.map((row, r) => [
      ...row.map((value) => value.clone()),
      ...Array.from({ length: n }, (_, c) => (r === c ? ONE : ZERO)),
    ]),
  };
}

export function inverse(input: Matrix): Matrix {
  if (input.rows !== input.cols) throw new Error('只有方阵才可能可逆');
  const n = input.rows;
  const aug = augmentedInverseInput(input);
  const trail = rowReduceTrail(aug, { pivotLimit: n });
  if (trail.rank !== n) throw new Error('矩阵是奇异的（不可逆），无法求出逆矩阵');
  return {
    name: `${input.name}⁻¹`,
    rows: n,
    cols: n,
    data: trail.matrix.data.map((row) => row.slice(n)),
  };
}

export function inverseTrail(input: Matrix): InverseReduction {
  if (input.rows !== input.cols) throw new Error('只有方阵才可能可逆');
  const n = input.rows;
  const augmented = augmentedInverseInput(input);
  const trail = rowReduceTrail(augmented, { pivotLimit: n });
  if (trail.rank !== n) throw new Error('矩阵是奇异的（不可逆），无法求出逆矩阵');
  return {
    ...trail,
    augmented,
    inverse: {
      name: `${input.name}⁻¹`,
      rows: n,
      cols: n,
      data: trail.matrix.data.map((row) => row.slice(n)),
    },
  };
}

export function solveLinear(A: Matrix, b: Matrix): SolveResult {
  if (A.rows !== A.cols) throw new Error('solve(A, b) 目前要求 A 是方阵');
  if (b.rows !== A.rows || b.cols !== 1) {
    throw new Error(`b 需要是 ${A.rows}×1 的列向量，当前是 ${b.rows}×${b.cols}`);
  }
  const n = A.rows;
  const augmented: Matrix = {
    name: '[A | b]',
    rows: n,
    cols: n + 1,
    data: A.data.map((row, r) => [...row.map((value) => value.clone()), b.data[r]?.[0] ?? ZERO]),
  };
  const trail = rowReduceTrail(augmented, { pivotLimit: n });
  if (trail.rank < n) {
    const deficient = trail.pivots.some((pivot) => pivot.col === n);
    throw new Error(deficient ? '方程组不相容，无解' : '方程组有自由变量，解不唯一');
  }
  const x: Matrix = {
    name: 'x',
    rows: n,
    cols: 1,
    data: trail.matrix.data.map((row) => [row[n] ?? ZERO]),
  };
  return { x, trail, augmented };
}

export function solveTrail(A: Matrix, b: Matrix): SolveResult {
  return solveLinear(A, b);
}

export function nullspace(A: Matrix): NullspaceResult {
  const trail = rowReduceTrail(A);
  const pivotCols = new Set(trail.pivots.map((pivot) => pivot.col));
  const free = Array.from({ length: A.cols }, (_, i) => i).filter((c) => !pivotCols.has(c));
  if (!free.length) {
    return { basis: [], matrix: null, free };
  }
  const basis = free.map((freeCol) => {
    const vec: Q[] = new Array<Q>(A.cols).fill(ZERO);
    vec[freeCol] = ONE;
    trail.pivots.forEach((pivot, index) => {
      vec[pivot.col] = (trail.matrix.data[index]?.[freeCol] ?? ZERO).neg();
    });
    return vec;
  });
  return {
    basis,
    matrix: {
      name: 'N(A)',
      rows: A.cols,
      cols: basis.length,
      data: Array.from({ length: A.cols }, (_, r) => basis.map((vec) => vec[r] ?? ZERO)),
    },
    free,
  };
}

export function columnSpace(A: Matrix): ColumnSpaceResult {
  const pivotCols = rowReduceTrail(A).pivots.map((pivot) => pivot.col);
  return {
    basis: pivotCols.map((c) => A.data.map((row) => row[c] ?? ZERO)),
    columns: pivotCols,
    matrix: {
      name: 'Col(A)',
      rows: A.rows,
      cols: pivotCols.length,
      data: A.data.map((row) => pivotCols.map((c) => row[c] ?? ZERO)),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Structural operations
 * ------------------------------------------------------------------ */

export function concatHorizontal(matrices: readonly Matrix[]): Matrix {
  if (!matrices.length) throw new Error('至少需要一个矩阵');
  const rowCount = matrices[0]?.rows ?? 0;
  if (matrices.some((m) => m.rows !== rowCount)) {
    throw new Error('水平拼接要求所有矩阵拥有相同的行数');
  }
  return {
    name: '水平拼接',
    rows: rowCount,
    cols: matrices.reduce((sum, m) => sum + m.cols, 0),
    data: Array.from({ length: rowCount }, (_, r) =>
      matrices.flatMap((m) => (m.data[r] ?? []).map((value) => value.clone())),
    ),
  };
}

export function concatVertical(matrices: readonly Matrix[]): Matrix {
  if (!matrices.length) throw new Error('至少需要一个矩阵');
  const colCount = matrices[0]?.cols ?? 0;
  if (matrices.some((m) => m.cols !== colCount)) {
    throw new Error('竖直拼接要求所有矩阵拥有相同的列数');
  }
  return {
    name: '竖直拼接',
    rows: matrices.reduce((sum, m) => sum + m.rows, 0),
    cols: colCount,
    data: matrices.flatMap((m) => m.data.map((row) => row.map((value) => value.clone()))),
  };
}

export function concatBlocks(grid: readonly (readonly (Matrix | null)[])[]): BlockAssembly {
  const blocks = grid.flat().filter((block): block is Matrix => block !== null);
  if (!blocks.length) throw new Error('请至少放入一个矩阵块');
  const rows = grid.length;
  const cols = Math.max(...grid.map((row) => row.length));
  const rowHeights: number[] = [];
  const colWidths: number[] = [];

  for (let r = 0; r < rows; r++) {
    const nonEmpty = (grid[r] ?? []).filter((m): m is Matrix => Boolean(m));
    if (!nonEmpty.length) throw new Error(`第 ${r + 1} 个块行还是空的`);
    if (nonEmpty.some((m) => m.rows !== nonEmpty[0]?.rows)) {
      throw new Error(`第 ${r + 1} 个块行中矩阵行数不一致`);
    }
    rowHeights[r] = nonEmpty[0]?.rows ?? 0;
  }
  for (let c = 0; c < cols; c++) {
    const nonEmpty = grid.map((row) => row[c] ?? null).filter((m): m is Matrix => Boolean(m));
    if (!nonEmpty.length) throw new Error(`第 ${c + 1} 个块列还是空的`);
    if (nonEmpty.some((m) => m.cols !== nonEmpty[0]?.cols)) {
      throw new Error(`第 ${c + 1} 个块列中矩阵列数不一致`);
    }
    colWidths[c] = nonEmpty[0]?.cols ?? 0;
  }
  if (rowHeights.some((h) => !h) || colWidths.some((w) => !w)) {
    throw new Error('每个块行 / 块列都必须至少包含一个矩阵');
  }

  const totalRows = rowHeights.reduce((a, b) => a + b, 0);
  const totalCols = colWidths.reduce((a, b) => a + b, 0);
  const data = Array.from({ length: totalRows }, () => new Array<Q>(totalCols).fill(ZERO));
  const placements: BlockPlacement[] = [];
  const rowOffsets: number[] = [];
  const colOffsets: number[] = [];
  let y = 0;
  for (let br = 0; br < rows; br++) {
    rowOffsets.push(y);
    let x = 0;
    for (let bc = 0; bc < cols; bc++) {
      if (br === 0) colOffsets.push(x);
      const block = grid[br]?.[bc] ?? null;
      if (block) {
        for (let r = 0; r < block.rows; r++) {
          for (let c = 0; c < block.cols; c++) {
            data[y + r]![x + c] = (block.data[r]?.[c] ?? ZERO).clone();
          }
        }
        placements.push({ block, blockRow: br, blockCol: bc, rowOffset: y, colOffset: x });
      }
      x += colWidths[bc] ?? 0;
    }
    y += rowHeights[br] ?? 0;
  }
  rowOffsets.push(y);
  colOffsets.push(totalCols);

  return {
    matrix: { name: 'K', rows: totalRows, cols: totalCols, data },
    placements,
    rowHeights,
    colWidths,
    rowOffsets,
    colOffsets,
  };
}

export function directSum(a: Matrix, b: Matrix): Matrix {
  const rows = a.rows + b.rows;
  const cols = a.cols + b.cols;
  return {
    name: 'A⊕B',
    rows,
    cols,
    data: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        if (r < a.rows && c < a.cols) return (a.data[r]?.[c] ?? ZERO).clone();
        if (r >= a.rows && c >= a.cols) return (b.data[r - a.rows]?.[c - a.cols] ?? ZERO).clone();
        return ZERO;
      }),
    ),
  };
}

export function kronecker(a: Matrix, b: Matrix): Matrix {
  const rows = a.rows * b.rows;
  const cols = a.cols * b.cols;
  const data = Array.from({ length: rows }, () => new Array<Q>(cols).fill(ZERO));
  for (let ar = 0; ar < a.rows; ar++) {
    for (let ac = 0; ac < a.cols; ac++) {
      for (let br = 0; br < b.rows; br++) {
        for (let bc = 0; bc < b.cols; bc++) {
          data[ar * b.rows + br]![ac * b.cols + bc] =
            (a.data[ar]?.[ac] ?? ZERO).mul(b.data[br]?.[bc] ?? ZERO);
        }
      }
    }
  }
  return { name: 'A⊗B', rows, cols, data };
}

export function power(a: Matrix, exponent: number): Matrix {
  if (!Number.isInteger(exponent)) throw new Error('矩阵幂次必须是整数');
  if (a.rows !== a.cols) throw new Error('只有方阵才有整数幂');
  if (exponent < 0) return power(inverse(a), -exponent);
  if (exponent === 0) return identity(a.rows, `${a.name}⁰`);
  let result = identity(a.rows, `${a.name}^${exponent}`);
  let base = cloneMatrix(a);
  let n = exponent;
  while (n > 0) {
    if (n & 1) result = matmul(result, base, `${a.name}^${exponent}`);
    n >>= 1;
    if (n) base = matmul(base, base);
  }
  return result;
}

export function dot(u: Matrix, v: Matrix): Q {
  if (u.rows !== v.rows || u.cols !== 1 || v.cols !== 1) {
    throw new Error('点积需要两个同尺寸列向量');
  }
  let sum = ZERO;
  for (let i = 0; i < u.rows; i++) {
    sum = sum.add((u.data[i]?.[0] ?? ZERO).mul(v.data[i]?.[0] ?? ZERO));
  }
  return sum;
}

export function outer(u: Matrix, v: Matrix): Matrix {
  if (u.cols !== 1 || v.cols !== 1) throw new Error('外积需要两个列向量');
  return {
    name: 'uvᵀ',
    rows: u.rows,
    cols: v.rows,
    data: u.data.map((uRow) => v.data.map((vRow) => (uRow[0] ?? ZERO).mul(vRow[0] ?? ZERO))),
  };
}

export function frobeniusNorm(a: Matrix): number {
  let sum = 0;
  for (const row of a.data) for (const value of row) sum += value.toNumber() ** 2;
  return Math.sqrt(sum);
}

/* ------------------------------------------------------------------ *
 * Decompositions & spectral helpers
 * ------------------------------------------------------------------ */

export function luDecompose(input: Matrix): LUDecomposition {
  if (input.rows !== input.cols) throw new Error('LU 分解要求方阵');
  const n = input.rows;
  const U = input.data.map((row) => row.map((value) => value.clone()));
  const L: Q[][] = Array.from({ length: n }, (_, r) =>
    new Array<Q>(n).fill(ZERO).map((_, c) => (r === c ? ONE : ZERO)),
  );
  const P = identity(n, 'P');
  const steps: LUDecomposition['steps'] = [];
  let swaps = 0;
  let singular = false;

  for (let k = 0; k < n; k++) {
    let pivot = k;
    while (pivot < n && (U[pivot]?.[k] ?? ZERO).isZero) pivot++;
    if (pivot === n) {
      singular = true;
      continue;
    }
    if (pivot !== k) {
      const uRow = U[pivot] as Q[];
      U[pivot] = U[k] as Q[];
      U[k] = uRow;
      const pRow = P.data[pivot] as Q[];
      P.data[pivot] = P.data[k] as Q[];
      P.data[k] = pRow;
      for (let c = 0; c < k; c++) {
        const temp = L[pivot]?.[c] ?? ZERO;
        L[pivot]![c] = L[k]?.[c] ?? ZERO;
        L[k]![c] = temp;
      }
      swaps++;
      steps.push({ type: 'swap', target: k, source: pivot });
    }
    for (let r = k + 1; r < n; r++) {
      if ((U[r]?.[k] ?? ZERO).isZero) continue;
      const factor = (U[r]?.[k] ?? ZERO).div(U[k]?.[k] ?? ONE);
      L[r]![k] = factor;
      for (let c = k; c < n; c++) {
        U[r]![c] = (U[r]?.[c] ?? ZERO).sub(factor.mul(U[k]?.[c] ?? ZERO));
      }
      steps.push({ type: 'eliminate', target: r, source: k, factor });
    }
  }

  return {
    P,
    L: { name: 'L', rows: n, cols: n, data: L },
    U: { name: 'U', rows: n, cols: n, data: U },
    swaps,
    singular,
    steps,
    permutationSign: swaps % 2 ? -1 : 1,
  };
}

export function qrDecompose(input: Matrix): QRNumeric {
  const n = input.rows;
  const m = input.cols;
  const A = input.data.map((row) => row.map((value) => value.toNumber()));
  const Q: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  const R: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  for (let j = 0; j < m; j++) {
    const v = A.map((row) => row[j] ?? 0);
    for (let i = 0; i < j; i++) {
      let r = 0;
      for (let k = 0; k < n; k++) r += (Q[k]?.[i] ?? 0) * (v[k] ?? 0);
      R[i]![j] = r;
      for (let k = 0; k < n; k++) v[k] = (v[k] ?? 0) - r * (Q[k]?.[i] ?? 0);
    }
    const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
    R[j]![j] = norm;
    if (norm > 1e-12) for (let k = 0; k < n; k++) Q[k]![j] = (v[k] ?? 0) / norm;
  }
  return { Q, R, numeric: true };
}

export function characteristicPolynomial(input: Matrix): Q[] {
  if (input.rows !== input.cols) throw new Error('特征多项式只对方阵有定义');
  const n = input.rows;
  let M = identity(n);
  const coeffs: Q[] = [ONE];
  for (let k = 1; k <= n; k++) {
    M = matmul(input, M);
    const c = trace(M).div(Q.of(k)).neg();
    coeffs.push(c);
    M = add(M, scale(identity(n), c));
  }
  return coeffs;
}

export function eigenvalues2x2(input: Matrix): EigenResult {
  if (input.rows !== 2 || input.cols !== 2) throw new Error('2×2 特征值例程需要 2×2 矩阵');
  const a = input.data[0]?.[0]?.toNumber() ?? 0;
  const b = input.data[0]?.[1]?.toNumber() ?? 0;
  const c = input.data[1]?.[0]?.toNumber() ?? 0;
  const d = input.data[1]?.[1]?.toNumber() ?? 0;
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc < -1e-12) {
    return {
      complex: true,
      values: [
        { re: tr / 2, im: Math.sqrt(-disc) / 2 },
        { re: tr / 2, im: -Math.sqrt(-disc) / 2 },
      ],
      discriminant: disc,
      trace: tr,
      determinant: det,
    };
  }
  const s = Math.sqrt(Math.max(0, disc));
  return {
    complex: false,
    values: [
      { re: (tr + s) / 2, im: 0 },
      { re: (tr - s) / 2, im: 0 },
    ],
    discriminant: disc,
    trace: tr,
    determinant: det,
  };
}

export function isSymmetric(input: Matrix, tolerance = 1e-9): boolean {
  if (input.rows !== input.cols) return false;
  for (let r = 0; r < input.rows; r++) {
    for (let c = 0; c < input.cols; c++) {
      if (
        Math.abs(
          (input.data[r]?.[c]?.toNumber() ?? 0) - (input.data[c]?.[r]?.toNumber() ?? 0),
        ) > tolerance
      ) {
        return false;
      }
    }
  }
  return true;
}

export function eigenvaluesSymmetric(input: Matrix): ComplexValue[] {
  if (!isSymmetric(input)) throw new Error('实对称特征值例程需要对称矩阵');
  const n = input.rows;
  const a = input.data.map((row) => row.map((value) => value.toNumber()));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) off += (a[p]?.[q] ?? 0) ** 2;
    }
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]?.[q] ?? 0;
        if (Math.abs(apq) < 1e-15) continue;
        const theta = ((a[q]?.[q] ?? 0) - (a[p]?.[p] ?? 0)) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k]?.[p] ?? 0;
          const akq = a[k]?.[q] ?? 0;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]?.[k] ?? 0;
          const aqk = a[q]?.[k] ?? 0;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
      }
    }
  }
  return Array.from({ length: n }, (_, i) => ({ re: a[i]?.[i] ?? 0, im: 0 })).sort(
    (x, y) => y.re - x.re,
  );
}

export function eigenvaluesNumeric(input: Matrix): ComplexValue[] {
  if (input.rows !== input.cols) throw new Error('特征值只对方阵有定义');
  if (input.rows === 1) return [{ re: input.data[0]?.[0]?.toNumber() ?? 0, im: 0 }];
  if (input.rows === 2) return eigenvalues2x2(input).values;
  if (isSymmetric(input)) return eigenvaluesSymmetric(input);
  let A = input.data.map((row) => row.map((value) => value.toNumber()));
  const n = input.rows;
  for (let iter = 0; iter < 600; iter++) {
    const qr = qrNumeric(A);
    A = multiplyNumeric(qr.R, qr.Q);
    let off = 0;
    for (let r = 1; r < n; r++) for (let c = 0; c < r; c++) off += (A[r]?.[c] ?? 0) ** 2;
    if (off < 1e-20) break;
  }
  return Array.from({ length: n }, (_, i) => ({ re: A[i]?.[i] ?? 0, im: 0 })).sort(
    (x, y) => y.re - x.re,
  );
}

function qrNumeric(A: number[][]): QRNumeric {
  const n = A.length;
  const m = A[0]?.length ?? 0;
  const Q: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  const R: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  for (let j = 0; j < m; j++) {
    const v = A.map((row) => row[j] ?? 0);
    for (let i = 0; i < j; i++) {
      let r = 0;
      for (let k = 0; k < n; k++) r += (Q[k]?.[i] ?? 0) * (v[k] ?? 0);
      R[i]![j] = r;
      for (let k = 0; k < n; k++) v[k] = (v[k] ?? 0) - r * (Q[k]?.[i] ?? 0);
    }
    const norm = Math.hypot(...v);
    R[j]![j] = norm;
    if (norm > 1e-14) for (let k = 0; k < n; k++) Q[k]![j] = (v[k] ?? 0) / norm;
  }
  return { Q, R, numeric: true };
}

function multiplyNumeric(A: number[][], B: number[][]): number[][] {
  const rows = A.length;
  const mid = A[0]?.length ?? 0;
  const cols = B[0]?.length ?? 0;
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      let sum = 0;
      for (let k = 0; k < mid; k++) sum += (A[r]?.[k] ?? 0) * (B[k]?.[c] ?? 0);
      return sum;
    }),
  );
}

export function formatEigen(eigen: ComplexValue): string {
  if (eigen.im && Math.abs(eigen.im) > 1e-9) {
    const sign = eigen.im > 0 ? '+' : '−';
    return `${cleanFloat(eigen.re)} ${sign} ${cleanFloat(Math.abs(eigen.im))}i`;
  }
  return cleanFloat(eigen.re);
}

export function cleanFloat(value: number): string {
  if (Math.abs(value) < 1e-10) return '0';
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

/* ------------------------------------------------------------------ *
 * Utilities
 * ------------------------------------------------------------------ */

export function toNumberGrid(input: Matrix): number[][] {
  return input.data.map((row) => row.map((value) => value.toNumber()));
}

export function fromNumberGrid(rows: readonly (readonly number[])[], name = 'R'): Matrix {
  return matrixFromRows(
    rows.map((row) => row.map((value) => String(Math.round(value * 1e8) / 1e8))),
    name,
  );
}

export function matrixToText(input: Matrix): string {
  return input.data.map((row) => row.map((value) => formatNumber(value)).join('\t')).join('\n');
}

export function randomMatrix(
  rows: number,
  cols: number,
  options: { min?: number; max?: number; zeroChance?: number } = {},
): Matrix {
  const { min = -4, max = 4, zeroChance = 0.14 } = options;
  return matrix(
    rows,
    cols,
    Array.from({ length: rows * cols }, () => {
      if (Math.random() < zeroChance) return 0;
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }),
    'R',
  );
}
