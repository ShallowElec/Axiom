import { Q, ZERO, ONE, formatNumber } from './rational.js';

/* ------------------------------------------------------------------ *
 * Matrix construction
 * ------------------------------------------------------------------ */

export function isMatrix(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.data));
}

export function matrixFromRows(rows, name = 'A') {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('矩阵至少需要一行');
  const cols = rows[0].length;
  if (!cols) throw new Error('矩阵至少需要一列');
  if (rows.some((row) => row.length !== cols)) throw new Error('每一行的列数必须相同');
  return {
    name,
    rows: rows.length,
    cols,
    data: rows.map((row) => row.map((value) => Q.of(value))),
  };
}

export function matrix(rows, cols, values, name = 'A') {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error('矩阵尺寸必须是正整数');
  }
  if (values && Array.isArray(values[0])) return matrixFromRows(values, name);
  const flat = values || new Array(rows * cols).fill(0);
  if (flat.length !== rows * cols) throw new Error('元素数量与矩阵尺寸不符');
  const data = [];
  for (let r = 0; r < rows; r++) {
    data.push(flat.slice(r * cols, (r + 1) * cols).map((v) => Q.of(v)));
  }
  return { name, rows, cols, data };
}

export function zeros(rows, cols, name = 'O') {
  return matrix(rows, cols, new Array(rows * cols).fill(0), name);
}

export function ones(rows, cols, name = 'J') {
  return matrix(rows, cols, new Array(rows * cols).fill(1), name);
}

export function identity(n, name = 'I') {
  return matrix(
    n,
    n,
    Array.from({ length: n * n }, (_, i) => (Math.floor(i / n) === i % n ? 1 : 0)),
    name,
  );
}

export function diagonal(values, name = 'D') {
  const n = values.length;
  return matrix(
    n,
    n,
    Array.from({ length: n * n }, (_, i) => {
      const r = Math.floor(i / n);
      const c = i % n;
      return r === c ? values[r] : 0;
    }),
    name,
  );
}

export function cloneMatrix(input, name = input.name) {
  return {
    name,
    rows: input.rows,
    cols: input.cols,
    data: input.data.map((row) => row.map((value) => value.clone())),
  };
}

export function sameShape(a, b) {
  return a.rows === b.rows && a.cols === b.cols;
}

export function shapeLabel(value) {
  if (!value) return '';
  if (value.kind === 'scalar' || !value.data) return '标量';
  return `${value.rows}×${value.cols}`;
}

export function matrixEquals(a, b) {
  if (!sameShape(a, b)) return false;
  return a.data.every((row, r) => row.every((value, c) => value.eq(b.data[r][c])));
}

export function assertSameShape(a, b, operation = '运算') {
  if (!sameShape(a, b)) {
    throw new Error(
      `${operation}要求形状相同：${a.name} 是 ${a.rows}×${a.cols}，${b.name} 是 ${b.rows}×${b.cols}`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Elementary operations
 * ------------------------------------------------------------------ */

export function add(a, b) {
  assertSameShape(a, b, '矩阵加法');
  return {
    name: 'A+B',
    rows: a.rows,
    cols: a.cols,
    data: a.data.map((row, r) => row.map((v, c) => v.add(b.data[r][c]))),
  };
}

export function subtract(a, b) {
  assertSameShape(a, b, '矩阵减法');
  return {
    name: 'A−B',
    rows: a.rows,
    cols: a.cols,
    data: a.data.map((row, r) => row.map((v, c) => v.sub(b.data[r][c]))),
  };
}

export function hadamard(a, b) {
  assertSameShape(a, b, 'Hadamard 乘积');
  return {
    name: 'A⊙B',
    rows: a.rows,
    cols: a.cols,
    data: a.data.map((row, r) => row.map((v, c) => v.mul(b.data[r][c]))),
  };
}

export function hadamardPower(a, exponent) {
  const e = Number(exponent);
  return {
    ...cloneMatrix(a),
    name: `${a.name}^∘${e}`,
    data: a.data.map((row) => row.map((v) => v.pow(e))),
  };
}

export function scale(a, scalar) {
  const k = Q.of(scalar);
  return {
    ...cloneMatrix(a),
    name: `${formatNumber(k)}${a.name}`,
    data: a.data.map((row) => row.map((v) => v.mul(k))),
  };
}

export function divide(a, scalar) {
  return scale(a, Q.of(scalar).pow(-1));
}

export function addScalar(a, scalar) {
  const k = Q.of(scalar);
  return {
    ...cloneMatrix(a),
    data: a.data.map((row) => row.map((v) => v.add(k))),
  };
}

export function matmul(a, b, name = 'AB') {
  if (a.cols !== b.rows) {
    throw new Error(
      `矩阵乘法要求 A 的列数 = B 的行数：${a.rows}×${a.cols} 与 ${b.rows}×${b.cols} 不相容`,
    );
  }
  const data = [];
  for (let r = 0; r < a.rows; r++) {
    const row = [];
    for (let c = 0; c < b.cols; c++) {
      let sum = ZERO;
      for (let k = 0; k < a.cols; k++) sum = sum.add(a.data[r][k].mul(b.data[k][c]));
      row.push(sum);
    }
    data.push(row);
  }
  return { name, rows: a.rows, cols: b.cols, data };
}

export function transpose(a) {
  return {
    name: `${a.name}ᵀ`,
    rows: a.cols,
    cols: a.rows,
    data: Array.from({ length: a.cols }, (_, r) =>
      Array.from({ length: a.rows }, (_, c) => a.data[c][r].clone()),
    ),
  };
}

export function trace(a) {
  if (a.rows !== a.cols) throw new Error('只有方阵才有迹（trace）');
  let sum = ZERO;
  for (let i = 0; i < a.rows; i++) sum = sum.add(a.data[i][i]);
  return sum;
}

export function hadamardTrace(a) {
  return trace(a);
}

export function minorMatrix(a, skipRow, skipCol) {
  return {
    name: `M${skipRow + 1}${skipCol + 1}`,
    rows: a.rows - 1,
    cols: a.cols - 1,
    data: a.data
      .filter((_, r) => r !== skipRow)
      .map((row) => row.filter((_, c) => c !== skipCol)),
  };
}

export function minor(a, skipRow, skipCol) {
  const m = minorMatrix(a, skipRow, skipCol);
  return determinant(m);
}

export function cofactor(a, r, c) {
  return (r + c) % 2 === 0 ? minor(a, r, c) : minor(a, r, c).neg();
}

export function cofactorMatrix(a) {
  if (a.rows !== a.cols) throw new Error('只有方阵才有余子式矩阵');
  return {
    name: `cof(${a.name})`,
    rows: a.rows,
    cols: a.cols,
    data: a.data.map((row, r) => row.map((_, c) => cofactor(a, r, c))),
  };
}

export function adjugate(a) {
  return transpose(cofactorMatrix(a));
}

/* ------------------------------------------------------------------ *
 * Determinant & inversion (exact)
 * ------------------------------------------------------------------ */

export function determinant(input) {
  if (input.rows !== input.cols) throw new Error('行列式只对方阵有定义');
  const n = input.rows;
  if (n === 0) return ONE;
  if (n === 1) return input.data[0][0].clone();
  if (n === 2) return input.data[0][0].mul(input.data[1][1]).sub(input.data[0][1].mul(input.data[1][0]));
  const a = input.data.map((row) => row.map((v) => v.clone()));
  let sign = ONE;
  let det = ONE;
  for (let k = 0; k < n; k++) {
    let pivot = k;
    while (pivot < n && a[pivot][k].isZero) pivot++;
    if (pivot === n) return ZERO;
    if (pivot !== k) {
      [a[pivot], a[k]] = [a[k], a[pivot]];
      sign = sign.neg();
    }
    const pv = a[k][k];
    det = det.mul(pv);
    for (let r = k + 1; r < n; r++) {
      if (a[r][k].isZero) continue;
      const factor = a[r][k].div(pv);
      for (let c = k; c < n; c++) a[r][c] = a[r][c].sub(factor.mul(a[k][c]));
    }
  }
  return det.mul(sign);
}

/* Row-reduction trail used by every animated elimination story. */
export function rowReduceTrail(input, { pivotLimit = input.cols } = {}) {
  const rows = input.rows;
  const cols = input.cols;
  const a = input.data.map((row) => row.map((v) => v.clone()));
  const steps = [];
  const pivots = [];
  const record = (step) => {
    const before = step.before;
    const after = a.map((row) => row.map((v) => v.clone()));
    steps.push({ ...step, after, beforeTarget: before[step.target], afterTarget: after[step.target] });
  };
  let row = 0;
  for (let col = 0; col < Math.min(cols, pivotLimit) && row < rows; col++) {
    let p = row;
    while (p < rows && a[p][col].isZero) p++;
    if (p === rows) continue;
    if (p !== row) {
      const before = a.map((r) => r.map((v) => v.clone()));
      [a[p], a[row]] = [a[row], a[p]];
      record({ type: 'swap', target: row, source: p, pivotCol: col, pivotRow: row, before });
    }
    const pivot = a[row][col];
    if (!pivot.isOne) {
      const before = a.map((r) => r.map((v) => v.clone()));
      for (let c = 0; c < cols; c++) a[row][c] = a[row][c].div(pivot);
      record({
        type: 'scale',
        target: row,
        source: row,
        factor: pivot,
        pivotCol: col,
        pivotRow: row,
        before,
      });
    }
    for (let r = 0; r < rows; r++) {
      if (r === row || a[r][col].isZero) continue;
      const before = a.map((rr) => rr.map((v) => v.clone()));
      const factor = a[r][col];
      for (let c = 0; c < cols; c++) a[r][c] = a[r][c].sub(factor.mul(a[row][c]));
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

export function rref(input) {
  return rowReduceTrail(input).matrix;
}

export function rank(input) {
  return rowReduceTrail(input).rank;
}

export function inverse(input) {
  if (input.rows !== input.cols) throw new Error('只有方阵才可能可逆');
  const n = input.rows;
  const aug = {
    name: `[${input.name} | I]`,
    rows: n,
    cols: 2 * n,
    data: input.data.map((row, r) => [
      ...row.map((v) => v.clone()),
      ...Array.from({ length: n }, (_, c) => (r === c ? ONE : ZERO)),
    ]),
  };
  const trail = rowReduceTrail(aug, { pivotLimit: n });
  if (trail.rank !== n) throw new Error('矩阵是奇异的（不可逆），无法求出逆矩阵');
  const data = trail.matrix.data.map((row) => row.slice(n));
  return { name: `${input.name}⁻¹`, rows: n, cols: n, data };
}

export function inverseTrail(input) {
  if (input.rows !== input.cols) throw new Error('只有方阵才可能可逆');
  const n = input.rows;
  const aug = {
    name: `[${input.name} | I]`,
    rows: n,
    cols: 2 * n,
    data: input.data.map((row, r) => [
      ...row.map((v) => v.clone()),
      ...Array.from({ length: n }, (_, c) => (r === c ? ONE : ZERO)),
    ]),
  };
  const trail = rowReduceTrail(aug, { pivotLimit: n });
  if (trail.rank !== n) throw new Error('矩阵是奇异的（不可逆），无法求出逆矩阵');
  return {
    ...trail,
    augmented: aug,
    inverse: {
      name: `${input.name}⁻¹`,
      rows: n,
      cols: n,
      data: trail.matrix.data.map((row) => row.slice(n)),
    },
  };
}

export function solveLinear(A, b) {
  if (A.rows !== A.cols) throw new Error('solve(A, b) 目前要求 A 是方阵');
  if (b.rows !== A.rows || b.cols !== 1) {
    throw new Error(`b 需要是 ${A.rows}×1 的列向量，当前是 ${b.rows}×${b.cols}`);
  }
  const n = A.rows;
  const aug = {
    name: '[A | b]',
    rows: n,
    cols: n + 1,
    data: A.data.map((row, r) => [...row.map((v) => v.clone()), b.data[r][0].clone()]),
  };
  const trail = rowReduceTrail(aug, { pivotLimit: n });
  if (trail.rank < n) {
    const deficient = trail.pivots.some((p) => p.col === n);
    throw new Error(deficient ? '方程组不相容，无解' : '方程组有自由变量，解不唯一');
  }
  const x = {
    name: 'x',
    rows: n,
    cols: 1,
    data: trail.matrix.data.map((row) => [row[n]]),
  };
  return { x, trail, augmented: aug };
}

export function solveTrail(A, b) {
  return solveLinear(A, b);
}

export function nullspace(A) {
  const trail = rowReduceTrail(A);
  const pivotCols = new Set(trail.pivots.map((p) => p.col));
  const free = Array.from({ length: A.cols }, (_, i) => i).filter((c) => !pivotCols.has(c));
  if (!free.length) {
    return { basis: [], matrix: matrix(A.cols, 0, [], 'N(A)'), free };
  }
  const basis = free.map((freeCol) => {
    const vec = new Array(A.cols).fill(ZERO);
    vec[freeCol] = ONE;
    trail.pivots.forEach((pivot, index) => {
      vec[pivot.col] = trail.matrix.data[index][freeCol].neg();
    });
    return vec;
  });
  return {
    basis,
    matrix: {
      name: 'N(A)',
      rows: A.cols,
      cols: basis.length,
      data: Array.from({ length: A.cols }, (_, r) => basis.map((v) => v[r])),
    },
    free,
  };
}

export function columnSpace(A) {
  const pivotCols = rowReduceTrail(A).pivots.map((p) => p.col);
  return {
    basis: pivotCols.map((c) => A.data.map((row) => row[c])),
    columns: pivotCols,
    matrix: {
      name: 'Col(A)',
      rows: A.rows,
      cols: pivotCols.length,
      data: A.data.map((row) => pivotCols.map((c) => row[c])),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Structural operations
 * ------------------------------------------------------------------ */

export function concatHorizontal(matrices) {
  if (!matrices.length) throw new Error('至少需要一个矩阵');
  const rowCount = matrices[0].rows;
  if (matrices.some((m) => m.rows !== rowCount)) {
    throw new Error('水平拼接要求所有矩阵拥有相同的行数');
  }
  return {
    name: '水平拼接',
    rows: rowCount,
    cols: matrices.reduce((sum, m) => sum + m.cols, 0),
    data: Array.from({ length: rowCount }, (_, r) => matrices.flatMap((m) => m.data[r].map((v) => v.clone()))),
  };
}

export function concatVertical(matrices) {
  if (!matrices.length) throw new Error('至少需要一个矩阵');
  const colCount = matrices[0].cols;
  if (matrices.some((m) => m.cols !== colCount)) {
    throw new Error('竖直拼接要求所有矩阵拥有相同的列数');
  }
  return {
    name: '竖直拼接',
    rows: matrices.reduce((sum, m) => sum + m.rows, 0),
    cols: colCount,
    data: matrices.flatMap((m) => m.data.map((row) => row.map((v) => v.clone()))),
  };
}

export function concatBlocks(grid) {
  const blocks = grid.flat().filter(Boolean);
  if (!blocks.length) throw new Error('请至少放入一个矩阵块');
  const rows = grid.length;
  const cols = Math.max(...grid.map((row) => row.length));
  const rowHeights = [];
  const colWidths = [];
  for (let r = 0; r < rows; r++) {
    const nonEmpty = grid[r].filter(Boolean);
    if (!nonEmpty.length) throw new Error(`第 ${r + 1} 个块行还是空的`);
    if (nonEmpty.some((m) => m.rows !== nonEmpty[0].rows)) {
      throw new Error(`第 ${r + 1} 个块行中矩阵行数不一致`);
    }
    rowHeights[r] = nonEmpty[0].rows;
  }
  for (let c = 0; c < cols; c++) {
    const nonEmpty = grid.map((row) => row[c]).filter(Boolean);
    if (!nonEmpty.length) throw new Error(`第 ${c + 1} 个块列还是空的`);
    if (nonEmpty.some((m) => m.cols !== nonEmpty[0].cols)) {
      throw new Error(`第 ${c + 1} 个块列中矩阵列数不一致`);
    }
    colWidths[c] = nonEmpty[0].cols;
  }
  if (rowHeights.some((h) => !h) || colWidths.some((w) => !w)) {
    throw new Error('每个块行 / 块列都必须至少包含一个矩阵');
  }
  const totalRows = rowHeights.reduce((a, b) => a + b, 0);
  const totalCols = colWidths.reduce((a, b) => a + b, 0);
  const data = Array.from({ length: totalRows }, () => new Array(totalCols).fill(ZERO));
  const placements = [];
  let y = 0;
  for (let br = 0; br < rows; br++) {
    let x = 0;
    for (let bc = 0; bc < cols; bc++) {
      const block = grid[br][bc];
      if (block) {
        for (let r = 0; r < block.rows; r++) {
          for (let c = 0; c < block.cols; c++) {
            data[y + r][x + c] = block.data[r][c].clone();
          }
        }
        placements.push({
          block,
          blockRow: br,
          blockCol: bc,
          rowOffset: y,
          colOffset: x,
        });
      }
      x += colWidths[bc];
    }
    y += rowHeights[br];
  }
  return {
    matrix: { name: 'K', rows: totalRows, cols: totalCols, data },
    placements,
    rowHeights,
    colWidths,
    rowOffsets: rowHeights.reduce((acc, h) => (acc.push((acc.at(-1) || 0) + h), acc), []),
    colOffsets: colWidths.reduce((acc, w) => (acc.push((acc.at(-1) || 0) + w), acc), []),
  };
}

export function directSum(a, b) {
  const rows = a.rows + b.rows;
  const cols = a.cols + b.cols;
  return {
    name: 'A⊕B',
    rows,
    cols,
    data: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        if (r < a.rows && c < a.cols) return a.data[r][c].clone();
        if (r >= a.rows && c >= a.cols) return b.data[r - a.rows][c - a.cols].clone();
        return ZERO;
      }),
    ),
  };
}

export function kronecker(a, b) {
  const rows = a.rows * b.rows;
  const cols = a.cols * b.cols;
  const data = Array.from({ length: rows }, () => new Array(cols).fill(ZERO));
  for (let ar = 0; ar < a.rows; ar++) {
    for (let ac = 0; ac < a.cols; ac++) {
      for (let br = 0; br < b.rows; br++) {
        for (let bc = 0; bc < b.cols; bc++) {
          data[ar * b.rows + br][ac * b.cols + bc] = a.data[ar][ac].mul(b.data[br][bc]);
        }
      }
    }
  }
  return { name: 'A⊗B', rows, cols, data };
}

export function power(a, exponent) {
  const e = Number(exponent);
  if (!Number.isInteger(e)) throw new Error('矩阵幂次必须是整数');
  if (a.rows !== a.cols) throw new Error('只有方阵才有整数幂');
  if (e < 0) return power(inverse(a), -e);
  if (e === 0) return identity(a.rows, `${a.name}⁰`);
  let result = identity(a.rows, `${a.name}^${e}`);
  let base = cloneMatrix(a);
  let n = e;
  while (n > 0) {
    if (n & 1) result = matmul(result, base, `${a.name}^${e}`);
    n >>= 1;
    if (n) base = matmul(base, base);
  }
  return result;
}

export function dot(u, v) {
  if (u.rows !== v.rows || u.cols !== 1 || v.cols !== 1) {
    throw new Error('点积需要两个同尺寸列向量');
  }
  let sum = ZERO;
  for (let i = 0; i < u.rows; i++) sum = sum.add(u.data[i][0].mul(v.data[i][0]));
  return sum;
}

export function outer(u, v) {
  if (u.cols !== 1 || v.cols !== 1) throw new Error('外积需要两个列向量');
  return {
    name: 'uvᵀ',
    rows: u.rows,
    cols: v.rows,
    data: u.data.map((ur) => v.data.map((vr) => ur[0].mul(vr[0]))),
  };
}

export function frobeniusNorm(a) {
  let sum = 0;
  for (const row of a.data) for (const v of row) sum += v.toNumber() ** 2;
  return Math.sqrt(sum);
}

/* ------------------------------------------------------------------ *
 * Decompositions & spectral helpers (real numerical routines)
 * ------------------------------------------------------------------ */

export function luDecompose(input) {
  if (input.rows !== input.cols) throw new Error('LU 分解要求方阵');
  const n = input.rows;
  const U = input.data.map((row) => row.map((v) => v.clone()));
  const L = Array.from({ length: n }, (_, r) => new Array(n).fill(ZERO).map((_, c) => (r === c ? ONE : ZERO)));
  const P = identity(n, 'P');
  const steps = [];
  let swaps = 0;
  let singular = false;
  for (let k = 0; k < n; k++) {
    let pivot = k;
    while (pivot < n && U[pivot][k].isZero) pivot++;
    if (pivot === n) {
      singular = true;
      continue;
    }
    if (pivot !== k) {
      [U[pivot], U[k]] = [U[k], U[pivot]];
      [P.data[pivot], P.data[k]] = [P.data[k], P.data[pivot]];
      for (let c = 0; c < k; c++) [L.data[pivot][c], L.data[k][c]] = [L.data[k][c], L.data[pivot][c]];
      swaps++;
      steps.push({ type: 'swap', target: k, source: pivot });
    }
    for (let r = k + 1; r < n; r++) {
      if (U[r][k].isZero) continue;
      const factor = U[r][k].div(U[k][k]);
      L[r][k] = factor;
      for (let c = k; c < n; c++) U[r][c] = U[r][c].sub(factor.mul(U[k][c]));
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

export function qrDecompose(input) {
  const n = input.rows;
  const m = input.cols;
  const A = input.data.map((row) => row.map((v) => v.toNumber()));
  const Q = Array.from({ length: n }, () => new Array(m).fill(0));
  const R = Array.from({ length: m }, () => new Array(m).fill(0));
  for (let j = 0; j < m; j++) {
    const v = A.map((row) => row[j]);
    for (let i = 0; i < j; i++) {
      let r = 0;
      for (let k = 0; k < n; k++) r += Q[k][i] * v[k];
      R[i][j] = r;
      for (let k = 0; k < n; k++) v[k] -= r * Q[k][i];
    }
    const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
    R[j][j] = norm;
    if (norm > 1e-12) for (let k = 0; k < n; k++) Q[k][j] = v[k] / norm;
  }
  return { Q, R, numeric: true };
}

export function characteristicPolynomial(input) {
  if (input.rows !== input.cols) throw new Error('特征多项式只对方阵有定义');
  const n = input.rows;
  let M = identity(n);
  const coeffs = [ONE];
  for (let k = 1; k <= n; k++) {
    M = matmul(input, M);
    const c = trace(M).div(Q.of(k)).neg();
    coeffs.push(c);
    M = add(M, scale(identity(n), c));
  }
  return coeffs;
}

export function eigenvalues2x2(input) {
  if (input.rows !== 2 || input.cols !== 2) throw new Error('2×2 特征值例程需要 2×2 矩阵');
  const a = input.data[0][0].toNumber();
  const b = input.data[0][1].toNumber();
  const c = input.data[1][0].toNumber();
  const d = input.data[1][1].toNumber();
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

export function isSymmetric(input, tolerance = 1e-9) {
  if (input.rows !== input.cols) return false;
  for (let r = 0; r < input.rows; r++) {
    for (let c = 0; c < input.cols; c++) {
      if (Math.abs(input.data[r][c].toNumber() - input.data[c][r].toNumber()) > tolerance) return false;
    }
  }
  return true;
}

export function eigenvaluesSymmetric(input) {
  if (!isSymmetric(input)) throw new Error('实对称特征值例程需要对称矩阵');
  const n = input.rows;
  const a = input.data.map((row) => row.map((v) => v.toNumber()));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
      }
    }
  }
  return Array.from({ length: n }, (_, i) => ({ re: a[i][i], im: 0 })).sort((x, y) => y.re - x.re);
}

export function eigenvaluesNumeric(input) {
  if (input.rows !== input.cols) throw new Error('特征值只对方阵有定义');
  if (input.rows === 1) return [{ re: input.data[0][0].toNumber(), im: 0 }];
  if (input.rows === 2) return eigenvalues2x2(input).values;
  if (isSymmetric(input)) return eigenvaluesSymmetric(input);
  // Unshifted QR iteration: good enough for an illustrative numerical reading.
  let A = input.data.map((row) => row.map((v) => v.toNumber()));
  const n = input.rows;
  for (let iter = 0; iter < 600; iter++) {
    const qr = qrNumeric(A);
    A = multiplyNumeric(qr.R, qr.Q);
    let off = 0;
    for (let r = 1; r < n; r++) for (let c = 0; c < r; c++) off += A[r][c] ** 2;
    if (off < 1e-20) break;
  }
  return Array.from({ length: n }, (_, i) => ({ re: A[i][i], im: 0 })).sort((x, y) => y.re - x.re);
}

function qrNumeric(A) {
  const n = A.length;
  const m = A[0].length;
  const Q = Array.from({ length: n }, () => new Array(m).fill(0));
  const R = Array.from({ length: m }, () => new Array(m).fill(0));
  let data = A.map((row) => row.slice());
  for (let j = 0; j < m; j++) {
    const v = data.map((row) => row[j]);
    for (let i = 0; i < j; i++) {
      let r = 0;
      for (let k = 0; k < n; k++) r += Q[k][i] * v[k];
      R[i][j] = r;
      for (let k = 0; k < n; k++) v[k] -= r * Q[k][i];
    }
    const norm = Math.hypot(...v);
    R[j][j] = norm;
    if (norm > 1e-14) for (let k = 0; k < n; k++) Q[k][j] = v[k] / norm;
  }
  return { Q, R };
}

function multiplyNumeric(A, B) {
  const rows = A.length;
  const mid = A[0].length;
  const cols = B[0].length;
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      let sum = 0;
      for (let k = 0; k < mid; k++) sum += A[r][k] * B[k][c];
      return sum;
    }),
  );
}

export function formatEigen(eigen) {
  if (eigen.im && Math.abs(eigen.im) > 1e-9) {
    const sign = eigen.im > 0 ? '+' : '−';
    return `${cleanFloat(eigen.re)} ${sign} ${cleanFloat(Math.abs(eigen.im))}i`;
  }
  return cleanFloat(eigen.re);
}

export function cleanFloat(value) {
  if (Math.abs(value) < 1e-10) return '0';
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

/* ------------------------------------------------------------------ *
 * Utilities
 * ------------------------------------------------------------------ */

export function toNumberGrid(input) {
  return input.data.map((row) => row.map((v) => v.toNumber()));
}

export function fromNumberGrid(rows, name = 'R') {
  return matrixFromRows(
    rows.map((row) => row.map((v) => String(Math.round(v * 1e8) / 1e8))),
    name,
  );
}

export function matrixToText(input) {
  return input.data.map((row) => row.map((v) => formatNumber(v)).join('\t')).join('\n');
}

export function randomMatrix(rows, cols, { min = -4, max = 4, zeroChance = 0.14 } = {}) {
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

export function dotProductOfRows(a, rowA, b, colB) {
  const products = [];
  let sum = ZERO;
  for (let k = 0; k < b.rows; k++) {
    const x = a.data[rowA][k];
    const y = b.data[k][colB];
    products.push({ k, a: x, b: y, product: x.mul(y) });
    sum = sum.add(x.mul(y));
  }
  return { products, sum };
}

export function subMatrixText(matrix, r, c) {
  return formatNumber(matrix.data[r][c]);
}
