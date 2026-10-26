import { Icon, BrandMark } from './Icons';
import { MatrixMini } from './MatrixPanel';
import type { StoredMatrix } from '../core/matrix.js';

interface LibraryPanelProps {
  matrices: readonly StoredMatrix[];
  onCreate: () => void;
  onEdit: (matrix: StoredMatrix) => void;
  onInsert: (name: string) => void;
  onOpenBlock: () => void;
  onReset: () => void;
  onExport: () => void;
}

export default function LibraryPanel({
  matrices,
  onCreate,
  onEdit,
  onInsert,
  onOpenBlock,
  onReset,
  onExport,
}: LibraryPanelProps) {
  return (
    <aside className="library">
      <div className="library-brand">
        <div className="brand-row">
          <BrandMark />
          <div>
            <div className="brand-name">矩阵工坊</div>
            <div className="brand-sub">MATRIX ATELIER</div>
          </div>
        </div>
        <div className="brand-version">LAB · 01</div>
      </div>

      <div className="library-intro">
        <span className="micro-label light">OBJECTS / 矩阵对象</span>
        <h2>先有形状，<br />再谈变化。</h2>
        <p>每一张矩阵都有自己的行列与含义。点一下，就能把它放进表达式。</p>
      </div>

      <div className="library-heading">
        <div>
          <span className="library-count">{String(matrices.length).padStart(2, '0')}</span>
          <span>个矩阵</span>
        </div>
        <button type="button" className="icon-button light" onClick={onCreate} title="新建矩阵" aria-label="新建矩阵">
          <Icon name="plus" size={17} />
        </button>
      </div>

      <div className="library-list">
        {matrices.map((matrix) => (
          <article key={matrix.id || matrix.name} className="matrix-card">
            <div className="matrix-card-head">
              <div className="matrix-card-title">
                <strong>{matrix.name}</strong>
                <span>{matrix.shape}</span>
              </div>
              <button
                type="button"
                className="card-edit"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(matrix);
                }}
                aria-label={`编辑矩阵 ${matrix.name}`}
                title="编辑矩阵"
              >
                <Icon name="edit" size={14} />
              </button>
            </div>
            <button type="button" className="matrix-card-main" onClick={() => onInsert(matrix.name)} title={`插入 ${matrix.name} 到表达式`}>
              <MatrixMini matrix={matrix} variant="dark" />
              <span className="card-note">{matrix.note || '自定义矩阵对象'}</span>
              <span className="insert-hint">
                插入 <Icon name="arrow" size={12} />
              </span>
            </button>
          </article>
        ))}
        {!matrices.length && (
          <div className="library-empty">矩阵库是空的。先造一个对象。</div>
        )}
      </div>

      <div className="library-actions">
        <button type="button" className="library-primary" onClick={onCreate}>
          <Icon name="plus" size={15} /> 新建矩阵
        </button>
        <button type="button" className="library-secondary" onClick={onOpenBlock}>
          <Icon name="grid" size={15} /> 分块组合
        </button>
      </div>

      <div className="library-footer">
        <div className="library-footer-row">
          <span className="library-status"><span className="status-dot ok" /> 精确有理数</span>
          <span className="library-status">本地运行</span>
        </div>
        <div className="library-footer-links">
          <button type="button" onClick={onExport}><Icon name="download" size={13} /> 导出实验</button>
          <button type="button" onClick={onReset}><Icon name="reset" size={13} /> 重置</button>
        </div>
        <div className="library-signature">MADE FOR SLOW LOOKING · {new Date().getFullYear()}</div>
      </div>
    </aside>
  );
}
