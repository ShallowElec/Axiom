import { describe, expect, it } from 'vitest';
import { libraryFrom } from '../content/library.js';
import { concatBlocks, matrixFromRows } from '../core/matrix.js';
import { buildStoryFromExpression } from '../presentation/stories.js';
import { createSeedDocument, WorkbenchStore } from './workbench-store.js';
import type { RunRecord, StoryRunner } from './types.js';

function makeStore(autoPlay = false): { store: WorkbenchStore; calls: { count: number } } {
  const calls = { count: 0 };
  const runner: StoryRunner = (expression, objects, options) => {
    calls.count += 1;
    return buildStoryFromExpression(expression, libraryFrom(objects), options ?? {});
  };
  return { store: new WorkbenchStore({ document: createSeedDocument() }, runner), calls };
}

describe('Axiom workbench runtime', () => {
  it('builds a derived run with groups, steps, frames and scenes', () => {
    const { store } = makeStore();
    const result = store.run({ autoPlay: false });
    expect(result.ok).toBe(true);
    const run = result.run as RunRecord;
    expect(run.provenance).toBe('derived');
    expect(run.kind).toBe('expression');
    expect(run.status).toBe('completed');
    expect(run.steps.length).toBeGreaterThan(1);
    expect(run.groups.length).toBeGreaterThan(0);
    expect(Object.keys(run.frames).length).toBe(run.steps.length);
    expect(run.scenes[run.steps[0]!.id]?.flat.space).toBe('flat');
    expect(run.scenes[run.steps[0]!.id]?.layered.space).toBe('layered');
    expect(run.scenes[run.steps[0]!.id]?.flat.schemaVersion).toBe(2);
    expect(run.scenes[run.steps[0]!.id]?.flat.sourceStepId).toBe(run.steps[0]!.id);
    const flat = run.scenes[run.steps[0]!.id]!.flat;
    expect(flat.groups?.[0]?.nodeIds.length).toBe(flat.nodes.length);
    expect(flat.a11y.tables?.length).toBeGreaterThan(0);
    expect(run.scenes[run.steps[0]!.id]?.flat.nodes.every((node) => node.sourceStepId === run.steps[0]!.id)).toBe(true);
    for (const step of run.steps) {
      expect(step.microframeIds.length).toBeGreaterThan(0);
      expect(run.frames[step.id]?.panels.length).toBeGreaterThan(0);
      expect(run.microframes[step.id]?.length).toBeGreaterThan(0);
    }
    expect(store.getSnapshot().replay.stepIndex).toBe(run.steps.length - 1);
    expect(store.getSnapshot().replay.status).toBe('ended');
  });

  it('does not call the engine while seeking or switching replay granularity', () => {
    const { store, calls } = makeStore();
    const result = store.run({ autoPlay: false });
    const run = result.run as RunRecord;
    const before = calls.count;
    store.seekStep(2);
    store.seekMicro(0);
    store.setDetail('micro');
    store.previousMicroframe();
    store.openRun(run.id);
    store.togglePlay();
    store.pause();
    expect(calls.count).toBe(before);
    expect(store.getSnapshot().replay.status).toBe('paused');
  });

  it('keeps runs immutable and marks active replay stale after document edits', () => {
    const { store } = makeStore();
    const result = store.run({ autoPlay: false });
    const oldRun = result.run as RunRecord;
    const stepsBefore = oldRun.steps.length;
    store.setExpression('A + B');
    expect(store.stale()).toBe(true);
    expect(oldRun.steps.length).toBe(stepsBefore);
    expect(store.getSnapshot().document.expression).toBe('A + B');
    const next = store.run({ autoPlay: false });
    expect(next.ok).toBe(true);
    expect(store.getSnapshot().runs).toHaveLength(2);
    expect(store.getSnapshot().activeRunId).not.toBe(oldRun.id);
    expect(store.getSnapshot().runs[0]?.id).toBe(oldRun.id);
    expect(store.stale()).toBe(false);
  });

  it('creates a failed run and problem instead of throwing', () => {
    const { store } = makeStore();
    const result = store.run({ expression: 'A + M', autoPlay: false });
    expect(result.ok).toBe(false);
    const state = store.getSnapshot();
    expect(state.runs.at(-1)?.status).toBe('failed');
    expect(state.runs.at(-1)?.steps).toHaveLength(0);
    expect(state.problems[0]?.severity).toBe('error');
    expect(state.replay.status).toBe('idle');
  });

  it('opens a completed run at its end and can play from the beginning', () => {
    const { store } = makeStore();
    const result = store.run({ autoPlay: false });
    const run = result.run as RunRecord;
    store.seekStep(0);
    store.openRun(run.id);
    const opened = store.getSnapshot().replay;
    expect(opened.stepIndex).toBe(run.steps.length - 1);
    expect(opened.status).toBe('ended');
    store.togglePlay();
    const replaying = store.getSnapshot().replay;
    expect(replaying.stepIndex).toBe(0);
    expect(replaying.status).toBe('playing');
  });

  it('runs a block composition through the same runtime and adds its matrix to the session', () => {
    const { store } = makeStore();
    const A = matrixFromRows([[1, 2], [3, 4]], 'A');
    const B = matrixFromRows([[5], [6]], 'B');
    const built = concatBlocks([[A, B]]);
    const run = store.runBlock({ name: 'K', grid: [[A, B]], built, rows: 1, cols: 2 }, { autoPlay: false });
    expect(run.kind).toBe('expression');
    expect(run.steps.length).toBeGreaterThan(0);
    expect(store.getSnapshot().document.expression).toBe('K');
    expect(store.getSnapshot().document.objects.some((matrix) => matrix.name === 'K')).toBe(true);
    expect(store.stale()).toBe(false);
  });

  it('auto-plays a new run by default and can loop', () => {
    const { store } = makeStore();
    store.run({ autoPlay: true });
    expect(store.getSnapshot().replay.status).toBe('playing');
    const run = store.activeRun!;
    for (let i = 0; i < run.steps.length + 1; i += 1) store.advance();
    expect(store.getSnapshot().replay.status).toBe('ended');
    store.setLoop(true);
    store.togglePlay();
    for (let i = 0; i < run.steps.length + 1; i += 1) store.advance();
    expect(store.getSnapshot().replay.status).toBe('playing');
  });
});
