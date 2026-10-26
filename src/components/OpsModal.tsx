import { useEffect, useMemo, useRef, useState } from 'react';
import { OPS_REFERENCE } from '../content/library.js';
import type { OperationReferenceItem } from '../content/library.js';
import { analyzeExpression } from '../core/expression.js';
import {
  characteristicPolynomial,
  cleanFloat,
  dot,
  eigenvaluesNumeric,
  formatEigen,
  frobeniusNorm,
  luDecompose,
  nullspace,
  outer,
  qrDecompose,
} from '../core/matrix.js';
import type { Matrix, StoredMatrix } from '../core/matrix.js';
import type { Q } from '../core/rational.js';
import { Modal, ModalHeader } from './Modal';
import { Icon } from './Icons';

interface MatrixTextData {
  rows: number;
  cols: number;
  data: readonly (readonly (Q | number)[])[];
}

interface TrayValue {
  label: string;
  value: string;
}

interface TrayMatrix {
  name: string;
  shape: string;
  text: string;
}

interface AdvancedReadout {
  title?: string;
  note?: string;
  numeric?: boolean;
  values?: TrayValue[];
  matrices?: TrayMatrix[];
  extras?: string[];
  error?: string;
}

function expressionForCode(code: string, first?: Matrix, second?: Matrix, vector?: Matrix): string | null {
  const a = first?.name;
  const vectorName = second?.cols === 1 ? second.name : vector?.name;
  switch (code) {
    case 'add': return `${a} + ${second?.name}`;
    case 'sub': return `${a} - ${second?.name}`;
    case 'hadamard': return `${a} ⊙ ${second?.name}`;
    case 'matmul': return `${a} × ${second?.name}`;
    case 'kron': return `${a} ⊗ ${second?.name}`;
    case 'scale': return `2 × ${a}`;
    case 'divide': return `${a} / 2`;
    case 'transpose': return `${a}ᵀ`;
    case 'power': return `${a}^2`;
    case 'det': return `det(${a})`;
    case 'trace': return `trace(${a})`;
    case 'rank': return `rank(${a})`;
    case 'rref': return `rref(${a})`;
    case 'inv': return `inv(${a})`;
    case 'adj': return `adj(${a})`;
    case 'solve': return `solve(${a}, ${vectorName})`;
    default: return null;
  }
}

function matrixLines(matrix: MatrixTextData, name: string, numeric = false): TrayMatrix {
  const text = matrix.data
    .map((row) =>
      row
        .map((value) => (numeric ? cleanFloat(typeof value === 'number' ? value : value.toNumber()) : (value as Q).toString()))
        .join('\t'),
    )
    .join('\n');
  return {
    name,
    shape: `${matrix.rows}×${matrix.cols}`,
    text,
  };
}

function polynomialString(coeffs: readonly Q[]): string {
  const terms: string[] = [];
  coeffs.forEach((value, index) => {
    if (value.isZero) return;
    const power = coeffs.length - 1 - index;
    const abs = value.abs();
    const coefficient = abs.isOne && power > 0 ? '' : abs.toString();
    const variable = power === 0 ? '' : power === 1 ? 'λ' : `λ^${power}`;
    const sign = value.sign < 0 ? '−' : terms.length ? '+' : '';
    terms.push(`${sign}${coefficient}${variable}`.trim());
  });
  return terms.length ? terms.join(' ') : '0';
}

function computeAdvanced(code: string, first?: Matrix, _matrices?: readonly Matrix[], second?: Matrix): AdvancedReadout {
  if (!first) return { error: '请选择一个矩阵' };
  try {
    if (code === 'dot') {
      if (!second) return { error: '请选择第二个列向量。' };
      if (first.cols !== 1 || second.cols !== 1) return { error: '内积需要两个列向量。' };
      if (first.rows !== second.rows) return { error: `两个列向量高度不同：${first.rows} 与 ${second.rows}。` };
      const value = dot(first, second);
      return {
        title: '内积 · u · v',
        note: '对应位置相乘，再全部相加。结果是一个标量；它衡量两个向量在同一方向上的投影关系。',
        values: [{ label: 'u · v', value: value.toString() }],
        extras: ['精确有理数', `向量维度 = ${first.rows}`],
      };
    }
    if (code === 'outer') {
      if (!second) return { error: '请选择第二个列向量。' };
      if (first.cols !== 1 || second.cols !== 1) return { error: '外积需要两个列向量。' };
      const result = outer(first, second);
      return {
        title: '外积 · u vᵀ',
        note: '列向量乘行向量，生成一张每一行都是 v 的倍数的新矩阵。',
        matrices: [matrixLines(result, `${first.name}${second.name}ᵀ`)],
        extras: [`形状 ${result.rows}×${result.cols}`, '秩最多为 1'],
      };
    }
    if (code === 'charpoly') {
      if (first.rows !== first.cols) return { error: '特征多项式只对方阵有定义。' };
      const coeffs = characteristicPolynomial(first);
      return {
        title: '特征多项式 · χ(λ)',
        note: '展开 det(λI − A) 得到的系数。它的根就是特征值。',
        values: coeffs.map((coefficient, index) => ({ label: index === 0 ? 'λⁿ 系数' : `项 ${index}`, value: coefficient.toString() })),
        extras: [`χ(λ) = ${polynomialString(coeffs)}`, '系数由 Faddeev–LeVerrier 递推精确求得'],
      };
    }
    if (code === 'lu') {
      if (first.rows !== first.cols) return { error: 'LU 分解需要方阵。' };
      const lu = luDecompose(first);
      if (lu.singular) return { error: '该矩阵的某个主元为 0，未做行交换时无法给出完整 LU；请查看中阶消元演示。' };
      return {
        title: 'LU 分解 · PA = LU',
        note: `置换符号 ${lu.permutationSign > 0 ? '+1' : '−1'}。P 记录行交换，L 是单位下三角，U 是上三角。`,
        matrices: [
          matrixLines(lu.P, 'P'),
          matrixLines(lu.L, 'L'),
          matrixLines(lu.U, 'U'),
        ],
        extras: [`行交换次数：${lu.swaps}`],
      };
    }
    if (code === 'qr') {
      const qr = qrDecompose(first);
      return {
        title: 'QR 分解 · 数值透视',
        note: '通过 Gram–Schmidt 逐步正交化。数字为浮点近似，形状与因子关系仍然严格。',
        matrices: [
          matrixLines({ rows: first.rows, cols: first.cols, data: qr.Q }, 'Q', true),
          matrixLines({ rows: first.cols, cols: first.cols, data: qr.R }, 'R', true),
        ],
        numeric: true,
        extras: ['A ≈ QR', `Q：${first.rows}×${first.cols} · R：${first.cols}×${first.cols}`],
      };
    }
    if (code === 'eig') {
      if (first.rows !== first.cols) return { error: '特征值只对方阵有定义。' };
      const values = eigenvaluesNumeric(first);
      return {
        title: '特征值读数 · eig(A)',
        note: first.rows > 2 ? '使用数值 QR/Jacobi 迭代，保留 6 位有效小数。' : '由特征多项式直接求根，结果以数值形式呈现。',
        numeric: true,
        values: values.map((value, index) => ({ label: `λ${index + 1}`, value: formatEigen(value) })),
        extras: [`迹 = ${cleanFloat(values.reduce((s, v) => s + v.re, 0))}`, `阶数 = ${first.rows}`],
      };
    }
    if (code === 'null') {
      const ns = nullspace(first);
      if (!ns.basis.length) {
        return { title: '零空间 · N(A)', note: '没有自由变量，零空间只有零向量 {0}。', extras: ['nullity = 0'] };
      }
      return {
        title: '零空间 · N(A)',
        note: '这些列向量被 A 映到零。零空间的维数 = 自由变量数量。',
        matrices: ns.matrix ? [matrixLines(ns.matrix, 'N(A)')] : [],
        extras: [`零空间维数：${ns.free.length}`, `自由列：${ns.free.map((c) => c + 1).join(', ')}`],
      };
    }
    if (code === 'norm') {
      const norm = frobeniusNorm(first);
      return {
        title: 'Frobenius 范数',
        note: '把所有元素平方相加再开方，衡量整张矩阵作为向量的长度。',
        values: [{ label: '‖A‖F', value: cleanFloat(norm) }],
        extras: [`元素数 = ${first.rows * first.cols}`, '非负标量'],
      };
    }
    return { error: '这个读数还没有接入。' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '读数计算失败' };
  }
}

interface OpsModalProps {
  open: boolean;
  matrices: readonly StoredMatrix[];
  onClose: () => void;
  onLaunchExpression: (expression: string, meta?: { title?: string; eyebrow?: string }) => void;
  onOpenBlock: () => void;
}

export default function OpsModal({
  open,
  matrices,
  onClose,
  onLaunchExpression,
  onOpenBlock,
}: OpsModalProps) {
  const [group, setGroup] = useState('全部');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedReadout | null>(null);
  const catalogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setFirst((current) => (matrices.some((m) => m.name === current) ? current : matrices[0]?.name || ''));
    setSecond((current) => (matrices.some((m) => m.name === current) ? current : matrices[1]?.name || ''));
    setError(null);
    setAdvanced(null);
    setGroup('全部');
  }, [open, matrices]);

  const firstMatrix = matrices.find((m) => m.name === first);
  const secondMatrix = matrices.find((m) => m.name === second);
  const vectorMatrix = matrices.find((m) => m.cols === 1);
  const groups = ['全部', ...OPS_REFERENCE.map((g) => g.group)];
  const visibleGroups = useMemo(
    () => (group === '全部' ? OPS_REFERENCE : OPS_REFERENCE.filter((g) => g.group === group)),
    [group],
  );

  if (!open) return null;

  const revealTray = (): void => {
    requestAnimationFrame(() => {
      catalogRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const handleOperation = (item: OperationReferenceItem): void => {
    setError(null);
    setAdvanced(null);
    if (item.code === 'block') {
      onOpenBlock();
      return;
    }

    const vectors = matrices.filter((m) => m.cols === 1);
    const square = matrices.find((m) => m.rows === m.cols);
    let chosenFirst = firstMatrix;
    let chosenSecond = secondMatrix;

    if (item.code === 'dot' || item.code === 'outer') {
      if (!chosenFirst || chosenFirst.cols !== 1) chosenFirst = vectors[0];
      if (!chosenSecond || chosenSecond.cols !== 1 || chosenSecond === chosenFirst) {
        chosenSecond = vectors.find((m) => m !== chosenFirst) || vectors[0];
      }
    } else if (['lu', 'qr', 'eig', 'charpoly'].includes(item.code)) {
      if (!chosenFirst || chosenFirst.rows !== chosenFirst.cols) chosenFirst = square;
    } else if (item.code === 'solve') {
      if (!chosenFirst || chosenFirst.rows !== chosenFirst.cols) chosenFirst = square;
      if (!chosenSecond || chosenSecond.cols !== 1) chosenSecond = vectors[0];
    }

    if (chosenFirst !== firstMatrix) setFirst(chosenFirst?.name ?? '');
    if (chosenSecond !== secondMatrix) setSecond(chosenSecond?.name ?? '');

    if (item.advanced) {
      setAdvanced(computeAdvanced(item.code, chosenFirst, matrices, chosenSecond));
      revealTray();
      return;
    }
    const expr = expressionForCode(item.code, chosenFirst, chosenSecond, chosenSecond);
    if (!expr || !chosenFirst) {
      setError('这个操作还没有可播放的表达式入口。');
      return;
    }
    const analysis = analyzeExpression(expr, Object.fromEntries(matrices.map((m) => [m.name, m])));
    if (!analysis.ok) {
      setError(`${item.name}：${analysis.error}`);
      revealTray();
      return;
    }
    onLaunchExpression(expr, { title: item.name, eyebrow: 'OPERATION LIBRARY' });
  };

  return (
    <Modal open={open} onClose={onClose} className="ops-modal" labelledBy="ops-title">
      <ModalHeader
        id="ops-title"
        eyebrow="OPERATION MANUAL / 运算手册"
        title="每一种线性代数操作，都有入口"
        description="选择一个具体对象，再选择操作。可播放的操作会直接装入演示台；分解与谱读数会在此处展开。"
        onClose={onClose}
      />
      <div className="ops-body">
        <aside className="ops-sidebar">
          <div className="operand-block">
            <span className="micro-label">OPERANDS / 作用对象</span>
            <label className="operand-field">
              <span>主矩阵</span>
              <select value={first} onChange={(e) => { setFirst(e.target.value); setAdvanced(null); setError(null); }}>
                {matrices.map((m) => <option key={m.name} value={m.name}>{m.name} · {m.rows}×{m.cols}</option>)}
              </select>
            </label>
            <label className="operand-field">
              <span>第二矩阵</span>
              <select value={second} onChange={(e) => { setSecond(e.target.value); setAdvanced(null); setError(null); }}>
                {matrices.map((m) => <option key={m.name} value={m.name}>{m.name} · {m.rows}×{m.cols}</option>)}
              </select>
            </label>
            <div className="operand-shape">
              <span>{firstMatrix?.rows}×{firstMatrix?.cols}</span>
              <em>+</em>
              <span>{secondMatrix?.rows}×{secondMatrix?.cols}</span>
            </div>
          </div>
          <div className="ops-groups">
            {groups.map((name) => (
              <button type="button" key={name} className={group === name ? 'active' : ''} onClick={() => setGroup(name)}>
                {name}
                <span>
                  {name === '全部'
                    ? OPS_REFERENCE.reduce((sum, g) => sum + g.items.length, 0)
                    : OPS_REFERENCE.find((g) => g.group === name)?.items.length}
                </span>
              </button>
            ))}
          </div>
          <div className="ops-note">
            <Icon name="book" size={15} />
            <p>所有可播放语法都能直接写进顶部表达式，例如 <code>A × B + A</code>。</p>
          </div>
        </aside>

        <section className="ops-catalog" ref={catalogRef as React.RefObject<HTMLElement>}>
          {(error || advanced) && (
            <div className={`ops-tray ${error ? 'is-error' : ''}`}>
              {error && (
                <>
                  <span className="tray-title">这次装填没有通过</span>
                  <p>{error}</p>
                  <button type="button" className="tray-close" onClick={() => setError(null)}><Icon name="close" size={13} /></button>
                </>
              )}
              {advanced && !error && (
                <>
                  <div className="tray-head">
                    <span className="micro-label">{advanced.numeric ? 'NUMERICAL READOUT' : 'EXACT / ANALYTIC READOUT'}</span>
                    <span>{advanced.title}</span>
                    <button type="button" className="tray-close" onClick={() => setAdvanced(null)}><Icon name="close" size={13} /></button>
                  </div>
                  {advanced.error ? (
                    <p>{advanced.error}</p>
                  ) : (
                    <>
                      <p className="tray-note">{advanced.note}</p>
                      {advanced.values && (
                        <div className="tray-values">
                          {advanced.values.map((value) => (
                            <div key={value.label}><span>{value.label}</span><strong>{value.value}</strong></div>
                          ))}
                        </div>
                      )}
                      {advanced.matrices && advanced.matrices.length > 0 && (
                        <div className="tray-matrices">
                          {advanced.matrices.map((m) => (
                            <div key={m.name}>
                              <span>{m.name}<em>{m.shape}</em></span>
                              <pre>{m.text}</pre>
                            </div>
                          ))}
                        </div>
                      )}
                      {advanced.extras && (
                        <div className="tray-extras">
                          {advanced.extras.map((extra) => <span key={extra}>{extra}</span>)}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {visibleGroups.map((groupItem) => (
            <div className="ops-group" key={groupItem.group}>
              <div className="ops-group-head">
                <h3>{groupItem.group}</h3>
                <span>{String(groupItem.items.length).padStart(2, '0')}</span>
              </div>
              <div className="ops-grid">
                {groupItem.items.map((item) => (
                  <article className={`op-card ${item.advanced ? 'advanced' : ''}`} key={item.code}>
                    <div className="op-card-top">
                      <span className="op-syntax">{item.syntax}</span>
                      <span className="op-code">{item.code.toUpperCase()}</span>
                    </div>
                    <strong>{item.name}</strong>
                    <p>{item.desc}</p>
                    <button type="button" className="op-action" onClick={() => handleOperation(item)}>
                      {item.advanced ? '查看读数' : item.code === 'block' ? '打开组合器' : '装填并开演'}
                      <Icon name="arrow" size={13} />
                    </button>
                  </article>
                ))}
              </div>
            </div>
          ))}
          <div className="ops-footer-note">
            <span>已接通：精确有理数 + 数值分解</span>
            <span>每个有形状的结果都会保留 shape badge</span>
          </div>
        </section>
      </div>
    </Modal>
  );
}
