import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StoredMatrix } from './core/matrix.js';
import { DEBUG_FUNCTIONS } from './debug/registry.js';
import type { DebugFunctionDefinition } from './debug/types.js';
import { TEMPLATES } from './content/library.js';
import type { FormulaTemplate } from './content/library.js';
import type { Story } from './presentation/storyTypes.js';
import { createSeedDocument, WorkbenchStore } from './runtime/workbench-store.js';
import { analyzeObjectsExpression, analyzeWorkbenchDocument } from './runtime/document.js';
import type { MatrixDraft, ToastMessage } from './workspace/types.js';
import ActivityRail from './axiom/components/ActivityRail.js';
import type { ResourceMode } from './axiom/components/ActivityRail.js';
import CommandBar from './axiom/components/CommandBar.js';
import ExpressionStrip from './axiom/components/ExpressionStrip.js';
import FlatView from './axiom/components/FlatView.js';
import Inspector from './axiom/components/Inspector.js';
import LayersView from './axiom/components/LayersView.js';
import ReplayDock from './axiom/components/ReplayDock.js';
import type { DockTab } from './axiom/components/ReplayDock.js';
import ResourceDock from './axiom/components/ResourceDock.js';
import StageView from './axiom/components/StageView.js';
import StatusBar from './axiom/components/StatusBar.js';
import TemplateDialog from './axiom/components/TemplateDialog.js';
import { useWorkbench } from './axiom/useWorkbench.js';
import { draftToStored, nextMatrixName, replaceIdentifier, withShape } from './axiom/matrix-utils.js';
import MatrixEditorModal from './components/MatrixEditorModal.js';
import { Icon } from './components/Icons.js';

const FormulaLabModal = lazy(() => import('./components/FormulaLabModal.js'));

type ViewMode = 'stage' | 'flat' | 'layers';

interface EditorState {
  open: boolean;
  matrix: StoredMatrix | null;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export default function AxiomApp() {
  const storeRef = useRef<WorkbenchStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new WorkbenchStore({ document: createSeedDocument() });
  }
  const store = storeRef.current;
  const state = useWorkbench(store);
  const { document: workbenchDocument, runs, activeRunId, replay, selection, problems } = state;
  const run = runs.find((candidate) => candidate.id === activeRunId) ?? null;
  const step = run?.steps[replay.stepIndex] ?? null;
  const frame = step ? run?.frames[step.id] ?? null : null;
  const microframes = step ? run?.microframes[step.id] ?? [] : [];
  const microframe = microframes[replay.microIndex] ?? null;
  const stale = Boolean(run && run.documentRevision !== workbenchDocument.revision);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [resourceMode, setResourceMode] = useState<ResourceMode>('objects');
  const [resourceOpen, setResourceOpen] = useState(() => window.innerWidth >= 1280);
  const [view, setView] = useState<ViewMode>('stage');
  const [dockOpen, setDockOpen] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>('replay');
  const [consoleFunctionId, setConsoleFunctionId] = useState(DEBUG_FUNCTIONS[0]?.id ?? 'matmul');
  const scene = step && run
    ? run.scenes[step.id]?.[view === 'flat' ? 'flat' : 'layered'] ?? null
    : null;
  const [editor, setEditor] = useState<EditorState>({ open: false, matrix: null });
  const [template, setTemplate] = useState<FormulaTemplate | null>(null);
  const [formulaLabOpen, setFormulaLabOpen] = useState(false);
  const [storedRunId, setStoredRunId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimer = useRef<number | null>(null);

  const analysis = useMemo(() => analyzeWorkbenchDocument(workbenchDocument), [workbenchDocument]);
  const suggestedName = useMemo(() => nextMatrixName(workbenchDocument.objects), [workbenchDocument.objects]);
  const modalOpen = editor.open || template !== null || formulaLabOpen;

  const showToast = useCallback((message: string, type: 'info' | 'error' = 'info'): void => {
    setToast({ message, type, id: Date.now() });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.title = 'Axiom · Computational Workbench';
  }, [theme]);

  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    if (replay.status !== 'playing' || !run) return undefined;
    const delay = replay.detail === 'micro'
      ? Math.max(140, (microframe?.durationHintMs ?? 520) / replay.speed)
      : 780 / replay.speed;
    const timer = window.setTimeout(() => store.advance(), delay);
    return () => window.clearTimeout(timer);
  }, [replay.status, replay.detail, replay.speed, replay.stepIndex, replay.microIndex, run, microframe, store]);

  const openReplay = (tab: DockTab = 'replay'): void => {
    setDockTab(tab);
    setDockOpen(true);
  };

  const handleRun = useCallback((): void => {
    const result = store.run({ autoPlay: !prefersReducedMotion() });
    if (result.ok) {
      openReplay('replay');
      if (result.run) showToast(`RUN ${result.run.id} · ${result.run.steps.length} steps · derived trace`);
    } else {
      openReplay('problems');
      showToast(result.error ?? 'Run failed.', 'error');
    }
  }, [store, showToast]);

  const handleSelectCell = (panelKey: string, row: number, col: number): void => {
    store.select({ kind: 'cell', stepIndex: replay.stepIndex, panelKey, row, col });
  };
  const handleSelectPanel = (panelKey: string): void => {
    store.select({ kind: 'panel', stepIndex: replay.stepIndex, panelKey });
  };
  const handleSelectSceneNode = (nodeId: string): void => {
    store.select({ kind: 'scene-node', stepIndex: replay.stepIndex, space: view === 'flat' ? 'flat' : 'layered', nodeId });
  };

  const openNewMatrix = (): void => setEditor({ open: true, matrix: null });
  const openEditMatrix = (matrix: StoredMatrix): void => setEditor({ open: true, matrix });

  const handleSaveMatrix = (draft: MatrixDraft): void => {
    const editing = editor.matrix;
    if (editing) {
      const updated = draftToStored(draft, editing);
      const nextObjects = workbenchDocument.objects.map((matrix) => matrix.id === editing.id ? updated : matrix);
      const nextExpression = editing.name !== draft.name
        ? replaceIdentifier(workbenchDocument.expression, editing.name, draft.name)
        : workbenchDocument.expression;
      store.replaceDocument(nextObjects, nextExpression);
      showToast(`Matrix ${updated.name} updated; current run is now stale.`);
    } else {
      const created = draftToStored(draft);
      store.replaceDocument([...workbenchDocument.objects, created], workbenchDocument.expression);
      showToast(`Matrix ${created.name} added to this in-memory session.`);
    }
    setEditor({ open: false, matrix: null });
  };

  const handleDeleteMatrix = (matrix: StoredMatrix): void => {
    if (workbenchDocument.objects.length <= 1) {
      showToast('At least one matrix object must remain.', 'error');
      return;
    }
    if (!window.confirm(`Delete matrix ${matrix.name}? Expressions using it will become invalid.`)) return;
    const remaining = workbenchDocument.objects.filter((candidate) => candidate.id !== matrix.id);
    let nextExpression = workbenchDocument.expression;
    const used = new RegExp(`(?<![A-Za-z0-9_])${matrix.name}(?![A-Za-z0-9_])`);
    if (used.test(nextExpression) || !analyzeObjectsExpression(remaining, nextExpression).ok) {
      nextExpression = remaining[0]?.name ?? nextExpression;
    }
    store.replaceDocument(remaining, nextExpression);
    setEditor({ open: false, matrix: null });
    showToast(`Matrix ${matrix.name} removed; run the document again.`);
  };

  const handleInsertMatrix = (name: string): void => {
    const current = workbenchDocument.expression.trimEnd();
    const next = !current
      ? name
      : /[+\-*/^⊙⊗(]$/.test(current)
        ? `${current} ${name}`
        : `${current} + ${name}`;
    store.setExpression(next);
  };

  const handleLaunchTemplate = (expression: string, activeTemplate: FormulaTemplate): void => {
    setTemplate(null);
    const result = store.run({
      expression,
      autoPlay: !prefersReducedMotion(),
      storyOptions: {
        template: {
          title: activeTemplate.title,
          eyebrow: 'FORMULA ASSET',
          description: activeTemplate.subtitle,
        },
      },
    });
    if (result.ok) {
      openReplay('replay');
      showToast(`Loaded ${activeTemplate.title} as RUN ${result.run?.id}.`);
    } else {
      openReplay('problems');
      showToast(result.error ?? 'Template run failed.', 'error');
    }
  };

  const handleOpenAlgorithm = (definition: DebugFunctionDefinition): void => {
    setConsoleFunctionId(definition.id);
    setDockTab('console');
    setDockOpen(true);
  };

  const handleOpenConsole = (): void => {
    setDockTab('console');
    setDockOpen(true);
  };

  const handleOpenStory = (story: Story): void => {
    store.loadStoryRun(story, {
      kind: 'function',
      autoPlay: !prefersReducedMotion(),
      storyOptions: {
        template: {
          title: story.title,
          eyebrow: 'FUNCTION RUN',
          description: story.description,
        },
      },
    });
    openReplay('replay');
    showToast('Function trace opened as a function run.');
  };

  const handleStoreResult = (): void => {
    const result = run?.resultValue;
    if (!result || result.kind !== 'matrix') {
      showToast('This run ends in a scalar; there is no matrix to store.', 'error');
      return;
    }
    const name = nextMatrixName(workbenchDocument.objects);
    const stored = withShape({
      id: `result-${Date.now()}`,
      name,
      rows: result.matrix.rows,
      cols: result.matrix.cols,
      data: result.matrix.data.map((row) => row.map((value) => value.clone())),
      note: `Result of ${run.id} · ${run.summary.expression}`,
    });
    store.replaceDocument([...workbenchDocument.objects, stored], workbenchDocument.expression);
    setStoredRunId(run.id);
    showToast(`Stored result as matrix ${name}. Current run is now stale.`);
  };

  const handleRunAgain = (): void => {
    store.setExpression(workbenchDocument.expression);
    handleRun();
  };

  const toggleResource = (mode: ResourceMode): void => {
    if (mode === resourceMode && resourceOpen) {
      setResourceOpen(false);
      return;
    }
    setResourceMode(mode);
    setResourceOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.closest('input, textarea, select, button, [contenteditable="true"]'));
      if (event.key === 'F5') {
        event.preventDefault();
        if (!modalOpen) handleRun();
        return;
      }
      if (modalOpen) return;
      if (typing) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (run) {
          store.togglePlay();
          if (replay.status === 'ended') openReplay('replay');
        }
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        if (event.shiftKey) {
          if (direction < 0) store.previousStep(); else store.nextStep();
        } else if (replay.detail === 'micro') {
          if (direction < 0) store.previousMicroframe(); else store.nextMicroframe();
        } else {
          if (direction < 0) store.previousStep(); else store.nextStep();
        }
        return;
      }
      if (event.key === 'Home' && run) {
        event.preventDefault();
        store.seekStep(0);
      }
      if (event.key === 'End' && run) {
        event.preventDefault();
        store.seekStep(run.steps.length - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRun, modalOpen, replay.detail, replay.status, run, store]);

  const resourceCounts = {
    objects: workbenchDocument.objects.length,
    formulas: TEMPLATES.length,
    algorithms: DEBUG_FUNCTIONS.length,
    runs: runs.length,
  };

  return (
    <div className={`ax-app ax-platform-${window.desktop?.platform || 'web'}`}>
      <CommandBar
        run={run}
        stale={stale}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
        onRun={handleRun}
        onOpenRuns={() => {
          setResourceMode('runs');
          setResourceOpen(true);
        }}
      />

      <div className="ax-workspace">
        <ActivityRail
          mode={resourceMode}
          resourceOpen={resourceOpen}
          counts={resourceCounts}
          onSelect={toggleResource}
          onToggleResource={() => setResourceOpen((open) => !open)}
        />

        <div className={`ax-workspace-main ${resourceOpen ? '' : 'resource-closed'} ${dockOpen ? '' : 'dock-closed'}`}>
          <ResourceDock
            mode={resourceMode}
            objects={workbenchDocument.objects}
            formulas={TEMPLATES}
            algorithms={DEBUG_FUNCTIONS}
            runs={runs}
            activeRunId={activeRunId}
            onCreateMatrix={openNewMatrix}
            onEditMatrix={openEditMatrix}
            onInsertMatrix={handleInsertMatrix}
            onOpenFormula={(nextTemplate) => setTemplate(nextTemplate)}
            onOpenFormulaLab={() => setFormulaLabOpen(true)}
            onOpenAlgorithm={handleOpenAlgorithm}
            onOpenConsole={handleOpenConsole}
            onOpenRun={(runId) => {
              store.openRun(runId);
              openReplay('replay');
            }}
          />

          <main className="ax-center">
            <ExpressionStrip
              expression={workbenchDocument.expression}
              analysis={analysis}
              revision={workbenchDocument.revision}
              onChange={(value) => store.setExpression(value)}
              onRun={handleRun}
            />

            <section className="ax-view">
              <div className="ax-viewbar">
                <div className="ax-viewtabs" role="tablist" aria-label="View">
                  {(['stage', 'flat', 'layers'] as const).map((entry) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={view === entry}
                      key={entry}
                      className={`ax-viewtab ${view === entry ? 'active' : ''}`}
                      onClick={() => setView(entry)}
                    >
                      {entry === 'stage' ? 'STAGE' : entry === 'flat' ? 'FLAT' : 'LAYERS'}
                    </button>
                  ))}
                </div>
                <div className="ax-viewtools">
                  <span className="ax-chip">{run ? `RUN ${run.id.replace('run-', '')}` : 'NO RUN'}</span>
                  {stale && <span className="ax-chip hatch">STALE</span>}
                  <span className="ax-chip sky">DERIVED</span>
                  <button type="button" className="ax-icon-button" onClick={() => setView('stage')} title="Reset to stage" aria-label="Reset to stage">
                    <Icon name="compass" size={13} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              <div className="ax-view-body">
                {view === 'stage' && (
                  <StageView
                    run={run}
                    step={step}
                    frame={frame}
                    microframe={microframe}
                    stepIndex={replay.stepIndex}
                    totalSteps={run?.steps.length ?? 0}
                    selection={selection}
                    detail={replay.detail}
                    stale={stale}
                    expression={workbenchDocument.expression}
                    onRun={handleRun}
                    onSelectCell={handleSelectCell}
                    onSelectPanel={handleSelectPanel}
                  />
                )}
                {view === 'flat' && <FlatView scene={scene} selection={selection} onSelectNode={handleSelectSceneNode} />}
                {view === 'layers' && <LayersView scene={scene} selection={selection} onSelectNode={handleSelectSceneNode} />}
              </div>

              <div className="ax-transport">
                <button type="button" className="ax-control" onClick={() => run && store.seekStep(0)} disabled={!run?.steps.length} title="Start" aria-label="Start">
                  <Icon name="rewind" size={12} strokeWidth={1.5} />
                </button>
                <button type="button" className="ax-control" onClick={() => store.previousStep()} disabled={!run?.steps.length} title="Previous step" aria-label="Previous step">
                  <Icon name="stepBack" size={12} strokeWidth={1.5} />
                </button>
                <button type="button" className="ax-control primary" onClick={() => run && store.togglePlay()} disabled={!run?.steps.length} title="Play/Pause" aria-label="Play/Pause">
                  <Icon name={replay.status === 'playing' ? 'pause' : 'play'} size={11} />
                </button>
                <button type="button" className="ax-control" onClick={() => store.nextStep()} disabled={!run?.steps.length} title="Next step" aria-label="Next step">
                  <Icon name="stepForward" size={12} strokeWidth={1.5} />
                </button>
                <button type="button" className="ax-control" onClick={() => run && store.seekStep(run.steps.length - 1)} disabled={!run?.steps.length} title="End" aria-label="End">
                  <Icon name="fastForward" size={12} strokeWidth={1.5} />
                </button>
                <span className="ax-vsep" />
                <span className="ax-transport-label">
                  {run ? <>STEP <strong>{String(replay.stepIndex + 1).padStart(2, '0')}/{String(run.steps.length).padStart(2, '0')}</strong></> : 'NO RUN'}
                </span>
                <span className="ax-transport-spacer" />
                <div className="ax-segmented">
                  <button type="button" className={replay.detail === 'step' ? 'active' : ''} onClick={() => store.setDetail('step')}>STEP</button>
                  <button type="button" className={replay.detail === 'micro' ? 'active' : ''} onClick={() => store.setDetail('micro')}>MICRO</button>
                </div>
                <select className="ax-speed" value={replay.speed} onChange={(event) => store.setSpeed(Number(event.target.value))} aria-label="Speed">
                  {[0.25, 0.5, 1, 2, 4].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
                </select>
              </div>
            </section>
          </main>

          <Inspector
            run={run}
            step={step}
            frame={frame}
            microframe={microframe}
            selection={selection}
            scene={scene}
            stale={stale}
            detail={replay.detail}
            storeDisabled={storedRunId === run?.id}
            onSelectMicroframe={(index) => {
              store.seekMicro(index);
              openReplay('replay');
            }}
            onStoreResult={handleStoreResult}
            onRunAgain={handleRunAgain}
          />

          <ReplayDock
            open={dockOpen}
            activeTab={dockTab}
            onTab={(tab) => { setDockTab(tab); setDockOpen(true); }}
            onToggleOpen={() => setDockOpen((open) => !open)}
            run={run}
            replay={replay}
            problems={problems}
            matrices={workbenchDocument.objects}
            consoleFunctionId={consoleFunctionId}
            onSelectFunction={setConsoleFunctionId}
            onOpenStory={handleOpenStory}
            onSeekStep={(index) => store.seekStep(index)}
            onSeekMicro={(index) => store.seekMicro(index)}
            onPlayPause={() => run && store.togglePlay()}
            onPrevStep={() => store.previousStep()}
            onNextStep={() => store.nextStep()}
            onSetDetail={(detail) => store.setDetail(detail)}
            onSetSpeed={(speed) => store.setSpeed(speed)}
            onToggleLoop={() => store.setLoop(!replay.loop)}
          />
        </div>
      </div>

      <StatusBar
        run={run}
        step={step}
        stepIndex={replay.stepIndex}
        totalSteps={run?.steps.length ?? 0}
        selection={selection}
        stale={stale}
        theme={theme}
        detail={replay.detail}
      />

      <MatrixEditorModal
        open={editor.open}
        initial={editor.matrix}
        suggestedName={suggestedName}
        existingNames={workbenchDocument.objects.map((matrix) => matrix.name)}
        onClose={() => setEditor({ open: false, matrix: null })}
        onSave={handleSaveMatrix}
        onDelete={handleDeleteMatrix}
      />

      <TemplateDialog
        template={template}
        matrices={workbenchDocument.objects}
        onClose={() => setTemplate(null)}
        onLaunch={handleLaunchTemplate}
      />

      {formulaLabOpen && (
        <Suspense fallback={<div className="ax-formula-loading">LOADING STRUCTURE LAB…</div>}>
          <FormulaLabModal
            open
            matrices={workbenchDocument.objects}
            onClose={() => setFormulaLabOpen(false)}
            onOpenInStage={(expression) => {
              setFormulaLabOpen(false);
              const result = store.run({ expression, autoPlay: !prefersReducedMotion() });
              if (result.ok) {
                openReplay('replay');
                showToast(`Structure expression loaded: ${expression}`);
              } else {
                openReplay('problems');
                showToast(result.error ?? 'Structure run failed.', 'error');
              }
            }}
          />
        </Suspense>
      )}

      {toast && (
        <div className={`ax-toast ${toast.type}`}>
          <span className="ax-toast-mark">{toast.type === 'error' ? '!' : '✓'}</span>
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification"><Icon name="close" size={11} /></button>
        </div>
      )}
    </div>
  );
}
