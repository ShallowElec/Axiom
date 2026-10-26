import { Q } from '../src/engine/rational.js';
import * as M from '../src/engine/matrix.js';
import { analyzeExpression, evaluateExpression } from '../src/engine/expression.js';
import { buildStoryFromExpression } from '../src/engine/stories.js';

let pass = 0, fail = 0;
function check(name, cond, extra='') { if (cond) { pass++; } else { fail++; console.log('FAIL', name, extra); } }
function eq(a,b){ return a.toString()===b.toString(); }

// rational
check('decimal 0.5', Q.parse('0.5').toString() === '1/2');
check('fraction -3/6', Q.parse('-3/6').toString() === '-1/2');
check('sci 1.2e-3', Q.parse('1.2e-3').toString() === '3/2500');
check('pow', Q.parse('2/3').pow(-2).toString() === '9/4');

const A = M.matrixFromRows([[2,1],[-1,3]],'A');
const B = M.matrixFromRows([[4,0],[2,5]],'B');
const C = M.matrixFromRows([[1,2,0],[0,1,3],[2,0,1]],'C');
const b = M.matrixFromRows([[5],[1],[2]],'b');
const swap = M.matrixFromRows([[0,2],[1,3]],'S');
const singular = M.matrixFromRows([[1,2],[2,4]],'G');
const rect = M.matrixFromRows([[1,2,3,4],[2,4,6,8],[1,1,1,1]],'R');

check('add', M.matrixToText(M.add(A,B)) === '6\t1\n1\t8');
check('mul', M.matrixToText(M.matmul(A,B)) === '10\t5\n2\t15');
check('det', eq(M.determinant(A), Q.of(7)));
check('det swap', eq(M.determinant(swap), Q.of(-2)));
check('det C', eq(M.determinant(C), Q.of(13)));
const inv = M.inverse(A);
check('inverse', M.matrixEquals(M.matmul(A, inv), M.identity(2)));
const invS = M.inverse(swap);
check('inverse swap', M.matrixEquals(M.matmul(swap, invS), M.identity(2)));
check('rank rect', M.rank(rect) === 2);
check('rref rank', M.rowReduceTrail(rect).rank === 2);
const rrefC = M.rref(C);
check('rref ids', M.matrixToText(rrefC).startsWith('1'));
check('trace', eq(M.trace(C), Q.of(3)));
const ns = M.nullspace(singular);
check('nullspace', ns.basis.length === 1 && eq(singular.rows === 2 ? singular.data[0][0].mul(ns.basis[0][0]).add(singular.data[0][1].mul(ns.basis[0][1])) : Q.of(0), Q.of(0)));
const solve = M.solveLinear(C,b);
check('solve residual', (() => {
  const ax = M.matmul(C, solve.x);
  return ax.data.every((row,r)=>row[0].eq(b.data[r][0]));
})());
let invSingular = false;
try { M.inverse(singular); } catch { invSingular = true; }
check('singular rejected', invSingular);
const lu = M.luDecompose(A);
let PA = M.matmul(lu.P, A);
let LU = M.matmul(lu.L, lu.U);
check('LU PA=LU', M.matrixEquals(PA, LU), `${M.matrixToText(PA)} vs ${M.matrixToText(LU)}`);
const luS = M.luDecompose(swap);
check('LU swap PA=LU', M.matrixEquals(M.matmul(luS.P, swap), M.matmul(luS.L, luS.U)));
const direct = M.concatBlocks([[A,B]]);
check('block horizontal', direct.matrix.rows===2 && direct.matrix.cols===4);
const vertical = M.concatBlocks([[A],[B]]);
check('block vertical', vertical.matrix.rows===4 && vertical.matrix.cols===2);
check('kron shape', M.kronecker(A,B).rows===4);
const adj = M.adjugate(A);
check('A adj = det I', M.matrixEquals(M.matmul(A, adj), M.scale(M.identity(2), M.determinant(A))));
const qr = M.qrDecompose(C);
check('QR shapes', qr.Q.length===3 && qr.R.length===3);
const eigS = M.eigenvaluesNumeric(M.matrixFromRows([[2,1],[1,2]],'Sym'));
check('eig symmetric', Math.abs(eigS[0].re-3)<1e-9 && Math.abs(eigS[1].re-1)<1e-9);
const charPoly = M.characteristicPolynomial(A);
check('char poly det', eq(charPoly[2], Q.of(7)));
const eig2 = M.eigenvaluesNumeric(A);
check('eig 2x2', eig2.length===2);
const QR = M.qrDecompose(A);
check('QR reconstruct', (()=>{
  let max=0;
  for(let i=0;i<A.rows;i++)for(let j=0;j<A.cols;j++){
    let s=0; for(let k=0;k<A.cols;k++) s+=QR.Q[i][k]*QR.R[k][j];
    max=Math.max(max, Math.abs(s-A.data[i][j].toNumber()));
  }
  return max<1e-9;
})());
const lib = { A,B,C,b };
for (const expr of ['A + B','A - B','A × B','A ⊙ B','A ⊗ B','Aᵀ','A^T','det(A)','det(C)','trace(C)','rank(rect)','inv(A)','rref(C)','solve(C,b)','A^2','2 × A','A / 2','A × B + A','transpose(A)','adj(A)','-A','minor(C, 1, 1)','2 + 3','det(C) + det(A)','2 * det(A)']) {
  const a = analyzeExpression(expr, {...lib, rect});
  check('parse '+expr, a.ok, a.error);
  if (a.ok) {
    try { const s=buildStoryFromExpression(expr,{...lib, rect}); check('story '+expr, s.chapters.length>0); }
    catch(e) { check('story '+expr, false, e.stack); }
  }
}
for (const expr of ['A + B ⊙ C','A × C','det(A)+','foo(A)','inv(G)','solve(A,b)']) {
  const a = analyzeExpression(expr, {...lib, rect, G:singular});
  check('invalid expected '+expr, !a.ok, 'unexpected ok');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
