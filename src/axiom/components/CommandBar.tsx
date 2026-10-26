import { Icon } from '../../components/Icons.js';
import type { RunRecord } from '../../runtime/types.js';

interface CommandBarProps {
  run: RunRecord | null;
  stale: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onRun: () => void;
  onOpenRuns: () => void;
}

const runLabel = (run: RunRecord | null): string => {
  if (!run) return 'NO RUN';
  if (run.status === 'failed') return 'FAILED';
  if (run.status === 'computing') return 'COMPUTING';
  return 'READY';
};

export default function CommandBar({ run, stale, theme, onToggleTheme, onRun, onOpenRuns }: CommandBarProps) {
  return (
    <header className="ax-commandbar">
      <div className="ax-command-left">
        <div className="ax-wordmark" title="Axiom — computational workbench">
          <strong>AXIOM</strong>
          <span>COMPUTATIONAL WORKBENCH</span>
        </div>
        <div className="ax-session">
          <div className="ax-session-copy">
            <span className="ax-session-name">UNTITLED SESSION</span>
            <span className="ax-session-state"><span className="ax-dot black" /> IN-MEMORY / {new Date().getFullYear()}</span>
          </div>
        </div>
      </div>

      <div className="ax-command-center">
        <button type="button" className="ax-command-button" onClick={onOpenRuns} title="Open in-memory runs">
          <span>{run?.id ?? 'NO RUN'}</span><kbd>RUNS</kbd>
        </button>
        <span className="ax-command-center-sep" />
        <span className="ax-run-state">
          <span className={`ax-chip ${stale ? 'hatch' : run ? 'sky' : ''}`}>{stale ? 'STALE' : runLabel(run)}</span>
          {run && <><strong>{run.steps.length}</strong> STEPS · {run.provenance === 'derived' ? 'DERIVED' : 'NATIVE'}</>}
          {!run && <>RUN THE EXPRESSION TO BUILD A TRACE</>}
        </span>
      </div>

      <div className="ax-command-right">
        <button
          type="button"
          className="ax-icon-button"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
          <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} strokeWidth={1.5} />
        </button>
        <button type="button" className="ax-run-button" onClick={onRun} title="Run the current expression (F5)">
          <Icon name="play" size={12} /> RUN <kbd>F5</kbd>
        </button>
      </div>
    </header>
  );
}
