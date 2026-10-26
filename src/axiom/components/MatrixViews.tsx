import type { SceneMatrixPreview } from '../../scene/types.js';
import type { StagePanel } from '../../runtime/types.js';

interface StageMatrixProps {
  panel: StagePanel;
  selectedCell: { row: number; col: number } | null;
  onSelectCell: (row: number, col: number) => void;
}

export function StageMatrix({ panel, selectedCell, onSelectCell }: StageMatrixProps) {
  const cellSize = Math.max(30, Math.min(52, Math.floor(360 / Math.max(panel.cols, 1))));
  return (
    <div className="ax-matrix" style={{ '--ax-cell-size': `${cellSize}px` } as React.CSSProperties}>
      <div className="ax-row-labels" style={{ gridTemplateRows: `repeat(${panel.rows}, var(--ax-cell-size))` }}>
        {Array.from({ length: panel.rows }, (_, row) => <span key={row}>{row + 1}</span>)}
      </div>
      <div className="ax-matrix-frame">
        <div className="ax-col-labels" style={{ gridTemplateColumns: `repeat(${panel.cols}, var(--ax-cell-size))` }}>
          {Array.from({ length: panel.cols }, (_, col) => <span key={col}>{col + 1}</span>)}
        </div>
        <div className="ax-cell-grid" style={{ gridTemplateColumns: `repeat(${panel.cols}, var(--ax-cell-size))` }}>
          {panel.cells.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const selected = selectedCell?.row === rowIndex && selectedCell.col === colIndex;
              return (
                <button
                  type="button"
                  key={`${rowIndex},${colIndex}`}
                  className={`ax-cell tone-${cell.tone} ${cell.hidden ? 'hidden' : ''} ${selected ? 'selected' : ''}`}
                  onClick={() => onSelectCell(rowIndex, colIndex)}
                  title={`${panel.label}[${rowIndex + 1},${colIndex + 1}] = ${cell.hidden ? 'hidden' : cell.text}`}
                  aria-label={`Cell ${rowIndex + 1}, ${colIndex + 1}: ${cell.hidden ? 'hidden' : cell.text}`}
                >
                  {cell.hidden ? '·' : cell.text}
                </button>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}

export function SceneMatrix({ matrix, highlight }: { matrix: SceneMatrixPreview; highlight?: { row: number; col: number } }) {
  return (
    <div
      className="ax-scene-matrix"
      style={{ gridTemplateColumns: `repeat(${matrix.cols}, minmax(14px, 1fr))` }}
      aria-hidden="true"
    >
      {matrix.cells.map((row, rowIndex) =>
        row.map((cell, colIndex) => (
          <span
            key={`${rowIndex},${colIndex}`}
            className={`ax-scene-cell tone-${cell.tone ?? 'neutral'} ${cell.hidden ? 'hidden' : ''} ${highlight?.row === rowIndex && highlight.col === colIndex ? 'selected' : ''}`}
          >
            {cell.hidden ? '·' : cell.text}
          </span>
        )),
      )}
    </div>
  );
}
