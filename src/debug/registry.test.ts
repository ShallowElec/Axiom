import { describe, expect, it } from 'vitest';
import { matrixFromRows } from '../core/matrix.js';
import { libraryFrom } from '../content/library.js';
import { DEBUG_FUNCTIONS, runDebugFunction } from './registry.js';
import { buildStoryFromExpression, flattenBeats } from '../presentation/stories.js';
import { buildStoryScene } from '../scene/builders.js';

const A = matrixFromRows([[2, 1], [-1, 3]], 'A');
const B = matrixFromRows([[4, 0], [2, 5]], 'B');
const M = matrixFromRows([[1, 2, 0], [0, 1, 3], [2, 0, 1]], 'M');
const b = matrixFromRows([[5], [1], [2]], 'b');
const v = matrixFromRows([[2], [-1], [3]], 'v');
const library = libraryFrom([A, B, M, b, v]);

describe('debug function registry', () => {
  for (const definition of DEBUG_FUNCTIONS) {
    it(`runs ${definition.id} with defaults and emits trace + scene`, () => {
      const result = runDebugFunction(definition, definition.defaults, {
        matrices: Object.values(library),
        library,
      });
      expect(result.ok, result.error).toBe(true);
      expect(result.trace.schemaVersion).toBe(1);
      expect(result.trace.status).toBe('ok');
      expect(result.trace.outputs.length).toBeGreaterThan(0);
      expect(result.scenes.length).toBeGreaterThan(0);
      expect(result.scenes[0]?.schemaVersion).toBe(2);
      for (const scene of result.scenes) {
        expect(scene.nodes.length).toBeGreaterThan(0);
        expect(scene.a11y.altText.length).toBeGreaterThan(0);
      }
      expect(result.artifacts.length).toBeGreaterThan(0);
    });
  }

  it('reports a useful error for bad matrix names', () => {
    const matmul = DEBUG_FUNCTIONS.find((item) => item.id === 'matmul')!;
    const result = runDebugFunction(matmul, { A: 'Z', B: 'B' }, {
      matrices: Object.values(library),
      library,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('矩阵库里没有「Z」');
    expect(result.trace.status).toBe('error');
  });

  it('produces both layered and flat representations for expression functions', () => {
    const add = DEBUG_FUNCTIONS.find((item) => item.id === 'add')!;
    const result = runDebugFunction(add, add.defaults, {
      matrices: Object.values(library),
      library,
    });
    expect(result.scenes.map((scene) => scene.space).sort()).toEqual(['flat', 'layered']);
  });
});

describe('storyboard → scene projection', () => {
  const story = buildStoryFromExpression('A × B', library);
  const beat = flattenBeats(story)[0]!;

  it('keeps the layered stage axis and active chapter', () => {
    const scene = buildStoryScene(story, beat, 'layered');
    expect(scene.space).toBe('layered');
    expect(scene.nodes.some((node) => node.role === 'input')).toBe(true);
    expect(scene.nodes.some((node) => node.role === 'operation' && node.status === 'active')).toBe(true);
    expect(scene.nodes.some((node) => node.role === 'result')).toBe(true);
  });

  it('flattens the current beat panels into a synthesis track', () => {
    const scene = buildStoryScene(story, beat, 'flat');
    expect(scene.space).toBe('flat');
    expect(scene.nodes.length).toBeGreaterThanOrEqual(beat.panels.length);
    expect(scene.edges.length).toBeGreaterThan(0);
    expect(scene.a11y.summary.length).toBeGreaterThan(0);
  });
});
