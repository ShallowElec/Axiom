import { useEffect, useMemo, useState } from 'react';
import type { FormulaNode, SemanticCategory } from '../formula/ast.js';
import {
  callNode,
  createFormulaDocument,
  numberNode,
  operatorNode,
  serializeFormulaDocument,
  slotNode,
  symbolNode,
} from '../formula/ast.js';
import {
  formulaToPlainLatex,
  renderFormulaToHtml,
} from '../formula/latex.js';
import type { StoredMatrix } from '../core/matrix.js';
import { Icon } from './Icons.js';
import { Modal, ModalHeader } from './Modal.js';

type LabTemplateId = 'matmul' | 'scale' | 'det';
type SlotKey = 'left' | 'right';

interface LabSlotSpec {
  key: SlotKey;
  label: string;
  accepts: readonly SemanticCategory[];
  placeholder: string;
}

interface LabTemplateSpec {
  id: LabTemplateId;
  label: string;
  operator: string;
  slots: readonly LabSlotSpec[];
  description: string;
}

interface PaletteSymbol {
  id: string;
  label: string;
  category: 'matrix' | 'number';
  create: () => FormulaNode;
}

interface FormulaLabModalProps {
  open: boolean;
  matrices: readonly StoredMatrix[];
  onClose: () => void;
  onOpenInStage: (expression: string) => void;
}

const TEMPLATES: Record<LabTemplateId, LabTemplateSpec> = {
  matmul: {
    id: 'matmul',
    label: '矩阵乘法',
    operator: '×',
    description: '两个矩阵的列/行必须相接；结果形状由左行数与右列数决定。',
    slots: [
      { key: 'left', label: '左矩阵', accepts: ['matrix'], placeholder: '拖入矩阵 A' },
      { key: 'right', label: '右矩阵', accepts: ['matrix'], placeholder: '拖入矩阵 B' },
    ],
  },
  scale: {
    id: 'scale',
    label: '标量乘法',
    operator: '×',
    description: '数字只改变尺度，不改变矩阵形状。',
    slots: [
      { key: 'left', label: '标量', accepts: ['number', 'scalar'], placeholder: '拖入数字' },
      { key: 'right', label: '矩阵', accepts: ['matrix'], placeholder: '拖入矩阵' },
    ],
  },
  det: {
    id: 'det',
    label: '行列式',
    operator: 'det',
    description: '只接受方阵；结果是一个标量，不保留矩阵形状。',
    slots: [{ key: 'left', label: '方阵', accepts: ['matrix'], placeholder: '拖入方阵' }],
  },
};

function matrixForNode(node: FormulaNode | null, matrices: readonly StoredMatrix[]): StoredMatrix | undefined {
  if (!node || node.kind !== 'symbol' || node.category !== 'matrix') return undefined;
  return matrices.find((matrix) => matrix.name === node.name);
}

function LaTeX({ node, display = false }: { node: FormulaNode; display?: boolean }) {
  const html = useMemo(
    () => renderFormulaToHtml(node, { displayMode: display, throwOnError: false }),
    [node, display],
  );
  return (
    <span
      className={`formula-katex ${display ? 'display' : ''}`}
      // Safe: formula AST is validated, KaTeX trust only permits our htmlClass/htmlData annotations.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function FormulaLabModal({ open, matrices, onClose, onOpenInStage }: FormulaLabModalProps) {
  const [templateId, setTemplateId] = useState<LabTemplateId>('matmul');
  const [filled, setFilled] = useState<Record<SlotKey, FormulaNode | null>>({ left: null, right: null });
  const [selected, setSelected] = useState<SlotKey | null>('left');
  const [message, setMessage] = useState<string | null>(null);
  const [showStructure, setShowStructure] = useState(false);
  const template = TEMPLATES[templateId];

  const palette: PaletteSymbol[] = useMemo(
    () => [
      ...matrices.map((matrix) => ({
        id: `matrix-${matrix.name}`,
        label: matrix.name,
        category: 'matrix' as const,
        create: () => symbolNode(matrix.name, { category: 'matrix' }),
      })),
      ...[0, 1, 2, -1, 0.5].map((value) => ({
        id: `number-${value}`,
        label: String(value),
        category: 'number' as const,
        create: () => numberNode(value),
      })),
    ],
    [matrices],
  );

  useEffect(() => {
    if (!open) return;
    setTemplateId('matmul');
    setFilled({ left: null, right: null });
    setSelected('left');
    setMessage(null);
    setShowStructure(false);
  }, [open]);

  const tree = useMemo(() => {
    const left = filled.left ?? slotNode('operand', {
      accepts: template.slots[0]?.accepts,
      placeholder: template.slots[0]?.placeholder,
      label: template.slots[0]?.label,
    });
    if (template.id === 'det') return callNode('det', [left]);
    const right = filled.right ?? slotNode('operand', {
      accepts: template.slots[1]?.accepts,
      placeholder: template.slots[1]?.placeholder,
      label: template.slots[1]?.label,
    });
    return operatorNode('\\times', [left, right]);
  }, [filled, template]);

  const analysis = useMemo(() => {
    const errors: string[] = [];
    const left = filled.left;
    const right = filled.right;
    const missing = template.slots.filter((slot) => !filled[slot.key]);
    if (missing.length) errors.push(`还需要填入：${missing.map((slot) => slot.label).join('、')}`);
    for (const slot of template.slots) {
      const node = filled[slot.key];
      if (node && !slot.accepts.includes(node.category)) {
        errors.push(`${slot.label} 需要 ${slot.accepts.join(' / ')}，${node.category} 不兼容`);
      }
    }
    let resultShape: string | null = null;
    let expression: string | null = null;
    if (template.id === 'matmul') {
      const a = matrixForNode(left, matrices);
      const b = matrixForNode(right, matrices);
      if (left && right && a && b) {
        if (a.cols !== b.rows) errors.push(`内维不匹配：${a.rows}×${a.cols} 无法乘 ${b.rows}×${b.cols}`);
        else {
          resultShape = `${a.rows}×${b.cols}`;
          expression = `${a.name} × ${b.name}`;
        }
      }
    } else if (template.id === 'scale') {
      const matrix = matrixForNode(right, matrices);
      if (left && right && matrix && (left.kind === 'number' || left.category === 'number')) {
        resultShape = `${matrix.rows}×${matrix.cols}`;
        if (left.kind === 'number') expression = `${left.value} × ${matrix.name}`;
      }
    } else {
      const matrix = matrixForNode(left, matrices);
      if (matrix) {
        if (matrix.rows !== matrix.cols) errors.push(`det 只接受方阵，${matrix.name} 是 ${matrix.rows}×${matrix.cols}`);
        else {
          resultShape = '标量';
          expression = `det(${matrix.name})`;
        }
      }
    }
    return { errors: [...new Set(errors)], resultShape, expression };
  }, [filled, matrices, template]);

  if (!open) return null;

  const dropOn = (slot: SlotKey, itemId: string): void => {
    const item = palette.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const spec = template.slots.find((candidate) => candidate.key === slot);
    if (!spec) return;
    if (!spec.accepts.includes(item.category)) {
      setMessage(`${spec.label} 需要 ${spec.accepts.join(' / ')}；「${item.label}」是 ${item.category}`);
      setSelected(slot);
      return;
    }
    setFilled((current) => ({ ...current, [slot]: item.create() }));
    setSelected(template.slots.find((candidate) => candidate.key !== slot)?.key ?? slot);
    setMessage(`${item.label} 已吸附到「${spec.label}」槽位。`);
  };

  const fillSelected = (item: PaletteSymbol): void => {
    const target = selected ?? template.slots.find((slot) => !filled[slot.key])?.key ?? template.slots[0]?.key;
    if (target) dropOn(target, item.id);
  };

  const loadExample = (): void => {
    const A = matrices.find((matrix) => matrix.name === 'A');
    const B = matrices.find((matrix) => matrix.name === 'B');
    const M = matrices.find((matrix) => matrix.name === 'M') ?? matrices[0];
    if (template.id === 'matmul' && A && B) {
      setFilled({ left: symbolNode(A.name, { category: 'matrix' }), right: symbolNode(B.name, { category: 'matrix' }) });
      setMessage('示例已填：A × B');
    } else if (template.id === 'scale' && A) {
      setFilled({ left: numberNode(2), right: symbolNode(A.name, { category: 'matrix' }) });
      setMessage('示例已填：2 × A');
    } else if (template.id === 'det' && M) {
      setFilled({ left: symbolNode(M.name, { category: 'matrix' }), right: null });
      setMessage(`示例已填：det(${M.name})`);
    } else {
      setMessage('当前项目缺少可用的示例矩阵。');
    }
  };

  const copy = async (text: string, label: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label}已复制到剪贴板。`);
    } catch {
      setMessage('剪贴板不可用。');
    }
  };

  const structureJson = serializeFormulaDocument(createFormulaDocument(tree));
  const plainLatex = formulaToPlainLatex(tree);

  return (
    <Modal open={open} onClose={onClose} className="formula-lab-modal" labelledBy="formula-lab-title">
      <ModalHeader
        id="formula-lab-title"
        eyebrow="FORMULA STRUCTURE LAB / 公式结构实验"
        title="先把结构搭对，再让数字进来"
        description="这是 typed AST 的第一个可见原型：符号先声明自己是矩阵、标量还是数字，槽位只接受兼容类别。拖拽只是入口，类型检查才是规则。"
        onClose={onClose}
      />

      <div className="formula-lab-body">
        <aside className="formula-lab-palette">
          <span className="micro-label">SYMBOLS / 当前项目符号</span>
          <p>点击填入当前槽位，或拖到右侧公式中。</p>
          <div className="lab-symbol-group">
            <span>矩阵对象</span>
            {palette.filter((item) => item.category === 'matrix').map((item) => (
              <button
                type="button"
                draggable
                key={item.id}
                className="lab-symbol matrix"
                onClick={() => fillSelected(item)}
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-formula-symbol', item.id);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <b>{item.label}</b>
                <em>matrix</em>
              </button>
            ))}
          </div>
          <div className="lab-symbol-group">
            <span>数字常量</span>
            {palette.filter((item) => item.category === 'number').map((item) => (
              <button
                type="button"
                draggable
                key={item.id}
                className="lab-symbol number"
                onClick={() => fillSelected(item)}
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-formula-symbol', item.id);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <b>{item.label}</b>
                <em>number</em>
              </button>
            ))}
          </div>
          <div className="lab-legend">
            <span><i className="dot matrix" />矩阵</span>
            <span><i className="dot number" />数字</span>
            <span><i className="dot slot" />待填槽位</span>
          </div>
          <button type="button" className="lab-example-button" onClick={loadExample}>
            <Icon name="spark" size={13} /> 装填示例
          </button>
        </aside>

        <section className="formula-lab-canvas">
          <div className="lab-template-tabs">
            {Object.values(TEMPLATES).map((item) => (
              <button
                type="button"
                key={item.id}
                className={templateId === item.id ? 'active' : ''}
                onClick={() => {
                  setTemplateId(item.id);
                  setFilled({ left: null, right: null });
                  setSelected('left');
                  setMessage(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="lab-template-description">{template.description}</p>

          <div className={`lab-equation template-${template.id}`}>
            {template.id === 'det' && <span className="lab-operator-word">det</span>}
            {template.id === 'det' && <span className="lab-paren">(</span>}
            {template.slots.map((slot, index) => (
              <div key={slot.key} className="lab-equation-cell">
                {index > 0 && <span className="lab-operator">{template.operator}</span>}
                <button
                  type="button"
                  className={`lab-drop-slot ${selected === slot.key ? 'selected' : ''} ${filled[slot.key] ? 'filled' : 'empty'}`}
                  onClick={() => setSelected(slot.key)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const itemId = event.dataTransfer.getData('application/x-formula-symbol');
                    if (itemId) dropOn(slot.key, itemId);
                  }}
                  aria-label={`${slot.label}槽位${filled[slot.key] ? '，已填' : '，空'}`}
                >
                  <span className="lab-slot-caption">{slot.label} · {slot.accepts.join('/')}</span>
                  {filled[slot.key] ? (
                    <LaTeX node={filled[slot.key]!} display />
                  ) : (
                    <span className="lab-slot-placeholder">{slot.placeholder}</span>
                  )}
                  {filled[slot.key] && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="lab-slot-clear"
                      title="清空槽位"
                      onClick={(event) => {
                        event.stopPropagation();
                        setFilled((current) => ({ ...current, [slot.key]: null }));
                        setSelected(slot.key);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          setFilled((current) => ({ ...current, [slot.key]: null }));
                          setSelected(slot.key);
                        }
                      }}
                    >
                      ×
                    </span>
                  )}
                </button>
              </div>
            ))}
            {template.id === 'det' && <span className="lab-paren">)</span>}
          </div>

          {message && <div className={`lab-message ${analysis.errors.length ? 'warn' : ''}`}>{message}</div>}
          {analysis.errors.length > 0 ? (
            <div className="lab-check error">
              <span className="lab-check-mark">!</span>
              <div>
                <strong>结构尚未闭合</strong>
                {analysis.errors.map((error) => <p key={error}>{error}</p>)}
              </div>
            </div>
          ) : (
            <div className="lab-check ok">
              <span className="lab-check-mark">✓</span>
              <div>
                <strong>类型与形状通过</strong>
                <p>{analysis.resultShape ? `结果形状：${analysis.resultShape}` : '结构完整，等待矩阵形状检查。'}</p>
              </div>
            </div>
          )}
        </section>

        <aside className="formula-lab-inspector">
          <span className="micro-label">STRUCTURE / 结构</span>
          <div className="lab-shape-readout">
            <span>SHAPE</span>
            <strong>
              {template.id === 'matmul' ? 'A:m×n × B:n×p' : template.id === 'scale' ? 'k × A:m×n' : 'M:n×n'}
              {analysis.resultShape ? ` → ${analysis.resultShape}` : ' → ?'}
            </strong>
          </div>
          <dl className="lab-meta">
            <div><dt>模板</dt><dd>{template.label}</dd></div>
            <div><dt>槽位</dt><dd>{template.slots.length}</dd></div>
            <div><dt>已填</dt><dd>{template.slots.filter((slot) => filled[slot.key]).length} / {template.slots.length}</dd></div>
            <div><dt>结果类别</dt><dd>{template.id === 'det' ? 'scalar' : 'matrix'}</dd></div>
          </dl>
          <div className="lab-latex">
            <span>LATEX</span>
            <code>{plainLatex}</code>
          </div>
          <div className="lab-actions">
            <button
              type="button"
              className="primary-button"
              disabled={analysis.errors.length > 0 || !analysis.expression}
              onClick={() => {
                if (analysis.expression) onOpenInStage(analysis.expression);
              }}
            >
              <Icon name="play" size={13} /> 送入演算台
            </button>
            <button type="button" className="lab-secondary" onClick={() => void copy(plainLatex, 'LaTeX')}>
              <Icon name="copy" size={12} /> 复制 LaTeX
            </button>
            <button type="button" className="lab-secondary" onClick={() => setShowStructure((value) => !value)}>
              <Icon name="code" size={12} /> {showStructure ? '收起 AST' : '查看 AST'}
            </button>
          </div>
          {showStructure && (
            <pre className="lab-structure-json">{structureJson}</pre>
          )}
          <p className="lab-footnote">
            KaTeX 只负责排版；节点类别、槽位接受集合与结果形状都来自自有 AST。复杂模板（分式、求和、导数）会共用同一结构协议。
          </p>
        </aside>
      </div>
    </Modal>
  );
}
