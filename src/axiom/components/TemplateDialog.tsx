import { useEffect, useMemo, useState } from 'react';
import type { Matrix, StoredMatrix } from '../../core/matrix.js';
import type { FormulaTemplate, SlotAccept } from '../../content/library.js';
import { Icon } from '../../components/Icons.js';

interface TemplateDialogProps {
  template: FormulaTemplate | null;
  matrices: readonly StoredMatrix[];
  onClose: () => void;
  onLaunch: (expression: string, template: FormulaTemplate) => void;
}

function accepts(matrix: Matrix, accept: SlotAccept): boolean {
  if (accept === 'square') return matrix.rows === matrix.cols;
  if (accept === 'vector') return matrix.cols === 1;
  return true;
}

function combinations(lists: StoredMatrix[][]): StoredMatrix[][] {
  return lists.reduce<StoredMatrix[][]>(
    (acc, list) => acc.flatMap((prefix) => list.map((matrix) => [...prefix, matrix])),
    [[]],
  );
}

function suggestSelection(template: FormulaTemplate, matrices: readonly StoredMatrix[]): Record<string, string> {
  const lists = template.slots.map((slot) => matrices.filter((matrix) => accepts(matrix, slot.accept)));
  if (lists.some((list) => !list.length)) return {};
  const combos = combinations(lists);
  for (const combo of combos) {
    const names = combo.map((matrix) => matrix.name);
    const distinct = new Set(names).size === names.length;
    if (distinct && !template.validate(combo)) {
      return Object.fromEntries(template.slots.map((slot, index) => [slot.key, combo[index]?.name ?? '']));
    }
  }
  for (const combo of combos) {
    if (!template.validate(combo)) {
      return Object.fromEntries(template.slots.map((slot, index) => [slot.key, combo[index]?.name ?? '']));
    }
  }
  return Object.fromEntries(template.slots.map((slot, index) => [slot.key, lists[index]?.[0]?.name ?? '']));
}

export default function TemplateDialog({ template, matrices, onClose, onLaunch }: TemplateDialogProps) {
  const [selection, setSelection] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!template) return;
    setSelection(suggestSelection(template, matrices));
  }, [template, matrices]);

  useEffect(() => {
    if (!template) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [template, onClose]);

  const selected = useMemo(
    () => template?.slots.map((slot) => matrices.find((matrix) => matrix.name === selection[slot.key])) ?? [],
    [matrices, selection, template],
  );
  const validation = template ? template.validate(selected) : null;
  const expression = template && selected.every(Boolean)
    ? template.build(Object.fromEntries(template.slots.map((slot) => [slot.key, selection[slot.key] ?? ''])))
    : '';

  if (!template) return null;

  return (
    <div className="ax-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="ax-modal ax-template-dialog" role="dialog" aria-modal="true" aria-labelledby="ax-template-title">
        <header className="ax-modal-head">
          <div>
            <span className="ax-micro">FORMULA ASSET / 公式装填</span>
            <h2 id="ax-template-title">{template.title}</h2>
            <p>{template.subtitle}</p>
          </div>
          <button type="button" className="ax-icon-button" onClick={onClose} aria-label="Close"><Icon name="close" size={15} /></button>
        </header>
        <div className="ax-modal-body ax-template-body">
          <div className="ax-template-main">
            <div className="ax-formula-preview">
              <span className="ax-micro">SUBSTITUTED FORMULA</span>
              <strong>{expression || template.formula}</strong>
              <p>{template.description}</p>
            </div>
            <div className="ax-slot-list">
              {template.slots.map((slot, index) => {
                const options = matrices.filter((matrix) => accepts(matrix, slot.accept));
                return (
                  <label className="ax-slot-row" key={slot.key}>
                    <span className="ax-slot-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="ax-slot-label">
                      <strong>{slot.label}</strong>
                      <small>{slot.hint}</small>
                    </span>
                    <select
                      className="ax-select"
                      value={selection[slot.key] ?? ''}
                      onChange={(event) => setSelection((current) => ({ ...current, [slot.key]: event.target.value }))}
                    >
                      <option value="">SELECT MATRIX…</option>
                      {options.map((matrix) => (
                        <option key={matrix.name} value={matrix.name}>{matrix.name} · {matrix.rows}×{matrix.cols}</option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
            <div className={`ax-template-validation ${validation ? 'error' : 'ok'}`}>
              <span>{validation ? '×' : '✓'}</span>
              <p>{validation ?? 'Shape constraints satisfied. Run will create an immutable trace.'}</p>
            </div>
          </div>
          <aside className="ax-template-side">
            <span className="ax-micro">ASSET</span>
            <div className="ax-template-meta">
              <span><b>category</b>{template.category}</span>
              <span><b>slots</b>{template.slots.length}</span>
              <span><b>provenance</b>native trace · derived presentation</span>
            </div>
            <div className="ax-template-checks">
              {template.checkLines.map((line) => <p key={line}><span>▸</span>{line}</p>)}
            </div>
            <div className="ax-template-note">
              The formula fixes the structure. Values and trace remain tied to this document revision.
            </div>
          </aside>
        </div>
        <footer className="ax-modal-foot">
          <span className="ax-small-label">NO PERSISTENCE · RUN STAYS IN MEMORY</span>
          <div className="ax-modal-actions">
            <button type="button" className="ax-button" onClick={onClose}>CANCEL</button>
            <button type="button" className="ax-button primary" disabled={Boolean(validation) || !expression} onClick={() => onLaunch(expression, template)}>
              <Icon name="play" size={12} /> LOAD & RUN
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
