import { Q, formatNumber } from '../core/rational.js';
import type { Matrix } from '../core/matrix.js';
import {
  characteristicPolynomial,
  dot,
  eigenvaluesNumeric,
  formatEigen,
  luDecompose,
  matrixToText,
  nullspace,
  outer,
  qrDecompose,
} from '../core/matrix.js';
import { buildStoryFromExpression, flattenBeats } from '../presentation/stories.js';
import type { Story } from '../presentation/storyTypes.js';
import { buildDebugScene, buildStoryScene } from '../scene/builders.js';
import type { Scene, SceneSpace } from '../scene/types.js';
import type { ComputationTrace, JsonValue, TraceStep } from '../core/protocol.js';
import type {
  DebugArtifact,
  DebugContext,
  DebugFunctionDefinition,
  DebugFunctionParam,
  DebugRunResult,
} from './types.js';

let runCounter = 0;

function matrixFromArg(args: Record<string, JsonValue>, key: string, context: DebugContext): Matrix {
  const name = args[key];
  if (typeof name !== 'string') throw new Error(`参数 ${key} 需要矩阵名，例如 "A"`);
  const matrix = context.library[name];
  if (!matrix) throw new Error(`找不到矩阵 ${name}`);
  return matrix;
}

function numberFromArg(args: Record<string, JsonValue>, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`参数 ${key} 需要有限数字`);
  return value;
}

function artifactsForStory(story: Story): DebugArtifact[] {
  const sources = story.meta.sources.map((source) => ({
    id: `artifact-source-${source.name}`,
    label: source.name,
    kind: 'matrix' as const,
    preview: matrixToText(source.matrix),
    matrix: source.matrix,
  }));
  const result = story.resultValue;
  const resultArtifact: DebugArtifact =
    result.kind === 'matrix'
      ? {
          id: 'artifact-result',
          label: result.label,
          kind: 'matrix',
          preview: matrixToText(result.matrix),
          matrix: result.matrix,
        }
      : {
          id: 'artifact-result',
          label: '结果',
          kind: 'scalar',
          preview: formatNumber(result.value),
          scalar: formatNumber(result.value),
        };
  return [...sources, resultArtifact];
}

function traceFromStory(
  story: Story,
  operationId: string,
  label: string,
  startedAt: number,
  durationMs: number,
): ComputationTrace {
  const beats = flattenBeats(story);
  const steps: TraceStep[] = beats.map((beat, index) => ({
    id: `story-step-${index}`,
    index,
    kind: index === beats.length - 1 ? 'result' : index === 0 ? 'input' : 'operation',
    title: beat.title,
    detail: beat.lens.equation || beat.narration,
    highlights: beat.panels.flatMap((panel) =>
      Object.entries(panel.cells)
        .filter(([, cell]) => cell.tone === 'source' || cell.tone === 'result' || cell.tone === 'live')
        .slice(0, 8)
        .map(([key, cell]) => {
          const [r = 0, c = 0] = key.split(',').map(Number);
          return {
            panel: panel.label,
            cell: [r, c] as [number, number],
            role:
              cell.tone === 'result' || cell.tone === 'live'
                ? ('result' as const)
                : ('source' as const),
          };
        }),
    ),
    payload: {
      equation: beat.lens.equation,
      readout: beat.readout?.value ?? null,
      chapter: beat.chapterTitle,
    },
  }));
  const inputs = story.meta.sources.map((source) => ({
    id: `trace-input-${source.name}`,
    label: source.name,
    kind: 'matrix' as const,
    dtype: 'Q' as const,
    shape: { rows: source.matrix.rows, cols: source.matrix.cols },
    preview: matrixToText(source.matrix),
  }));
  const output =
    story.resultValue.kind === 'matrix'
      ? {
          id: 'trace-output',
          label: story.resultValue.label,
          kind: 'matrix' as const,
          dtype: 'Q' as const,
          shape: {
            rows: story.resultValue.matrix.rows,
            cols: story.resultValue.matrix.cols,
          },
          preview: matrixToText(story.resultValue.matrix),
        }
      : {
          id: 'trace-output',
          label: '结果',
          kind: 'scalar' as const,
          dtype: 'Q' as const,
          preview: formatNumber(story.resultValue.value),
        };
  return {
    schemaVersion: 1,
    runId: `run-${++runCounter}`,
    operationId,
    label,
    startedAt: new Date(startedAt).toISOString(),
    durationMs,
    status: 'ok',
    inputs,
    outputs: [output],
    steps,
    tags: ['exact', story.source],
  };
}

function scenePairFromStory(story: Story): Scene[] {
  const beats = flattenBeats(story);
  const first = beats[0];
  if (!first) return [];
  const spaces: SceneSpace[] = ['layered', 'flat'];
  return spaces.map((space) => buildStoryScene(story, first, space));
}

function expressionBackedResult(story: Story, operationId: string, label: string, startedAt: number): DebugRunResult {
  const durationMs = Math.max(1, performance.now() - startedAt);
  return {
    ok: true,
    functionId: operationId,
    trace: traceFromStory(story, operationId, label, startedAt, durationMs),
    artifacts: artifactsForStory(story),
    story,
    scenes: scenePairFromStory(story),
  };
}

function runExpression(
  operationId: string,
  label: string,
  expression: string,
  context: DebugContext,
): DebugRunResult {
  const startedAt = performance.now();
  try {
    const story = buildStoryFromExpression(expression, context.library);
    return expressionBackedResult(story, operationId, label, startedAt);
  } catch (error) {
    return errorResult(operationId, error, startedAt);
  }
}

function advancedResult(
  operationId: string,
  label: string,
  context: DebugContext,
  inputMatrices: Array<{ label: string; matrix: Matrix }>,
  operations: string[],
  outputs: DebugArtifact[],
  startedAt: number,
  extraScenes: Scene[] = [],
): DebugRunResult {
  const durationMs = Math.max(1, performance.now() - startedAt);
  const trace: ComputationTrace = {
    schemaVersion: 1,
    runId: `run-${++runCounter}`,
    operationId,
    label,
    startedAt: new Date(startedAt).toISOString(),
    durationMs,
    status: 'ok',
    inputs: inputMatrices.map((input) => ({
      id: `input-${input.label}`,
      label: input.label,
      kind: 'matrix',
      dtype: 'Q',
      shape: { rows: input.matrix.rows, cols: input.matrix.cols },
      preview: matrixToText(input.matrix),
    })),
    outputs: outputs
      .filter((artifact) => artifact.kind !== 'text')
      .map((artifact) => ({
        id: artifact.id,
        label: artifact.label,
        kind: artifact.kind === 'matrix' ? 'matrix' : 'scalar',
        dtype: 'Q',
        preview: artifact.preview,
        ...(artifact.matrix
          ? { shape: { rows: artifact.matrix.rows, cols: artifact.matrix.cols } }
          : {}),
      })),
    steps: operations.map((operation, index) => ({
      id: `advanced-${index}`,
      index,
      kind: 'operation',
      title: operation,
    })),
    tags: ['advanced', 'debug'],
  };
  const scene =
    extraScenes[0] ??
    buildDebugScene(
      label,
      trace.runId,
      inputMatrices,
      operations,
      outputs.map((artifact) => ({
        label: artifact.label,
        text: artifact.preview.length > 32 ? artifact.preview.split('\n')[0] ?? '…' : artifact.preview,
        ...(artifact.matrix ? { matrix: artifact.matrix } : {}),
      })),
    );
  return { ok: true, functionId: operationId, trace, artifacts: outputs, scenes: extraScenes.length > 1 ? extraScenes : [scene] };
}

function errorResult(operationId: string, error: unknown, startedAt: number): DebugRunResult {
  const message = error instanceof Error ? error.message : String(error);
  const now = performance.now();
  return {
    ok: false,
    functionId: operationId,
    error: message,
    artifacts: [],
    scenes: [],
    trace: {
      schemaVersion: 1,
      runId: `run-${++runCounter}`,
      operationId,
      label: operationId,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Math.max(1, now - startedAt),
      status: 'error',
      error: message,
      inputs: [],
      outputs: [],
      steps: [],
      tags: ['error'],
    },
  };
}

function matrixArtifact(id: string, label: string, matrix: Matrix): DebugArtifact {
  return { id, label, kind: 'matrix', preview: matrixToText(matrix), matrix };
}

function scalarArtifact(id: string, label: string, value: Q | number | string): DebugArtifact {
  return {
    id,
    label,
    kind: 'scalar',
    preview: value instanceof Q ? formatNumber(value) : String(value),
    scalar: value instanceof Q ? formatNumber(value) : String(value),
  };
}

function expressionDefinition(
  id: string,
  name: string,
  group: string,
  description: string,
  signature: string,
  params: DebugFunctionParam[],
  defaults: Record<string, JsonValue>,
  expression: (...args: Record<string, JsonValue>[]) => string,
): DebugFunctionDefinition {
  return {
    id,
    name,
    group,
    description,
    signature,
    params,
    defaults,
    run: (args, context) => runExpression(id, name, expression(args), context),
  };
}

const matrixParam = (key: string, label: string, defaultValue: JsonValue, description?: string): DebugFunctionParam => ({
  key,
  label,
  kind: 'matrix',
  ...(description ? { description } : {}),
  defaultValue,
});

const EXPRESSION_DEFINITIONS: DebugFunctionDefinition[] = [
  expressionDefinition(
    'matmul',
    '矩阵乘法',
    '线性结构',
    '逐格执行 A 的行与 B 的列点积，并生成完整的动画故事板。',
    'matmul(A, B)',
    [matrixParam('A', '左矩阵', 'A'), matrixParam('B', '右矩阵', 'B')],
    { A: 'A', B: 'B' },
    (args) => `${String(args.A)} × ${String(args.B)}`,
  ),
  expressionDefinition(
    'add',
    '矩阵加法',
    '逐格运算',
    '同形矩阵逐格相加。',
    'add(A, B)',
    [matrixParam('A', '矩阵 A', 'A'), matrixParam('B', '矩阵 B', 'B')],
    { A: 'A', B: 'B' },
    (args) => `${String(args.A)} + ${String(args.B)}`,
  ),
  expressionDefinition(
    'hadamard',
    'Hadamard 积',
    '逐格运算',
    '同形矩阵逐格相乘。',
    'hadamard(A, B)',
    [matrixParam('A', '矩阵 A', 'A'), matrixParam('B', '矩阵 B', 'B')],
    { A: 'A', B: 'B' },
    (args) => `${String(args.A)} ⊙ ${String(args.B)}`,
  ),
  expressionDefinition(
    'determinant',
    '行列式',
    '标量不变量',
    'Laplace 余子式展开，直到一个标量。',
    'determinant(A)',
    [matrixParam('A', '方阵', 'M')],
    { A: 'M' },
    (args) => `det(${String(args.A)})`,
  ),
  expressionDefinition(
    'inverse',
    '逆矩阵',
    '消元与系统',
    '在增广矩阵上执行高斯-若尔当消元。',
    'inverse(A)',
    [matrixParam('A', '方阵', 'A')],
    { A: 'A' },
    (args) => `inv(${String(args.A)})`,
  ),
  expressionDefinition(
    'rref',
    '最简行阶梯',
    '消元与系统',
    '记录所有换行、归一与消元动作。',
    'rref(A)',
    [matrixParam('A', '矩阵', 'M')],
    { A: 'M' },
    (args) => `rref(${String(args.A)})`,
  ),
  expressionDefinition(
    'transpose',
    '转置',
    '线性结构',
    '逐元素交换行列坐标。',
    'transpose(A)',
    [matrixParam('A', '矩阵', 'A')],
    { A: 'A' },
    (args) => `${String(args.A)}ᵀ`,
  ),
  expressionDefinition(
    'solve',
    '线性方程组',
    '消元与系统',
    '把 Ax=b 消成可直接读出 x 的 [I | x]。',
    'solve(A, b)',
    [matrixParam('A', '系数方阵', 'M'), matrixParam('b', '右端向量', 'b')],
    { A: 'M', b: 'b' },
    (args) => `solve(${String(args.A)}, ${String(args.b)})`,
  ),
];

function advancedDefinitions(): DebugFunctionDefinition[] {
  return [
    {
      id: 'lu',
      name: 'LU 分解',
      group: '分解与谱',
      description: '计算 PA=LU，并输出置换矩阵、下三角与上三角因子。',
      signature: 'lu(A)',
      params: [matrixParam('A', '方阵', 'A')],
      defaults: { A: 'A' },
      run: (args, context) => {
        const startedAt = performance.now();
        try {
          const matrix = matrixFromArg(args, 'A', context);
          const lu = luDecompose(matrix);
          const outputs = [
            matrixArtifact('lu-p', 'P', lu.P),
            matrixArtifact('lu-l', 'L', lu.L),
            matrixArtifact('lu-u', 'U', lu.U),
          ];
          return advancedResult(
            'lu',
            'LU 分解',
            context,
            [{ label: matrix.name, matrix }],
            [
              `寻找主元与置换（${lu.swaps} 次换行）`,
              '记录消元乘子到 L',
              '剩余上三角进入 U',
            ],
            outputs,
            startedAt,
          );
        } catch (error) {
          return errorResult('lu', error, startedAt);
        }
      },
    },
    {
      id: 'qr',
      name: 'QR 分解',
      group: '分解与谱',
      description: 'Gram–Schmidt 正交化；数字为浮点近似。',
      signature: 'qr(A)',
      params: [matrixParam('A', '矩阵', 'A')],
      defaults: { A: 'A' },
      run: (args, context) => {
        const startedAt = performance.now();
        try {
          const matrix = matrixFromArg(args, 'A', context);
          const qr = qrDecompose(matrix);
          const qMatrix: Matrix = {
            name: 'Q',
            rows: matrix.rows,
            cols: matrix.cols,
            data: qr.Q.map((row) => row.map((value) => Q.parse(String(Math.round(value * 1e8) / 1e8)))),
          };
          const rMatrix: Matrix = {
            name: 'R',
            rows: matrix.cols,
            cols: matrix.cols,
            data: qr.R.map((row) => row.map((value) => Q.parse(String(Math.round(value * 1e8) / 1e8)))),
          };
          return advancedResult(
            'qr',
            'QR 分解',
            context,
            [{ label: matrix.name, matrix }],
            ['Gram–Schmidt 正交化', '生成 Q 的列', '投影得到 R'],
            [matrixArtifact('qr-q', 'Q', qMatrix), matrixArtifact('qr-r', 'R', rMatrix)],
            startedAt,
          );
        } catch (error) {
          return errorResult('qr', error, startedAt);
        }
      },
    },
    {
      id: 'eigenvalues',
      name: '特征值',
      group: '分解与谱',
      description: '数值特征值读数，保留六位小数。',
      signature: 'eig(A)',
      params: [matrixParam('A', '方阵', 'A')],
      defaults: { A: 'A' },
      run: (args, context) => {
        const startedAt = performance.now();
        try {
          const matrix = matrixFromArg(args, 'A', context);
          const values = eigenvaluesNumeric(matrix);
          return advancedResult(
            'eigenvalues',
            '特征值',
            context,
            [{ label: matrix.name, matrix }],
            ['检查方阵与对称性', '求特征多项式或 QR 迭代', '排序并读数'],
            values.map((value, index) => scalarArtifact(`lambda-${index}`, `λ${index + 1}`, formatEigen(value))),
            startedAt,
          );
        } catch (error) {
          return errorResult('eigenvalues', error, startedAt);
        }
      },
    },
    {
      id: 'charpoly',
      name: '特征多项式',
      group: '分解与谱',
      description: '通过 Faddeev–LeVerrier 递推得到精确系数。',
      signature: 'charpoly(A)',
      params: [matrixParam('A', '方阵', 'A')],
      defaults: { A: 'A' },
      run: (args, context) => {
        const startedAt = performance.now();
        try {
          const matrix = matrixFromArg(args, 'A', context);
          const coeffs = characteristicPolynomial(matrix);
          return advancedResult(
            'charpoly',
            '特征多项式',
            context,
            [{ label: matrix.name, matrix }],
            ['构造 λI−A', '递推特征多项式系数', '得到 χ(λ)'],
            coeffs.map((coefficient, index) => scalarArtifact(`coeff-${index}`, `c${index}`, coefficient)),
            startedAt,
          );
        } catch (error) {
          return errorResult('charpoly', error, startedAt);
        }
      },
    },
    {
      id: 'nullspace',
      name: '零空间',
      group: '结构',
      description: '从 RREF 的自由变量构造零空间基。',
      signature: 'nullspace(A)',
      params: [matrixParam('A', '矩阵', 'A')],
      defaults: { A: 'A' },
      run: (args, context) => {
        const startedAt = performance.now();
        try {
          const matrix = matrixFromArg(args, 'A', context);
          const ns = nullspace(matrix);
          const outputs = ns.basis.length
            ? (ns.matrix ? [matrixArtifact('nullspace', 'N(A)', ns.matrix)] : [scalarArtifact('null-trivial', '零空间', 0)])
            : [scalarArtifact('null-trivial', '零空间', 0)];
          return advancedResult(
            'nullspace',
            '零空间',
            context,
            [{ label: matrix.name, matrix }],
            ['计算 RREF', '识别自由列', '构造基向量'],
            outputs,
            startedAt,
          );
        } catch (error) {
          return errorResult('nullspace', error, startedAt);
        }
      },
    },
    {
      id: 'dot',
      name: '向量内积',
      group: '向量',
      description: '两个同高列向量的精确内积。',
      signature: 'dot(u, v)',
      params: [matrixParam('u', '列向量 u', 'b'), matrixParam('v', '列向量 v', 'v')],
      defaults: { u: 'b', v: 'v' },
      run: (args, context) => {
        const startedAt = performance.now();
        try {
          const u = matrixFromArg(args, 'u', context);
          const v = matrixFromArg(args, 'v', context);
          const value = dot(u, v);
          return advancedResult(
            'dot',
            '向量内积',
            context,
            [{ label: u.name, matrix: u }, { label: v.name, matrix: v }],
            ['逐位相乘', '相加得到标量'],
            [scalarArtifact('dot-result', 'u·v', value)],
            startedAt,
          );
        } catch (error) {
          return errorResult('dot', error, startedAt);
        }
      },
    },
    {
      id: 'outer',
      name: '向量外积',
      group: '向量',
      description: '列向量乘行向量，生成秩 1 矩阵。',
      signature: 'outer(u, v)',
      params: [matrixParam('u', '列向量 u', 'b'), matrixParam('v', '列向量 v', 'v')],
      defaults: { u: 'b', v: 'v' },
      run: (args, context) => {
        const startedAt = performance.now();
        try {
          const u = matrixFromArg(args, 'u', context);
          const v = matrixFromArg(args, 'v', context);
          const result = outer(u, v);
          return advancedResult(
            'outer',
            '向量外积',
            context,
            [{ label: u.name, matrix: u }, { label: v.name, matrix: v }],
            ['每个 u 分量乘整条 v', '排列成矩阵'],
            [matrixArtifact('outer-result', 'uvᵀ', result)],
            startedAt,
          );
        } catch (error) {
          return errorResult('outer', error, startedAt);
        }
      },
    },
  ];
}

export const DEBUG_FUNCTIONS: DebugFunctionDefinition[] = [...EXPRESSION_DEFINITIONS, ...advancedDefinitions()];

export const DEBUG_GROUPS = [...new Set(DEBUG_FUNCTIONS.map((definition) => definition.group))];

export function debugFunctionById(id: string): DebugFunctionDefinition | undefined {
  return DEBUG_FUNCTIONS.find((definition) => definition.id === id);
}

export function runDebugFunction(
  definition: DebugFunctionDefinition,
  args: Record<string, JsonValue>,
  context: DebugContext,
): DebugRunResult {
  const startedAt = performance.now();
  try {
    const missing = definition.params.find((param) => !(param.key in args));
    if (missing) throw new Error(`缺少参数 ${missing.key}`);
    return definition.run(args, context);
  } catch (error) {
    return errorResult(definition.id, error, startedAt);
  }
}
