import type { ExecutionStep, RunRecord, Selection } from '../../runtime/types.js';

interface StatusBarProps {
  run: RunRecord | null;
  step: ExecutionStep | null;
  stepIndex: number;
  totalSteps: number;
  selection: Selection;
  stale: boolean;
  theme: 'light' | 'dark';
  detail: 'step' | 'micro';
}

function selectionLabel(selection: Selection): string {
  if (!selection) return 'NO SELECTION';
  if (selection.kind === 'cell') return `${selection.panelKey}[${selection.row + 1},${selection.col + 1}]`;
  if (selection.kind === 'panel') return selection.panelKey;
  return selection.nodeId;
}

export default function StatusBar({ run, step, stepIndex, totalSteps, selection, stale, theme, detail }: StatusBarProps) {
  return (
    <footer className="ax-statusbar">
      <div className="ax-status-group">
        <span><strong>IN-MEMORY</strong></span>
        <span className="ax-status-sep" />
        <span>ENGINE EXACT-Q</span>
        <span className="ax-status-sep" />
        <span>{run ? `${run.id} · ${run.provenance.toUpperCase()}` : 'NO RUN'}</span>
        {stale && <span className="ax-chip hatch">STALE</span>}
      </div>
      <div className="ax-status-group">
        <span>{run && totalSteps ? `STEP ${String(stepIndex + 1).padStart(2, '0')}/${String(totalSteps).padStart(2, '0')}` : 'STEP —/—'}</span>
        <span>{detail.toUpperCase()}</span>
        <span className="ax-status-sep" />
        <span>{selectionLabel(selection)}</span>
        <span className="ax-status-sep" />
        <span>{theme.toUpperCase()}</span>
        {step?.status === 'error' && <span className="ax-chip hatch">ERROR</span>}
      </div>
    </footer>
  );
}
