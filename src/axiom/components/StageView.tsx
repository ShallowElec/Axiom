import type { ExecutionStep, Microframe, RunRecord, Selection, StageFrame } from '../../runtime/types.js';
import { StageMatrix } from './MatrixViews.js';
import { Icon } from '../../components/Icons.js';

interface StageViewProps {
  run: RunRecord | null;
  step: ExecutionStep | null;
  frame: StageFrame | null;
  microframe: Microframe | null;
  stepIndex: number;
  totalSteps: number;
  selection: Selection;
  detail: 'step' | 'micro';
  stale: boolean;
  expression: string;
  onRun: () => void;
  onSelectCell: (panelKey: string, row: number, col: number) => void;
  onSelectPanel: (panelKey: string) => void;
}

export default function StageView({
  run,
  step,
  frame,
  microframe,
  stepIndex,
  totalSteps,
  selection,
  detail,
  stale,
  expression,
  onRun,
  onSelectCell,
  onSelectPanel,
}: StageViewProps) {
  if (!run) {
    return (
      <div className="ax-stage-empty">
        <span className="ax-micro">NO RUN / READY</span>
        <h2>Run the expression to build an inspectable trace.</h2>
        <p>
          The document is editable and local to this session. Running creates an immutable trace; replay and view
          switching never execute the engine again.
        </p>
        <div className="ax-stage-empty-formula">{expression || '—'}</div>
        <div className="ax-stage-empty-actions">
          <button type="button" className="ax-button primary" onClick={onRun}><Icon name="play" size={12} /> RUN EXPRESSION</button>
          <span className="ax-chip">F5</span>
        </div>
      </div>
    );
  }

  if (run.status === 'failed' || !step || !frame) {
    return (
      <div className="ax-stage-empty">
        <span className="ax-micro">RUN FAILED / {run.id}</span>
        <div className="ax-error-panel">
          <strong>ERROR · {run.error?.code ?? 'RUN_FAILED'}</strong>
          <p>{run.error?.message ?? 'This run did not produce a trace.'}</p>
          {run.summary.expression && <p className="ax-mono">EXPRESSION · {run.summary.expression}</p>}
        </div>
        <div className="ax-stage-empty-actions">
          <button type="button" className="ax-button primary" onClick={onRun}><Icon name="reset" size={12} /> RUN AGAIN</button>
        </div>
      </div>
    );
  }

  const group = run.groups.find((entry) => entry.id === step.groupId);
  const selectedCell = selection?.kind === 'cell' && selection.panelKey
    ? { panelKey: selection.panelKey, row: selection.row, col: selection.col }
    : null;
  const selectedPanel = selection?.kind === 'panel' ? selection.panelKey : null;

  return (
    <div className="ax-stage">
      <header className="ax-stage-head">
        <div className="ax-stage-title">
          <div className="ax-stage-eyebrow">
            <span>STEP {String(stepIndex + 1).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}</span>
            <span className="ax-vsep" />
            <span>{group?.label ?? 'DERIVED EXECUTION'}</span>
            {stale && <span className="ax-chip hatch">STALE REVIEW</span>}
          </div>
          <h2>{step.title}</h2>
          <p>{step.detail}</p>
        </div>
        <div className="ax-stage-meta">
          <span className="ax-chip">{run.summary.shapeChain}</span>
          <span className="ax-chip sky">DERIVED</span>
        </div>
      </header>

      <div className="ax-stage-canvas">
        <div className="ax-stage-panels">
          {frame.panels.map((panel, index) => (
            <div className="ax-stage-panels" key={panel.key}>
              {index > 0 && <div className="ax-connector" aria-hidden="true">{frame.connectors[index - 1] ?? '·'}</div>}
              <article className={`ax-stage-panel role-${panel.role} ${selectedPanel === panel.key ? 'selected' : ''}`}>
                <button type="button" className="ax-panel-caption" onClick={() => onSelectPanel(panel.key)} title={`Inspect ${panel.label}`}>
                  <span className="ax-panel-name">{panel.label}</span>
                  <span className="ax-panel-shape">{panel.shape}</span>
                </button>
                <div className="ax-panel-caption-role" style={{ display: 'none' }}>{panel.role}</div>
                <StageMatrix
                  panel={panel}
                  selectedCell={selectedCell?.panelKey === panel.key ? selectedCell : null}
                  onSelectCell={(row, col) => onSelectCell(panel.key, row, col)}
                />
                <div className="ax-panel-foot">
                  <span>{panel.role.toUpperCase()}</span>
                  <span>{panel.caption || '—'}</span>
                </div>
              </article>
            </div>
          ))}
        </div>
      </div>

      {detail === 'micro' && microframe && (
        <div className="ax-micro-caption">
          <span className="ax-dot black" />
          <strong>MICRO {String(microframe.index + 1).padStart(2, '0')}</strong>
          <span>{microframe.label}</span>
          {microframe.equation && <span>· {microframe.equation}</span>}
          {microframe.value && <span>· {microframe.value}</span>}
        </div>
      )}

      <div className="ax-stage-bottom">
        <div className="ax-lens">
          <div className="ax-lens-head">
            <strong className="ax-lens-equation">{frame.lens.equation}</strong>
            <span className="ax-lens-kicker">{frame.lens.kicker}</span>
          </div>
          <div className="ax-terms">
            {frame.lens.terms.slice(0, 8).map((term, index) => (
              <span className={`ax-term ${term.state}`} key={`${term.label}-${index}`}>
                <em>{term.label}</em>
                <strong>{term.expr}</strong>
                <span>= {term.value}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="ax-readout">
          <span className="ax-readout-label">{frame.readout?.label ?? 'CURRENT VALUE'}</span>
          <strong className="ax-readout-value">
            {frame.readout?.value ?? frame.lens.accumulator?.value ?? '—'}
          </strong>
          <span className="ax-readout-note">{frame.readout?.note ?? frame.lens.note}</span>
        </div>
      </div>
    </div>
  );
}
