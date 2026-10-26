import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icons.js';

export interface CommandAction {
  id: string;
  group: string;
  label: string;
  detail?: string;
  shortcut?: string;
  icon?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  actions: readonly CommandAction[];
  onClose: () => void;
}

export default function CommandPalette({ open, actions, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return actions;
    return actions.filter((action) =>
      `${action.group} ${action.label} ${action.detail ?? ''} ${action.shortcut ?? ''}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

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

  useEffect(() => {
    setIndex(0);
  }, [query]);

  if (!open) return null;

  const execute = (action: CommandAction | undefined): void => {
    if (!action) return;
    onClose();
    action.run();
  };

  return (
    <div className="ax-palette-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="ax-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <header className="ax-palette-head">
          <Icon name="compass" size={15} strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="SEARCH COMMANDS / 输入命令或动作"
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setIndex((current) => Math.min(filtered.length - 1, current + 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setIndex((current) => Math.max(0, current - 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                execute(filtered[index]);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
          />
          <span className="ax-kbd">ESC</span>
        </header>
        <div className="ax-palette-list" role="listbox" aria-label="Commands">
          {filtered.length === 0 && <div className="ax-palette-empty">NO MATCH · 没有匹配的命令</div>}
          {filtered.map((action, actionIndex) => (
            <button
              type="button"
              role="option"
              aria-selected={actionIndex === index}
              key={action.id}
              className={`ax-palette-row ${actionIndex === index ? 'active' : ''}`}
              onMouseEnter={() => setIndex(actionIndex)}
              onClick={() => execute(action)}
            >
              <span className="ax-palette-icon"><Icon name={action.icon ?? 'arrow'} size={13} strokeWidth={1.5} /></span>
              <span className="ax-palette-copy">
                <strong>{action.label}</strong>
                {action.detail && <small>{action.detail}</small>}
              </span>
              <span className="ax-palette-group">{action.group}</span>
              {action.shortcut && <span className="ax-kbd">{action.shortcut}</span>}
            </button>
          ))}
        </div>
        <footer className="ax-palette-foot">
          <span>↑↓ move</span>
          <span>ENTER run</span>
          <span>ESC close</span>
          <span className="ax-palette-count">{filtered.length} ACTIONS</span>
        </footer>
      </section>
    </div>
  );
}
