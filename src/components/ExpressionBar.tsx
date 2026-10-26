import { useRef } from 'react';
import type { FormEvent } from 'react';
import { insertAtCursor } from '../core/expression.js';
import type { ExpressionAnalysis } from '../core/expression.js';
import type { Matrix } from '../core/matrix.js';
import { Icon } from './Icons';

const OPERATORS = [
  { label: '+', insert: ' + ', title: '矩阵加法' },
  { label: '−', insert: ' - ', title: '矩阵减法' },
  { label: '×', insert: ' × ', title: '矩阵乘法', accent: true },
  { label: '÷', insert: ' / ', title: '除以标量' },
  { label: '^', insert: '^', title: '矩阵幂，例如 A^2' },
  { label: '⊙', insert: ' ⊙ ', title: 'Hadamard 逐项乘积' },
  { label: '⊗', insert: ' ⊗ ', title: 'Kronecker 积' },
  { label: 'ᵀ', insert: 'ᵀ', title: '转置' },
];

const FUNCTIONS = [
  { label: 'det', insert: 'det()', caretBack: 1, title: '行列式' },
  { label: 'inv', insert: 'inv()', caretBack: 1, title: '逆矩阵' },
  { label: 'rank', insert: 'rank()', caretBack: 1, title: '秩' },
  { label: 'trace', insert: 'trace()', caretBack: 1, title: '迹' },
  { label: 'rref', insert: 'rref()', caretBack: 1, title: '最简行阶梯形' },
  { label: 'solve', insert: 'solve(, )', caretBack: 3, title: '解线性方程组' },
];

interface ExpressionBarProps {
  expression: string;
  setExpression: (value: string) => void;
  matrices: readonly Matrix[];
  analysis: ExpressionAnalysis;
  onRun: () => void;
  onOpenExamples: () => void;
  onOpenTemplates: () => void;
  onOpenOps: () => void;
}

export default function ExpressionBar({
  expression,
  setExpression,
  matrices,
  analysis,
  onRun,
  onOpenExamples,
  onOpenTemplates,
  onOpenOps,
}: ExpressionBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const insert = (text: string, caretBack = 0): void => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? expression.length;
    const end = el?.selectionEnd ?? expression.length;
    const result = insertAtCursor(expression, text, start, end);
    setExpression(result.value);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = Math.max(0, result.cursor - caretBack);
      el.setSelectionRange(caret, caret);
    });
  };

  const insertMatrixToken = (name: string): void => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? expression.length;
    const before = expression.slice(0, start).trimEnd();
    const needsOperator = before && !/[+\-*/^⊙⊗(,]$/.test(before);
    insert(needsOperator ? ` + ${name} ` : `${name} `);
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (analysis.ok) onRun();
  };

  return (
    <section className="expression-bar" aria-label="矩阵表达式工作区">
      <form onSubmit={submit} className="expression-main">
        <div className="expression-label">
          <span className="micro-label">EXPRESSION<span className="expr-cn"> / 现场表达式</span></span>
          <span className="expression-hint">把矩阵对象用运算符连接起来</span>
        </div>
        <div className={`expression-field ${!analysis.ok ? 'has-error' : ''}`}>
          <span className="expression-prefix">ƒ</span>
          <input
            ref={inputRef}
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="例如  A × B + A"
            spellCheck="false"
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="矩阵表达式"
          />
          {expression && (
            <button
              type="button"
              className="field-clear"
              onClick={() => {
                setExpression('');
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              aria-label="清空表达式"
            >
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
        <div className="expression-status">
          {analysis.ok ? (
            <div className="parse-ok">
              <span className="status-dot ok" />
              <span>{analysis.kind === 'matrix' ? `结果 ${analysis.shape.rows}×${analysis.shape.cols}` : '结果：标量'}</span>
              <span className="parse-ops">{analysis.opCount} 次运算</span>
            </div>
          ) : (
            <div className="parse-error" title={analysis.error}>
              <span className="status-dot error" />
              <span>{analysis.error}</span>
            </div>
          )}
        </div>
        <button type="submit" className="run-button" disabled={!analysis.ok}>
          <span className="run-button-pulse">
            <Icon name="play" size={14} />
          </span>
          <span>开演</span>
          <kbd>↵</kbd>
        </button>
      </form>

      <div className="expression-tools">
        <div className="tool-group matrix-chips">
          <span className="tool-label">矩阵</span>
          {matrices.slice(0, 7).map((m) => (
            <button type="button" key={m.name} className="matrix-chip" onClick={() => insertMatrixToken(m.name)} title={`插入矩阵 ${m.name}`}>
              <b>{m.name}</b>
              <span>{m.rows}×{m.cols}</span>
            </button>
          ))}
        </div>
        <span className="tool-divider" />
        <div className="tool-group operator-chips">
          {OPERATORS.map((op) => (
            <button
              type="button"
              key={op.label}
              className={`operator-chip ${op.accent ? 'accent' : ''}`}
              onClick={() => insert(op.insert)}
              title={op.title}
            >
              {op.label}
            </button>
          ))}
        </div>
        <span className="tool-divider" />
        <div className="tool-group function-chips">
          {FUNCTIONS.map((fn) => (
            <button
              type="button"
              key={fn.label}
              className="function-chip"
              onClick={() => insert(fn.insert, fn.caretBack || 0)}
              title={fn.title}
            >
              {fn.label}
            </button>
          ))}
        </div>
        <div className="expression-shortcuts">
          <button type="button" className="text-button" onClick={onOpenExamples}>
            示例 <Icon name="chevron" size={12} />
          </button>
          <button type="button" className="text-button" onClick={onOpenTemplates}>
            模板
          </button>
          <button type="button" className="text-button" onClick={onOpenOps}>
            运算手册
          </button>
        </div>
      </div>
    </section>
  );
}
