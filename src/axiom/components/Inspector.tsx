import { useMemo, useState } from 'react';
import type { Scene } from '../../scene/types.js';
import type {
  ExecutionStep,
  Microframe,
  RunRecord,
  Selection,
  StageFrame,
  StagePanel,
} from '../../runtime/types.js';
import { SceneMatrix } from './MatrixViews.js';
import { Icon } from '../../components/Icons.js';

interface InspectorProps {
  run: RunRecord | null;
  step: ExecutionStep | null;
  frame: StageFrame | null;
  microframe: Microframe | null;
  selection: Selection;
  scene: Scene | null;
  stale: boolean;
  detail: 'step' | 'micro';
  storeDisabled: boolean;
  onSelectMicroframe: (index: number) => void;
  onStoreResult: () => void;
  onRunAgain: () => void;
}

type InspectorTab = 'overview' | 'trace';

function previewFor(panel: StagePanel) {
  return {
    rows: panel.rows,
    cols: panel.cols,
    cells: panel.cells.map((row) => row.map((cell) => ({ text: cell.text, tone: cell.tone, hidden: cell.hidden }))),
  };
}

function pathFor(selection: Selection): string {
  if (!selection) return 'NO SELECTION';
  if (selection.kind === 'cell') return `${selection.panelKey}[${selection.row + 1},${selection.col + 1}]`;
  if (selection.kind === 'panel') return selection.panelKey;
  return selection.nodeId;
}

export default function Inspector({
  run,
  step,
  frame,
  microframe,
  selection,
  scene,
  stale,
  detail,
  storeDisabled,
  onSelectMicroframe,
  onStoreResult,
  onRunAgain,
}: InspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('overview');
  const panel = useMemo<StagePanel | null>(() => {
    if (!frame || !selection) return null;
    if (selection.kind === 'panel') return frame.panels.find((entry) => entry.key === selection.panelKey) ?? null;
    if (selection.kind === 'cell') return frame.panels.find((entry) => entry.key === selection.panelKey) ?? null;
    return null;
  }, [frame, selection]);
  const sceneNode = useMemo(
    () => (selection?.kind === 'scene-node' ? scene?.nodes.find((node) => node.id === selection.nodeId) ?? null : null),
    [scene, selection],
  );
  const cell = selection?.kind === 'cell' && panel ? panel.cells[selection.row]?.[selection.col] : null;

  let title = 'NOTHING SELECTED';
  let kind = 'SELECTION';
  let note = 'Select a matrix cell, a panel header, or a scene node.';
  let value: string | null = null;
  let shape = '—';
  if (cell && selection?.kind === 'cell' && panel) {
    title = `${panel.label}[${selection.row + 1},${selection.col + 1}]`;
    kind = 'CELL';
    value = cell.text;
    shape = `${panel.rows}×${panel.cols}`;
    note = panel.caption;
  } else if (panel) {
    title = panel.label;
    kind = panel.role.toUpperCase();
    shape = `${panel.rows}×${panel.cols}`;
    value = panel.cells.map((row) => row.map((entry) => entry.text).join(' ')).join(' · ');
    note = panel.caption;
  } else if (sceneNode) {
    title = sceneNode.label;
    kind = sceneNode.role.toUpperCase();
    shape = sceneNode.shape ? `${sceneNode.shape.rows}×${sceneNode.shape.cols}` : '—';
    value = sceneNode.badge ?? null;
    note = sceneNode.detail ?? sceneNode.label;
  } else if (step) {
    title = step.title;
    kind = 'STEP';
    shape = run?.summary.shapeChain ?? '—';
    note = step.detail;
  }

  const canStore = !storeDisabled && run?.status === 'completed' && run.resultValue?.kind === 'matrix';

  if (!run) {
    return (
      <aside className="ax-inspector" aria-label="Inspector">
        <header className="ax-panel-head">
          <div className="ax-panel-title"><strong>INSPECTOR</strong><span>检查器</span></div>
          <span className="ax-chip">EMPTY</span>
        </header>
        <div className="ax-inspector-scroll">
          <div className="ax-inspector-empty">
            <strong>NO RUN</strong>
            Run the expression to inspect values, trace IDs, and provenance. This session is in-memory only.
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="ax-inspector" aria-label="Inspector">
      <header className="ax-panel-head">
        <div className="ax-panel-title"><strong>INSPECTOR</strong><span>{run.id}</span></div>
        {stale ? <span className="ax-chip hatch">STALE</span> : <span className="ax-chip sky">LIVE</span>}
      </header>
      <div className="ax-inspector-tabs">
        <button type="button" className={`ax-inspector-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>OVERVIEW</button>
        <button type="button" className={`ax-inspector-tab ${tab === 'trace' ? 'active' : ''}`} onClick={() => setTab('trace')}>TRACE</button>
      </div>
      <div className="ax-inspector-scroll">
        <div className="ax-selection-head">
          <span className="ax-selection-path">{pathFor(selection)} · {kind}</span>
          <h3 className="ax-selection-name">{title}</h3>
          <p className="ax-selection-note">{note}</p>
        </div>

        {tab === 'overview' ? (
          <>
            <div className="ax-prop-grid">
              <span className="ax-prop-key">TYPE</span><span className="ax-prop-value">{kind}</span>
              <span className="ax-prop-key">SHAPE</span><span className="ax-prop-value">{shape}</span>
              <span className="ax-prop-key">DTYPE</span><span className="ax-prop-value">Q · exact rational</span>
              <span className="ax-prop-key">VALUE</span><span className="ax-prop-value strong">{value ?? '—'}</span>
              <span className="ax-prop-key">SOURCE</span><span className="ax-prop-value">{step ? `${step.id}` : '—'}</span>
              <span className="ax-prop-key">PROVENANCE</span><span className="ax-prop-value">{run.provenance.toUpperCase()}</span>
              <span className="ax-prop-key">RUN REV</span><span className="ax-prop-value">{run.documentRevision}</span>
            </div>

            {run.status === 'failed' && (
              <div className="ax-inspector-section">
                <h4>RUN FAILED</h4>
                <div className="ax-error-panel">
                  <strong>{run.error?.code ?? 'RUN_FAILED'}</strong>
                  <p>{run.error?.message}</p>
                </div>
              </div>
            )}

            {panel && (
              <div className="ax-inspector-section">
                <h4>VALUES <span>{panel.rows}×{panel.cols}</span></h4>
                <SceneMatrix
                  matrix={previewFor(panel)}
                  highlight={selection?.kind === 'cell' ? { row: selection.row, col: selection.col } : undefined}
                />
              </div>
            )}

            {step && (
              <div className="ax-inspector-section">
                <h4>CURRENT EQUATION</h4>
                <div className="ax-lens-rule">{frame?.lens.equation ?? step.detail}</div>
                {frame?.lens.rule && <p style={{ marginTop: 6 }}>{frame.lens.rule}</p>}
                {detail === 'micro' && microframe && <p style={{ marginTop: 6 }}><span className="ax-small-label">MICRO</span> · {microframe.label} {microframe.value ? `· ${microframe.value}` : ''}</p>}
              </div>
            )}

            <div className="ax-inspector-actions">
              {canStore && (
                <button type="button" className="ax-button tiny" onClick={onStoreResult}>
                  <Icon name="plus" size={11} /> STORE RESULT
                </button>
              )}
              {stale && (
                <button type="button" className="ax-button tiny" onClick={onRunAgain}>
                  <Icon name="play" size={11} /> RUN LATEST
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="ax-prop-grid">
              <span className="ax-prop-key">RUN</span><span className="ax-prop-value">{run.id}</span>
              <span className="ax-prop-key">STEP</span><span className="ax-prop-value">{step ? `${String(step.index + 1).padStart(2, '0')} / ${String(run.steps.length).padStart(2, '0')}` : '—'}</span>
              <span className="ax-prop-key">STATUS</span><span className="ax-prop-value">{step?.status.toUpperCase() ?? run.status.toUpperCase()}</span>
              <span className="ax-prop-key">PHASE</span><span className="ax-prop-value">{step?.phase.toUpperCase() ?? '—'}</span>
              <span className="ax-prop-key">OP</span><span className="ax-prop-value">{step?.op ?? '—'}</span>
              <span className="ax-prop-key">TRACE</span><span className="ax-prop-value">{run.provenance.toUpperCase()} / {run.engine.backend.toUpperCase()}</span>
            </div>
            {step && (
              <>
                <div className="ax-inspector-section">
                  <h4>INPUT VALUE IDS</h4>
                  <div className="ax-trace-ids">{step.inputs.map((id) => <span key={id}>{id}</span>)}</div>
                </div>
                <div className="ax-inspector-section">
                  <h4>OUTPUT VALUE IDS</h4>
                  <div className="ax-trace-ids">{step.outputs.map((id) => <span key={id}>{id}</span>)}</div>
                </div>
                <div className="ax-inspector-section">
                  <h4>MICROFRAMES <span>{run.microframes[step.id]?.length ?? 0}</span></h4>
                  <div className="ax-micro-list">
                    {(run.microframes[step.id] ?? []).map((frameItem, index) => (
                      <button type="button" className="ax-micro-list-item" key={frameItem.id} onClick={() => onSelectMicroframe(index)}>
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <strong>{frameItem.label}</strong>
                        <em>{frameItem.value ?? ''}</em>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
