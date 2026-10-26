import React from 'react';
import { formatCompact } from '../engine/rational.js';

function Fraction({ text }) {
  const normalized = text.replace(/^-/, '−');
  const match = normalized.match(/^([−-]?\d+)\/(\d+)$/);
  if (!match) return <span className="cell-number">{normalized}</span>;
  return (
    <span className="cell-fraction" aria-label={normalized}>
      <span className="frac-n">{match[1]}</span>
      <span className="frac-line" />
      <span className="frac-d">{match[2]}</span>
    </span>
  );
}

function CellValue({ text, cellSize }) {
  if (cellSize < 34) {
    return <span className="cell-number compact-number">{text.replace(/^-/, '−')}</span>;
  }
  return <Fraction text={String(text)} />;
}

export default function MatrixPanel({ panel, cellSize = 46, index = 0 }) {
  const { matrix, label, cells = {}, rowFocus = [], colFocus = [], dividerAfter, role, caption, shape } = panel;
  const fontSize = Math.max(11, Math.min(19, Math.round(cellSize * 0.37)));
  const showAxis = cellSize >= 27;
  const axisHeight = showAxis ? 16 : 0;

  return (
    <figure className={`matrix-panel role-${role || 'input'}`} data-panel-index={index}>
      <div className="panel-heading">
        <span className="panel-label">{label}</span>
        <span className="panel-shape">{shape || `${matrix.rows}×${matrix.cols}`}</span>
      </div>

      <div
        className="matrix-frame"
        style={{
          '--cell-size': `${cellSize}px`,
          '--cell-font': `${fontSize}px`,
          '--axis-height': `${axisHeight}px`,
        }}
      >
        {showAxis && (
          <div className="matrix-col-axis" style={{ paddingLeft: 20, gridTemplateColumns: `repeat(${matrix.cols}, ${cellSize}px)` }}>
            {Array.from({ length: matrix.cols }, (_, c) => (
              <span key={c} className={colFocus.includes(c) ? 'axis-hot' : ''}>
                {c + 1}
              </span>
            ))}
          </div>
        )}
        <div className="matrix-body">
          {showAxis && (
            <div className="matrix-row-axis">
              {Array.from({ length: matrix.rows }, (_, r) => (
                <span key={r} className={rowFocus.includes(r) ? 'axis-hot' : ''} style={{ height: cellSize }}>
                  {r + 1}
                </span>
              ))}
            </div>
          )}
          <div className="bracket-stage">
            <span className="bracket bracket-left" aria-hidden="true" />
            <span className="bracket bracket-right" aria-hidden="true" />
            <div
              className="matrix-grid"
              style={{ gridTemplateColumns: `repeat(${matrix.cols}, ${cellSize}px)` }}
              role="grid"
              aria-label={`${label}，${matrix.rows} 行 ${matrix.cols} 列`}
            >
              {matrix.data.map((row, r) =>
                row.map((value, c) => {
                  const override = cells[`${r},${c}`] || {};
                  const tone = override.tone || 'neutral';
                  const text = override.text ?? formatCompact(value);
                  const activeRow = rowFocus.includes(r);
                  const activeCol = colFocus.includes(c);
                  const divider = dividerAfter != null && c === dividerAfter - 1;
                  return (
                    <div
                      key={`${r}-${c}`}
                      role="gridcell"
                      className={[
                        'matrix-cell',
                        `tone-${tone}`,
                        override.hidden ? 'is-hidden' : '',
                        activeRow ? 'row-focus' : '',
                        activeCol ? 'col-focus' : '',
                        divider ? 'augment-divider' : '',
                        tone === 'source' ? 'is-source' : '',
                        tone === 'live' || tone === 'result' ? 'is-live-result' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={override.hidden ? '尚未计算' : `${label} 第 ${r + 1} 行第 ${c + 1} 列：${text}`}
                    >
                      {override.hidden ? <span className="uncomputed-dot">·</span> : <CellValue text={text} cellSize={cellSize} />}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </div>

      <figcaption>
        <span>{caption || ' '}</span>
        {rowFocus.length > 0 && <span className="focus-hint">行 {rowFocus.map((r) => r + 1).join(', ')}</span>}
      </figcaption>
    </figure>
  );
}

export function MatrixMini({ matrix, max = 3, variant = 'light' }) {
  const rows = Math.min(matrix.rows, max);
  const cols = Math.min(matrix.cols, max);
  return (
    <div className={`matrix-mini ${variant}`} style={{ '--mini-cols': cols }}>
      <span className="mini-bracket left" />
      <div className="mini-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const value = matrix.data[r][c];
          return (
            <span key={i} className={value.isZero ? 'mini-value zero' : 'mini-value'}>
              {formatCompact(value)}
            </span>
          );
        })}
      </div>
      <span className="mini-bracket right" />
      {(matrix.rows > rows || matrix.cols > cols) && <span className="mini-more">…</span>}
    </div>
  );
}
