import React, { useEffect, useMemo, useState } from 'react';
import { concatBlocks } from '../engine/matrix.js';
import { Modal, ModalHeader } from './Modal.jsx';
import { Icon } from './Icons.jsx';
import { MatrixMini } from './MatrixPanel.jsx';

function rowsCandidateGalleries(matrices) {
  const byHeight = new Map();
  for (const matrix of matrices) {
    if (!byHeight.has(matrix.rows)) byHeight.set(matrix.rows, []);
    byHeight.get(matrix.rows).push(matrix);
  }
  return byHeight;
}

function autoLayout(matrices, rows, cols) {
  if (!matrices.length) return Array.from({ length: rows }, () => Array(cols).fill(''));
  const byName = new Map(matrices.map((m) => [m.name, m]));
  const isValid = (names) => {
    try {
      concatBlocks(names.map((row) => row.map((name) => byName.get(name))));
      return true;
    } catch {
      return false;
    }
  };

  // Prefer varied blocks. Repeating the same pattern in every block row keeps
  // each block column the same width, so the assembly stays rectangular.
  const byHeight = rowsCandidateGalleries(matrices);
  const heightGroups = [...byHeight.values()].sort((a, b) => b.length - a.length);
  for (const list of heightGroups) {
    const pattern = Array.from({ length: cols }, (_, i) => list[i % list.length].name);
    const candidate = Array.from({ length: rows }, () => [...pattern]);
    if (isValid(candidate)) return candidate;
  }

  const byWidth = new Map();
  for (const matrix of matrices) {
    if (!byWidth.has(matrix.cols)) byWidth.set(matrix.cols, []);
    byWidth.get(matrix.cols).push(matrix);
  }
  const widthGroups = [...byWidth.values()].sort((a, b) => b.length - a.length);
  for (const list of widthGroups) {
    const pattern = Array.from({ length: rows }, (_, i) => list[i % list.length].name);
    const candidate = Array.from({ length: rows }, () => Array(cols).fill(''));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) candidate[r][c] = pattern[r];
    }
    if (isValid(candidate)) return candidate;
  }

  return Array.from({ length: rows }, () => Array(cols).fill(matrices[0].name));
}

function resolveGrid(selection, matrices) {
  return selection.map((row) => row.map((name) => matrices.find((m) => m.name === name) || null));
}

export default function BlockModal({ open, matrices, nameSuggestion, onClose, onBuild }) {
  const [layout, setLayout] = useState('h');
  const [rows, setRows] = useState(1);
  const [cols, setCols] = useState(2);
  const [selection, setSelection] = useState([]);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLayout('h');
    setRows(1);
    setCols(2);
    setSelection(autoLayout(matrices, 1, 2));
    setName(nameSuggestion || 'K');
    setNameError(null);
  }, [open, matrices, nameSuggestion]);

  const grid = useMemo(() => resolveGrid(selection, matrices), [selection, matrices]);
  const result = useMemo(() => {
    try {
      if (!grid.length || grid.flat().some((m) => !m)) return { error: '每个块位都需要一个矩阵。' };
      return { built: concatBlocks(grid) };
    } catch (error) {
      return { error: error.message };
    }
  }, [grid]);

  if (!open) return null;

  const applyPreset = (preset) => {
    setLayout(preset);
    const nextRows = preset === 'h' ? 1 : 2;
    const nextCols = preset === 'v' ? 1 : 2;
    setRows(nextRows);
    setCols(nextCols);
    setSelection(autoLayout(matrices, nextRows, nextCols));
  };

  const changeDims = (nextRows, nextCols) => {
    setRows(nextRows);
    setCols(nextCols);
    setLayout('custom');
    setSelection(autoLayout(matrices, nextRows, nextCols));
  };

  const setSlot = (r, c, value) => {
    setSelection((current) =>
      current.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)),
    );
  };

  const refill = () => setSelection(autoLayout(matrices, rows, cols));

  const submit = () => {
    const trimmed = name.trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{0,3}$/.test(trimmed)) {
      setNameError('名字需以字母开头，最多 4 个字符（字母、数字、下划线）');
      return;
    }
    if (matrices.some((m) => m.name === trimmed)) {
      setNameError(`矩阵 ${trimmed} 已经存在，换一个名字。`);
      return;
    }
    if (!result.built) {
      setNameError(result.error);
      return;
    }
    onBuild({ name: trimmed, grid, built: result.built, rows, cols });
  };

  const blockWidths = grid.map((row) => row.map((m) => m?.cols));
  const totalRows = result.built ? result.built.matrix.rows : '—';
  const totalCols = result.built ? result.built.matrix.cols : '—';

  return (
    <Modal open={open} onClose={onClose} className="block-modal" labelledBy="block-title">
      <ModalHeader
        id="block-title"
        eyebrow="BLOCK COMPOSER / 分块组合器"
        title="把矩阵像积木一样拼成更大的对象"
        description="每个块行必须等高，每个块列必须等宽。拼出来的矩阵会保留每个块的坐标与含义。"
        onClose={onClose}
      />

      <div className="block-body">
        <section className="block-config">
          <div className="block-presets">
            <span className="micro-label">LAYOUT / 排布</span>
            <div className="preset-buttons">
              <button type="button" className={layout === 'h' ? 'active' : ''} onClick={() => applyPreset('h')}>水平 [A | B]</button>
              <button type="button" className={layout === 'v' ? 'active' : ''} onClick={() => applyPreset('v')}>竖直 [A ; B]</button>
              <button type="button" className={layout === 'b' ? 'active' : ''} onClick={() => applyPreset('b')}>分块 2×2</button>
            </div>
          </div>

          <div className="block-dim-row">
            <div className="block-dim-control">
              <span className="field-label">块格</span>
              <label>
                行
                <select value={rows} onChange={(e) => changeDims(Number(e.target.value), cols)}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <span>×</span>
              <label>
                列
                <select value={cols} onChange={(e) => changeDims(rows, Number(e.target.value))}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <button type="button" className="ghost-small" onClick={refill}>
              <Icon name="reset" size={13} /> 自动搭配
            </button>
          </div>

          <div className="slot-matrix-labels" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }, (_, c) => (
              <span key={c}>块列 {c + 1}{blockWidths[0]?.[c] ? ` · ${blockWidths[0][c]} 列` : ''}</span>
            ))}
          </div>

          <div className="block-slot-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {selection.map((row, r) =>
              row.map((value, c) => {
                const matrix = matrices.find((m) => m.name === value);
                return (
                  <label className={`block-slot ${matrix ? 'filled' : ''}`} key={`${r}-${c}`}>
                    <span className="block-slot-coord">{r + 1} · {c + 1}</span>
                    <select value={value || ''} onChange={(e) => setSlot(r, c, e.target.value)}>
                      <option value="">放入矩阵…</option>
                      {matrices.map((m) => (
                        <option key={m.name} value={m.name}>{m.name} · {m.rows}×{m.cols}</option>
                      ))}
                    </select>
                    <span className="block-slot-shape">{matrix ? `${matrix.rows}×${matrix.cols}` : '空'}</span>
                  </label>
                );
              }),
            )}
          </div>

          <div className={`block-check ${result.built ? 'ok' : 'error'}`}>
            <span>{result.built ? <Icon name="check" size={14} /> : '!'}</span>
            <div>
              <strong>{result.built ? '块边界完全吻合' : '矩阵还没对齐'}</strong>
              <p>{result.built ? `目标矩阵将会是 ${totalRows}×${totalCols}。` : result.error}</p>
            </div>
          </div>

          <div className="block-name-row">
            <label className="field-group compact">
              <span>组合矩阵的名字</span>
              <input
                className={nameError ? 'invalid' : ''}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
                maxLength={4}
                spellCheck="false"
              />
            </label>
            <div className="block-name-preview">
              <span>NEW OBJECT</span>
              <strong>{name || 'K'} = block(...)</strong>
            </div>
          </div>
          {nameError && <div className="inline-form-error">{nameError}</div>}
          <p className="block-help">格子越多不等于越复杂：真正的约束是同一行等高、同一列等宽。出现红色提示时，换一个兼容矩阵即可。</p>

          <div className="block-insight">
            <div className="block-insight-head">
              <span className="micro-label">STRUCTURE NOTE / 为什么能拼</span>
              <span>{result.built ? `${result.built.matrix.rows} × ${result.built.matrix.cols}` : '—'}</span>
            </div>
            <div className="block-shape-equation">
              <span>{result.built ? result.built.rowHeights.join(' + ') : '?'} 行</span>
              <em>×</em>
              <span>{result.built ? result.built.colWidths.join(' + ') : '?'} 列</span>
              <strong>→ {totalRows} × {totalCols}</strong>
            </div>
            <p>
              拼接不会新造数字，只会把每个源矩阵的数字搬到更大的坐标表里。同一块行里的矩阵共同决定行偏移，
              同一块列里的矩阵共同决定列偏移；因此形状的“加法”必须发生在两个方向上都成立。
            </p>
          </div>
        </section>

        <aside className="block-preview">
          <div className="preview-head">
            <span className="micro-label">ASSEMBLY PREVIEW / 拼装预览</span>
            <span>{totalRows} × {totalCols}</span>
          </div>
          <div className="block-diagram" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {selection.map((row, r) =>
              row.map((value, c) => {
                const matrix = matrices.find((m) => m.name === value);
                const rowHeight = result.built?.rowHeights?.[r];
                const colWidth = result.built?.colWidths?.[c];
                return (
                  <div
                    className="diagram-block"
                    key={`${r}-${c}`}
                    style={{ minHeight: `${Math.min(110, 38 + (rowHeight || 2) * 12)}px` }}
                  >
                    <strong>{value || '—'}</strong>
                    <span>{matrix ? `${matrix.rows}×${matrix.cols}` : '未放置'}</span>
                    <em>{rowHeight && colWidth ? `${rowHeight} 高 / ${colWidth} 宽` : ' '}</em>
                  </div>
                );
              }),
            )}
          </div>

          <div className="preview-matrix-wrap">
            <span className="preview-caption">目标矩阵 {name || 'K'}</span>
            {result.built ? (
              <MatrixMini matrix={result.built.matrix} max={5} variant="dark" />
            ) : (
              <div className="preview-error-glyph">×</div>
            )}
          </div>

          <div className="preview-equation">
            <span>block({selection.flat().filter(Boolean).join(', ')})</span>
            <strong>→ {name || 'K'} <em>{totalRows} × {totalCols}</em></strong>
          </div>

          <div className="preview-block-rules">
            <span className="micro-label">BLOCK RULES / 拼接不变量</span>
            <ul>
              <li>每个块行的行数必须一致</li>
              <li>每个块列的列数必须一致</li>
              <li>元素数值原样搬入，不做运算</li>
              <li>组合后的整体形状可追溯回块结构</li>
            </ul>
          </div>

          <button type="button" className="primary-button block-submit" onClick={submit} disabled={!result.built}>
            <Icon name="grid" size={15} /> 拼合，并逐格演示
          </button>
          <span className="preview-footnote">新矩阵会被加入左侧矩阵库，并立即进入演示台。</span>
        </aside>
      </div>
    </Modal>
  );
}
