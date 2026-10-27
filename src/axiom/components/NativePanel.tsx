import type { NativeCheckpoint, NativeOperation, RunRecord } from '../../runtime/types.js';
import { Icon } from '../../components/Icons.js';

interface NativePanelProps {
  run: RunRecord | null;
  onFork: (operation: NativeOperation, checkpoint: NativeCheckpoint) => void;
}

export default function NativePanel({ run, onFork }: NativePanelProps) {
  const trace = run?.native;
  if (!run || !trace) {
    return (
      <div className="ax-native-empty">
        <span className="ax-micro">NATIVE TRACE / 原生执行记录</span>
        <p>No native trace for this run. Function-story runs remain derived; expression runs produce exact-Q checkpoints.</p>
      </div>
    );
  }

  return (
    <div className="ax-native-panel">
      <header className="ax-native-head">
        <div>
          <span className="ax-micro">NATIVE TRACE / 原生执行记录</span>
          <strong>{run.id} · {trace.granularity === 'cell' ? 'CELL CHECKPOINTS' : 'OPERATION CHECKPOINTS'}</strong>
        </div>
        <div className="ax-native-stats">
          <span>{trace.operations.length} OPS</span>
          <span>{Object.keys(trace.checkpoints).length} CKPT</span>
          <span>{trace.durationMs ? `${trace.durationMs.toFixed(1)} MS` : 'EXACT-Q'}</span>
        </div>
      </header>
      <div className="ax-native-table-wrap">
        <table className="ax-native-table">
          <thead>
            <tr>
              <th>#</th>
              <th>KIND</th>
              <th>OPERATION</th>
              <th>EXPRESSION</th>
              <th>CHECKPOINT</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {trace.operations.map((operation) => {
              const checkpoint = trace.checkpoints[operation.checkpointId];
              const result = operation.resultValueId ? checkpoint?.values[operation.resultValueId] : null;
              const canFork = Boolean(result?.kind === 'matrix' && result.matrix);
              return (
                <tr key={operation.id} className={checkpoint?.complete ? 'complete' : ''}>
                  <td className="ax-mono">{String(operation.index + 1).padStart(2, '0')}</td>
                  <td><span className={`ax-native-kind ${operation.kind}`}>{operation.kind}</span></td>
                  <td>
                    <strong>{operation.label}</strong>
                    {operation.coordinates && <small>[{operation.coordinates.row + 1},{operation.coordinates.col + 1}]</small>}
                  </td>
                  <td className="ax-native-expr">{operation.expression}</td>
                  <td className="ax-native-checkpoint">
                    <code>{operation.checkpointId}</code>
                    <span>{checkpoint?.complete ? 'COMPLETE' : 'PARTIAL'}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ax-button tiny"
                      disabled={!canFork}
                      onClick={() => checkpoint && onFork(operation, checkpoint)}
                      title={canFork ? `Create a branch from ${operation.checkpointId}` : 'This checkpoint has no matrix value'}
                    >
                      <Icon name="fork" size={11} /> FORK
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="ax-native-foot">
        <span>Exact-Q native values · presentation remains derived</span>
        <span>Checkpoint matrices are materialized as new session inputs when forked.</span>
      </footer>
    </div>
  );
}
