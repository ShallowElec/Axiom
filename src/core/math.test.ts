import { describe, expect, it } from 'vitest';
import { Q } from './rational.js';
import * as M from './matrix.js';
import { analyzeExpression } from './expression.js';
import { buildStoryFromExpression } from '../presentation/stories.js';

const A = M.matrixFromRows([[2, 1], [-1, 3]], 'A');
const B = M.matrixFromRows([[4, 0], [2, 5]], 'B');
const C = M.matrixFromRows([[1, 2, 0], [0, 1, 3], [2, 0, 1]], 'C');
const b = M.matrixFromRows([[5], [1], [2]], 'b');
const swap = M.matrixFromRows([[0, 2], [1, 3]], 'S');
const singular = M.matrixFromRows([[1, 2], [2, 4]], 'G');
const rect = M.matrixFromRows([[1, 2, 3, 4], [2, 4, 6, 8], [1, 1, 1, 1]], 'R');

describe('exact rational arithmetic', () => {
  it('parses decimals, fractions and scientific notation', () => {
    expect(Q.parse('0.5').toString()).toBe('1/2');
    expect(Q.parse('-3/6').toString()).toBe('-1/2');
    expect(Q.parse('1.2e-3').toString()).toBe('3/2500');
    expect(Q.parse('2/3').pow(-2).toString()).toBe('9/4');
  });
});

describe('matrix operations', () => {
  it('adds and multiplies', () => {
    expect(M.matrixToText(M.add(A, B))).toBe('6\t1\n1\t8');
    expect(M.matrixToText(M.matmul(A, B))).toBe('10\t5\n2\t15');
  });

  it('computes determinants', () => {
    expect(M.determinant(A).eq(Q.of(7))).toBe(true);
    expect(M.determinant(swap).eq(Q.of(-2))).toBe(true);
    expect(M.determinant(C).eq(Q.of(13))).toBe(true);
  });

  it('inverts invertible matrices', () => {
    expect(M.matrixEquals(M.matmul(A, M.inverse(A)), M.identity(2))).toBe(true);
    expect(M.matrixEquals(M.matmul(swap, M.inverse(swap)), M.identity(2))).toBe(true);
    expect(() => M.inverse(singular)).toThrow();
  });

  it('reduces and ranks', () => {
    expect(M.rank(rect)).toBe(2);
    expect(M.rowReduceTrail(rect).rank).toBe(2);
    expect(M.matrixToText(M.rref(C)).startsWith('1')).toBe(true);
    expect(M.trace(C).eq(Q.of(3))).toBe(true);
  });

  it('finds nullspaces and solves systems', () => {
    const ns = M.nullspace(singular);
    expect(ns.basis.length).toBe(1);
    const vector = ns.basis[0]!;
    expect(singular.data[0]![0]!.mul(vector[0]!).add(singular.data[0]![1]!.mul(vector[1]!)).eq(Q.of(0))).toBe(true);
    const solved = M.solveLinear(C, b);
    const residual = M.matmul(C, solved.x);
    expect(residual.data.every((row, r) => row[0]!.eq(b.data[r]![0]!))).toBe(true);
  });

  it('LU decomposes (including permutations)', () => {
    for (const input of [A, swap]) {
      const lu = M.luDecompose(input);
      expect(M.matrixEquals(M.matmul(lu.P, input), M.matmul(lu.L, lu.U))).toBe(true);
    }
  });

  it('assembles blocks and Kronecker products', () => {
    const horizontal = M.concatBlocks([[A, B]]);
    expect([horizontal.matrix.rows, horizontal.matrix.cols]).toEqual([2, 4]);
    const vertical = M.concatBlocks([[A], [B]]);
    expect([vertical.matrix.rows, vertical.matrix.cols]).toEqual([4, 2]);
    expect(M.kronecker(A, B).rows).toBe(4);
  });

  it('relates adjugate and determinant', () => {
    const adj = M.adjugate(A);
    expect(M.matrixEquals(M.matmul(A, adj), M.scale(M.identity(2), M.determinant(A)))).toBe(true);
  });

  it('produces QR / eigen / characteristic data', () => {
    const qr = M.qrDecompose(A);
    expect(M.qrDecompose(C).Q.length).toBe(3);
    expect(M.qrDecompose(C).R.length).toBe(3);
    const symmetric = M.eigenvaluesNumeric(M.matrixFromRows([[2, 1], [1, 2]], 'Sym'));
    expect(Math.abs((symmetric[0]?.re ?? 0) - 3)).toBeLessThan(1e-9);
    expect(Math.abs((symmetric[1]?.re ?? 0) - 1)).toBeLessThan(1e-9);
    const charPoly = M.characteristicPolynomial(A);
    expect(charPoly[2]!.eq(Q.of(7))).toBe(true);
    expect(M.eigenvaluesNumeric(A).length).toBe(2);
    let maxError = 0;
    for (let i = 0; i < A.rows; i++) {
      for (let j = 0; j < A.cols; j++) {
        let sum = 0;
        for (let k = 0; k < A.cols; k++) sum += (qr.Q[i]?.[k] ?? 0) * (qr.R[k]?.[j] ?? 0);
        maxError = Math.max(maxError, Math.abs(sum - (A.data[i]?.[j]?.toNumber() ?? 0)));
      }
    }
    expect(maxError).toBeLessThan(1e-9);
  });
});

describe('expression analysis and story compilation', () => {
  const library = { A, B, C, b, rect };
  const validExpressions = [
    'A + B',
    'A - B',
    'A × B',
    'A ⊙ B',
    'A ⊗ B',
    'Aᵀ',
    'A^T',
    'det(A)',
    'det(C)',
    'trace(C)',
    'rank(rect)',
    'inv(A)',
    'rref(C)',
    'solve(C,b)',
    'A^2',
    '2 × A',
    'A / 2',
    'A × B + A',
    'transpose(A)',
    'adj(A)',
    '-A',
    'minor(C, 1, 1)',
    '2 + 3',
    'det(C) + det(A)',
    '2 * det(A)',
  ];

  for (const expression of validExpressions) {
    it(`compiles ${expression}`, () => {
      const analysis = analyzeExpression(expression, library);
      expect(analysis.ok, analysis.ok ? '' : analysis.error).toBe(true);
      const story = buildStoryFromExpression(expression, library);
      expect(story.chapters.length).toBeGreaterThan(0);
      expect(story.resultValue.kind).toMatch(/matrix|scalar/);
    });
  }

  for (const expression of ['A + B ⊙ C', 'A × C', 'det(A)+', 'foo(A)', 'inv(G)', 'solve(A,b)']) {
    it(`rejects ${expression}`, () => {
      expect(analyzeExpression(expression, { ...library, G: singular }).ok).toBe(false);
    });
  }
});
