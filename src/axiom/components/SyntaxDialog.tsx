import { useEffect, useMemo, useState } from 'react';
import { OPS_REFERENCE, EXPRESSION_EXAMPLES } from '../../content/library.js';
import { Icon } from '../../components/Icons.js';

interface SyntaxDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function SyntaxDialog({ open, onClose }: SyntaxDialogProps) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const groups = useMemo(
    () => OPS_REFERENCE.map((group) => ({
      ...group,
      items: group.items.filter((item) => !normalized || `${group.group} ${item.name} ${item.syntax} ${item.desc} ${item.code}`.toLowerCase().includes(normalized)),
    })).filter((group) => group.items.length),
    [normalized],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ax-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="ax-modal ax-syntax-dialog" role="dialog" aria-modal="true" aria-label="Expression syntax reference">
        <header className="ax-modal-head">
          <div>
            <span className="ax-micro">OPS REFERENCE / 表达式语法</span>
            <h2>Write the expression, then Run.</h2>
            <p>Expression syntax is not the algorithm registry. Registered functions live in Algorithms and run in Console.</p>
          </div>
          <button type="button" className="ax-icon-button" onClick={onClose} aria-label="Close syntax reference"><Icon name="close" size={15} /></button>
        </header>
        <div className="ax-syntax-toolbar">
          <label className="ax-resource-search" style={{ margin: 0 }}>
            <Icon name="compass" size={12} strokeWidth={1.5} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SEARCH SYNTAX" spellCheck={false} />
          </label>
          <span className="ax-small-label">{groups.reduce((sum, group) => sum + group.items.length, 0)} ENTRIES</span>
        </div>
        <div className="ax-syntax-body">
          <section className="ax-syntax-groups">
            {groups.map((group) => (
              <section className="ax-syntax-group" key={group.group}>
                <h3>{group.group}</h3>
                {group.items.map((item) => (
                  <article className="ax-syntax-item" key={item.syntax}>
                    <div>
                      <strong>{item.syntax}</strong>
                      <span>{item.name}</span>
                    </div>
                    <p>{item.desc}</p>
                    <code>{item.code}</code>
                  </article>
                ))}
              </section>
            ))}
            {!groups.length && <div className="ax-empty-inline">No syntax matches this search.</div>}
          </section>
          <aside className="ax-syntax-side">
            <span className="ax-micro">EXAMPLES</span>
            <p>Try one of these in the expression strip:</p>
            <div className="ax-syntax-examples">
              {EXPRESSION_EXAMPLES.slice(0, 8).map((example) => (
                <div key={example.expression}>
                  <code>{example.expression}</code>
                  <span>{example.label}</span>
                </div>
              ))}
            </div>
            <div className="ax-syntax-note">
              Operations are exact rational operations in this session. There is no save/export; Runs are immutable for the current session only.
            </div>
          </aside>
        </div>
        <footer className="ax-modal-foot">
          <span className="ax-small-label">EXACT-Q · IN-MEMORY</span>
          <button type="button" className="ax-button" onClick={onClose}>CLOSE</button>
        </footer>
      </section>
    </div>
  );
}
