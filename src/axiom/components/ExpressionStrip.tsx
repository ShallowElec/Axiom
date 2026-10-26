import type { ExpressionAnalysis } from '../../core/expression.js';

interface ExpressionStripProps {
  expression: string;
  analysis: ExpressionAnalysis;
  revision: number;
  onChange: (value: string) => void;
  onRun: () => void;
}

export default function ExpressionStrip({ expression, analysis, revision, onChange, onRun }: ExpressionStripProps) {
  const shape = analysis.ok
    ? analysis.kind === 'matrix'
      ? `${analysis.shape.rows}×${analysis.shape.cols}`
      : 'scalar'
    : 'invalid';
  return (
    <section className="ax-expression" aria-label="Expression">
      <div className="ax-expression-head">
        <div className="ax-expression-meta">
          <span className="ax-micro">EXPRESSION / 表达式</span>
          <span className="ax-expression-shape">{shape} · DOC REV {String(revision).padStart(2, '0')}</span>
        </div>
        <span className="ax-micro">{analysis.ok ? `${analysis.opCount} OPS` : 'NOT RUNNABLE'}</span>
      </div>
      <div className="ax-expression-line">
        <span className="ax-expression-prefix">f</span>
        <input
          className={`ax-expression-input ${analysis.ok ? '' : 'invalid'}`}
          value={expression}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onRun();
            }
          }}
          spellCheck={false}
          aria-label="Matrix expression"
        />
      </div>
      <div className={`ax-expression-hint ${analysis.ok ? '' : 'error'}`}>
        {analysis.ok ? (
          <>
            Shape contract accepted. <span className="ax-key">F5</span> run · <span className="ax-key">ENTER</span> in field
            to run.
          </>
        ) : (
          <>ERR · {analysis.error}</>
        )}
      </div>
    </section>
  );
}
