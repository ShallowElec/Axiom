import type { SceneMatrixPreview } from '../../scene/types.js';

interface SceneMatrixProps {
  matrix: SceneMatrixPreview;
  compact?: boolean;
}

export default function SceneMatrix({ matrix, compact = false }: SceneMatrixProps) {
  return (
    <div
      className={`scene-matrix ${compact ? 'compact' : ''}`}
      style={{ gridTemplateColumns: `repeat(${matrix.cols}, minmax(18px, 1fr))` }}
      aria-hidden="true"
    >
      {matrix.cells.map((row, r) =>
        row.map((cell, c) => (
          <span
            key={`${r}-${c}`}
            className={`scene-cell tone-${cell.tone ?? 'neutral'} ${cell.hidden ? 'hidden' : ''}`}
          >
            {cell.hidden ? '·' : cell.text}
          </span>
        )),
      )}
    </div>
  );
}
