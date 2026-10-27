import type { StoredMatrix } from '../../core/matrix.js';
import type { Story } from '../../presentation/storyTypes.js';
import type { NativeCheckpoint, NativeOperation, Problem, ReplayState, RunRecord } from '../../runtime/types.js';
import { Icon } from '../../components/Icons.js';
import ConsolePanel from './ConsolePanel.js';
import ProblemsPanel from './ProblemsPanel.js';
import TracePanel from './TracePanel.js';
import NativePanel from './NativePanel.js';

export type DockTab = 'replay' | 'trace' | 'native' | 'console' | 'problems';

interface ReplayDockProps {
  open: boolean;
  activeTab: DockTab;
  onTab: (tab: DockTab) => void;
  onToggleOpen: () => void;
  run: RunRecord | null;
  replay: ReplayState;
  problems: readonly Problem[];
  matrices: readonly StoredMatrix[];
  consoleFunctionId: string;
  onSelectFunction: (id: string) => void;
  onOpenStory: (story: Story) => void;
  onSeekStep: (index: number) => void;
  onSeekMicro: (index: number) => void;
  onPlayPause: () => void;
  onPrevStep: () => void;
  onNextStep: () => void;
  onSetDetail: (detail: 'step' | 'micro') => void;
  onSetSpeed: (speed: number) => void;
  onToggleLoop: () => void;
  onFork: (operation: NativeOperation, checkpoint: NativeCheckpoint) => void;
}

const tabs: Array<{ id: DockTab; label: string; icon: string }> = [
  { id: 'replay', label: 'REPLAY', icon: 'play' },
  { id: 'trace', label: 'TRACE', icon: 'table' },
  { id: 'native', label: 'NATIVE', icon: 'fork' },
  { id: 'console', label: 'CONSOLE', icon: 'terminal' },
  { id: 'problems', label: 'PROBLEMS', icon: 'compass' },
];

export default function ReplayDock({
  open,
  activeTab,
  onTab,
  onToggleOpen,
  run,
  replay,
  problems,
  matrices,
  consoleFunctionId,
  onSelectFunction,
  onOpenStory,
  onSeekStep,
  onSeekMicro,
  onPlayPause,
  onPrevStep,
  onNextStep,
  onSetDetail,
  onSetSpeed,
  onToggleLoop,
  onFork,
}: ReplayDockProps) {
  const activeStep = run?.steps[replay.stepIndex] ?? null;
  const activeMicroframes = activeStep ? run?.microframes[activeStep.id] ?? [] : [];
  const counts: Record<DockTab, string> = {
    replay: run ? String(run.steps.length) : '',
    trace: run ? String(run.steps.length) : '',
    native: run?.native ? String(run.native.operations.length) : '',
    console: '',
    problems: problems.length ? String(problems.length) : '',
  };

  return (
    <section className="ax-dock" aria-label="Replay and debugging dock">
      <header className="ax-dock-head">
        <div className="ax-dock-tabs" role="tablist" aria-label="Bottom panels">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`ax-dock-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTab(tab.id)}
            >
              <Icon name={tab.icon} size={11} strokeWidth={1.5} />
              {tab.label}
              {counts[tab.id] && <span className="ax-dock-tab-count">{counts[tab.id]}</span>}
            </button>
          ))}
        </div>
        <div className="ax-dock-actions">
          {run && <span className="ax-chip sky">{run.provenance.toUpperCase()}</span>}
          <button
            type="button"
            className="ax-row-icon"
            onClick={onToggleOpen}
            title={open ? 'Collapse dock' : 'Expand dock'}
            aria-label={open ? 'Collapse dock' : 'Expand dock'}
          >
            <Icon name={open ? 'chevron' : 'forward'} size={13} strokeWidth={1.5} />
          </button>
        </div>
      </header>
      {open && (
        <div className="ax-dock-body">
          {activeTab === 'replay' && (
            !run ? (
              <div className="ax-replay-empty">
                <span>NO RUN / NO REPLAY</span>
                <span className="ax-small-label">F5 creates an immutable run in this session.</span>
              </div>
            ) : (
              <div className="ax-replay">
                <div className="ax-replay-head">
                  <div className="ax-replay-run">
                    <strong>{run.id}</strong>
                    <span>{run.summary.expression}</span>
                  </div>
                  <div className="ax-replay-spacer" />
                  <span className="ax-replay-meta">
                    <span>{run.steps.length} STEPS</span>
                    <span>{run.provenance.toUpperCase()}</span>
                    <span>{run.presentationProvenance.toUpperCase()} PRESENTATION</span>
                    {run.lineage && <span>BRANCH ← {run.lineage.parentRunId}</span>}
                    <span>{replay.status.toUpperCase()}</span>
                  </span>
                </div>

                <div className="ax-timeline">
                  <div className="ax-timeline-groups">
                    {run.groups.map((group) => (
                      <div className="ax-timeline-group" key={group.id} style={{ flex: `${group.stepIds.length} 1 0` }}>
                        <span>{group.kind}</span>
                        <strong>{group.label}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="ax-timeline-steps">
                    {run.steps.map((step, index) => (
                      <button
                        type="button"
                        key={step.id}
                        className={`ax-timeline-step ${index === replay.stepIndex ? 'active' : ''}`}
                        onClick={() => onSeekStep(index)}
                        title={step.detail}
                      >
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <strong>{step.title}</strong>
                      </button>
                    ))}
                  </div>
                  {replay.detail === 'micro' && activeMicroframes.length > 0 && (
                    <div className="ax-microstrip">
                      {activeMicroframes.map((frame, index) => (
                        <button
                          type="button"
                          key={frame.id}
                          className={`ax-microframe ${index === replay.microIndex ? 'active' : ''}`}
                          onClick={() => onSeekMicro(index)}
                          title={frame.detail}
                        >
                          <span>{String(index + 1).padStart(2, '0')}</span>
                          {frame.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="ax-replay-controls">
                  <button type="button" className="ax-control" onClick={() => onSeekStep(0)} title="Go to start" aria-label="Go to start">
                    <Icon name="rewind" size={13} strokeWidth={1.5} />
                  </button>
                  <button type="button" className="ax-control" onClick={onPrevStep} disabled={!run.steps.length} title="Previous step" aria-label="Previous step">
                    <Icon name="stepBack" size={13} strokeWidth={1.5} />
                  </button>
                  <button type="button" className="ax-control primary" onClick={onPlayPause} disabled={!run.steps.length} title={replay.status === 'playing' ? 'Pause' : 'Play'} aria-label={replay.status === 'playing' ? 'Pause' : 'Play'}>
                    <Icon name={replay.status === 'playing' ? 'pause' : 'play'} size={12} />
                  </button>
                  <button type="button" className="ax-control" onClick={onNextStep} disabled={!run.steps.length} title="Next step" aria-label="Next step">
                    <Icon name="stepForward" size={13} strokeWidth={1.5} />
                  </button>
                  <button type="button" className="ax-control" onClick={() => onSeekStep(run.steps.length - 1)} title="Go to end" aria-label="Go to end">
                    <Icon name="fastForward" size={13} strokeWidth={1.5} />
                  </button>
                  <span className="ax-vsep" />
                  <span className="ax-replay-caption">
                    <span>STEP {String(replay.stepIndex + 1).padStart(2, '0')}/{String(run.steps.length).padStart(2, '0')}</span>
                    <strong>{activeStep?.title}</strong>
                    <em>{activeStep?.detail}</em>
                  </span>
                  <span className="ax-replay-spacer" />
                  <div className="ax-segmented" aria-label="Replay granularity">
                    <button type="button" className={replay.detail === 'step' ? 'active' : ''} onClick={() => onSetDetail('step')} title="Play by execution step">STEP</button>
                    <button type="button" className={replay.detail === 'micro' ? 'active' : ''} onClick={() => onSetDetail('micro')} title="Play presentation microframes">MICRO</button>
                  </div>
                  <select
                    className="ax-speed"
                    value={replay.speed}
                    onChange={(event) => onSetSpeed(Number(event.target.value))}
                    aria-label="Replay speed"
                  >
                    {[0.25, 0.5, 1, 2, 4].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
                  </select>
                  <button
                    type="button"
                    className={`ax-control ${replay.loop ? 'active' : ''}`}
                    onClick={onToggleLoop}
                    title="Loop replay"
                    aria-label="Loop replay"
                    aria-pressed={replay.loop}
                  >
                    <Icon name="reset" size={12} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            )
          )}
          {activeTab === 'trace' && <TracePanel run={run} activeIndex={replay.stepIndex} onSeek={onSeekStep} />}
          {activeTab === 'native' && <NativePanel run={run} onFork={onFork} />}
          {activeTab === 'console' && (
            <ConsolePanel
              matrices={matrices}
              selectedFunctionId={consoleFunctionId}
              onSelectFunction={onSelectFunction}
              onOpenStory={onOpenStory}
            />
          )}
          {activeTab === 'problems' && <ProblemsPanel problems={problems} />}
        </div>
      )}
    </section>
  );
}
