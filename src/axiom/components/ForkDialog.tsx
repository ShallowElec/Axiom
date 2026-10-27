import { useEffect, useRef, useState } from 'react';
import type { StoredMatrix } from '../../core/matrix.js';
import type { NativeCheckpoint, NativeOperation, RunRecord } from '../../runtime/types.js';
import { Icon } from '../../components/Icons.js';

interface ForkDialogProps {
  parent: RunRecord | null;
  operation: NativeOperation | null;
  checkpoint: NativeCheckpoint | null;
  matrix: StoredMatrix | null;
  onClose: () => void;
  onCommit: (expression: string) => string | null;
}

export default function ForkDialog({ parent, operation, checkpoint, matrix, onClose, onCommit }: ForkDialogProps) {
  const [expression, setExpression] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const open = Boolean(parent && operation && checkpoint && matrix);

  useEffect(() => {
    if (!open || !matrix) return;
    setExpression(matrix.name);
    setError(null);
    const timer = window.setTimeout(() => inputRef.current?.select(), 40);
    return () => window.clearTimeout(timer);
  }, [open, matrix]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !parent || !operation || !checkpoint || !matrix) return null;

  const submit = (): void => {
    const value = expression.trim();
    if (!value) {
      setError('写一个从这个检查点出发的表达式。');
      return;
    }
    const message = onCommit(value);
    if (message) setError(message);
  };

  return (
    <div className="ax-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="ax-modal ax-fork-dialog" role="dialog" aria-modal="true" aria-labelledby="ax-fork-title">
        <header className="ax-modal-head">
          <div>
            <span className="ax-micro">FORK FROM CHECKPOINT / 从检查点开分支</span>
            <h2 id="ax-fork-title">从这里继续，不重算前缀。</h2>
            <p>检查点会作为新的 session 输入物化；下一 Run 带 lineage，父 run 保持不可变。</p>
          </div>
          <button type="button" className="ax-icon-button" onClick={onClose} aria-label="Close fork dialog"><Icon name="close" size={15} /></button>
        </header>

        <div className="ax-fork-body">
          <div className="ax-fork-meta">
            <div><span>PARENT RUN</span><strong>{parent.id}</strong></div>
            <div><span>OPERATION</span><strong>{String(operation.index + 1).padStart(2, '0')} / {operation.kind}</strong></div>
            <div><span>CHECKPOINT</span><strong>{checkpoint.id}</strong></div>
            <div><span>STATE</span><strong>{checkpoint.complete ? 'COMPLETE' : 'PARTIAL'}</strong></div>
          </div>

          <section className="ax-fork-checkpoint">
            <header>
              <span className="ax-micro">CHECKPOINT VALUE</span>
              <span>{matrix.rows}×{matrix.cols} · EXACT-Q</span>
            </header>
            <div className="ax-fork-matrix" style={{ gridTemplateColumns: `repeat(${Math.min(matrix.cols, 4)}, minmax(34px, 1fr))` }}>
              {matrix.data.slice(0, 4).map((row, rowIndex) => row.slice(0, 4).map((value, colIndex) => (
                <code key={`${rowIndex}-${colIndex}`} title={`[${rowIndex + 1},${colIndex + 1}]`}>{value.toString()}</code>
              )))}
            </div>
            <p>
              {checkpoint.complete
                ? 'This checkpoint is complete and can be used directly as a new input.'
                : 'This is a partial cell checkpoint. Uncomputed cells are zero; the branch starts from that exact partial state.'}
            </p>
          </section>

          <label className="ax-fork-expression">
            <span className="ax-micro">BRANCH EXPRESSION</span>
            <input
              ref={inputRef}
              value={expression}
              onChange={(event) => { setExpression(event.target.value); setError(null); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }}
              spellCheck={false}
              aria-label="Branch expression"
            />
            <small>The checkpoint matrix is added as <b>{matrix.name}</b>. You can use it with any current object, e.g. <code>{matrix.name} × B</code>.</small>
          </label>

          {error && <div className="ax-fork-error" role="alert">{error}</div>}
        </div>

        <footer className="ax-modal-foot">
          <span className="ax-small-label">IMMUTABLE PARENT · NEW LINEAGE</span>
          <div className="ax-fork-actions">
            <button type="button" className="ax-button" onClick={onClose}>CANCEL</button>
            <button type="button" className="ax-button primary" onClick={submit}><Icon name="fork" size={11} /> CREATE BRANCH</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
