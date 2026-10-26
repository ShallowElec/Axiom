import type { ExecutionStep, RunRecord, ValueSnapshot } from '../../runtime/types.js';

interface TracePanelProps {
  run: RunRecord | null;
  activeIndex: number;
  onSeek: (index: number) => void;
}

function outputShape(step: ExecutionStep, values: Record<string, ValueSnapshot>): string {
  const value = step.outputs.map((id) => values[id]).find(Boolean);
  if (!value?.shape) return value?.kind === 'scalar' ? 'scalar' : '—';
  return `${value.shape.rows}×${value.shape.cols}`;
}

export default function TracePanel({ run, activeIndex, onSeek }: TracePanelProps) {
  if (!run) {
    return <div className="ax-empty-inline">No trace. Run the expression to populate this table.</div>;
  }
  return (
    <div className="ax-table-scroll">
      <table className="ax-table" aria-label="Execution trace">
        <thead>
          <tr>
            <th style={{ width: 45 }}>#</th>
            <th style={{ width: 70 }}>STATUS</th>
            <th style={{ width: 105 }}>OP</th>
            <th>STEP</th>
            <th style={{ width: 80 }}>SHAPE</th>
            <th style={{ width: 76 }}>SOURCE</th>
            <th style={{ width: 70 }}>MICRO</th>
          </tr>
        </thead>
        <tbody>
          {run.steps.map((step, index) => (
            <tr key={step.id} className={index === activeIndex ? 'active' : ''} onClick={() => onSeek(index)}>
              <td>{String(index + 1).padStart(2, '0')}</td>
              <td className={`status-${step.status}`}>{step.status.toUpperCase()}</td>
              <td>{step.op}</td>
              <td>{step.title}</td>
              <td>{outputShape(step, run.values)}</td>
              <td>{step.provenance.toUpperCase()}</td>
              <td>{run.microframes[step.id]?.length ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {run.status === 'failed' && (
        <div className="ax-console-error" style={{ margin: 10 }}>
          <strong>ERROR · {run.error?.code ?? 'RUN_FAILED'}</strong><br />
          {run.error?.message}
        </div>
      )}
    </div>
  );
}
