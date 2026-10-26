import type { Problem } from '../../runtime/types.js';

export default function ProblemsPanel({ problems }: { problems: readonly Problem[] }) {
  if (!problems.length) {
    return <div className="ax-empty-inline">No problems. EXPRESSION / RUN diagnostics will appear here.</div>;
  }
  return (
    <div className="ax-problems">
      {problems.map((problem) => (
        <div className="ax-problem" key={problem.id}>
          <span className="ax-problem-level">{problem.severity === 'error' ? '× ERROR' : '△ WARN'}</span>
          <span className="ax-problem-message">{problem.message}</span>
          <span className="ax-problem-code">{problem.code ?? '—'}</span>
          {problem.detail && <span className="ax-problem-detail">{problem.detail}</span>}
        </div>
      ))}
    </div>
  );
}
