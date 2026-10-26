import React, { useEffect, useMemo, useState } from 'react';
import { TEMPLATES, TEMPLATE_CATEGORIES } from '../data/seed.js';
import { Modal, ModalHeader } from './Modal.jsx';
import { Icon } from './Icons.jsx';

const PREFERRED = {
  matmul: ['A', 'B'],
  hadamard: ['A', 'B'],
  add: ['A', 'B'],
  inverse: ['A'],
  determinant: ['M', 'A'],
  rref: ['M', 'A'],
  rank: ['M', 'A'],
  solve: ['M', 'b'],
  transpose: ['A'],
  power: ['A'],
  kron: ['A', 'B'],
};

function accepts(matrix, accept) {
  if (accept === 'square') return matrix.rows === matrix.cols;
  if (accept === 'vector') return matrix.cols === 1;
  return true;
}

function combos(lists) {
  if (!lists.length) return [[]];
  return lists.reduce(
    (acc, list) => acc.flatMap((prefix) => list.map((item) => [...prefix, item])),
    [[]],
  );
}

export function suggestSelection(template, matrices) {
  const slotLists = template.slots.map((slot) => matrices.filter((m) => accepts(m, slot.accept)));
  if (slotLists.some((list) => !list.length)) return {};
  const preferred = PREFERRED[template.id] || [];
  let best = null;
  let bestScore = Infinity;
  for (const combination of combos(slotLists)) {
    if (template.validate(combination)) continue;
    let score = 0;
    combination.forEach((matrix, index) => {
      const preferredName = preferred[index];
      if (preferredName && matrix.name !== preferredName) score += 40;
      if (!preferredName) score += index;
    });
    if (score < bestScore) {
      bestScore = score;
      best = combination;
    }
  }
  if (!best) {
    return Object.fromEntries(
      template.slots.map((slot, index) => [slot.key, slotLists[index]?.[0]?.name || '']),
    );
  }
  return Object.fromEntries(template.slots.map((slot, index) => [slot.key, best[index].name]));
}

export default function TemplateModal({ open, matrices, onClose, onLaunch, onOpenBlock }) {
  const [category, setCategory] = useState('all');
  const [selectedId, setSelectedId] = useState(TEMPLATES[0]?.id || '');
  const [selection, setSelection] = useState({});

  const activeTemplate = TEMPLATES.find((t) => t.id === selectedId) || TEMPLATES[0];
  const visibleTemplates = useMemo(
    () => (category === 'all' ? TEMPLATES : TEMPLATES.filter((t) => t.category === category)),
    [category],
  );
  const selectedMatrices = useMemo(
    () => activeTemplate?.slots.map((slot) => matrices.find((m) => m.name === selection[slot.key])) || [],
    [activeTemplate, matrices, selection],
  );
  const validation = activeTemplate ? activeTemplate.validate(selectedMatrices) : '请选择一个模板';
  const missing = selectedMatrices.some((m) => !m);
  const expression = activeTemplate && !missing && !validation ? activeTemplate.build(selection) : '';
  const isLaunchable = Boolean(activeTemplate && expression && !validation);

  useEffect(() => {
    if (!open) return;
    if (!TEMPLATES.some((t) => t.id === selectedId)) setSelectedId(TEMPLATES[0]?.id || '');
  }, [open, selectedId]);

  useEffect(() => {
    if (!open || !activeTemplate) return;
    setSelection(suggestSelection(activeTemplate, matrices));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedId, matrices.length]);

  if (!open || !activeTemplate) return null;

  const chooseTemplate = (template) => {
    setSelectedId(template.id);
  };

  const refill = () => {
    setSelection(suggestSelection(activeTemplate, matrices));
  };

  const setSlot = (key, value) => {
    setSelection((current) => ({ ...current, [key]: value }));
  };

  return (
    <Modal open={open} onClose={onClose} className="template-modal" labelledBy="template-title">
      <ModalHeader
        id="template-title"
        eyebrow="FORMULA GALLERY / 公式装填台"
        title="选一条公式，把你的矩阵放进去"
        description="模板只固定规则的形状；真正被演算的，是你当下选择的数字。"
        onClose={onClose}
      />

      <div className="template-body">
        <section className="template-gallery">
          <div className="template-filters">
            {TEMPLATE_CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat.id}
                className={category === cat.id ? 'active' : ''}
                onClick={() => setCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
            <span className="template-total">{visibleTemplates.length + (category === 'all' || category === 'structure' ? 1 : 0)} 个入口</span>
          </div>
          <div className="template-grid">
            {visibleTemplates.map((template) => {
              const active = template.id === selectedId;
              return (
                <button
                  type="button"
                  key={template.id}
                  className={`template-card accent-${template.accent} ${active ? 'active' : ''}`}
                  onClick={() => chooseTemplate(template)}
                >
                  <div className="template-card-top">
                    <span className="template-symbol">{template.symbol}</span>
                    <span className="template-card-index">{String(TEMPLATES.indexOf(template) + 1).padStart(2, '0')}</span>
                  </div>
                  <strong>{template.title}</strong>
                  <span className="template-formula">{template.formula}</span>
                  <p>{template.subtitle}</p>
                  <span className="template-card-link">
                    {active ? '正在配置' : '配置这一条'} <Icon name="arrow" size={12} />
                  </span>
                </button>
              );
            })}
            {(category === 'all' || category === 'structure') && (
              <button type="button" className="template-card block-entry-card accent-mint" onClick={onOpenBlock}>
                <div className="template-card-top">
                  <span className="template-symbol">⊞</span>
                  <span className="template-card-index">BLOCK</span>
                </div>
                <strong>分块组合器 · 拼出更大矩阵</strong>
                <span className="template-formula">[A | B] 或 2×2 分块</span>
                <p>把矩阵对象直接当作积木，检查每一块行与块列的对齐，再逐格搬入新矩阵。</p>
                <span className="template-card-link">打开组合器 <Icon name="arrow" size={12} /></span>
              </button>
            )}
          </div>
        </section>

        <aside className={`template-config accent-${activeTemplate.accent}`}>
          <div className="config-topline">
            <span className="micro-label">FILL THE FORMULA / 装填</span>
            <span className="config-index">{String(TEMPLATES.indexOf(activeTemplate) + 1).padStart(2, '0')} / {TEMPLATES.length}</span>
          </div>
          <div className="config-hero">
            <span className="config-symbol">{activeTemplate.symbol}</span>
            <div>
              <h3>{activeTemplate.title}</h3>
              <p>{activeTemplate.description}</p>
            </div>
          </div>

          <div className="formula-preview">
            <span className="formula-preview-label">代入具体的矩阵之后</span>
            <strong>{expression || activeTemplate.formula}</strong>
            {selectedMatrices.filter(Boolean).length > 0 && (
              <span className="formula-chips">
                {selectedMatrices.filter(Boolean).map((m) => (
                  <i key={m.name}>{m.name} · {m.rows}×{m.cols}</i>
                ))}
              </span>
            )}
          </div>

          <div className="slot-list">
            {activeTemplate.slots.map((slot, index) => {
              const value = selection[slot.key] || '';
              const selected = matrices.find((m) => m.name === value);
              const disabledOptions = matrices.filter((m) => !accepts(m, slot.accept));
              return (
                <label className="slot-row" key={slot.key} htmlFor={`slot-${slot.key}`}>
                  <div className="slot-head">
                    <span className="slot-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="slot-name">{slot.label}</span>
                    <span className="slot-hint">{slot.hint}</span>
                  </div>
                  <div className="slot-select-wrap">
                    <select
                      id={`slot-${slot.key}`}
                      value={value}
                      onChange={(e) => setSlot(slot.key, e.target.value)}
                    >
                      <option value="">选择一个矩阵…</option>
                      {matrices.map((m) => (
                        <option key={m.name} value={m.name} disabled={!accepts(m, slot.accept)}>
                          {m.name} — {m.rows}×{m.cols}{!accepts(m, slot.accept) ? '（不符合）' : ''}
                        </option>
                      ))}
                    </select>
                    {selected && (
                      <span className="slot-shape">{selected.rows}×{selected.cols}</span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          <div className="slot-actions">
            <button type="button" className="ghost-small" onClick={refill}>
              <Icon name="reset" size={13} /> 自动装填
            </button>
            {disabledOptionsCount(activeTemplate, matrices) > 0 && (
              <span className="slot-note">灰掉的对象不满足该槽位的形状约束</span>
            )}
          </div>

          <div className={`template-check ${validation ? 'error' : 'ok'}`}>
            <span className="check-icon">{validation ? '!' : <Icon name="check" size={14} />}</span>
            <div>
              <strong>{validation ? '还不能开演' : '形状预检通过'}</strong>
              <p>{validation || '这些具体矩阵已经严丝合缝地填进公式。'}</p>
            </div>
          </div>

          <ul className="template-checklines">
            {activeTemplate.checkLines.map((line) => (
              <li key={line}><Icon name="check" size={12} /> {line}</li>
            ))}
          </ul>

          <div className="config-actions">
            <button type="button" className="ghost-button" onClick={onClose}>稍后再说</button>
            <button
              type="button"
              className="primary-button fill-button"
              disabled={!isLaunchable}
              onClick={() => isLaunchable && onLaunch(expression, activeTemplate)}
            >
              <Icon name="play" size={14} /> 装填并开演
            </button>
          </div>
        </aside>
      </div>
    </Modal>
  );
}

function disabledOptionsCount(template, matrices) {
  return template.slots.reduce(
    (sum, slot) => sum + matrices.filter((m) => !accepts(m, slot.accept)).length,
    0,
  );
}
