import { formatNumber } from '../core/rational.js';
import type { Matrix } from '../core/matrix.js';
import { flattenBeats } from '../presentation/stories.js';
import type { FlatBeat, Story, StoryPanel } from '../presentation/storyTypes.js';
import { buildStoryScene } from '../scene/builders.js';
import type { ExecutionStep, Microframe, RunRecord, StageCell, StageLens, StagePanel, ValueSnapshot } from './types.js';

function cellText(panel: StoryPanel, row: number, col: number): StageCell {
  const override = panel.cells[`${row},${col}`];
  return {
    text: override?.text ?? formatNumber(panel.matrix.data[row]?.[col] ?? 0),
    tone: override?.tone ?? 'neutral',
    hidden: Boolean(override?.hidden),
  };
}

function stagePanel(panel: StoryPanel, stepId: string, index: number, values: Record<string, ValueSnapshot>): StagePanel {
  const valueId = `${stepId}:value:${index}`;
  values[valueId] = {
    id: valueId,
    label: panel.label,
    kind: 'matrix',
    shape: { rows: panel.matrix.rows, cols: panel.matrix.cols },
    dtype: 'Q',
    preview: panel.caption || panel.shape,
    matrix: panel.matrix,
  };
  return {
    key: panel.key,
    label: panel.label,
    role: panel.role,
    caption: panel.caption,
    shape: panel.shape,
    rows: panel.matrix.rows,
    cols: panel.matrix.cols,
    cells: Array.from({ length: panel.matrix.rows }, (_, row) =>
      Array.from({ length: panel.matrix.cols }, (_, col) => cellText(panel, row, col)),
    ),
    rowFocus: [...panel.rowFocus],
    colFocus: [...panel.colFocus],
    valueId,
  };
}

function stageLens(beat: FlatBeat): StageLens {
  return {
    kicker: beat.lens.kicker,
    heading: beat.lens.heading,
    equation: beat.lens.equation,
    terms: beat.lens.terms.map((term) => ({ ...term })),
    accumulator: beat.lens.accumulator ? { ...beat.lens.accumulator } : null,
    note: beat.lens.note,
    rule: beat.lens.rule,
  };
}

function microframesForStep(beat: FlatBeat, stepId: string): Microframe[] {
  const micro: Microframe[] = [
    {
      id: `${stepId}:micro:0`,
      stepId,
      index: 0,
      kind: 'source',
      label: '定位来源',
      detail: beat.lens.heading || beat.title,
      equation: beat.lens.equation,
      durationHintMs: 420,
    },
  ];
  for (const [index, term] of beat.lens.terms.entries()) {
    micro.push({
      id: `${stepId}:micro:${micro.length}`,
      stepId,
      index: micro.length,
      kind: term.state === 'done' ? 'accumulate' : 'multiply',
      label: term.label,
      detail: term.state === 'done' ? '已经完成的项' : '当前参与计算的项',
      equation: `${term.expr} = ${term.value}`,
      value: term.value,
      durationHintMs: 500 + index * 20,
    });
  }
  if (beat.lens.accumulator) {
    micro.push({
      id: `${stepId}:micro:${micro.length}`,
      stepId,
      index: micro.length,
      kind: 'accumulate',
      label: beat.lens.accumulator.label,
      detail: '当前累计值',
      value: beat.lens.accumulator.value,
      durationHintMs: 520,
    });
  }
  if (beat.readout) {
    micro.push({
      id: `${stepId}:micro:${micro.length}`,
      stepId,
      index: micro.length,
      kind: 'write',
      label: '写入结果',
      detail: beat.readout.note,
      equation: beat.readout.label,
      value: beat.readout.value,
      durationHintMs: 640,
    });
  }
  if (micro.length === 1) {
    micro.push({
      id: `${stepId}:micro:1`,
      stepId,
      index: 1,
      kind: 'write',
      label: '完成这一步',
      detail: beat.narration,
      equation: beat.lens.equation,
      durationHintMs: 500,
    });
  }
  return micro;
}

function resultValueSnapshot(story: Story): ValueSnapshot {
  const result = story.resultValue;
  if (result.kind === 'scalar') {
    return {
      id: 'run:result',
      label: result.label,
      kind: 'scalar',
      dtype: 'Q',
      preview: formatNumber(result.value),
      scalar: formatNumber(result.value),
    };
  }
  return {
    id: 'run:result',
    label: result.label,
    kind: 'matrix',
    shape: { rows: result.matrix.rows, cols: result.matrix.cols },
    dtype: 'Q',
    preview: result.expr ?? result.label,
    matrix: result.matrix,
  };
}

export function buildRunFromStory(story: Story, options: import('./types.js').BuildRunOptions): RunRecord {
  const runId = options.runId;
  const beats = flattenBeats(story);
  const values: Record<string, ValueSnapshot> = {};
  const frames: RunRecord['frames'] = {};
  const scenes: RunRecord['scenes'] = {};
  const microframes: Record<string, Microframe[]> = {};
  const groups = story.chapters.map((chapter, chapterIndex) => ({
    id: `${runId}:group:${chapterIndex}`,
    label: chapter.title,
    kind: 'chapter' as const,
    stepIds: beats.filter((beat) => beat.chapterIndex === chapterIndex).map((beat) => `${runId}:step:${beat.index}`),
  }));
  const steps: ExecutionStep[] = beats.map((beat) => {
    const stepId = `${runId}:step:${beat.index}`;
    const panels = beat.panels.map((panel, index) => stagePanel(panel, stepId, index, values));
    const micro = microframesForStep(beat, stepId);
    microframes[stepId] = micro;
    frames[stepId] = {
      stepId,
      panels,
      connectors: [...beat.connectors],
      lens: stageLens(beat),
      readout: beat.readout ? { ...beat.readout } : null,
      isFinale: beat.isFinale,
    };
    const flatScene = buildStoryScene(story, beat, 'flat');
    const layeredScene = buildStoryScene(story, beat, 'layered');
    const valueByLabel = new Map(panels.map((panel) => [panel.label, panel.valueId]));
    for (const scene of [flatScene, layeredScene]) {
      scene.sourceStepId = stepId;
      for (const node of scene.nodes) {
        node.sourceStepId = stepId;
        const valueId = valueByLabel.get(node.label);
        if (valueId) node.sourceValueIds = [valueId];
      }
    }
    scenes[stepId] = { flat: flatScene, layered: layeredScene };
    const inputs = panels.filter((panel) => panel.role === 'input' || panel.role === 'workspace').map((panel) => panel.valueId);
    const outputs = panels.filter((panel) => panel.role === 'result').map((panel) => panel.valueId);
    return {
      id: stepId,
      index: beat.index,
      groupId: `${runId}:group:${beat.chapterIndex}`,
      phase: 'forward',
      nodeId: `${runId}:node:${beat.index}`,
      op: (story.meta.rootType === 'identity' ? 'identity' : story.meta.rootType) as ExecutionStep['op'],
      title: beat.title,
      detail: beat.lens.equation || beat.narration,
      status: 'ok',
      provenance: 'derived',
      inputs: inputs.length ? inputs : panels.slice(0, 1).map((panel) => panel.valueId),
      outputs: outputs.length ? outputs : panels.slice(-1).map((panel) => panel.valueId),
      microframeIds: micro.map((frame) => frame.id),
    };
  });
  values['run:result'] = resultValueSnapshot(story);
  return {
    schemaVersion: 1,
    id: runId,
    kind: options.kind,
    status: 'completed',
    provenance: 'derived',
    presentationProvenance: 'derived',
    documentRevision: options.documentRevision,
    expression: story.inputExpression,
    createdAtIso: new Date(options.startedAt).toISOString(),
    completedAtIso: new Date(options.completedAt).toISOString(),
    durationMs: Math.max(1, options.completedAt - options.startedAt),
    engine: { id: 'exact-q', version: 1, backend: 'ts' },
    summary: {
      title: options.storyOptions?.template?.title ?? story.title,
      expression: story.expression,
      inputExpression: story.inputExpression,
      description: options.storyOptions?.template?.description ?? story.description,
      eyebrow: options.storyOptions?.template?.eyebrow ?? story.eyebrow,
      shapeChain: story.meta.shapeChain,
      rule: story.meta.rule,
      meaning: story.meta.meaning,
      operationCount: story.meta.operationCount,
    },
    groups,
    steps,
    values,
    frames,
    microframes,
    scenes,
    resultValue: story.resultValue,
    lineage: options.lineage,
  };
}

export function createFailedRun(
  runId: string,
  expression: string,
  documentRevision: number,
  error: unknown,
  startedAt: number,
): RunRecord {
  const message = error instanceof Error ? error.message : String(error);
  const now = performance.now();
  return {
    schemaVersion: 1,
    id: runId,
    kind: 'expression',
    status: 'failed',
    provenance: 'derived',
    presentationProvenance: 'derived',
    documentRevision,
    expression,
    createdAtIso: new Date(startedAt).toISOString(),
    completedAtIso: new Date(now).toISOString(),
    durationMs: Math.max(1, now - startedAt),
    engine: { id: 'exact-q', version: 1, backend: 'ts' },
    summary: {
      title: '运行失败',
      expression,
      inputExpression: expression,
      description: '这次表达式没有产生可重播的执行记录。',
      eyebrow: 'RUN ERROR',
      shapeChain: '—',
      rule: '检查表达式与矩阵形状',
      meaning: '没有可用的数学结果。',
      operationCount: 0,
    },
    groups: [],
    steps: [],
    values: {},
    frames: {},
    microframes: {},
    scenes: {},
    error: { code: 'RUN_FAILED', message },
  };
}

export function matrixPreviewRows(matrix: Matrix): string[][] {
  return matrix.data.map((row) => row.map((value) => formatNumber(value)));
}
