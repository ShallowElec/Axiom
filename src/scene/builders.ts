import { formatNumber } from '../core/rational.js';
import type { Matrix } from '../core/matrix.js';
import type { FlatBeat, Story, StoryPanel } from '../presentation/storyTypes.js';
import type {
  Scene,
  SceneCell,
  SceneEdge,
  SceneMatrixPreview,
  SceneNode,
  SceneRole,
  SceneSpace,
  SceneStatus,
} from './types.js';

function panelPreview(panel: StoryPanel): SceneMatrixPreview {
  const { matrix, cells } = panel;
  return {
    rows: matrix.rows,
    cols: matrix.cols,
    cells: Array.from({ length: matrix.rows }, (_, r) =>
      Array.from({ length: matrix.cols }, (_, c): SceneCell => {
        const override = cells[`${r},${c}`];
        return {
          text: override?.text ?? formatNumber(matrix.data[r]?.[c] ?? 0),
          tone: override?.tone ?? 'neutral',
          hidden: override?.hidden,
        };
      }),
    ),
  };
}

function matrixPreview(matrix: Matrix): SceneMatrixPreview {
  return {
    rows: matrix.rows,
    cols: matrix.cols,
    cells: Array.from({ length: matrix.rows }, (_, r) =>
      Array.from({ length: matrix.cols }, (_, c): SceneCell => ({
        text: formatNumber(matrix.data[r]?.[c] ?? 0),
        tone: 'result',
      })),
    ),
  };
}

function panelRole(panel: StoryPanel): SceneRole {
  if (panel.role === 'result') return 'result';
  if (panel.role === 'workspace') return 'intermediate';
  if (panel.role === 'auxiliary') return 'observation';
  return 'input';
}

function chapterStatus(chapterIndex: number, activeIndex: number): SceneStatus {
  if (chapterIndex < activeIndex) return 'past';
  if (chapterIndex === activeIndex) return 'active';
  return 'future';
}

function legendFor(space: SceneSpace): Scene['legend'] {
  if (space === 'layered') {
    return [
      { role: 'input', label: '输入层' },
      { role: 'operation', label: '计算层' },
      { role: 'intermediate', label: '中间量' },
      { role: 'result', label: '结果层' },
    ];
  }
  return [
    { role: 'input', label: '输入量' },
    { role: 'operation', label: '算子' },
    { role: 'result', label: '输出量' },
    { role: 'observation', label: '中间观察' },
  ];
}

/**
 * Build a layered scene from the current storyboard step.
 * Vertical stage is pipeline depth only; matrix dimensions stay in the plate.
 */
function buildLayered(story: Story, beat: FlatBeat): Scene {
  const nodes: SceneNode[] = [];
  const edges: SceneEdge[] = [];
  const sourcePanels = beat.panels.filter((panel) => panel.role === 'input' || panel.role === 'workspace');
  sourcePanels.forEach((panel, index) => {
    nodes.push({
      id: `input-${index}`,
      role: 'input',
      label: panel.label,
      detail: panel.caption || '当前步骤的输入',
      badge: `${panel.matrix.rows}×${panel.matrix.cols}`,
      stage: 0,
      lane: index,
      status: 'active',
      shape: { rows: panel.matrix.rows, cols: panel.matrix.cols },
      matrix: panelPreview(panel),
    });
  });
  if (!sourcePanels.length) {
    story.meta.sources.forEach((source, index) => {
      nodes.push({
        id: `input-${index}`,
        role: 'input',
        label: source.name,
        detail: '来源矩阵',
        badge: `${source.matrix.rows}×${source.matrix.cols}`,
        stage: 0,
        lane: index,
        status: 'past',
        shape: { rows: source.matrix.rows, cols: source.matrix.cols },
        matrix: matrixPreview(source.matrix),
      });
    });
  }

  story.chapters.forEach((chapter, index) => {
    const active = index === beat.chapterIndex;
    const status = chapterStatus(index, beat.chapterIndex);
    const node: SceneNode = {
      id: `chapter-${index}`,
      role: 'operation',
      label: chapter.title,
      detail: active ? beat.title : chapter.description,
      badge: active ? `第 ${beat.beatIndex + 1} / ${chapter.beats.length} 步` : `${chapter.beats.length} 步`,
      stage: index + 1,
      lane: 0,
      status,
      metrics: {
        幕: index + 1,
        步骤: chapter.beats.length,
      },
    };
    if (active) {
      const resultPanel = beat.panels.find((panel) => panel.role === 'result');
      if (resultPanel) {
        node.matrix = panelPreview(resultPanel);
        node.shape = { rows: resultPanel.matrix.rows, cols: resultPanel.matrix.cols };
      }
      node.detail = beat.lens.equation || beat.title;
    }
    nodes.push(node);
  });

  const result = story.resultValue;
  const resultNode: SceneNode = {
    id: 'result',
    role: 'result',
    label: result.label,
    detail: story.meta.shapeChain,
    badge: result.kind === 'scalar' ? formatNumber(result.value) : `${result.matrix.rows}×${result.matrix.cols}`,
    stage: story.chapters.length + 1,
    lane: 0,
    status: 'future',
    ...(result.kind === 'matrix'
      ? {
          shape: { rows: result.matrix.rows, cols: result.matrix.cols },
          matrix: matrixPreview(result.matrix),
        }
      : {}),
  };
  if (beat.isFinale) resultNode.status = 'done';
  nodes.push(resultNode);

  const firstLayerNodes = nodes.filter((node) => node.stage === 0);
  const firstChapter = nodes.find((node) => node.id === 'chapter-0');
  if (firstChapter) {
    for (const source of firstLayerNodes) {
      edges.push({ id: `${source.id}-${firstChapter.id}`, from: source.id, to: firstChapter.id, kind: 'data' });
    }
  }
  for (let i = 0; i < story.chapters.length - 1; i++) {
    edges.push({
      id: `chapter-${i}-chapter-${i + 1}`,
      from: `chapter-${i}`,
      to: `chapter-${i + 1}`,
      kind: 'data',
    });
  }
  const lastChapter = nodes.find((node) => node.id === `chapter-${story.chapters.length - 1}`);
  if (lastChapter) {
    edges.push({ id: 'last-result', from: lastChapter.id, to: 'result', kind: 'data' });
  }

  return {
    schemaVersion: 1,
    id: `scene-layered-${story.id}-${beat.id}`,
    space: 'layered',
    title: story.title,
    description: story.description,
    traceRef: story.id,
    nodes,
    edges,
    legend: legendFor('layered'),
    a11y: {
      altText: `矩阵流水线层叠视图：${story.expression}`,
      summary: `${story.chapters.length} 个计算层，当前第 ${beat.chapterIndex + 1} 层：${beat.title}`,
    },
  };
}

/**
 * Flatten the current step's panels into a synthesis bench. Values become
 * tiles/strands; operations become bridge nodes. This deliberately consumes the
 * same Storyboard as the 2D stage.
 */
function buildFlat(story: Story, beat: FlatBeat): Scene {
  const nodes: SceneNode[] = beat.panels.map((panel, index) => ({
    id: `panel-${index}`,
    role: panelRole(panel),
    label: panel.label,
    detail: panel.caption || beat.title,
    badge: `${panel.matrix.rows}×${panel.matrix.cols}`,
    stage: index,
    lane: 0,
    status: panel.role === 'result' ? 'active' : 'past',
    shape: { rows: panel.matrix.rows, cols: panel.matrix.cols },
    matrix: panelPreview(panel),
  }));

  const edges: SceneEdge[] = [];
  for (let index = 0; index < nodes.length - 1; index++) {
    edges.push({
      id: `flat-${index}`,
      from: nodes[index]!.id,
      to: nodes[index + 1]!.id,
      kind: 'data',
      label: beat.connectors[index] ?? '→',
    });
  }

  if (beat.readout) {
    nodes.push({
      id: 'readout',
      role: 'observation',
      label: beat.readout.label,
      detail: beat.readout.note,
      badge: beat.readout.value,
      stage: nodes.length,
      lane: 1,
      status: 'active',
      metrics: { 读数: beat.readout.value },
    });
  }

  return {
    schemaVersion: 1,
    id: `scene-flat-${story.id}-${beat.id}`,
    space: 'flat',
    title: beat.title,
    description: story.expression,
    traceRef: story.id,
    nodes,
    edges,
    legend: legendFor('flat'),
    a11y: {
      altText: `矩阵平铺合成视图：${beat.title}`,
      summary: nodes.map((node) => `${node.label} ${node.badge ?? ''}`).join(' → '),
    },
  };
}

export function buildStoryScene(story: Story, beat: FlatBeat, space: SceneSpace): Scene {
  return space === 'layered' ? buildLayered(story, beat) : buildFlat(story, beat);
}

export function buildDebugScene(
  title: string,
  traceRef: string,
  inputs: Array<{ label: string; matrix: Matrix }>,
  operations: string[],
  outputs: Array<{ label: string; matrix?: Matrix; text: string }>,
): Scene {
  const nodes: SceneNode[] = [
    ...inputs.map((input, index) => ({
      id: `debug-input-${index}`,
      role: 'input' as const,
      label: input.label,
      detail: '调试输入',
      badge: `${input.matrix.rows}×${input.matrix.cols}`,
      stage: 0,
      lane: index,
      status: 'past' as const,
      shape: { rows: input.matrix.rows, cols: input.matrix.cols },
      matrix: matrixPreview(input.matrix),
    })),
    ...operations.map((operation, index) => ({
      id: `debug-op-${index}`,
      role: 'operation' as const,
      label: operation,
      stage: index + 1,
      lane: 0,
      status: 'active' as const,
    })),
    ...outputs.map((output, index) => ({
      id: `debug-output-${index}`,
      role: 'result' as const,
      label: output.label,
      detail: '调试输出',
      badge: output.text,
      stage: operations.length + 1,
      lane: index,
      status: 'done' as const,
      ...(output.matrix
        ? {
            shape: { rows: output.matrix.rows, cols: output.matrix.cols },
            matrix: matrixPreview(output.matrix),
          }
        : {}),
    })),
  ];
  const edges: SceneEdge[] = [];
  const inputsIds = nodes.filter((node) => node.role === 'input').map((node) => node.id);
  const opIds = nodes.filter((node) => node.role === 'operation').map((node) => node.id);
  const outputIds = nodes.filter((node) => node.role === 'result').map((node) => node.id);
  if (opIds[0]) {
    inputsIds.forEach((id) => edges.push({ id: `${id}-${opIds[0]}`, from: id, to: opIds[0]!, kind: 'data' }));
  }
  opIds.slice(1).forEach((id, index) => {
    edges.push({ id: `debug-op-${index}`, from: opIds[index]!, to: id, kind: 'control' });
  });
  if (outputIds.length && opIds.length) {
    outputIds.forEach((id) => edges.push({ id: `${id}-output`, from: opIds[opIds.length - 1]!, to: id, kind: 'data' }));
  }
  return {
    schemaVersion: 1,
    id: `debug-scene-${traceRef}`,
    space: 'layered',
    title,
    description: '调试运行的抽象流水线',
    traceRef,
    nodes,
    edges,
    legend: legendFor('layered'),
    a11y: { altText: title, summary: operations.join(' → ') },
  };
}
