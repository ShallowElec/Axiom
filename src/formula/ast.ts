/**
 * Formula AST foundation for Matrix Atelier.
 *
 * This module is deliberately headless: it has no React, DOM, renderer, or
 * application-state imports. A formula is an AST first and a LaTeX string
 * second, so a future visual editor can reason about every node, hole, and
 * drop target without parsing rendered text.
 *
 * Design notes
 * ------------
 * - Every node has a stable, URL-safe id. Ids survive JSON serialization.
 * - A FormulaDocument stores nodes once in an id-keyed map. The on-disk JSON
 *   format is flat: children are referenced by id, while the in-memory format
 *   keeps direct object references for easy traversal.
 * - Slots are first-class typed nodes. In addition, every structural child
 *   position is described by a static slot registry so editors can create
 *   targets even when a position is currently empty.
 * - JSON validation narrows `unknown` explicitly; no `any` is exposed by the
 *   public API.
 */

/* ------------------------------------------------------------------ *
 * Semantic vocabulary
 * ------------------------------------------------------------------ */

export const SEMANTIC_CATEGORIES = [
  'scalar',
  'matrix',
  'tensor',
  'function',
  'operator',
  'index',
  'bound',
  'number',
  'unit',
  'unknown',
] as const;

export type SemanticCategory = (typeof SEMANTIC_CATEGORIES)[number];

export const FORMULA_NODE_KINDS = [
  'symbol',
  'number',
  'operator',
  'call',
  'fraction',
  'script',
  'matrix',
  'binder',
  'slot',
  'reference',
] as const;

export type FormulaNodeKind = (typeof FORMULA_NODE_KINDS)[number];

export type FormulaNodeId = string;

export const FORMULA_DOCUMENT_SCHEMA = 'matrix-atelier/formula' as const;
export const FORMULA_DOCUMENT_VERSION = 1 as const;

/* ------------------------------------------------------------------ *
 * Operators and calls
 * ------------------------------------------------------------------ */

export type OperatorFixity = 'prefix' | 'infix' | 'postfix';

export const OPERATOR_SYMBOLS = [
  '+',
  '-',
  '\\pm',
  '\\mp',
  '\\times',
  '\\cdot',
  '\\odot',
  '\\otimes',
  '\\div',
  '=',
  '\\neq',
  '<',
  '>',
  '\\le',
  '\\ge',
  '\\approx',
  '\\to',
  '\\mapsto',
  '\\in',
  '\\subseteq',
  '\\ast',
  '\\circ',
  'transpose',
  'inverse',
  'gradient',
  'partial',
] as const;

export type OperatorSymbol = (typeof OPERATOR_SYMBOLS)[number];

export interface OperatorDefinition {
  readonly symbol: OperatorSymbol;
  readonly latex: string;
  readonly fixity: OperatorFixity;
  readonly arity: 1 | 2;
  readonly label: string;
  readonly category: SemanticCategory;
  readonly keywords: readonly string[];
  /** For postfix operators this is the superscript body. */
  readonly postfixLatex?: string;
}

export const OPERATOR_DEFINITIONS: Readonly<Record<OperatorSymbol, OperatorDefinition>> = {
  '+': {
    symbol: '+',
    latex: '+',
    fixity: 'infix',
    arity: 2,
    label: 'plus',
    category: 'operator',
    keywords: ['add', 'addition', 'sum', '加', '加法'],
  },
  '-': {
    symbol: '-',
    latex: '-',
    fixity: 'infix',
    arity: 2,
    label: 'minus',
    category: 'operator',
    keywords: ['subtract', 'subtraction', 'difference', '减', '减法'],
  },
  '\\pm': {
    symbol: '\\pm',
    latex: '\\pm',
    fixity: 'infix',
    arity: 2,
    label: 'plus or minus',
    category: 'operator',
    keywords: ['plus-minus', '正负'],
  },
  '\\mp': {
    symbol: '\\mp',
    latex: '\\mp',
    fixity: 'infix',
    arity: 2,
    label: 'minus or plus',
    category: 'operator',
    keywords: ['minus-plus', '负正'],
  },
  '\\times': {
    symbol: '\\times',
    latex: '\\times',
    fixity: 'infix',
    arity: 2,
    label: 'times',
    category: 'operator',
    keywords: ['multiply', 'multiplication', 'product', '乘', '乘法'],
  },
  '\\cdot': {
    symbol: '\\cdot',
    latex: '\\cdot',
    fixity: 'infix',
    arity: 2,
    label: 'dot product',
    category: 'operator',
    keywords: ['dot', 'multiply', '点乘'],
  },
  '\\odot': {
    symbol: '\\odot',
    latex: '\\odot',
    fixity: 'infix',
    arity: 2,
    label: 'Hadamard product',
    category: 'operator',
    keywords: ['hadamard', 'elementwise', 'schur', '哈达玛', '逐元素'],
  },
  '\\otimes': {
    symbol: '\\otimes',
    latex: '\\otimes',
    fixity: 'infix',
    arity: 2,
    label: 'Kronecker product',
    category: 'operator',
    keywords: ['kronecker', 'tensor product', '克罗内克', '张量积'],
  },
  '\\div': {
    symbol: '\\div',
    latex: '\\div',
    fixity: 'infix',
    arity: 2,
    label: 'divided by',
    category: 'operator',
    keywords: ['divide', 'division', '除', '除法'],
  },
  '=': {
    symbol: '=',
    latex: '=',
    fixity: 'infix',
    arity: 2,
    label: 'equals',
    category: 'operator',
    keywords: ['equal', 'equation', '等于'],
  },
  '\\neq': {
    symbol: '\\neq',
    latex: '\\neq',
    fixity: 'infix',
    arity: 2,
    label: 'not equal to',
    category: 'operator',
    keywords: ['ne', 'not equal', '不等于'],
  },
  '<': {
    symbol: '<',
    latex: '<',
    fixity: 'infix',
    arity: 2,
    label: 'less than',
    category: 'operator',
    keywords: ['lt', 'less', '小于'],
  },
  '>': {
    symbol: '>',
    latex: '>',
    fixity: 'infix',
    arity: 2,
    label: 'greater than',
    category: 'operator',
    keywords: ['gt', 'greater', '大于'],
  },
  '\\le': {
    symbol: '\\le',
    latex: '\\le',
    fixity: 'infix',
    arity: 2,
    label: 'less than or equal to',
    category: 'operator',
    keywords: ['leq', 'less equal', '小于等于'],
  },
  '\\ge': {
    symbol: '\\ge',
    latex: '\\ge',
    fixity: 'infix',
    arity: 2,
    label: 'greater than or equal to',
    category: 'operator',
    keywords: ['geq', 'greater equal', '大于等于'],
  },
  '\\approx': {
    symbol: '\\approx',
    latex: '\\approx',
    fixity: 'infix',
    arity: 2,
    label: 'approximately equal to',
    category: 'operator',
    keywords: ['approx', 'approximately', '约等于'],
  },
  '\\to': {
    symbol: '\\to',
    latex: '\\to',
    fixity: 'infix',
    arity: 2,
    label: 'to',
    category: 'operator',
    keywords: ['arrow', 'maps', 'to', '映射到'],
  },
  '\\mapsto': {
    symbol: '\\mapsto',
    latex: '\\mapsto',
    fixity: 'infix',
    arity: 2,
    label: 'maps to',
    category: 'operator',
    keywords: ['mapsto', 'mapping', '映射'],
  },
  '\\in': {
    symbol: '\\in',
    latex: '\\in',
    fixity: 'infix',
    arity: 2,
    label: 'in',
    category: 'operator',
    keywords: ['element of', 'member', '属于'],
  },
  '\\subseteq': {
    symbol: '\\subseteq',
    latex: '\\subseteq',
    fixity: 'infix',
    arity: 2,
    label: 'is a subset of or equal to',
    category: 'operator',
    keywords: ['subset', 'subseteq', '子集'],
  },
  '\\ast': {
    symbol: '\\ast',
    latex: '\\ast',
    fixity: 'infix',
    arity: 2,
    label: 'asterisk',
    category: 'operator',
    keywords: ['star', 'ast', '星号'],
  },
  '\\circ': {
    symbol: '\\circ',
    latex: '\\circ',
    fixity: 'infix',
    arity: 2,
    label: 'composed with',
    category: 'operator',
    keywords: ['compose', 'composition', '复合'],
  },
  transpose: {
    symbol: 'transpose',
    latex: '\\top',
    fixity: 'postfix',
    arity: 1,
    label: 'transpose of',
    category: 'operator',
    keywords: ['transpose', 'transposed', 't', '转置'],
    postfixLatex: '\\top',
  },
  inverse: {
    symbol: 'inverse',
    latex: '\\operatorname{inv}',
    fixity: 'postfix',
    arity: 1,
    label: 'inverse of',
    category: 'operator',
    keywords: ['inverse', 'invert', '逆', '求逆'],
    postfixLatex: '-1',
  },
  gradient: {
    symbol: 'gradient',
    latex: '\\nabla',
    fixity: 'prefix',
    arity: 1,
    label: 'gradient of',
    category: 'operator',
    keywords: ['gradient', 'nabla', 'grad', '梯度'],
  },
  partial: {
    symbol: 'partial',
    latex: '\\partial',
    fixity: 'prefix',
    arity: 1,
    label: 'partial derivative of',
    category: 'operator',
    keywords: ['partial', 'derivative', '偏导', '偏微分'],
  },
};

export const CALL_SYMBOLS = [
  'det',
  'trace',
  'rank',
  'inv',
  'solve',
  'minor',
  'transpose',
  'adj',
  'rref',
] as const;

export type CallSymbol = (typeof CALL_SYMBOLS)[number];

export interface CallDefinition {
  readonly name: CallSymbol;
  readonly latex: string;
  readonly minArgs: number;
  readonly maxArgs: number;
  readonly category: SemanticCategory;
  readonly label: string;
  readonly keywords: readonly string[];
}

export const CALL_DEFINITIONS: Readonly<Record<CallSymbol, CallDefinition>> = {
  det: {
    name: 'det',
    latex: '\\det',
    minArgs: 1,
    maxArgs: 1,
    category: 'scalar',
    label: 'determinant',
    keywords: ['determinant', 'det', '行列式'],
  },
  trace: {
    name: 'trace',
    latex: '\\operatorname{tr}',
    minArgs: 1,
    maxArgs: 1,
    category: 'scalar',
    label: 'trace',
    keywords: ['trace', 'tr', '迹'],
  },
  rank: {
    name: 'rank',
    latex: '\\operatorname{rank}',
    minArgs: 1,
    maxArgs: 1,
    category: 'scalar',
    label: 'rank',
    keywords: ['rank', '秩'],
  },
  inv: {
    name: 'inv',
    latex: '\\operatorname{inv}',
    minArgs: 1,
    maxArgs: 1,
    category: 'matrix',
    label: 'inverse',
    keywords: ['inverse', 'invert', 'inv', '逆', '求逆'],
  },
  solve: {
    name: 'solve',
    latex: '\\operatorname{solve}',
    minArgs: 2,
    maxArgs: 2,
    category: 'matrix',
    label: 'solve',
    keywords: ['solve', 'linear system', '解方程'],
  },
  minor: {
    name: 'minor',
    latex: '\\operatorname{minor}',
    minArgs: 3,
    maxArgs: 3,
    category: 'scalar',
    label: 'minor',
    keywords: ['minor', 'cofactor', '余子式'],
  },
  transpose: {
    name: 'transpose',
    latex: '\\operatorname{transpose}',
    minArgs: 1,
    maxArgs: 1,
    category: 'matrix',
    label: 'transpose',
    keywords: ['transpose', '转置'],
  },
  adj: {
    name: 'adj',
    latex: '\\operatorname{adj}',
    minArgs: 1,
    maxArgs: 1,
    category: 'matrix',
    label: 'adjugate',
    keywords: ['adjugate', 'adjoint', '伴随'],
  },
  rref: {
    name: 'rref',
    latex: '\\operatorname{rref}',
    minArgs: 1,
    maxArgs: 1,
    category: 'matrix',
    label: 'reduced row echelon form',
    keywords: ['rref', 'row reduce', '最简行阶梯'],
  },
};

/* ------------------------------------------------------------------ *
 * Nodes
 * ------------------------------------------------------------------ */

export type SymbolVariant = 'italic' | 'roman' | 'bold' | 'blackboard' | 'calligraphic' | 'sans';

export interface FormulaNodeBase {
  readonly id: FormulaNodeId;
  readonly kind: FormulaNodeKind;
  readonly category: SemanticCategory;
}

export interface FormulaSymbolNode extends FormulaNodeBase {
  readonly kind: 'symbol';
  readonly name: string;
  readonly variant: SymbolVariant;
}

export interface FormulaNumberNode extends FormulaNodeBase {
  readonly kind: 'number';
  readonly category: 'number';
  readonly value: string;
}

export interface FormulaOperatorNode extends FormulaNodeBase {
  readonly kind: 'operator';
  readonly op: OperatorSymbol;
  readonly fixity: OperatorFixity;
  readonly operands: readonly FormulaNode[];
}

export interface FormulaCallNode extends FormulaNodeBase {
  readonly kind: 'call';
  readonly name: CallSymbol;
  readonly args: readonly FormulaNode[];
}

export interface FormulaFractionNode extends FormulaNodeBase {
  readonly kind: 'fraction';
  readonly numerator: FormulaNode;
  readonly denominator: FormulaNode;
}

export interface FormulaScriptNode extends FormulaNodeBase {
  readonly kind: 'script';
  readonly base: FormulaNode;
  readonly sub?: FormulaNode;
  readonly sup?: FormulaNode;
}

export const MATRIX_DELIMITERS = ['bracket', 'paren', 'brace', 'bar', 'double-bar', 'none'] as const;

export type MatrixDelimiter = (typeof MATRIX_DELIMITERS)[number];

export interface FormulaMatrixNode extends FormulaNodeBase {
  readonly kind: 'matrix';
  readonly category: 'matrix';
  readonly rows: readonly (readonly FormulaNode[])[];
  readonly delimiters: MatrixDelimiter;
}

export const BINDER_KINDS = ['sum', 'int', 'lambda'] as const;

export type BinderKind = (typeof BINDER_KINDS)[number];

export interface BinderDomain {
  readonly lower?: FormulaNode;
  readonly upper?: FormulaNode;
  readonly over?: FormulaNode;
}

export interface FormulaBinderNode extends FormulaNodeBase {
  readonly kind: 'binder';
  readonly binder: BinderKind;
  readonly vars: readonly FormulaNode[];
  readonly body: FormulaNode;
  readonly domain?: BinderDomain;
}

export const SLOT_ROLES = [
  'operand',
  'argument',
  'numerator',
  'denominator',
  'base',
  'subscript',
  'superscript',
  'matrix-cell',
  'binder-variable',
  'binder-body',
  'binder-lower',
  'binder-upper',
  'binder-domain',
  'generic',
] as const;

export type SlotRole = (typeof SLOT_ROLES)[number];

export type SlotPolicy = 'replace' | 'insert' | 'wrap' | 'reject';

export interface FormulaSlotNode extends FormulaNodeBase {
  readonly kind: 'slot';
  readonly category: 'unknown';
  readonly role: SlotRole;
  readonly accepts: readonly SemanticCategory[];
  readonly required: boolean;
  readonly policy: SlotPolicy;
  readonly label?: string;
  readonly placeholder?: string;
}

export const REFERENCE_TARGETS = ['node', 'external'] as const;

export type ReferenceTarget = (typeof REFERENCE_TARGETS)[number];

export interface FormulaReferenceNode extends FormulaNodeBase {
  readonly kind: 'reference';
  readonly targetId: FormulaNodeId;
  readonly target: ReferenceTarget;
  readonly label: string;
}

export type FormulaNode =
  | FormulaSymbolNode
  | FormulaNumberNode
  | FormulaOperatorNode
  | FormulaCallNode
  | FormulaFractionNode
  | FormulaScriptNode
  | FormulaMatrixNode
  | FormulaBinderNode
  | FormulaSlotNode
  | FormulaReferenceNode;

/** Alias used by editor code that thinks in terms of expressions. */
export type FormulaExpr = FormulaNode;

export interface FormulaDocument {
  readonly schema: typeof FORMULA_DOCUMENT_SCHEMA;
  readonly version: typeof FORMULA_DOCUMENT_VERSION;
  readonly rootId: FormulaNodeId;
  readonly nodes: Readonly<Record<FormulaNodeId, FormulaNode>>;
}

/* ------------------------------------------------------------------ *
 * Flat JSON wire format
 * ------------------------------------------------------------------ */

export interface FormulaSymbolNodeJSON {
  readonly id: FormulaNodeId;
  readonly kind: 'symbol';
  readonly category: SemanticCategory;
  readonly name: string;
  readonly variant?: SymbolVariant;
}

export interface FormulaNumberNodeJSON {
  readonly id: FormulaNodeId;
  readonly kind: 'number';
  readonly category: 'number';
  readonly value: string;
}

export interface FormulaOperatorNodeJSON {
  readonly id: FormulaNodeId;
  readonly kind: 'operator';
  readonly category: SemanticCategory;
  readonly op: OperatorSymbol;
  readonly fixity: OperatorFixity;
  readonly operands: readonly FormulaNodeId[];
}

export interface FormulaCallNodeJSON {
  readonly id: FormulaNodeId;
  readonly kind: 'call';
  readonly category: SemanticCategory;
  readonly name: CallSymbol;
  readonly args: readonly FormulaNodeId[];
}

export interface FormulaFractionNodeJSON {
  readonly id: FormulaNodeId;
  readonly kind: 'fraction';
  readonly category: SemanticCategory;
  readonly numerator: FormulaNodeId;
  readonly denominator: FormulaNodeId;
}

export interface FormulaScriptNodeJSON {
  readonly id: FormulaNodeId;
  readonly kind: 'script';
  readonly category: SemanticCategory;
  readonly base: FormulaNodeId;
  readonly sub?: FormulaNodeId;
  readonly sup?: FormulaNodeId;
}

export interface FormulaMatrixNodeJSON {
  readonly id: FormulaNodeId;
  readonly kind: 'matrix';
  readonly category: 'matrix';
  readonly rows: readonly (readonly FormulaNodeId[])[];
  readonly delimiters: MatrixDelimiter;
}

export interface BinderDomainJSON {
  readonly lower?: FormulaNodeId;
  readonly upper?: FormulaNodeId;
  readonly over?: FormulaNodeId;
}

export interface FormulaBinderNodeJSON {
  readonly id: FormulaNodeId;
  readonly kind: 'binder';
  readonly category: SemanticCategory;
  readonly binder: BinderKind;
  readonly vars: readonly FormulaNodeId[];
  readonly body: FormulaNodeId;
  readonly domain?: BinderDomainJSON;
}

export interface FormulaSlotNodeJSON {
  readonly id: FormulaNodeId;
  readonly kind: 'slot';
  readonly category: 'unknown';
  readonly role: SlotRole;
  readonly accepts: readonly SemanticCategory[];
  readonly required: boolean;
  readonly policy: SlotPolicy;
  readonly label?: string;
  readonly placeholder?: string;
}

export interface FormulaReferenceNodeJSON {
  readonly id: FormulaNodeId;
  readonly kind: 'reference';
  readonly category: SemanticCategory;
  readonly targetId: FormulaNodeId;
  readonly target: ReferenceTarget;
  readonly label: string;
}

export type FormulaNodeJSON =
  | FormulaSymbolNodeJSON
  | FormulaNumberNodeJSON
  | FormulaOperatorNodeJSON
  | FormulaCallNodeJSON
  | FormulaFractionNodeJSON
  | FormulaScriptNodeJSON
  | FormulaMatrixNodeJSON
  | FormulaBinderNodeJSON
  | FormulaSlotNodeJSON
  | FormulaReferenceNodeJSON;

export interface FormulaDocumentJSON {
  readonly schema: typeof FORMULA_DOCUMENT_SCHEMA;
  readonly version: typeof FORMULA_DOCUMENT_VERSION;
  readonly rootId: FormulaNodeId;
  readonly nodes: Readonly<Record<FormulaNodeId, FormulaNodeJSON>>;
}

/* ------------------------------------------------------------------ *
 * Validation result and errors
 * ------------------------------------------------------------------ */

export interface FormulaValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type FormulaDocumentValidationResult =
  | { readonly ok: true; readonly document: FormulaDocument }
  | { readonly ok: false; readonly issues: readonly FormulaValidationIssue[] };

export class FormulaValidationError extends Error {
  readonly issues: readonly FormulaValidationIssue[];

  constructor(message: string, issues: readonly FormulaValidationIssue[]) {
    super(message);
    this.name = 'FormulaValidationError';
    this.issues = issues;
  }
}

/* ------------------------------------------------------------------ *
 * Small runtime guards
 * ------------------------------------------------------------------ */

const NODE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const SYMBOL_NAME_PATTERN = /^(?:[A-Za-z][A-Za-z0-9]{0,31}|[α-ωΑ-Ω])$/;
const NUMBER_LITERAL_PATTERN = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;
const DISPLAY_CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const MAX_DISPLAY_TEXT_LENGTH = 256;

export function isFormulaNodeId(value: unknown): value is FormulaNodeId {
  return typeof value === 'string' && NODE_ID_PATTERN.test(value);
}

export function isSemanticCategory(value: unknown): value is SemanticCategory {
  return (
    typeof value === 'string' &&
    (SEMANTIC_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isFormulaNodeKind(value: unknown): value is FormulaNodeKind {
  return (
    typeof value === 'string' &&
    (FORMULA_NODE_KINDS as readonly string[]).includes(value)
  );
}

export function isOperatorSymbol(value: unknown): value is OperatorSymbol {
  return (
    typeof value === 'string' &&
    (OPERATOR_SYMBOLS as readonly string[]).includes(value)
  );
}

export function isCallSymbol(value: unknown): value is CallSymbol {
  return (
    typeof value === 'string' &&
    (CALL_SYMBOLS as readonly string[]).includes(value)
  );
}

export function isSymbolVariant(value: unknown): value is SymbolVariant {
  return (
    value === 'italic' ||
    value === 'roman' ||
    value === 'bold' ||
    value === 'blackboard' ||
    value === 'calligraphic' ||
    value === 'sans'
  );
}

export function isMatrixDelimiter(value: unknown): value is MatrixDelimiter {
  return (
    typeof value === 'string' &&
    (MATRIX_DELIMITERS as readonly string[]).includes(value)
  );
}

export function isBinderKind(value: unknown): value is BinderKind {
  return (
    typeof value === 'string' &&
    (BINDER_KINDS as readonly string[]).includes(value)
  );
}

export function isSlotRole(value: unknown): value is SlotRole {
  return (
    typeof value === 'string' &&
    (SLOT_ROLES as readonly string[]).includes(value)
  );
}

export function isSlotPolicy(value: unknown): value is SlotPolicy {
  return value === 'replace' || value === 'insert' || value === 'wrap' || value === 'reject';
}

export function isReferenceTarget(value: unknown): value is ReferenceTarget {
  return value === 'node' || value === 'external';
}

export function isOperatorFixity(value: unknown): value is OperatorFixity {
  return value === 'prefix' || value === 'infix' || value === 'postfix';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSlotNode(value: FormulaNode | null | undefined): value is FormulaSlotNode {
  return value !== null && value !== undefined && value.kind === 'slot';
}

/**
 * A shallow structural guard. Use `parseFormulaDocumentJSON` for full,
 * recursive document validation.
 */
export function isFormulaNode(value: unknown): value is FormulaNode {
  if (!isRecord(value)) return false;
  if (!isFormulaNodeId(value.id)) return false;
  if (!isFormulaNodeKind(value.kind)) return false;
  if (!isSemanticCategory(value.category)) return false;

  switch (value.kind) {
    case 'symbol':
      return typeof value.name === 'string' && isSymbolVariant(value.variant);
    case 'number':
      return typeof value.value === 'string';
    case 'operator':
      return (
        isOperatorSymbol(value.op) &&
        isOperatorFixity(value.fixity) &&
        Array.isArray(value.operands)
      );
    case 'call':
      return isCallSymbol(value.name) && Array.isArray(value.args);
    case 'fraction':
      return isRecord(value.numerator) && isRecord(value.denominator);
    case 'script':
      return (
        isRecord(value.base) &&
        (isRecord(value.sub) || isRecord(value.sup)) &&
        (value.sub === undefined || isRecord(value.sub)) &&
        (value.sup === undefined || isRecord(value.sup))
      );
    case 'matrix':
      return (
        Array.isArray(value.rows) &&
        value.rows.every(
          (row) => Array.isArray(row) && row.every((cell) => isRecord(cell)),
        )
      );
    case 'binder':
      return (
        isBinderKind(value.binder) &&
        Array.isArray(value.vars) &&
        isRecord(value.body)
      );
    case 'slot':
      return (
        isSlotRole(value.role) &&
        Array.isArray(value.accepts) &&
        typeof value.required === 'boolean' &&
        isSlotPolicy(value.policy)
      );
    case 'reference':
      return (
        isFormulaNodeId(value.targetId) &&
        isReferenceTarget(value.target) &&
        typeof value.label === 'string'
      );
    default:
      return false;
  }
}

export function isFormulaDocument(value: unknown): value is FormulaDocument {
  return (
    isRecord(value) &&
    value.schema === FORMULA_DOCUMENT_SCHEMA &&
    value.version === FORMULA_DOCUMENT_VERSION &&
    isFormulaNodeId(value.rootId) &&
    isRecord(value.nodes)
  );
}

/* ------------------------------------------------------------------ *
 * Ids and display text
 * ------------------------------------------------------------------ */

let nodeIdSequence = 0;

export function createFormulaNodeId(prefix = 'node'): FormulaNodeId {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(prefix)) {
    throw new Error(`Invalid formula id prefix "${prefix}"`);
  }
  nodeIdSequence += 1;
  return `${prefix}_${nodeIdSequence.toString(36)}`;
}

function assertNodeId(id: FormulaNodeId, field: string): void {
  if (!isFormulaNodeId(id)) {
    throw new Error(`Invalid formula node id for ${field}: "${id}"`);
  }
}

function assertCategory(category: SemanticCategory): void {
  if (!isSemanticCategory(category)) {
    throw new Error(`Invalid semantic category "${String(category)}"`);
  }
}

function assertDisplayText(value: string, field: string, allowEmpty = false): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!allowEmpty && trimmed.length === 0) {
    throw new Error(`${field} must not be empty`);
  }
  if (trimmed.length > MAX_DISPLAY_TEXT_LENGTH) {
    throw new Error(`${field} is longer than ${MAX_DISPLAY_TEXT_LENGTH} characters`);
  }
  if (DISPLAY_CONTROL_PATTERN.test(trimmed)) {
    throw new Error(`${field} must not contain control characters`);
  }
  return trimmed;
}

function assertFormulaChild(value: FormulaNode, field: string): void {
  if (!isFormulaNode(value)) {
    throw new Error(`${field} must be a formula node`);
  }
}

function assertCategoryList(
  accepts: readonly SemanticCategory[],
  field: string,
): readonly SemanticCategory[] {
  if (!Array.isArray(accepts) || accepts.length === 0) {
    throw new Error(`${field} must contain at least one semantic category`);
  }
  const seen = new Set<SemanticCategory>();
  for (const category of accepts) {
    assertCategory(category);
    if (seen.has(category)) {
      throw new Error(`${field} contains duplicate category "${category}"`);
    }
    seen.add(category);
  }
  return [...accepts];
}

function assertBinderDomain(domain: BinderDomain | undefined): BinderDomain | undefined {
  if (domain === undefined) return undefined;
  if (
    domain.lower === undefined &&
    domain.upper === undefined &&
    domain.over === undefined
  ) {
    throw new Error('A binder domain must have a lower bound, an upper bound, or an over-set');
  }
  if (domain.lower !== undefined) assertFormulaChild(domain.lower, 'domain.lower');
  if (domain.upper !== undefined) assertFormulaChild(domain.upper, 'domain.upper');
  if (domain.over !== undefined) assertFormulaChild(domain.over, 'domain.over');
  return {
    ...(domain.lower !== undefined ? { lower: domain.lower } : {}),
    ...(domain.upper !== undefined ? { upper: domain.upper } : {}),
    ...(domain.over !== undefined ? { over: domain.over } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Typed slot registry
 * ------------------------------------------------------------------ */

export const ACCEPTS_ANY: readonly SemanticCategory[] = SEMANTIC_CATEGORIES;

const ACCEPTS_SCALARISH: readonly SemanticCategory[] = [
  'scalar',
  'number',
  'unit',
  'unknown',
];

const ACCEPTS_INDEXISH: readonly SemanticCategory[] = [
  'index',
  'scalar',
  'number',
  'unknown',
];

const ACCEPTS_EXPRESSION: readonly SemanticCategory[] = [
  'scalar',
  'matrix',
  'tensor',
  'number',
  'unit',
  'function',
  'operator',
  'index',
  'bound',
  'unknown',
];

const ACCEPTS_FRACTION_PART: readonly SemanticCategory[] = [
  'scalar',
  'matrix',
  'tensor',
  'number',
  'unit',
  'unknown',
];

const ACCEPTS_MATRIX_CELL: readonly SemanticCategory[] = [
  'scalar',
  'matrix',
  'tensor',
  'number',
  'unit',
  'unknown',
];

const ACCEPTS_POWER: readonly SemanticCategory[] = [
  'scalar',
  'matrix',
  'tensor',
  'number',
  'index',
  'unknown',
];

export type FormulaSlotKey =
  | 'operands[]'
  | 'args[]'
  | 'numerator'
  | 'denominator'
  | 'base'
  | 'sub'
  | 'sup'
  | 'rows[][]'
  | 'vars[]'
  | 'body'
  | 'domain.lower'
  | 'domain.upper'
  | 'domain.over';

export interface FormulaSlotRegistryEntry {
  /** Stable key. Array positions use a `[]` suffix. */
  readonly key: FormulaSlotKey;
  /** Path template, e.g. `operands[]` becomes `operands[0]` at runtime. */
  readonly path: string;
  readonly role: SlotRole;
  readonly accepts: readonly SemanticCategory[];
  readonly required: boolean;
  readonly policy: SlotPolicy;
}

function slotEntry(
  key: FormulaSlotKey,
  role: SlotRole,
  accepts: readonly SemanticCategory[],
  required: boolean,
  policy: SlotPolicy,
): FormulaSlotRegistryEntry {
  return { key, path: key, role, accepts, required, policy };
}

/**
 * The static contract for every editable position a node kind can expose.
 * Dynamic positions are expanded by `listNodeSlots`.
 */
export const FORMULA_SLOT_REGISTRY: Readonly<
  Record<FormulaNodeKind, readonly FormulaSlotRegistryEntry[]>
> = {
  symbol: [],
  number: [],
  operator: [slotEntry('operands[]', 'operand', ACCEPTS_EXPRESSION, true, 'replace')],
  call: [slotEntry('args[]', 'argument', ACCEPTS_EXPRESSION, true, 'replace')],
  fraction: [
    slotEntry('numerator', 'numerator', ACCEPTS_FRACTION_PART, true, 'replace'),
    slotEntry('denominator', 'denominator', ACCEPTS_FRACTION_PART, true, 'replace'),
  ],
  script: [
    slotEntry('base', 'base', ACCEPTS_ANY, true, 'replace'),
    slotEntry('sub', 'subscript', ACCEPTS_INDEXISH, false, 'insert'),
    slotEntry('sup', 'superscript', ACCEPTS_POWER, false, 'insert'),
  ],
  matrix: [slotEntry('rows[][]', 'matrix-cell', ACCEPTS_MATRIX_CELL, true, 'replace')],
  binder: [
    slotEntry('vars[]', 'binder-variable', ACCEPTS_INDEXISH, true, 'insert'),
    slotEntry('body', 'binder-body', ACCEPTS_ANY, true, 'replace'),
    slotEntry('domain.lower', 'binder-lower', ACCEPTS_INDEXISH, false, 'insert'),
    slotEntry('domain.upper', 'binder-upper', ACCEPTS_SCALARISH, false, 'insert'),
    slotEntry('domain.over', 'binder-domain', ACCEPTS_EXPRESSION, false, 'insert'),
  ],
  slot: [],
  reference: [],
};

/** Alias for consumers that prefer a shorter name. */
export const SLOT_REGISTRY = FORMULA_SLOT_REGISTRY;

export function getFormulaSlotRegistry(
  kind: FormulaNodeKind,
): readonly FormulaSlotRegistryEntry[] {
  return FORMULA_SLOT_REGISTRY[kind];
}

export interface SlotRoleDefaults {
  readonly accepts: readonly SemanticCategory[];
  readonly policy: SlotPolicy;
  readonly required: boolean;
}

export const SLOT_ROLE_DEFAULTS: Readonly<Record<SlotRole, SlotRoleDefaults>> = {
  operand: { accepts: ACCEPTS_EXPRESSION, policy: 'replace', required: true },
  argument: { accepts: ACCEPTS_EXPRESSION, policy: 'replace', required: true },
  numerator: { accepts: ACCEPTS_FRACTION_PART, policy: 'replace', required: true },
  denominator: { accepts: ACCEPTS_FRACTION_PART, policy: 'replace', required: true },
  base: { accepts: ACCEPTS_ANY, policy: 'replace', required: true },
  subscript: { accepts: ACCEPTS_INDEXISH, policy: 'insert', required: false },
  superscript: { accepts: ACCEPTS_POWER, policy: 'insert', required: false },
  'matrix-cell': { accepts: ACCEPTS_MATRIX_CELL, policy: 'replace', required: true },
  'binder-variable': { accepts: ACCEPTS_INDEXISH, policy: 'insert', required: true },
  'binder-body': { accepts: ACCEPTS_ANY, policy: 'replace', required: true },
  'binder-lower': { accepts: ACCEPTS_INDEXISH, policy: 'insert', required: false },
  'binder-upper': { accepts: ACCEPTS_SCALARISH, policy: 'insert', required: false },
  'binder-domain': { accepts: ACCEPTS_EXPRESSION, policy: 'insert', required: false },
  generic: { accepts: ACCEPTS_ANY, policy: 'replace', required: false },
};

/* ------------------------------------------------------------------ *
 * Constructors
 * ------------------------------------------------------------------ */

export interface SymbolNodeOptions {
  readonly id?: FormulaNodeId;
  readonly category?: SemanticCategory;
  readonly variant?: SymbolVariant;
}

export function symbolNode(name: string, options: SymbolNodeOptions = {}): FormulaSymbolNode {
  if (typeof name !== 'string' || !SYMBOL_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid symbol name "${String(name)}". Use a Latin/Greek identifier without LaTeX syntax.`,
    );
  }
  const category = options.category ?? 'unknown';
  assertCategory(category);
  const variant = options.variant ?? 'italic';
  if (!isSymbolVariant(variant)) throw new Error(`Invalid symbol variant "${String(variant)}"`);
  const id = options.id ?? createFormulaNodeId('sym');
  assertNodeId(id, 'symbol.id');
  return { id, kind: 'symbol', category, name, variant };
}

export interface NumberNodeOptions {
  readonly id?: FormulaNodeId;
}

export function numberNode(
  value: string | number,
  options: NumberNodeOptions = {},
): FormulaNumberNode {
  let literal: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('A number node must be finite');
    literal = Object.is(value, -0) ? '-0' : String(value);
  } else {
    literal = value.trim();
  }
  if (!NUMBER_LITERAL_PATTERN.test(literal)) {
    throw new Error(`Invalid number literal "${literal}"`);
  }
  const id = options.id ?? createFormulaNodeId('num');
  assertNodeId(id, 'number.id');
  return { id, kind: 'number', category: 'number', value: literal };
}

export interface OperatorNodeOptions {
  readonly id?: FormulaNodeId;
  readonly category?: SemanticCategory;
}

const SCALAR_LIKE_CATEGORIES: readonly SemanticCategory[] = ['scalar', 'number', 'unit'];

function combineCategories(categories: readonly SemanticCategory[]): SemanticCategory {
  const meaningful = categories.filter((category) => category !== 'unknown');
  if (meaningful.length === 0) return 'unknown';
  const first = meaningful[0];
  if (first === undefined) return 'unknown';
  if (meaningful.every((category) => category === first)) return first;
  if (meaningful.every((category) => SCALAR_LIKE_CATEGORIES.includes(category))) {
    return 'scalar';
  }
  return 'unknown';
}

export function inferOperatorCategory(
  op: OperatorSymbol,
  operands: readonly FormulaNode[],
): SemanticCategory {
  if (op === 'transpose' || op === 'inverse') {
    return operands[0]?.category ?? 'unknown';
  }
  return combineCategories(operands.map((operand) => operand.category));
}

export function operatorNode(
  op: OperatorSymbol,
  operands: readonly FormulaNode[],
  options: OperatorNodeOptions = {},
): FormulaOperatorNode {
  if (!isOperatorSymbol(op)) throw new Error(`Unknown operator "${String(op)}"`);
  const definition = OPERATOR_DEFINITIONS[op];
  if (operands.length !== definition.arity) {
    throw new Error(
      `Operator "${op}" expects ${definition.arity} operand(s), received ${operands.length}`,
    );
  }
  operands.forEach((operand, index) => assertFormulaChild(operand, `operator operands[${index}]`));
  const category = options.category ?? inferOperatorCategory(op, operands);
  assertCategory(category);
  const id = options.id ?? createFormulaNodeId('op');
  assertNodeId(id, 'operator.id');
  return {
    id,
    kind: 'operator',
    category,
    op,
    fixity: definition.fixity,
    operands: [...operands],
  };
}

export interface CallNodeOptions {
  readonly id?: FormulaNodeId;
  readonly category?: SemanticCategory;
}

export function callNode(
  name: CallSymbol,
  args: readonly FormulaNode[],
  options: CallNodeOptions = {},
): FormulaCallNode {
  if (!isCallSymbol(name)) throw new Error(`Unknown function "${String(name)}"`);
  const definition = CALL_DEFINITIONS[name];
  if (args.length < definition.minArgs || args.length > definition.maxArgs) {
    throw new Error(
      `Function "${name}" expects between ${definition.minArgs} and ${definition.maxArgs} argument(s), received ${args.length}`,
    );
  }
  args.forEach((arg, index) => assertFormulaChild(arg, `call args[${index}]`));
  const category = options.category ?? definition.category;
  assertCategory(category);
  const id = options.id ?? createFormulaNodeId('call');
  assertNodeId(id, 'call.id');
  return { id, kind: 'call', category, name, args: [...args] };
}

export interface FractionNodeOptions {
  readonly id?: FormulaNodeId;
  readonly category?: SemanticCategory;
}

export function inferFractionCategory(
  numerator: FormulaNode,
  denominator: FormulaNode,
): SemanticCategory {
  if (numerator.category === 'number' && denominator.category === 'number') return 'number';
  if (
    SCALAR_LIKE_CATEGORIES.includes(numerator.category) &&
    SCALAR_LIKE_CATEGORIES.includes(denominator.category)
  ) {
    return 'scalar';
  }
  return 'unknown';
}

export function fractionNode(
  numerator: FormulaNode,
  denominator: FormulaNode,
  options: FractionNodeOptions = {},
): FormulaFractionNode {
  assertFormulaChild(numerator, 'fraction numerator');
  assertFormulaChild(denominator, 'fraction denominator');
  const category = options.category ?? inferFractionCategory(numerator, denominator);
  assertCategory(category);
  const id = options.id ?? createFormulaNodeId('frac');
  assertNodeId(id, 'fraction.id');
  return { id, kind: 'fraction', category, numerator, denominator };
}

export interface ScriptNodeOptions {
  readonly id?: FormulaNodeId;
  readonly category?: SemanticCategory;
  readonly sub?: FormulaNode;
  readonly sup?: FormulaNode;
}

export function scriptNode(
  base: FormulaNode,
  options: ScriptNodeOptions = {},
): FormulaScriptNode {
  assertFormulaChild(base, 'script base');
  if (options.sub === undefined && options.sup === undefined) {
    throw new Error('A script node needs a subscript or a superscript');
  }
  if (options.sub !== undefined) assertFormulaChild(options.sub, 'script sub');
  if (options.sup !== undefined) assertFormulaChild(options.sup, 'script sup');
  const category = options.category ?? base.category;
  assertCategory(category);
  const id = options.id ?? createFormulaNodeId('script');
  assertNodeId(id, 'script.id');
  return {
    id,
    kind: 'script',
    category,
    base,
    ...(options.sub !== undefined ? { sub: options.sub } : {}),
    ...(options.sup !== undefined ? { sup: options.sup } : {}),
  };
}

export interface MatrixNodeOptions {
  readonly id?: FormulaNodeId;
  readonly delimiters?: MatrixDelimiter;
}

export function matrixNode(
  rows: readonly (readonly FormulaNode[])[],
  options: MatrixNodeOptions = {},
): FormulaMatrixNode {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('A matrix node needs at least one row');
  }
  const width = rows[0]?.length ?? 0;
  if (width === 0) throw new Error('A matrix row needs at least one cell');
  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error(
        `Matrix row ${rowIndex} has ${row.length} cell(s); expected ${width} (rectangular)`,
      );
    }
    row.forEach((cell, columnIndex) =>
      assertFormulaChild(cell, `matrix cell [${rowIndex}][${columnIndex}]`),
    );
  });
  const delimiters = options.delimiters ?? 'bracket';
  if (!isMatrixDelimiter(delimiters)) {
    throw new Error(`Invalid matrix delimiter "${String(delimiters)}"`);
  }
  const id = options.id ?? createFormulaNodeId('mat');
  assertNodeId(id, 'matrix.id');
  return {
    id,
    kind: 'matrix',
    category: 'matrix',
    rows: rows.map((row) => [...row]),
    delimiters,
  };
}

export interface BinderNodeOptions {
  readonly id?: FormulaNodeId;
  readonly category?: SemanticCategory;
  readonly domain?: BinderDomain;
}

export function binderNode(
  binder: BinderKind,
  vars: readonly FormulaNode[],
  body: FormulaNode,
  options: BinderNodeOptions = {},
): FormulaBinderNode {
  if (!isBinderKind(binder)) throw new Error(`Unknown binder "${String(binder)}"`);
  if (!Array.isArray(vars) || vars.length === 0) {
    throw new Error('A binder needs at least one variable');
  }
  vars.forEach((variable, index) => assertFormulaChild(variable, `binder vars[${index}]`));
  assertFormulaChild(body, 'binder body');
  const domain = assertBinderDomain(options.domain);
  const defaultCategory: SemanticCategory = binder === 'lambda' ? 'function' : 'bound';
  const category = options.category ?? defaultCategory;
  assertCategory(category);
  const id = options.id ?? createFormulaNodeId('binder');
  assertNodeId(id, 'binder.id');
  return {
    id,
    kind: 'binder',
    category,
    binder,
    vars: [...vars],
    body,
    ...(domain !== undefined ? { domain } : {}),
  };
}

export interface SlotNodeOptions {
  readonly id?: FormulaNodeId;
  readonly accepts?: readonly SemanticCategory[];
  readonly policy?: SlotPolicy;
  readonly required?: boolean;
  readonly label?: string;
  readonly placeholder?: string;
}

export function slotNode(role: SlotRole, options: SlotNodeOptions = {}): FormulaSlotNode {
  if (!isSlotRole(role)) throw new Error(`Unknown slot role "${String(role)}"`);
  const defaults = SLOT_ROLE_DEFAULTS[role];
  const accepts = assertCategoryList(options.accepts ?? defaults.accepts, 'slot.accepts');
  const policy = options.policy ?? defaults.policy;
  if (!isSlotPolicy(policy)) throw new Error(`Invalid slot policy "${String(policy)}"`);
  const required = options.required ?? defaults.required;
  if (typeof required !== 'boolean') throw new Error('slot.required must be a boolean');
  const label =
    options.label === undefined ? undefined : assertDisplayText(options.label, 'slot.label');
  const placeholder =
    options.placeholder === undefined
      ? undefined
      : assertDisplayText(options.placeholder, 'slot.placeholder');
  const id = options.id ?? createFormulaNodeId('slot');
  assertNodeId(id, 'slot.id');
  return {
    id,
    kind: 'slot',
    category: 'unknown',
    role,
    accepts,
    required,
    policy,
    ...(label !== undefined ? { label } : {}),
    ...(placeholder !== undefined ? { placeholder } : {}),
  };
}

export interface ReferenceNodeOptions {
  readonly id?: FormulaNodeId;
  readonly category?: SemanticCategory;
  readonly target?: ReferenceTarget;
  readonly label?: string;
}

export function referenceNode(
  targetId: FormulaNodeId,
  options: ReferenceNodeOptions = {},
): FormulaReferenceNode {
  assertNodeId(targetId, 'reference.targetId');
  const target = options.target ?? 'external';
  if (!isReferenceTarget(target)) {
    throw new Error(`Invalid reference target "${String(target)}"`);
  }
  const label = assertDisplayText(options.label ?? targetId, 'reference.label');
  const category = options.category ?? 'unknown';
  assertCategory(category);
  const id = options.id ?? createFormulaNodeId('ref');
  assertNodeId(id, 'reference.id');
  return { id, kind: 'reference', category, targetId, target, label };
}

/* ------------------------------------------------------------------ *
 * Generic traversal
 * ------------------------------------------------------------------ */

export function getFormulaChildEntries(
  node: FormulaNode,
): readonly FormulaChildEntry[] {
  switch (node.kind) {
    case 'symbol':
    case 'number':
    case 'slot':
    case 'reference':
      return [];
    case 'operator':
      return node.operands.map((child, index) => ({
        path: `operands[${index}]`,
        role: 'operand',
        node: child,
      }));
    case 'call':
      return node.args.map((child, index) => ({
        path: `args[${index}]`,
        role: 'argument',
        node: child,
      }));
    case 'fraction':
      return [
        { path: 'numerator', role: 'numerator', node: node.numerator },
        { path: 'denominator', role: 'denominator', node: node.denominator },
      ];
    case 'script':
      return [
        { path: 'base', role: 'base', node: node.base },
        ...(node.sub !== undefined
          ? [{ path: 'sub', role: 'subscript' as const, node: node.sub }]
          : []),
        ...(node.sup !== undefined
          ? [{ path: 'sup', role: 'superscript' as const, node: node.sup }]
          : []),
      ];
    case 'matrix': {
      const entries: FormulaChildEntry[] = [];
      node.rows.forEach((row, rowIndex) => {
        row.forEach((cell, columnIndex) => {
          entries.push({
            path: `rows[${rowIndex}][${columnIndex}]`,
            role: 'matrix-cell',
            node: cell,
          });
        });
      });
      return entries;
    }
    case 'binder':
      return [
        ...node.vars.map((variable, index) => ({
          path: `vars[${index}]`,
          role: 'binder-variable' as const,
          node: variable,
        })),
        { path: 'body', role: 'binder-body', node: node.body },
        ...(node.domain?.lower !== undefined
          ? [{ path: 'domain.lower', role: 'binder-lower' as const, node: node.domain.lower }]
          : []),
        ...(node.domain?.upper !== undefined
          ? [{ path: 'domain.upper', role: 'binder-upper' as const, node: node.domain.upper }]
          : []),
        ...(node.domain?.over !== undefined
          ? [{ path: 'domain.over', role: 'binder-domain' as const, node: node.domain.over }]
          : []),
      ];
    default:
      return [];
  }
}

export interface FormulaChildEntry {
  /** Concrete child path, e.g. `operands[1]` or `domain.lower`. */
  readonly path: string;
  readonly role: SlotRole;
  readonly node: FormulaNode;
}

export interface FormulaVisitContext {
  readonly parent: FormulaNode | null;
  /** Child path relative to the parent, or null for the root. */
  readonly key: string | null;
  readonly path: string;
  readonly depth: number;
  readonly role: SlotRole | null;
}

export type FormulaVisitor = (node: FormulaNode, context: FormulaVisitContext) => void | boolean;

export function getFormulaRoot(input: FormulaNode | FormulaDocument): FormulaNode {
  if (!isFormulaDocument(input)) return input;
  const root = input.nodes[input.rootId];
  if (root === undefined) {
    throw new Error(`Formula document root "${input.rootId}" is missing from the node map`);
  }
  return root;
}

function joinVisitPath(parentPath: string, childPath: string): string {
  return parentPath === '$' ? `$.${childPath}` : `${parentPath}.${childPath}`;
}

/**
 * Pre-order traversal. Returning `false` from the visitor skips that node's
 * children. Shared subtrees may be visited more than once; cycles are skipped.
 */
export function visitFormula(
  input: FormulaNode | FormulaDocument,
  visitor: FormulaVisitor,
): void {
  const root = getFormulaRoot(input);
  const active = new Set<FormulaNode>();

  const visit = (node: FormulaNode, context: FormulaVisitContext): void => {
    if (active.has(node)) return;
    const shouldDescend = visitor(node, context);
    if (shouldDescend === false) return;
    active.add(node);
    for (const entry of getFormulaChildEntries(node)) {
      visit(entry.node, {
        parent: node,
        key: entry.path,
        path: joinVisitPath(context.path, entry.path),
        depth: context.depth + 1,
        role: entry.role,
      });
    }
    active.delete(node);
  };

  visit(root, { parent: null, key: null, path: '$', depth: 0, role: null });
}

/** Alias for `visitFormula`, provided for callers that prefer "walk". */
export const walkFormula = visitFormula;

/* ------------------------------------------------------------------ *
 * Slot enumeration
 * ------------------------------------------------------------------ */

export interface FormulaNodeSlot {
  readonly nodeId: FormulaNodeId;
  readonly nodeKind: FormulaNodeKind;
  readonly key: FormulaSlotKey;
  /** Concrete path, e.g. `rows[0][1]`. */
  readonly path: string;
  readonly role: SlotRole;
  readonly accepts: readonly SemanticCategory[];
  readonly required: boolean;
  readonly policy: SlotPolicy;
  readonly occupied: boolean;
  readonly child?: FormulaNode;
  readonly childIsSlot: boolean;
}

function childByStaticPath(node: FormulaNode, path: string): FormulaNode | undefined {
  switch (node.kind) {
    case 'fraction':
      if (path === 'numerator') return node.numerator;
      if (path === 'denominator') return node.denominator;
      return undefined;
    case 'script':
      if (path === 'base') return node.base;
      if (path === 'sub') return node.sub;
      if (path === 'sup') return node.sup;
      return undefined;
    case 'binder':
      if (path === 'body') return node.body;
      if (path === 'domain.lower') return node.domain?.lower;
      if (path === 'domain.upper') return node.domain?.upper;
      if (path === 'domain.over') return node.domain?.over;
      return undefined;
    default:
      return undefined;
  }
}

function expandRegistryEntry(
  node: FormulaNode,
  entry: FormulaSlotRegistryEntry,
): readonly { readonly path: string; readonly child?: FormulaNode }[] {
  switch (entry.key) {
    case 'operands[]':
      return node.kind === 'operator'
        ? node.operands.map((child, index) => ({ path: `operands[${index}]`, child }))
        : [];
    case 'args[]':
      return node.kind === 'call'
        ? node.args.map((child, index) => ({ path: `args[${index}]`, child }))
        : [];
    case 'vars[]':
      return node.kind === 'binder'
        ? node.vars.map((child, index) => ({ path: `vars[${index}]`, child }))
        : [];
    case 'rows[][]': {
      if (node.kind !== 'matrix') return [];
      const result: { path: string; child: FormulaNode }[] = [];
      node.rows.forEach((row, rowIndex) => {
        row.forEach((child, columnIndex) => {
          result.push({ path: `rows[${rowIndex}][${columnIndex}]`, child });
        });
      });
      return result;
    }
    default:
      return [{ path: entry.path, child: childByStaticPath(node, entry.path) }];
  }
}

/**
 * Enumerate editable structural positions for a single node. Optional
 * positions that are currently empty are included with `occupied: false`.
 */
export function listNodeSlots(node: FormulaNode): readonly FormulaNodeSlot[] {
  const slots: FormulaNodeSlot[] = [];
  for (const entry of FORMULA_SLOT_REGISTRY[node.kind]) {
    const positions = expandRegistryEntry(node, entry);
    if (positions.length === 0) continue;
    for (const position of positions) {
      const child = position.child;
      const isSlot = isSlotNode(child);
      slots.push({
        nodeId: node.id,
        nodeKind: node.kind,
        key: entry.key,
        path: position.path,
        role: entry.role,
        accepts: entry.accepts,
        required: entry.required,
        policy: entry.policy,
        occupied: child !== undefined,
        ...(child !== undefined ? { child } : {}),
        childIsSlot: isSlot,
      });
    }
  }
  return slots;
}

export function listDocumentSlots(document: FormulaDocument): readonly FormulaNodeSlot[] {
  const result: FormulaNodeSlot[] = [];
  const visited = new Set<FormulaNodeId>();
  const walk = (node: FormulaNode): void => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    result.push(...listNodeSlots(node));
    for (const entry of getFormulaChildEntries(node)) walk(entry.node);
  };
  walk(getFormulaRoot(document));
  return result;
}

/* ------------------------------------------------------------------ *
 * Document construction
 * ------------------------------------------------------------------ */

export function createFormulaDocument(root: FormulaNode): FormulaDocument {
  assertFormulaChild(root, 'document root');
  const nodes = new Map<FormulaNodeId, FormulaNode>();
  const active = new Set<FormulaNode>();

  const collect = (node: FormulaNode): void => {
    if (active.has(node)) {
      throw new Error(`Cycle detected in formula node graph at "${node.id}"`);
    }
    const existing = nodes.get(node.id);
    if (existing !== undefined) {
      if (existing !== node) {
        throw new Error(`Duplicate formula node id "${node.id}"`);
      }
      return;
    }
    active.add(node);
    nodes.set(node.id, node);
    for (const entry of getFormulaChildEntries(node)) collect(entry.node);
    active.delete(node);
  };

  collect(root);

  for (const node of nodes.values()) {
    if (node.kind === 'reference' && node.target === 'node' && !nodes.has(node.targetId)) {
      throw new Error(
        `Reference "${node.id}" points at missing document node "${node.targetId}"`,
      );
    }
  }

  const record: Record<FormulaNodeId, FormulaNode> = {};
  for (const [id, node] of nodes) record[id] = node;

  return {
    schema: FORMULA_DOCUMENT_SCHEMA,
    version: FORMULA_DOCUMENT_VERSION,
    rootId: root.id,
    nodes: record,
  };
}

/* ------------------------------------------------------------------ *
 * Flat JSON serialization
 * ------------------------------------------------------------------ */

function childIdForJSON(
  child: FormulaNode,
  nodes: Readonly<Record<FormulaNodeId, FormulaNode>>,
): FormulaNodeId {
  if (!isFormulaNode(child)) throw new Error('Cannot serialize an invalid child node');
  if (nodes[child.id] === undefined) {
    throw new Error(`Child node "${child.id}" is not present in the document node map`);
  }
  return child.id;
}

function formulaNodeToJSON(
  node: FormulaNode,
  nodes: Readonly<Record<FormulaNodeId, FormulaNode>>,
): FormulaNodeJSON {
  switch (node.kind) {
    case 'symbol':
      return {
        id: node.id,
        kind: 'symbol',
        category: node.category,
        name: node.name,
        variant: node.variant,
      };
    case 'number':
      return { id: node.id, kind: 'number', category: 'number', value: node.value };
    case 'operator':
      return {
        id: node.id,
        kind: 'operator',
        category: node.category,
        op: node.op,
        fixity: node.fixity,
        operands: node.operands.map((child) => childIdForJSON(child, nodes)),
      };
    case 'call':
      return {
        id: node.id,
        kind: 'call',
        category: node.category,
        name: node.name,
        args: node.args.map((child) => childIdForJSON(child, nodes)),
      };
    case 'fraction':
      return {
        id: node.id,
        kind: 'fraction',
        category: node.category,
        numerator: childIdForJSON(node.numerator, nodes),
        denominator: childIdForJSON(node.denominator, nodes),
      };
    case 'script':
      return {
        id: node.id,
        kind: 'script',
        category: node.category,
        base: childIdForJSON(node.base, nodes),
        ...(node.sub !== undefined ? { sub: childIdForJSON(node.sub, nodes) } : {}),
        ...(node.sup !== undefined ? { sup: childIdForJSON(node.sup, nodes) } : {}),
      };
    case 'matrix':
      return {
        id: node.id,
        kind: 'matrix',
        category: 'matrix',
        rows: node.rows.map((row) => row.map((child) => childIdForJSON(child, nodes))),
        delimiters: node.delimiters,
      };
    case 'binder':
      return {
        id: node.id,
        kind: 'binder',
        category: node.category,
        binder: node.binder,
        vars: node.vars.map((child) => childIdForJSON(child, nodes)),
        body: childIdForJSON(node.body, nodes),
        ...(node.domain !== undefined
          ? {
              domain: {
                ...(node.domain.lower !== undefined
                  ? { lower: childIdForJSON(node.domain.lower, nodes) }
                  : {}),
                ...(node.domain.upper !== undefined
                  ? { upper: childIdForJSON(node.domain.upper, nodes) }
                  : {}),
                ...(node.domain.over !== undefined
                  ? { over: childIdForJSON(node.domain.over, nodes) }
                  : {}),
              },
            }
          : {}),
      };
    case 'slot':
      return {
        id: node.id,
        kind: 'slot',
        category: 'unknown',
        role: node.role,
        accepts: [...node.accepts],
        required: node.required,
        policy: node.policy,
        ...(node.label !== undefined ? { label: node.label } : {}),
        ...(node.placeholder !== undefined ? { placeholder: node.placeholder } : {}),
      };
    case 'reference':
      return {
        id: node.id,
        kind: 'reference',
        category: node.category,
        targetId: node.targetId,
        target: node.target,
        label: node.label,
      };
    default:
      return assertNever(node);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled formula node kind: ${String(value)}`);
}

export function formulaDocumentToJSON(document: FormulaDocument): FormulaDocumentJSON {
  if (document.schema !== FORMULA_DOCUMENT_SCHEMA) {
    throw new Error(`Unsupported formula document schema "${String(document.schema)}"`);
  }
  if (document.version !== FORMULA_DOCUMENT_VERSION) {
    throw new Error(`Unsupported formula document version "${String(document.version)}"`);
  }
  if (document.nodes[document.rootId] === undefined) {
    throw new Error(`Formula document root "${document.rootId}" is missing`);
  }

  const nodes: Record<FormulaNodeId, FormulaNodeJSON> = {};
  for (const key of Object.keys(document.nodes)) {
    const node = document.nodes[key];
    if (node === undefined) continue;
    if (key !== node.id) {
      throw new Error(`Formula document node key "${key}" does not match node id "${node.id}"`);
    }
    nodes[key] = formulaNodeToJSON(node, document.nodes);
  }

  return {
    schema: FORMULA_DOCUMENT_SCHEMA,
    version: FORMULA_DOCUMENT_VERSION,
    rootId: document.rootId,
    nodes,
  };
}

export interface SerializeFormulaDocumentOptions {
  /** Pretty-print with two spaces. Defaults to true. */
  readonly pretty?: boolean;
}

export function serializeFormulaDocument(
  document: FormulaDocument,
  options: SerializeFormulaDocumentOptions = {},
): string {
  const json = formulaDocumentToJSON(document);
  return JSON.stringify(json, null, options.pretty === false ? undefined : 2);
}

export function serializeFormula(root: FormulaNode, options: SerializeFormulaDocumentOptions = {}): string {
  return serializeFormulaDocument(createFormulaDocument(root), options);
}

/* ------------------------------------------------------------------ *
 * JSON parsing and validation
 * ------------------------------------------------------------------ */

const BASE_NODE_FIELDS = ['id', 'kind', 'category'] as const;

const NODE_ALLOWED_FIELDS: Readonly<Record<FormulaNodeKind, readonly string[]>> = {
  symbol: [...BASE_NODE_FIELDS, 'name', 'variant'],
  number: [...BASE_NODE_FIELDS, 'value'],
  operator: [...BASE_NODE_FIELDS, 'op', 'fixity', 'operands'],
  call: [...BASE_NODE_FIELDS, 'name', 'args'],
  fraction: [...BASE_NODE_FIELDS, 'numerator', 'denominator'],
  script: [...BASE_NODE_FIELDS, 'base', 'sub', 'sup'],
  matrix: [...BASE_NODE_FIELDS, 'rows', 'delimiters'],
  binder: [...BASE_NODE_FIELDS, 'binder', 'vars', 'body', 'domain'],
  slot: [...BASE_NODE_FIELDS, 'role', 'accepts', 'required', 'policy', 'label', 'placeholder'],
  reference: [...BASE_NODE_FIELDS, 'targetId', 'target', 'label'],
};

const DOCUMENT_ALLOWED_FIELDS = ['schema', 'version', 'rootId', 'nodes'] as const;
const DOMAIN_ALLOWED_FIELDS = ['lower', 'upper', 'over'] as const;

interface ParseContext {
  readonly issues: FormulaValidationIssue[];
}

function addIssue(context: ParseContext, path: string, message: string): void {
  context.issues.push({ path, message });
}

function checkAllowedFields(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string,
  context: ParseContext,
): boolean {
  let ok = true;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      addIssue(context, `${path}.${key}`, 'Unexpected field');
      ok = false;
    }
  }
  return ok;
}

function readRequiredString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  context: ParseContext,
): string | null {
  const value = record[key];
  if (typeof value !== 'string') {
    addIssue(context, `${path}.${key}`, 'Expected a string');
    return null;
  }
  return value;
}

function readOptionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  context: ParseContext,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    addIssue(context, `${path}.${key}`, 'Expected a string when present');
    return undefined;
  }
  return value;
}

function readDisplayText(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  context: ParseContext,
): string | undefined {
  const value = readOptionalString(record, key, path, context);
  if (value === undefined) return undefined;
  if (value.trim().length === 0) {
    addIssue(context, `${path}.${key}`, 'Display text must not be empty');
    return undefined;
  }
  if (value.trim().length > MAX_DISPLAY_TEXT_LENGTH) {
    addIssue(context, `${path}.${key}`, 'Display text is too long');
    return undefined;
  }
  if (DISPLAY_CONTROL_PATTERN.test(value)) {
    addIssue(context, `${path}.${key}`, 'Display text must not contain control characters');
    return undefined;
  }
  return value.trim();
}

function readNodeIdValue(
  value: unknown,
  path: string,
  context: ParseContext,
): FormulaNodeId | null {
  if (!isFormulaNodeId(value)) {
    addIssue(context, path, 'Expected a safe formula node id');
    return null;
  }
  return value;
}

function readNodeIdField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  context: ParseContext,
): FormulaNodeId | null {
  return readNodeIdValue(record[key], `${path}.${key}`, context);
}

function readOptionalNodeIdField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  context: ParseContext,
): FormulaNodeId | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  const parsed = readNodeIdValue(value, `${path}.${key}`, context);
  return parsed === null ? undefined : parsed;
}

function readCategoryField(
  record: Readonly<Record<string, unknown>>,
  path: string,
  context: ParseContext,
): SemanticCategory | null {
  const value = record.category;
  if (!isSemanticCategory(value)) {
    addIssue(context, `${path}.category`, 'Expected a semantic category');
    return null;
  }
  return value;
}

function readNodeIdArray(
  value: unknown,
  path: string,
  context: ParseContext,
  minItems = 0,
): readonly FormulaNodeId[] | null {
  if (!Array.isArray(value)) {
    addIssue(context, path, 'Expected an array of node ids');
    return null;
  }
  if (value.length < minItems) {
    addIssue(context, path, `Expected at least ${minItems} node id(s)`);
    return null;
  }
  const ids: FormulaNodeId[] = [];
  value.forEach((item, index) => {
    const id = readNodeIdValue(item, `${path}[${index}]`, context);
    if (id !== null) ids.push(id);
  });
  if (ids.length !== value.length) return null;
  return ids;
}

function parseBinderDomain(
  value: unknown,
  path: string,
  context: ParseContext,
): BinderDomainJSON | null {
  if (!isRecord(value)) {
    addIssue(context, path, 'Expected a binder domain object');
    return null;
  }
  checkAllowedFields(value, DOMAIN_ALLOWED_FIELDS, path, context);
  const lower = readOptionalNodeIdField(value, 'lower', path, context);
  const upper = readOptionalNodeIdField(value, 'upper', path, context);
  const over = readOptionalNodeIdField(value, 'over', path, context);
  if (lower === undefined && upper === undefined && over === undefined) {
    // Only treat this as a domain error when each field was simply absent.
    // Malformed fields already produced a more specific issue.
    if (value.lower === undefined && value.upper === undefined && value.over === undefined) {
      addIssue(context, path, 'A binder domain needs a lower, upper, or over node id');
    }
    return null;
  }
  return {
    ...(lower !== undefined ? { lower } : {}),
    ...(upper !== undefined ? { upper } : {}),
    ...(over !== undefined ? { over } : {}),
  };
}

function parseNodeJSON(
  raw: unknown,
  path: string,
  context: ParseContext,
): FormulaNodeJSON | null {
  if (!isRecord(raw)) {
    addIssue(context, path, 'Expected a formula node object');
    return null;
  }
  const start = context.issues.length;
  const kindRaw = raw.kind;
  if (!isFormulaNodeKind(kindRaw)) {
    addIssue(context, `${path}.kind`, 'Unknown formula node kind');
    return null;
  }
  checkAllowedFields(raw, NODE_ALLOWED_FIELDS[kindRaw], path, context);

  const id = readNodeIdField(raw, 'id', path, context);
  if (id === null) return null;
  const category = readCategoryField(raw, path, context);
  if (category === null) return null;

  const finish = (node: FormulaNodeJSON): FormulaNodeJSON | null =>
    context.issues.length === start ? node : null;

  switch (kindRaw) {
    case 'symbol': {
      const name = readRequiredString(raw, 'name', path, context);
      if (name === null || !SYMBOL_NAME_PATTERN.test(name)) {
        if (name !== null) addIssue(context, `${path}.name`, 'Invalid symbol name');
        return null;
      }
      const variantRaw = raw.variant;
      if (variantRaw !== undefined && !isSymbolVariant(variantRaw)) {
        addIssue(context, `${path}.variant`, 'Invalid symbol variant');
        return null;
      }
      return finish({
        id,
        kind: 'symbol',
        category,
        name,
        ...(isSymbolVariant(variantRaw) ? { variant: variantRaw } : {}),
      });
    }
    case 'number': {
      if (category !== 'number') {
        addIssue(context, `${path}.category`, 'Number nodes must use category "number"');
        return null;
      }
      const value = readRequiredString(raw, 'value', path, context);
      if (value === null) return null;
      if (!NUMBER_LITERAL_PATTERN.test(value)) {
        addIssue(context, `${path}.value`, 'Invalid number literal');
        return null;
      }
      return finish({ id, kind: 'number', category: 'number', value });
    }
    case 'operator': {
      const op = raw.op;
      if (!isOperatorSymbol(op)) {
        addIssue(context, `${path}.op`, 'Unknown operator symbol');
        return null;
      }
      const definition = OPERATOR_DEFINITIONS[op];
      const fixity = raw.fixity;
      if (!isOperatorFixity(fixity) || fixity !== definition.fixity) {
        addIssue(context, `${path}.fixity`, `Expected fixity "${definition.fixity}"`);
        return null;
      }
      const operands = readNodeIdArray(raw.operands, `${path}.operands`, context, 1);
      if (operands === null) return null;
      if (operands.length !== definition.arity) {
        addIssue(
          context,
          `${path}.operands`,
          `Operator "${op}" expects ${definition.arity} operand(s)`,
        );
        return null;
      }
      return finish({
        id,
        kind: 'operator',
        category,
        op,
        fixity,
        operands,
      });
    }
    case 'call': {
      const name = raw.name;
      if (!isCallSymbol(name)) {
        addIssue(context, `${path}.name`, 'Unknown function name');
        return null;
      }
      const definition = CALL_DEFINITIONS[name];
      const args = readNodeIdArray(raw.args, `${path}.args`, context, definition.minArgs);
      if (args === null) return null;
      if (args.length < definition.minArgs || args.length > definition.maxArgs) {
        addIssue(
          context,
          `${path}.args`,
          `Function "${name}" expects between ${definition.minArgs} and ${definition.maxArgs} arguments`,
        );
        return null;
      }
      return finish({ id, kind: 'call', category, name, args });
    }
    case 'fraction': {
      const numerator = readNodeIdField(raw, 'numerator', path, context);
      const denominator = readNodeIdField(raw, 'denominator', path, context);
      if (numerator === null || denominator === null) return null;
      return finish({ id, kind: 'fraction', category, numerator, denominator });
    }
    case 'script': {
      const base = readNodeIdField(raw, 'base', path, context);
      if (base === null) return null;
      const sub = readOptionalNodeIdField(raw, 'sub', path, context);
      const sup = readOptionalNodeIdField(raw, 'sup', path, context);
      if (sub === undefined && sup === undefined && raw.sub === undefined && raw.sup === undefined) {
        addIssue(context, path, 'A script node needs a subscript or superscript');
        return null;
      }
      return finish({
        id,
        kind: 'script',
        category,
        base,
        ...(sub !== undefined ? { sub } : {}),
        ...(sup !== undefined ? { sup } : {}),
      });
    }
    case 'matrix': {
      if (category !== 'matrix') {
        addIssue(context, `${path}.category`, 'Matrix nodes must use category "matrix"');
        return null;
      }
      const rowsRaw = raw.rows;
      if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) {
        addIssue(context, `${path}.rows`, 'Expected at least one matrix row');
        return null;
      }
      const rows: FormulaNodeId[][] = [];
      let width = -1;
      rowsRaw.forEach((rowRaw, rowIndex) => {
        const row = readNodeIdArray(rowRaw, `${path}.rows[${rowIndex}]`, context, 1);
        if (row === null) return;
        if (width === -1) width = row.length;
        if (row.length !== width) {
          addIssue(context, `${path}.rows[${rowIndex}]`, 'Matrix rows must have equal length');
          return;
        }
        rows.push([...row]);
      });
      if (rows.length !== rowsRaw.length) return null;
      const delimiters = raw.delimiters;
      if (!isMatrixDelimiter(delimiters)) {
        addIssue(context, `${path}.delimiters`, 'Invalid matrix delimiter');
        return null;
      }
      return finish({ id, kind: 'matrix', category: 'matrix', rows, delimiters });
    }
    case 'binder': {
      const binder = raw.binder;
      if (!isBinderKind(binder)) {
        addIssue(context, `${path}.binder`, 'Unknown binder kind');
        return null;
      }
      const vars = readNodeIdArray(raw.vars, `${path}.vars`, context, 1);
      if (vars === null) return null;
      const body = readNodeIdField(raw, 'body', path, context);
      if (body === null) return null;
      let domain: BinderDomainJSON | undefined;
      if (raw.domain !== undefined) {
        const parsedDomain = parseBinderDomain(raw.domain, `${path}.domain`, context);
        if (parsedDomain === null) return null;
        domain = parsedDomain;
      }
      return finish({
        id,
        kind: 'binder',
        category,
        binder,
        vars,
        body,
        ...(domain !== undefined ? { domain } : {}),
      });
    }
    case 'slot': {
      if (category !== 'unknown') {
        addIssue(context, `${path}.category`, 'Slot nodes must use category "unknown"');
        return null;
      }
      const role = raw.role;
      if (!isSlotRole(role)) {
        addIssue(context, `${path}.role`, 'Unknown slot role');
        return null;
      }
      if (!Array.isArray(raw.accepts) || raw.accepts.length === 0) {
        addIssue(context, `${path}.accepts`, 'Expected at least one accepted category');
        return null;
      }
      const accepts: SemanticCategory[] = [];
      const seen = new Set<SemanticCategory>();
      raw.accepts.forEach((accept, index) => {
        if (!isSemanticCategory(accept)) {
          addIssue(context, `${path}.accepts[${index}]`, 'Unknown semantic category');
          return;
        }
        if (seen.has(accept)) {
          addIssue(context, `${path}.accepts[${index}]`, 'Duplicate accepted category');
          return;
        }
        seen.add(accept);
        accepts.push(accept);
      });
      if (accepts.length !== raw.accepts.length) return null;
      if (!isSlotPolicy(raw.policy)) {
        addIssue(context, `${path}.policy`, 'Invalid slot policy');
        return null;
      }
      if (typeof raw.required !== 'boolean') {
        addIssue(context, `${path}.required`, 'Expected a boolean');
        return null;
      }
      const label = readDisplayText(raw, 'label', path, context);
      const placeholder = readDisplayText(raw, 'placeholder', path, context);
      return finish({
        id,
        kind: 'slot',
        category: 'unknown',
        role,
        accepts,
        required: raw.required,
        policy: raw.policy,
        ...(label !== undefined ? { label } : {}),
        ...(placeholder !== undefined ? { placeholder } : {}),
      });
    }
    case 'reference': {
      const targetId = readNodeIdField(raw, 'targetId', path, context);
      if (targetId === null) return null;
      const target = raw.target;
      if (!isReferenceTarget(target)) {
        addIssue(context, `${path}.target`, 'Invalid reference target');
        return null;
      }
      const label = readDisplayText(raw, 'label', path, context);
      if (label === undefined) {
        if (raw.label === undefined) addIssue(context, `${path}.label`, 'Expected a reference label');
        return null;
      }
      return finish({ id, kind: 'reference', category, targetId, target, label });
    }
    default:
      return assertNever(kindRaw);
  }
}

function formulaNodeJSONChildIds(node: FormulaNodeJSON): readonly FormulaNodeId[] {
  switch (node.kind) {
    case 'symbol':
    case 'number':
    case 'slot':
    case 'reference':
      return [];
    case 'operator':
      return node.operands;
    case 'call':
      return node.args;
    case 'fraction':
      return [node.numerator, node.denominator];
    case 'script':
      return [
        node.base,
        ...(node.sub !== undefined ? [node.sub] : []),
        ...(node.sup !== undefined ? [node.sup] : []),
      ];
    case 'matrix':
      return node.rows.flatMap((row) => [...row]);
    case 'binder':
      return [
        ...node.vars,
        node.body,
        ...(node.domain?.lower !== undefined ? [node.domain.lower] : []),
        ...(node.domain?.upper !== undefined ? [node.domain.upper] : []),
        ...(node.domain?.over !== undefined ? [node.domain.over] : []),
      ];
    default:
      return assertNever(node);
  }
}

function detectDocumentCycles(
  nodes: Readonly<Record<string, FormulaNodeJSON>>,
  context: ParseContext,
): void {
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string): void => {
    const current = state.get(id);
    if (current === 'done') return;
    if (current === 'visiting') {
      addIssue(context, `$.nodes.${id}`, 'Cycle detected in formula node graph');
      return;
    }
    state.set(id, 'visiting');
    const node = nodes[id];
    if (node !== undefined) {
      for (const childId of formulaNodeJSONChildIds(node)) {
        if (nodes[childId] !== undefined) visit(childId);
      }
    }
    state.set(id, 'done');
  };
  for (const id of Object.keys(nodes)) visit(id);
}

function buildNodeFromJSON(
  json: FormulaNodeJSON,
  resolve: (id: FormulaNodeId) => FormulaNode,
): FormulaNode {
  switch (json.kind) {
    case 'symbol':
      return symbolNode(json.name, {
        id: json.id,
        category: json.category,
        ...(json.variant !== undefined ? { variant: json.variant } : {}),
      });
    case 'number':
      return numberNode(json.value, { id: json.id });
    case 'operator':
      return operatorNode(json.op, json.operands.map(resolve), {
        id: json.id,
        category: json.category,
      });
    case 'call':
      return callNode(json.name, json.args.map(resolve), {
        id: json.id,
        category: json.category,
      });
    case 'fraction':
      return fractionNode(resolve(json.numerator), resolve(json.denominator), {
        id: json.id,
        category: json.category,
      });
    case 'script':
      return scriptNode(resolve(json.base), {
        id: json.id,
        category: json.category,
        ...(json.sub !== undefined ? { sub: resolve(json.sub) } : {}),
        ...(json.sup !== undefined ? { sup: resolve(json.sup) } : {}),
      });
    case 'matrix':
      return matrixNode(
        json.rows.map((row) => row.map(resolve)),
        { id: json.id, delimiters: json.delimiters },
      );
    case 'binder':
      return binderNode(
        json.binder,
        json.vars.map(resolve),
        resolve(json.body),
        {
          id: json.id,
          category: json.category,
          ...(json.domain !== undefined
            ? {
                domain: {
                  ...(json.domain.lower !== undefined
                    ? { lower: resolve(json.domain.lower) }
                    : {}),
                  ...(json.domain.upper !== undefined
                    ? { upper: resolve(json.domain.upper) }
                    : {}),
                  ...(json.domain.over !== undefined
                    ? { over: resolve(json.domain.over) }
                    : {}),
                },
              }
            : {}),
        },
      );
    case 'slot':
      return slotNode(json.role, {
        id: json.id,
        accepts: json.accepts,
        required: json.required,
        policy: json.policy,
        ...(json.label !== undefined ? { label: json.label } : {}),
        ...(json.placeholder !== undefined ? { placeholder: json.placeholder } : {}),
      });
    case 'reference':
      return referenceNode(json.targetId, {
        id: json.id,
        category: json.category,
        target: json.target,
        label: json.label,
      });
    default:
      return assertNever(json);
  }
}

/**
 * Validate and normalized-parse an unknown JSON value. Never throws for
 * malformed data; inspect `ok` and `issues`.
 */
export function validateFormulaDocumentJSON(value: unknown): FormulaDocumentValidationResult {
  const context: ParseContext = { issues: [] };

  if (!isRecord(value)) {
    addIssue(context, '$', 'Expected a formula document object');
    return { ok: false, issues: context.issues };
  }

  checkAllowedFields(value, DOCUMENT_ALLOWED_FIELDS, '$', context);
  if (value.schema !== FORMULA_DOCUMENT_SCHEMA) {
    addIssue(context, '$.schema', `Expected schema "${FORMULA_DOCUMENT_SCHEMA}"`);
  }
  if (value.version !== FORMULA_DOCUMENT_VERSION) {
    addIssue(context, '$.version', `Expected version ${FORMULA_DOCUMENT_VERSION}`);
  }
  const rootId = readNodeIdField(value, 'rootId', '$', context);
  const nodesRaw = value.nodes;
  if (!isRecord(nodesRaw)) {
    addIssue(context, '$.nodes', 'Expected an object mapping node ids to nodes');
    return { ok: false, issues: context.issues };
  }

  const nodes: Record<string, FormulaNodeJSON> = {};
  for (const key of Object.keys(nodesRaw)) {
    const node = parseNodeJSON(nodesRaw[key], `$.nodes.${key}`, context);
    if (node === null) continue;
    if (node.id !== key) {
      addIssue(context, `$.nodes.${key}.id`, `Node id "${node.id}" does not match map key`);
      continue;
    }
    nodes[key] = node;
  }

  if (rootId !== null && nodes[rootId] === undefined) {
    addIssue(context, '$.rootId', `Root node "${rootId}" is missing from the node map`);
  }

  for (const [id, node] of Object.entries(nodes)) {
    for (const childId of formulaNodeJSONChildIds(node)) {
      if (nodes[childId] === undefined) {
        addIssue(context, `$.nodes.${id}`, `Child node "${childId}" is missing from the node map`);
      }
    }
    if (node.kind === 'reference' && node.target === 'node' && nodes[node.targetId] === undefined) {
      addIssue(
        context,
        `$.nodes.${id}.targetId`,
        `Reference target "${node.targetId}" is missing from the node map`,
      );
    }
  }

  detectDocumentCycles(nodes, context);

  if (context.issues.length > 0 || rootId === null) {
    return { ok: false, issues: context.issues };
  }

  const built = new Map<FormulaNodeId, FormulaNode>();
  const build = (id: FormulaNodeId): FormulaNode => {
    const cached = built.get(id);
    if (cached !== undefined) return cached;
    const json = nodes[id];
    if (json === undefined) throw new Error(`Internal formula build error: missing node "${id}"`);
    const node = buildNodeFromJSON(json, build);
    built.set(id, node);
    return node;
  };

  const rebuilt: Record<FormulaNodeId, FormulaNode> = {};
  for (const id of Object.keys(nodes)) {
    rebuilt[id] = build(id);
  }
  const root = rebuilt[rootId];
  if (root === undefined) {
    addIssue(context, '$.rootId', `Root node "${rootId}" could not be rebuilt`);
    return { ok: false, issues: context.issues };
  }

  return {
    ok: true,
    document: {
      schema: FORMULA_DOCUMENT_SCHEMA,
      version: FORMULA_DOCUMENT_VERSION,
      rootId,
      nodes: rebuilt,
    },
  };
}

export function parseFormulaDocumentJSON(value: unknown): FormulaDocument {
  const result = validateFormulaDocumentJSON(value);
  if (!result.ok) {
    const first = result.issues[0];
    const detail = first === undefined ? 'invalid formula document' : `${first.path}: ${first.message}`;
    throw new FormulaValidationError(`Invalid formula document JSON (${detail})`, result.issues);
  }
  return result.document;
}

export function deserializeFormulaDocument(text: string): FormulaDocument {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new FormulaValidationError('Invalid formula document JSON syntax', [
      {
        path: '$',
        message: error instanceof Error ? error.message : 'Could not parse JSON',
      },
    ]);
  }
  return parseFormulaDocumentJSON(value);
}
