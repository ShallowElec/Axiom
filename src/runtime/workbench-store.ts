import { libraryFrom, seedObjects } from '../content/library.js';
import { buildBlockStory, buildStoryFromExpression } from '../presentation/stories.js';
import type { Story } from '../presentation/storyTypes.js';
import type { BlockBuildPayload } from '../workspace/types.js';
import { analyzeObjectsExpression } from './document.js';
import { buildRunFromStory, createFailedRun } from './derived.js';
import { buildNativeTrace } from './native.js';
import type {
  ExecutionStep,
  Microframe,
  Problem,
  ReplayState,
  RunOptions,
  RunRecord,
  Selection,
  StageFrame,
  StoryRunner,
  WorkbenchDocument,
  WorkbenchState,
} from './types.js';

export interface WorkbenchInit {
  document: WorkbenchDocument;
  runs?: RunRecord[];
  activeRunId?: string | null;
  replay?: ReplayState;
  nextRunNumber?: number;
}

export function createSeedDocument(): WorkbenchDocument {
  const objects = seedObjects().map((object) => ({
    ...object,
    shape: `${object.rows}×${object.cols}`,
  }));
  return { revision: 1, objects, expression: 'A × B' };
}

const initialReplay = (): ReplayState => ({
  runId: null,
  stepIndex: 0,
  microIndex: 0,
  status: 'idle',
  speed: 1,
  detail: 'step',
  loop: false,
});

export class WorkbenchStore {
  private state: WorkbenchState;
  private listeners = new Set<() => void>();
  private readonly runner: StoryRunner;

  constructor(init: WorkbenchInit = { document: createSeedDocument() }, runner?: StoryRunner) {
    this.state = {
      document: init.document,
      runs: init.runs ?? [],
      activeRunId: init.activeRunId ?? null,
      replay: init.replay ?? initialReplay(),
      selection: null,
      problems: [],
      nextRunNumber: init.nextRunNumber ?? 1,
    };
    this.runner = runner ?? ((expression, objects, options) =>
      buildStoryFromExpression(expression, libraryFrom(objects), options ?? {}));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): WorkbenchState => this.state;

  private set(patch: Partial<WorkbenchState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private setReplay(patch: Partial<ReplayState>): void {
    this.set({ replay: { ...this.state.replay, ...patch } });
  }

  setExpression(expression: string): void {
    if (expression === this.state.document.expression) return;
    this.set({
      document: {
        ...this.state.document,
        expression,
        revision: this.state.document.revision + 1,
      },
      selection: null,
      problems: [],
    });
    if (this.state.replay.status === 'playing') this.setReplay({ status: 'paused' });
  }

  replaceDocument(objects: WorkbenchDocument['objects'], expression = this.state.document.expression): void {
    this.set({
      document: { ...this.state.document, objects, expression, revision: this.state.document.revision + 1 },
      selection: null,
      problems: [],
    });
    if (this.state.replay.status === 'playing') this.setReplay({ status: 'paused' });
  }

  openRun(runId: string): void {
    const run = this.state.runs.find((candidate) => candidate.id === runId);
    if (!run) return;
    const lastIndex = Math.max(0, run.steps.length - 1);
    this.set({
      activeRunId: runId,
      selection: null,
      replay: {
        ...this.state.replay,
        runId,
        stepIndex: lastIndex,
        microIndex: 0,
        status: run.steps.length ? 'ended' : 'idle',
        detail: 'step',
      },
    });
  }

  seekStep(index: number): void {
    const run = this.activeRun;
    if (!run?.steps.length) return;
    const stepIndex = Math.max(0, Math.min(run.steps.length - 1, Math.trunc(index)));
    this.set({ selection: null });
    this.setReplay({ stepIndex, microIndex: 0, status: 'paused' });
  }

  seekMicro(index: number): void {
    const run = this.activeRun;
    if (!run?.steps.length) return;
    const frames = this.microframesForCurrentStep(run);
    const microIndex = Math.max(0, Math.min(frames.length - 1, Math.trunc(index)));
    this.setReplay({ microIndex, status: 'paused', detail: 'micro' });
  }

  nextStep(): void {
    const run = this.activeRun;
    if (!run?.steps.length) return;
    this.set({ selection: null });
    this.setReplay({ stepIndex: Math.min(run.steps.length - 1, this.state.replay.stepIndex + 1), microIndex: 0, status: 'paused' });
  }

  previousStep(): void {
    const run = this.activeRun;
    if (!run?.steps.length) return;
    this.set({ selection: null });
    this.setReplay({ stepIndex: Math.max(0, this.state.replay.stepIndex - 1), microIndex: 0, status: 'paused' });
  }

  nextMicroframe(): void {
    const run = this.activeRun;
    if (!run?.steps.length) return;
    const frames = this.microframesForCurrentStep(run);
    if (this.state.replay.microIndex < frames.length - 1) {
      this.setReplay({ microIndex: this.state.replay.microIndex + 1, status: 'paused', detail: 'micro' });
      return;
    }
    if (this.state.replay.stepIndex < run.steps.length - 1) {
      this.set({ selection: null });
      this.setReplay({
        stepIndex: this.state.replay.stepIndex + 1,
        microIndex: 0,
        status: 'paused',
        detail: 'micro',
      });
    }
  }

  previousMicroframe(): void {
    const run = this.activeRun;
    if (!run?.steps.length) return;
    if (this.state.replay.microIndex > 0) {
      this.setReplay({ microIndex: this.state.replay.microIndex - 1, status: 'paused', detail: 'micro' });
      return;
    }
    if (this.state.replay.stepIndex > 0) {
      const previousStep = this.state.replay.stepIndex - 1;
      const frames = run.microframes[run.steps[previousStep]!.id] ?? [];
      this.set({ selection: null });
      this.setReplay({
        stepIndex: previousStep,
        microIndex: Math.max(0, frames.length - 1),
        status: 'paused',
        detail: 'micro',
      });
    }
  }

  togglePlay(): void {
    const run = this.activeRun;
    if (!run?.steps.length) return;
    const replay = this.state.replay;
    if (replay.status === 'playing') {
      this.setReplay({ status: 'paused' });
      return;
    }
    if (replay.status === 'ended') {
      this.set({ selection: null });
      this.setReplay({ stepIndex: 0, microIndex: 0, status: 'playing' });
      return;
    }
    this.setReplay({ status: 'playing' });
  }

  pause(): void {
    if (this.state.replay.status === 'playing') this.setReplay({ status: 'paused' });
  }

  advance(): void {
    const run = this.activeRun;
    if (!run?.steps.length || this.state.replay.status !== 'playing') return;
    const { stepIndex, microIndex, detail, loop } = this.state.replay;
    if (detail === 'micro') {
      const frames = this.microframesForCurrentStep(run);
      if (microIndex < frames.length - 1) {
        this.setReplay({ microIndex: microIndex + 1 });
        return;
      }
    }
    if (stepIndex < run.steps.length - 1) {
      this.set({ selection: null });
      this.setReplay({ stepIndex: stepIndex + 1, microIndex: 0 });
      return;
    }
    if (loop) {
      this.set({ selection: null });
      this.setReplay({ stepIndex: 0, microIndex: 0, status: 'playing' });
      return;
    }
    this.setReplay({ status: 'ended' });
  }

  setDetail(detail: 'step' | 'micro'): void {
    this.setReplay({ detail, microIndex: 0, status: this.state.replay.status === 'playing' ? 'paused' : this.state.replay.status });
  }

  setSpeed(speed: number): void {
    this.setReplay({ speed: Math.max(0.25, Math.min(4, speed)) });
  }

  setLoop(loop: boolean): void {
    this.setReplay({ loop });
  }

  select(selection: Selection): void {
    this.set({ selection });
  }

  dismissProblems(): void {
    this.set({ problems: [] });
  }

  run(options: RunOptions = {}): { ok: boolean; run?: RunRecord; error?: string } {
    const expression = (options.expression ?? this.state.document.expression).trim();
    if (!expression) {
      const problem: Problem = {
        id: `problem-${Date.now()}`,
        severity: 'error',
        message: '表达式为空。',
        detail: '先写一个矩阵表达式，或从对象资源中插入一个对象。',
        code: 'EMPTY_EXPRESSION',
      };
      this.set({ problems: [problem] });
      return { ok: false, error: problem.message };
    }
    const nextDocument =
      expression === this.state.document.expression
        ? this.state.document
        : {
            ...this.state.document,
            expression,
            revision: this.state.document.revision + 1,
          };
    const analysis = analyzeObjectsExpression(nextDocument.objects, expression);
    if (!analysis.ok) {
      const runNumber = this.state.nextRunNumber;
      const runId = `run-${String(runNumber).padStart(3, '0')}`;
      const failed = createFailedRun(runId, expression, nextDocument.revision, new Error(analysis.error), performance.now());
      const problem: Problem = {
        id: `problem-${Date.now()}`,
        severity: 'error',
        message: analysis.error,
        detail: '当前表达式没有产生可运行的计划。',
        code: 'EXPRESSION_INVALID',
      };
      this.set({
        document: nextDocument,
        runs: [...this.state.runs, failed],
        activeRunId: failed.id,
        problems: [problem],
        selection: null,
        nextRunNumber: runNumber + 1,
        replay: { ...this.state.replay, runId: failed.id, stepIndex: 0, microIndex: 0, status: 'idle', detail: 'step' },
      });
      return { ok: false, error: analysis.error };
    }
    const runNumber = this.state.nextRunNumber;
    const runId = `run-${String(runNumber).padStart(3, '0')}`;
    const startedAt = performance.now();
    try {
      const story = this.runner(expression, nextDocument.objects, options.storyOptions);
      const completedAt = performance.now();
      let run = buildRunFromStory(story, {
        runId,
        documentRevision: nextDocument.revision,
        kind: options.kind ?? 'expression',
        startedAt,
        completedAt,
        storyOptions: options.storyOptions,
        lineage: options.lineage,
      });
      try {
        const library = Object.fromEntries(nextDocument.objects.map((matrix) => [matrix.name, matrix]));
        const native = buildNativeTrace({
          runId,
          expression,
          library,
          durationMs: Math.max(1, completedAt - startedAt),
        });
        if (native) {
          run = {
            ...run,
            provenance: 'native',
            presentationProvenance: 'derived',
            native,
          };
        }
      } catch {
        // Native trace failure must not hide a completed exact calculation.
      }
      const autoPlay = options.autoPlay !== false && run.steps.length > 0;
      const lastIndex = Math.max(0, run.steps.length - 1);
      this.set({
        document: nextDocument,
        runs: [...this.state.runs, run],
        activeRunId: run.id,
        selection: null,
        problems: [],
        nextRunNumber: runNumber + 1,
        replay: {
          ...this.state.replay,
          runId: run.id,
          stepIndex: autoPlay ? 0 : lastIndex,
          microIndex: 0,
          status: autoPlay ? 'playing' : run.steps.length ? 'ended' : 'idle',
          detail: 'step',
        },
      });
      return { ok: true, run };
    } catch (error) {
      const failed = createFailedRun(runId, expression, nextDocument.revision, error, startedAt);
      const problem: Problem = {
        id: `problem-${Date.now()}`,
        severity: 'error',
        message: failed.error?.message ?? '运行失败。',
        detail: '检查表达式、矩阵形状与对象定义。',
        code: failed.error?.code ?? 'RUN_FAILED',
      };
      this.set({
        document: nextDocument,
        runs: [...this.state.runs, failed],
        activeRunId: failed.id,
        selection: null,
        problems: [problem],
        nextRunNumber: runNumber + 1,
        replay: {
          ...this.state.replay,
          runId: failed.id,
          stepIndex: 0,
          microIndex: 0,
          status: 'idle',
          detail: 'step',
        },
      });
      return { ok: false, error: problem.message };
    }
  }

  runBlock(payload: BlockBuildPayload, options: { autoPlay?: boolean; storyOptions?: RunOptions['storyOptions'] } = {}): RunRecord {
    const sourceNames = payload.grid
      .flat()
      .filter((matrix): matrix is NonNullable<typeof matrix> => Boolean(matrix))
      .map((matrix) => matrix.name);
    const newMatrix = {
      ...payload.built.matrix,
      name: payload.name,
      id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      note: `Composed from ${[...new Set(sourceNames)].join('、')}`,
      shape: `${payload.built.matrix.rows}×${payload.built.matrix.cols}`,
    };
    const nextObjects = [...this.state.document.objects, newMatrix];
    const story = buildBlockStory({
      grid: payload.grid,
      built: { ...payload.built, matrix: newMatrix },
      resultName: payload.name,
      expression: `${payload.name} = block(${sourceNames.join(', ')})`,
    });
    this.set({
      document: {
        ...this.state.document,
        objects: nextObjects,
        expression: payload.name,
        revision: this.state.document.revision + 1,
      },
      selection: null,
      problems: [],
    });
    return this.loadStoryRun(story, {
      kind: 'expression',
      autoPlay: options.autoPlay,
      storyOptions: options.storyOptions,
    });
  }

  loadStoryRun(story: Story, options: { kind?: RunOptions['kind']; autoPlay?: boolean; storyOptions?: RunOptions['storyOptions'] } = {}): RunRecord {
    const runNumber = this.state.nextRunNumber;
    const runId = `run-${String(runNumber).padStart(3, '0')}`;
    const startedAt = performance.now();
    const run = buildRunFromStory(story, {
      runId,
      documentRevision: this.state.document.revision,
      kind: options.kind ?? 'function',
      startedAt,
      completedAt: performance.now(),
      storyOptions: options.storyOptions,
    });
    const autoPlay = options.autoPlay !== false;
    this.set({
      runs: [...this.state.runs, run],
      activeRunId: run.id,
      selection: null,
      problems: [],
      nextRunNumber: runNumber + 1,
      replay: {
        ...this.state.replay,
        runId: run.id,
        stepIndex: autoPlay ? 0 : Math.max(0, run.steps.length - 1),
        microIndex: 0,
        status: autoPlay ? 'playing' : 'ended',
        detail: 'step',
      },
    });
    return run;
  }

  get activeRun(): RunRecord | null {
    return this.state.runs.find((run) => run.id === this.state.activeRunId) ?? null;
  }

  currentStep(run = this.activeRun): ExecutionStep | null {
    return run?.steps[this.state.replay.stepIndex] ?? null;
  }

  currentFrame(run = this.activeRun): StageFrame | null {
    const step = this.currentStep(run);
    return step && run ? (run.frames[step.id] ?? null) : null;
  }

  microframesForCurrentStep(run = this.activeRun): Microframe[] {
    const step = this.currentStep(run);
    return step && run ? (run.microframes[step.id] ?? []) : [];
  }

  currentMicroframe(run = this.activeRun): Microframe | null {
    return this.microframesForCurrentStep(run)[this.state.replay.microIndex] ?? null;
  }

  stale(run = this.activeRun): boolean {
    return Boolean(run && run.documentRevision !== this.state.document.revision);
  }
}
