/**
 * A typed, presentation-agnostic formula palette for linear algebra.
 *
 * Every catalogue entry owns a factory that returns a fresh AST template on
 * demand. Templates contain typed `slot` holes, so dragging one into the
 * editor yields a real editable expression, not a LaTeX string. Previews are
 * generated once, from the same AST, with the plain LaTeX serializer.
 */

import {
  ACCEPTS_ANY,
  binderNode,
  callNode,
  createFormulaDocument,
  fractionNode,
  matrixNode,
  numberNode,
  operatorNode,
  scriptNode,
  slotNode,
  symbolNode,
} from './ast.js';
import type {
  CallSymbol,
  FormulaNode,
  FormulaSlotNode,
  MatrixDelimiter,
  OperatorSymbol,
  SemanticCategory,
  SlotPolicy,
  SlotRole,
} from './ast.js';
import { formulaToAltText, formulaToPlainLatex } from './latex.js';

/* ------------------------------------------------------------------ *
 * Catalogue types
 * ------------------------------------------------------------------ */

export const PALETTE_GROUPS = [
  'matrix',
  'constant',
  'operator',
  'structure',
  'function',
  'binder',
  'slot',
] as const;

export type PaletteGroup = (typeof PALETTE_GROUPS)[number];

export interface PaletteOutput {
  /** Root node kind produced by `create()`. */
  readonly nodeKind: FormulaNode['kind'];
  /** Result category advertised by the freshly created template. */
  readonly category: SemanticCategory;
  /** Plain, wrapper-free LaTeX preview. */
  readonly latex: string;
  /** Human-readable description of the preview for accessible UI. */
  readonly altText: string;
}

export interface PaletteItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly keywords: readonly string[];
  /** Semantic category used for palette colouring and grouping hints. */
  readonly category: SemanticCategory;
  readonly group: PaletteGroup;
  readonly output: PaletteOutput;
  /** Return a brand-new template AST with fresh node ids. */
  readonly create: () => FormulaNode;
  /** Suggested drop behaviour when dragged onto a slot or selection. */
  readonly dropPolicy: SlotPolicy;
  /** Feature is present as a typed placeholder for a later editor phase. */
  readonly future?: boolean;
}

export interface PaletteFilter {
  readonly group?: PaletteGroup;
  readonly category?: SemanticCategory;
  /** Include future items. Defaults to true. */
  readonly includeFuture?: boolean;
}

/* ------------------------------------------------------------------ *
 * Semantic colour tokens
 * ------------------------------------------------------------------ */

/** CSS custom property names. Values are owned by the host stylesheet. */
export const SEMANTIC_COLOR_TOKENS: Readonly<Record<SemanticCategory, string>> = {
  scalar: '--formula-color-scalar',
  matrix: '--formula-color-matrix',
  tensor: '--formula-color-tensor',
  function: '--formula-color-function',
  operator: '--formula-color-operator',
  index: '--formula-color-index',
  bound: '--formula-color-bound',
  number: '--formula-color-number',
  unit: '--formula-color-unit',
  unknown: '--formula-color-unknown',
};

/** Ready-to-use CSS variable references, keyed by semantic category. */
export const SEMANTIC_COLORS: Readonly<Record<SemanticCategory, string>> = {
  scalar: 'var(--formula-color-scalar)',
  matrix: 'var(--formula-color-matrix)',
  tensor: 'var(--formula-color-tensor)',
  function: 'var(--formula-color-function)',
  operator: 'var(--formula-color-operator)',
  index: 'var(--formula-color-index)',
  bound: 'var(--formula-color-bound)',
  number: 'var(--formula-color-number)',
  unit: 'var(--formula-color-unit)',
  unknown: 'var(--formula-color-unknown)',
};

/* ------------------------------------------------------------------ *
 * Template helpers
 * ------------------------------------------------------------------ */

const MATRIX_ARG_ACCEPTS: readonly SemanticCategory[] = ['matrix', 'tensor', 'unknown'];
const INDEX_ACCEPTS: readonly SemanticCategory[] = ['index', 'number', 'scalar', 'unknown'];
const FUNCTIONISH_ACCEPTS: readonly SemanticCategory[] = [
  'function',
  'scalar',
  'matrix',
  'tensor',
  'unknown',
];

function slot(
  role: SlotRole,
  options: {
    readonly accepts?: readonly SemanticCategory[];
    readonly placeholder?: string;
  } = {},
): FormulaSlotNode {
  return slotNode(role, {
    ...(options.accepts !== undefined ? { accepts: options.accepts } : {}),
    ...(options.placeholder !== undefined ? { placeholder: options.placeholder } : {}),
  });
}

function slotMatrix(
  rows: number,
  columns: number,
  delimiters: MatrixDelimiter = 'bracket',
): FormulaNode {
  const grid: FormulaSlotNode[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const cells: FormulaSlotNode[] = [];
    for (let column = 0; column < columns; column += 1) {
      cells.push(slot('matrix-cell'));
    }
    grid.push(cells);
  }
  return matrixNode(grid, { delimiters });
}

function identityMatrix(size: number): FormulaNode {
  const grid: FormulaNode[][] = [];
  for (let row = 0; row < size; row += 1) {
    const cells: FormulaNode[] = [];
    for (let column = 0; column < size; column += 1) {
      cells.push(numberNode(row === column ? '1' : '0'));
    }
    grid.push(cells);
  }
  return matrixNode(grid);
}

function binaryOperatorTemplate(op: OperatorSymbol): FormulaNode {
  return operatorNode(op, [slot('operand'), slot('operand')]);
}

function postfixOperatorTemplate(op: OperatorSymbol): FormulaNode {
  return operatorNode(op, [slot('base', { accepts: MATRIX_ARG_ACCEPTS, placeholder: 'A' })]);
}

function unaryFunctionTemplate(name: CallSymbol, placeholder: string): FormulaNode {
  return callNode(name, [
    slot('argument', { accepts: MATRIX_ARG_ACCEPTS, placeholder }),
  ]);
}

function fractionTemplate(): FormulaNode {
  return fractionNode(
    slot('numerator', { placeholder: 'a' }),
    slot('denominator', { placeholder: 'b' }),
  );
}

function powerTemplate(): FormulaNode {
  return scriptNode(slot('base', { placeholder: 'x' }), {
    sup: slot('superscript', { placeholder: 'n' }),
  });
}

function sumBinderTemplate(): FormulaNode {
  const index = symbolNode('i', { category: 'index' });
  const upper = symbolNode('n', { category: 'index' });
  return binderNode('sum', [index], slot('binder-body'), {
    domain: { lower: numberNode(1), upper },
  });
}

function gradientTemplate(): FormulaNode {
  return operatorNode('gradient', [
    slot('operand', { accepts: FUNCTIONISH_ACCEPTS, placeholder: 'f' }),
  ]);
}

function partialTemplate(): FormulaNode {
  const functionSlot = slot('operand', {
    accepts: ['function', 'scalar', 'unknown'],
    placeholder: 'f',
  });
  const variable = symbolNode('x', { category: 'index' });
  return fractionNode(operatorNode('partial', [functionSlot]), operatorNode('partial', [variable]));
}

/* ------------------------------------------------------------------ *
 * Item construction
 * ------------------------------------------------------------------ */

interface PaletteDefinition extends Omit<PaletteItem, 'output'> {}

function definePaletteItem(definition: PaletteDefinition): PaletteItem {
  // Generate the preview from a throwaway template. The `create` factory is
  // called again by every actual drop, so node ids are never reused.
  const preview = definition.create();
  const document = createFormulaDocument(preview);
  return {
    ...definition,
    output: {
      nodeKind: preview.kind,
      category: preview.category,
      latex: formulaToPlainLatex(document),
      altText: formulaToAltText(document),
    },
  };
}

export const PALETTE_ITEMS: readonly PaletteItem[] = [
  /* ------------------------------ matrices ------------------------------ */
  definePaletteItem({
    id: 'matrix-2x2',
    label: '2×2 矩阵',
    description: '带四个类型化单元格槽的 2×2 矩阵模板。',
    keywords: ['matrix', '2x2', '2×2', 'square', '矩阵', '方阵', '二阶'],
    category: 'matrix',
    group: 'matrix',
    create: () => slotMatrix(2, 2),
    dropPolicy: 'replace',
  }),
  definePaletteItem({
    id: 'matrix-3x3',
    label: '3×3 矩阵',
    description: '带九个类型化单元格槽的 3×3 矩阵模板。',
    keywords: ['matrix', '3x3', '3×3', 'square', '矩阵', '方阵', '三阶'],
    category: 'matrix',
    group: 'matrix',
    create: () => slotMatrix(3, 3),
    dropPolicy: 'replace',
  }),
  definePaletteItem({
    id: 'matrix-identity-2x2',
    label: '2×2 单位阵 I',
    description: '2×2 单位矩阵常量。',
    keywords: ['identity', 'unit matrix', 'i', '单位阵', '恒等矩阵'],
    category: 'matrix',
    group: 'matrix',
    create: () => identityMatrix(2),
    dropPolicy: 'replace',
  }),

  /* ------------------------------ constants ----------------------------- */
  definePaletteItem({
    id: 'constant-0',
    label: '0',
    description: '数字常量 0。',
    keywords: ['zero', 'constant', 'scalar', '零', '数字'],
    category: 'number',
    group: 'constant',
    create: () => numberNode('0'),
    dropPolicy: 'replace',
  }),
  definePaletteItem({
    id: 'constant-1',
    label: '1',
    description: '数字常量 1。',
    keywords: ['one', 'constant', 'scalar', '一', '数字'],
    category: 'number',
    group: 'constant',
    create: () => numberNode('1'),
    dropPolicy: 'replace',
  }),
  definePaletteItem({
    id: 'constant-2',
    label: '2',
    description: '数字常量 2。',
    keywords: ['two', 'constant', 'scalar', '二', '数字'],
    category: 'number',
    group: 'constant',
    create: () => numberNode('2'),
    dropPolicy: 'replace',
  }),
  definePaletteItem({
    id: 'constant-neg-one',
    label: '−1',
    description: '数字常量 −1。',
    keywords: ['minus one', 'negative', 'negative one', '负一', '数字'],
    category: 'number',
    group: 'constant',
    create: () => numberNode('-1'),
    dropPolicy: 'replace',
  }),
  definePaletteItem({
    id: 'constant-pi',
    label: 'π',
    description: '圆周率常量 π。',
    keywords: ['pi', 'π', 'circle', 'constant', '圆周率', '常量'],
    category: 'number',
    group: 'constant',
    create: () => symbolNode('π', { category: 'number' }),
    dropPolicy: 'replace',
  }),
  definePaletteItem({
    id: 'constant-e',
    label: 'e',
    description: '自然常数 e。',
    keywords: ['e', 'euler', 'natural', 'constant', '自然常数', '常量'],
    category: 'number',
    group: 'constant',
    create: () => symbolNode('e', { category: 'number' }),
    dropPolicy: 'replace',
  }),

  /* ------------------------------ operators ----------------------------- */
  definePaletteItem({
    id: 'operator-plus',
    label: '加法 +',
    description: '二元加法模板，两个操作数槽。',
    keywords: ['add', 'plus', 'addition', '加', '加法', '求和'],
    category: 'operator',
    group: 'operator',
    create: () => binaryOperatorTemplate('+'),
    dropPolicy: 'wrap',
  }),
  definePaletteItem({
    id: 'operator-minus',
    label: '减法 −',
    description: '二元减法模板，两个操作数槽。',
    keywords: ['subtract', 'minus', 'subtraction', '减', '减法', '差'],
    category: 'operator',
    group: 'operator',
    create: () => binaryOperatorTemplate('-'),
    dropPolicy: 'wrap',
  }),
  definePaletteItem({
    id: 'operator-times',
    label: '乘法 ×',
    description: '矩阵乘法 / 数乘模板。',
    keywords: ['multiply', 'times', 'matrix product', '乘', '乘法', '矩阵乘法'],
    category: 'operator',
    group: 'operator',
    create: () => binaryOperatorTemplate('\\times'),
    dropPolicy: 'wrap',
  }),
  definePaletteItem({
    id: 'operator-hadamard',
    label: 'Hadamard 积 ⊙',
    description: '逐元素乘法模板。',
    keywords: ['hadamard', 'elementwise', 'schur', 'odot', '哈达玛', '逐元素'],
    category: 'operator',
    group: 'operator',
    create: () => binaryOperatorTemplate('\\odot'),
    dropPolicy: 'wrap',
  }),
  definePaletteItem({
    id: 'operator-kronecker',
    label: 'Kronecker 积 ⊗',
    description: 'Kronecker 张量积模板。',
    keywords: ['kronecker', 'tensor product', 'otimes', '克罗内克', '张量积'],
    category: 'operator',
    group: 'operator',
    create: () => binaryOperatorTemplate('\\otimes'),
    dropPolicy: 'wrap',
  }),
  definePaletteItem({
    id: 'operator-transpose',
    label: '转置 ᵀ',
    description: '作用于矩阵或张量的后缀转置。',
    keywords: ['transpose', 'transposed', 't', '转置', '上标 t'],
    category: 'operator',
    group: 'operator',
    create: () => postfixOperatorTemplate('transpose'),
    dropPolicy: 'wrap',
  }),
  definePaletteItem({
    id: 'operator-inverse',
    label: '逆 A⁻¹',
    description: '作用于矩阵的后缀逆算子。',
    keywords: ['inverse', 'invert', '逆', '求逆', '负一次方'],
    category: 'operator',
    group: 'operator',
    create: () => postfixOperatorTemplate('inverse'),
    dropPolicy: 'wrap',
  }),
  definePaletteItem({
    id: 'operator-gradient',
    label: '梯度 ∇',
    description: '梯度前缀算子（未来编辑阶段启用）。',
    keywords: ['gradient', 'nabla', 'grad', '梯度', '未来'],
    category: 'operator',
    group: 'operator',
    create: () => gradientTemplate(),
    dropPolicy: 'wrap',
    future: true,
  }),
  definePaletteItem({
    id: 'operator-partial',
    label: '偏导 ∂/∂x',
    description: '偏导数结构模板（未来编辑阶段启用）。',
    keywords: ['partial', 'derivative', '偏导', '偏微分', '未来'],
    category: 'operator',
    group: 'operator',
    create: () => partialTemplate(),
    dropPolicy: 'wrap',
    future: true,
  }),

  /* ------------------------------ structure ----------------------------- */
  definePaletteItem({
    id: 'structure-fraction',
    label: '分式 a/b',
    description: '带分子与分母槽的分式。',
    keywords: ['fraction', 'divide', 'quotient', 'frac', '分数', '分式', '除'],
    category: 'scalar',
    group: 'structure',
    create: () => fractionTemplate(),
    dropPolicy: 'wrap',
  }),
  definePaletteItem({
    id: 'structure-power',
    label: '幂 xⁿ',
    description: '带底数与指数槽的幂。',
    keywords: ['power', 'exponent', 'superscript', 'pow', '幂', '指数', '乘方'],
    category: 'operator',
    group: 'structure',
    create: () => powerTemplate(),
    dropPolicy: 'wrap',
  }),

  /* ------------------------------ functions ----------------------------- */
  definePaletteItem({
    id: 'function-det',
    label: '行列式 det',
    description: '矩阵行列式调用模板。',
    keywords: ['determinant', 'det', '行列式', '函数'],
    category: 'function',
    group: 'function',
    create: () => unaryFunctionTemplate('det', 'A'),
    dropPolicy: 'wrap',
  }),
  definePaletteItem({
    id: 'function-trace',
    label: '迹 trace',
    description: '矩阵迹调用模板。',
    keywords: ['trace', 'tr', '迹', '函数'],
    category: 'function',
    group: 'function',
    create: () => unaryFunctionTemplate('trace', 'A'),
    dropPolicy: 'wrap',
  }),
  definePaletteItem({
    id: 'function-rank',
    label: '秩 rank',
    description: '矩阵秩调用模板。',
    keywords: ['rank', '秩', '函数'],
    category: 'function',
    group: 'function',
    create: () => unaryFunctionTemplate('rank', 'A'),
    dropPolicy: 'wrap',
  }),
  definePaletteItem({
    id: 'function-inv',
    label: '求逆 inv',
    description: '矩阵求逆函数模板。',
    keywords: ['inverse', 'invert', 'inv', '求逆', '逆矩阵', '函数'],
    category: 'function',
    group: 'function',
    create: () => unaryFunctionTemplate('inv', 'A'),
    dropPolicy: 'wrap',
  }),
  definePaletteItem({
    id: 'function-solve',
    label: '解方程 solve',
    description: '线性方程组求解模板 A x = b。',
    keywords: ['solve', 'linear system', 'equation', '解方程', '线性方程组', '函数'],
    category: 'function',
    group: 'function',
    create: () =>
      callNode('solve', [
        slot('argument', { accepts: MATRIX_ARG_ACCEPTS, placeholder: 'A' }),
        slot('argument', { accepts: MATRIX_ARG_ACCEPTS, placeholder: 'b' }),
      ]),
    dropPolicy: 'wrap',
  }),
  definePaletteItem({
    id: 'function-minor',
    label: '余子式 minor',
    description: '按行、列索引取余子式。',
    keywords: ['minor', 'cofactor', '余子式', '代数余子式', '函数'],
    category: 'function',
    group: 'function',
    create: () =>
      callNode('minor', [
        slot('argument', { accepts: MATRIX_ARG_ACCEPTS, placeholder: 'A' }),
        slot('argument', { accepts: INDEX_ACCEPTS, placeholder: 'i' }),
        slot('argument', { accepts: INDEX_ACCEPTS, placeholder: 'j' }),
      ]),
    dropPolicy: 'wrap',
  }),

  /* ------------------------------- binders ------------------------------ */
  definePaletteItem({
    id: 'binder-sum',
    label: '求和 Σ',
    description: '带索引变量、上下界和函数体槽的求和。',
    keywords: ['sum', 'sigma', 'binder', 'index', '求和', '绑定', '指标'],
    category: 'bound',
    group: 'binder',
    create: () => sumBinderTemplate(),
    dropPolicy: 'wrap',
  }),

  /* -------------------------------- slots ------------------------------- */
  definePaletteItem({
    id: 'slot-any',
    label: '任意槽',
    description: '接受任意语义类别的空槽。',
    keywords: ['slot', 'hole', 'any', 'placeholder', '槽', '空位', '占位'],
    category: 'unknown',
    group: 'slot',
    create: () =>
      slot('generic', {
        accepts: ACCEPTS_ANY,
        placeholder: '?',
      }),
    dropPolicy: 'replace',
  }),
  definePaletteItem({
    id: 'slot-scalar',
    label: '标量槽',
    description: '只接受标量、数字或单位的空槽。',
    keywords: ['slot', 'scalar', 'number', '槽', '标量', '数字'],
    category: 'unknown',
    group: 'slot',
    create: () =>
      slot('generic', {
        accepts: ['scalar', 'number', 'unit', 'unknown'],
        placeholder: 's',
      }),
    dropPolicy: 'replace',
  }),
  definePaletteItem({
    id: 'slot-matrix',
    label: '矩阵槽',
    description: '只接受矩阵或张量的空槽。',
    keywords: ['slot', 'matrix', 'tensor', '槽', '矩阵', '张量'],
    category: 'unknown',
    group: 'slot',
    create: () =>
      slot('generic', {
        accepts: MATRIX_ARG_ACCEPTS,
        placeholder: 'M',
      }),
    dropPolicy: 'replace',
  }),
  definePaletteItem({
    id: 'slot-index',
    label: '指标槽',
    description: '只接受指标、数字或标量的空槽。',
    keywords: ['slot', 'index', 'subscript', '槽', '指标', '下标'],
    category: 'unknown',
    group: 'slot',
    create: () =>
      slot('subscript', {
        accepts: INDEX_ACCEPTS,
        placeholder: 'i',
      }),
    dropPolicy: 'replace',
  }),
];

/* ------------------------------------------------------------------ *
 * Lookup API
 * ------------------------------------------------------------------ */

const byId: Record<string, PaletteItem> = {};
const seenIds = new Set<string>();
for (const item of PALETTE_ITEMS) {
  if (seenIds.has(item.id)) {
    throw new Error(`Duplicate palette item id "${item.id}"`);
  }
  seenIds.add(item.id);
  byId[item.id] = item;
}

export const PALETTE_BY_ID: Readonly<Record<string, PaletteItem>> = byId;

export function getPaletteItem(id: string): PaletteItem | undefined {
  return PALETTE_BY_ID[id];
}

export function listPaletteItems(filter: PaletteFilter = {}): readonly PaletteItem[] {
  const includeFuture = filter.includeFuture ?? true;
  return PALETTE_ITEMS.filter((item) => {
    if (!includeFuture && item.future === true) return false;
    if (filter.group !== undefined && item.group !== filter.group) return false;
    if (filter.category !== undefined && item.category !== filter.category) return false;
    return true;
  });
}

export function paletteItemsByGroup(): Readonly<Record<PaletteGroup, readonly PaletteItem[]>> {
  const result: Record<PaletteGroup, readonly PaletteItem[]> = {
    matrix: [],
    constant: [],
    operator: [],
    structure: [],
    function: [],
    binder: [],
    slot: [],
  };
  const groups: Record<PaletteGroup, PaletteItem[]> = {
    matrix: [],
    constant: [],
    operator: [],
    structure: [],
    function: [],
    binder: [],
    slot: [],
  };
  for (const item of PALETTE_ITEMS) groups[item.group].push(item);
  for (const group of PALETTE_GROUPS) {
    result[group] = groups[group];
  }
  return result;
}

/** IDs required by the linear-algebra palette contract. */
export const REQUIRED_PALETTE_IDS: readonly string[] = [
  'matrix-2x2',
  'matrix-3x3',
  'constant-0',
  'constant-1',
  'operator-plus',
  'operator-minus',
  'operator-times',
  'operator-hadamard',
  'operator-kronecker',
  'operator-transpose',
  'operator-inverse',
  'structure-fraction',
  'structure-power',
  'function-det',
  'function-trace',
  'function-rank',
  'function-inv',
  'function-solve',
  'function-minor',
  'binder-sum',
  'operator-gradient',
  'operator-partial',
  'slot-any',
];
