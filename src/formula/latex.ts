/**
 * LaTeX and KaTeX output for the formula AST.
 *
 * Two rendering modes share one serializer:
 * - plain LaTeX, suitable for storage, selection, or another TeX engine;
 * - annotated LaTeX, where every node is wrapped in KaTeX's trust-gated
 *   `\htmlClass` / `\htmlData` commands so a visual editor can map a rendered
 *   span back to a stable node id.
 *
 * The AST is the only source of LaTeX. This module never interpolates a raw
 * user-provided LaTeX string, and `renderFormulaToHtml` installs a trust
 * callback that permits only our own annotation wrappers. URLs, styles, ids,
 * and arbitrary HTML commands are rejected by construction.
 */

import katex from 'katex';
import type { KatexOptions, TrustContext } from 'katex';
import {
  CALL_DEFINITIONS,
  OPERATOR_DEFINITIONS,
  getFormulaRoot,
  isFormulaNodeId,
  isFormulaNodeKind,
  isSemanticCategory,
} from './ast.js';
import type {
  BinderDomain,
  BinderKind,
  FormulaDocument,
  FormulaNode,
  FormulaSlotNode,
  MatrixDelimiter,
  OperatorSymbol,
  SemanticCategory,
  SymbolVariant,
} from './ast.js';

/* ------------------------------------------------------------------ *
 * Public option and result types
 * ------------------------------------------------------------------ */

export interface LatexSerializeOptions {
  /**
   * Emit `\htmlClass`/`\htmlData` wrappers for each node. Defaults to false
   * for `formulaToLatex`, and true for `renderFormulaToHtml`.
   */
  readonly annotateNodes?: boolean;
}

export interface RenderFormulaOptions extends LatexSerializeOptions {
  readonly displayMode?: boolean;
  readonly throwOnError?: boolean;
  readonly strict?: KatexOptions['strict'];
  readonly maxExpand?: number;
  readonly maxSize?: number;
  readonly errorColor?: string;
}

export interface RenderedFormula {
  readonly html: string;
  readonly latex: string;
  readonly altText: string;
}

export type FormulaRenderInput = FormulaNode | FormulaDocument;

/* ------------------------------------------------------------------ *
 * Limited macro allowlist
 * ------------------------------------------------------------------ */

/**
 * A deliberately small macro set. The serializer itself does not need any of
 * these; they exist as safe building blocks for future AST renderers. No
 * caller-supplied macros are accepted.
 */
export const FORMULA_MACROS: Readonly<Record<string, string>> = {
  '\\R': '\\mathbb{R}',
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\Q': '\\mathbb{Q}',
  '\\C': '\\mathbb{C}',
  '\\tr': '\\operatorname{tr}',
  '\\rank': '\\operatorname{rank}',
  '\\inv': '\\operatorname{inv}',
};

/* ------------------------------------------------------------------ *
 * Trusted annotation surface
 * ------------------------------------------------------------------ */

const HTML_CLASS_PART_PATTERN = /^formula-(?:node|category)(?:--[a-z0-9-]+)?$/;
const ALLOWED_DATA_ATTRIBUTES = new Set([
  'data-formula-id',
  'data-formula-kind',
  'data-formula-category',
  'data-formula-role',
]);
const SAFE_ATTRIBUTE_VALUE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function isAllowedHtmlClass(value: string): boolean {
  const parts = value.trim().split(/\s+/);
  return (
    parts.length > 0 &&
    parts.length <= 6 &&
    parts.every((part) => HTML_CLASS_PART_PATTERN.test(part))
  );
}

function isAllowedHtmlData(attributes: Readonly<Record<string, string>>): boolean {
  const entries = Object.entries(attributes);
  if (entries.length === 0 || entries.length > ALLOWED_DATA_ATTRIBUTES.size) return false;
  return entries.every(
    ([key, value]) =>
      ALLOWED_DATA_ATTRIBUTES.has(key) && SAFE_ATTRIBUTE_VALUE_PATTERN.test(value),
  );
}

/**
 * The only trust callback used by `renderFormulaToHtml`.
 *
 * Importantly, it does not trust arbitrary `\htmlClass`/`\htmlData` commands:
 * class names must belong to our formula wrapper vocabulary and data attributes
 * must be one of the four names emitted by the serializer. `\href`, `\url`,
 * `\includegraphics`, `\htmlStyle`, and `\htmlId` are never trusted.
 */
export function isFormulaTrustedLatexCommand(context: TrustContext): boolean {
  switch (context.command) {
    case '\\htmlClass':
      return isAllowedHtmlClass(context.class);
    case '\\htmlData':
      return isAllowedHtmlData(context.attributes);
    case '\\href':
    case '\\url':
    case '\\includegraphics':
    case '\\htmlId':
    case '\\htmlStyle':
      return false;
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ *
 * Escaping and symbol rendering
 * ------------------------------------------------------------------ */

/**
 * Escape text that will be placed inside `\text{...}`. Backslashes are mapped
 * to a visible set-minus glyph rather than passed through, so text can never
 * become a command such as `\href` or `\htmlStyle`.
 */
export function escapeFormulaText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\\/g, '\u2216')
    .replace(/([{}%$&#_])/g, '\\$1')
    .replace(/\^/g, '\\^{}')
    .replace(/~/g, '\\~{}');
}

const GREEK_LATEX: Readonly<Record<string, string>> = {
  α: '\\alpha',
  β: '\\beta',
  γ: '\\gamma',
  δ: '\\delta',
  ε: '\\epsilon',
  ζ: '\\zeta',
  η: '\\eta',
  θ: '\\theta',
  ι: '\\iota',
  κ: '\\kappa',
  λ: '\\lambda',
  μ: '\\mu',
  ν: '\\nu',
  ξ: '\\xi',
  ο: '\\omicron',
  π: '\\pi',
  ρ: '\\rho',
  σ: '\\sigma',
  τ: '\\tau',
  υ: '\\upsilon',
  φ: '\\phi',
  χ: '\\chi',
  ψ: '\\psi',
  ω: '\\omega',
  Γ: '\\Gamma',
  Δ: '\\Delta',
  Θ: '\\Theta',
  Λ: '\\Lambda',
  Ξ: '\\Xi',
  Π: '\\Pi',
  Σ: '\\Sigma',
  Υ: '\\Upsilon',
  Φ: '\\Phi',
  Ψ: '\\Psi',
  Ω: '\\Omega',
};

function wrapSymbolVariant(body: string, variant: SymbolVariant): string {
  switch (variant) {
    case 'italic':
      return body;
    case 'roman':
      return `\\mathrm{${body}}`;
    case 'bold':
      return `\\mathbf{${body}}`;
    case 'blackboard':
      return `\\mathbb{${body}}`;
    case 'calligraphic':
      return `\\mathcal{${body}}`;
    case 'sans':
      return `\\mathsf{${body}}`;
    default:
      return body;
  }
}

function serializeSymbol(name: string, variant: SymbolVariant): string {
  const greek = GREEK_LATEX[name];
  if (greek !== undefined) return wrapSymbolVariant(greek, variant);
  if (variant === 'italic') {
    return name.length > 1 ? `\\mathit{${name}}` : name;
  }
  return wrapSymbolVariant(name, variant);
}

function serializeNumberLiteral(value: string): string {
  const scientific = /^([+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+)))[eE]([+-]?\d+)$/.exec(value);
  if (scientific !== null) {
    const mantissa = scientific[1] ?? value;
    const exponent = scientific[2] ?? '0';
    return `${mantissa}\\times 10^{${exponent}}`;
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * Precedence and parenthesization
 * ------------------------------------------------------------------ */

function infixPrecedence(op: OperatorSymbol): number {
  switch (op) {
    case '=':
    case '\\neq':
    case '<':
    case '>':
    case '\\le':
    case '\\ge':
    case '\\approx':
    case '\\to':
    case '\\mapsto':
    case '\\in':
    case '\\subseteq':
      return 0;
    case '+':
    case '-':
    case '\\pm':
    case '\\mp':
      return 1;
    case '\\times':
    case '\\cdot':
    case '\\odot':
    case '\\otimes':
    case '\\div':
    case '\\ast':
    case '\\circ':
      return 2;
    default:
      return 3;
  }
}

const NON_ASSOCIATIVE_INFIX = new Set<OperatorSymbol>([
  '-',
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
]);

function wrapInParens(latex: string): string {
  return `\\left(${latex}\\right)`;
}

function isInfixOperator(
  node: FormulaNode,
): node is Extract<FormulaNode, { kind: 'operator' }> {
  return node.kind === 'operator' && node.fixity === 'infix';
}

function serializeInfixOperand(
  operand: FormulaNode,
  parentOp: OperatorSymbol,
  side: 'left' | 'right',
  context: SerializeContext,
): string {
  const latex = serializeNode(operand, context);
  if (!isInfixOperator(operand)) return latex;
  const parentPrecedence = infixPrecedence(parentOp);
  const childPrecedence = infixPrecedence(operand.op);
  const needsParens =
    childPrecedence < parentPrecedence ||
    (childPrecedence === parentPrecedence &&
      side === 'right' &&
      NON_ASSOCIATIVE_INFIX.has(parentOp));
  return needsParens ? wrapInParens(latex) : latex;
}

function serializeUnaryOperand(operand: FormulaNode, context: SerializeContext): string {
  const latex = serializeNode(operand, context);
  if (isInfixOperator(operand) || operand.kind === 'binder' || operand.kind === 'matrix') {
    return wrapInParens(latex);
  }
  return latex;
}

function isAtomicScriptBase(base: FormulaNode): boolean {
  return (
    base.kind === 'symbol' ||
    base.kind === 'number' ||
    base.kind === 'slot' ||
    base.kind === 'reference' ||
    base.kind === 'call' ||
    base.kind === 'script'
  );
}

function serializeScriptBase(base: FormulaNode, context: SerializeContext): string {
  const latex = serializeNode(base, context);
  return isAtomicScriptBase(base) ? latex : wrapInParens(latex);
}

/* ------------------------------------------------------------------ *
 * Serializer
 * ------------------------------------------------------------------ */

interface SerializeContext {
  readonly annotateNodes: boolean;
}

function annotateNode(node: FormulaNode, body: string, context: SerializeContext): string {
  if (!context.annotateNodes) return body;
  if (!isFormulaNodeId(node.id) || !isFormulaNodeKind(node.kind)) return body;
  const category: SemanticCategory = isSemanticCategory(node.category)
    ? node.category
    : 'unknown';
  const classList = `formula-node formula-node--${node.kind} formula-category--${category}`;
  const dataParts = [
    `formula-id=${node.id}`,
    `formula-kind=${node.kind}`,
    `formula-category=${category}`,
  ];
  if (node.kind === 'slot') {
    dataParts.push(`formula-role=${node.role}`);
  }
  const data = dataParts.join(',');
  return `\\htmlClass{${classList}}{\\htmlData{${data}}{${body}}}`;
}

function serializeOperator(node: Extract<FormulaNode, { kind: 'operator' }>, context: SerializeContext): string {
  const definition = OPERATOR_DEFINITIONS[node.op];
  if (definition.fixity === 'infix') {
    const left = node.operands[0];
    const right = node.operands[1];
    if (left === undefined || right === undefined) {
      throw new Error(`Operator "${node.op}" is missing an operand`);
    }
    return `${serializeInfixOperand(left, node.op, 'left', context)} ${definition.latex} ${serializeInfixOperand(right, node.op, 'right', context)}`;
  }

  const operand = node.operands[0];
  if (operand === undefined) {
    throw new Error(`Operator "${node.op}" is missing its operand`);
  }
  if (definition.fixity === 'postfix') {
    const postfix = definition.postfixLatex ?? definition.latex;
    return `${serializeUnaryOperand(operand, context)}^{${postfix}}`;
  }
  return `${definition.latex} ${serializeUnaryOperand(operand, context)}`;
}

function serializeCall(node: Extract<FormulaNode, { kind: 'call' }>, context: SerializeContext): string {
  const definition = CALL_DEFINITIONS[node.name];
  const args = node.args.map((arg) => serializeNode(arg, context)).join(', ');
  return `${definition.latex}\\left(${args}\\right)`;
}

function serializeMatrix(node: Extract<FormulaNode, { kind: 'matrix' }>, context: SerializeContext): string {
  const environment = MATRIX_ENVIRONMENT[node.delimiters];
  const rows = node.rows
    .map((row) => row.map((cell) => serializeNode(cell, context)).join(' & '))
    .join(' \\\\ ');
  return `\\begin{${environment}}${rows}\\end{${environment}}`;
}

const MATRIX_ENVIRONMENT: Readonly<Record<MatrixDelimiter, string>> = {
  bracket: 'bmatrix',
  paren: 'pmatrix',
  brace: 'Bmatrix',
  bar: 'vmatrix',
  'double-bar': 'Vmatrix',
  none: 'matrix',
};

function serializeDomainPiece(node: FormulaNode, context: SerializeContext): string {
  return serializeNode(node, context);
}

function formatBinderVars(vars: readonly FormulaNode[], context: SerializeContext): string {
  return vars.map((variable) => serializeNode(variable, context)).join(', ');
}

function serializeBinderLimits(
  node: Extract<FormulaNode, { kind: 'binder' }>,
  context: SerializeContext,
): { readonly sub: string | null; readonly sup: string | null } {
  const domain: BinderDomain | undefined = node.domain;
  const varText = formatBinderVars(node.vars, context);
  const lower = domain?.lower === undefined ? null : serializeDomainPiece(domain.lower, context);
  const upper = domain?.upper === undefined ? null : serializeDomainPiece(domain.upper, context);
  const over = domain?.over === undefined ? null : serializeDomainPiece(domain.over, context);

  let sub: string | null = null;
  if (lower !== null) {
    sub = varText.length > 0 ? `${varText} = ${lower}` : lower;
  } else if (over !== null) {
    sub = varText.length > 0 ? `${varText} \\in ${over}` : over;
  } else if (varText.length > 0) {
    sub = varText;
  }

  return { sub, sup: upper };
}

function serializeBinder(node: Extract<FormulaNode, { kind: 'binder' }>, context: SerializeContext): string {
  const body = serializeNode(node.body, context);
  const varText = formatBinderVars(node.vars, context);
  const domain = node.domain;

  if (node.binder === 'lambda') {
    let restriction = '';
    if (domain?.over !== undefined) {
      restriction = ` \\in ${serializeDomainPiece(domain.over, context)}`;
    } else if (domain?.lower !== undefined || domain?.upper !== undefined) {
      const lower = domain.lower === undefined ? '' : serializeDomainPiece(domain.lower, context);
      const upper = domain.upper === undefined ? '' : serializeDomainPiece(domain.upper, context);
      restriction = ` \\in \\left[${lower}, ${upper}\\right]`;
    }
    return `\\lambda ${varText}${restriction}.\\, ${body}`;
  }

  const command = node.binder === 'sum' ? '\\sum' : '\\int';
  const limits = serializeBinderLimits(node, context);
  const script =
    (limits.sub === null ? '' : `_{${limits.sub}}`) +
    (limits.sup === null ? '' : `^{${limits.sup}}`);
  return `${command}${script} ${body}`;
}

function renderSlotPlaceholder(slot: FormulaSlotNode): string {
  if (slot.placeholder !== undefined) {
    return `\\boxed{\\text{${escapeFormulaText(slot.placeholder)}}}`;
  }
  if (slot.label !== undefined) {
    return `\\boxed{\\text{${escapeFormulaText(slot.label)}}}`;
  }
  return '\\square';
}

function serializeNodeBody(node: FormulaNode, context: SerializeContext): string {
  switch (node.kind) {
    case 'symbol':
      return serializeSymbol(node.name, node.variant);
    case 'number':
      return serializeNumberLiteral(node.value);
    case 'operator':
      return serializeOperator(node, context);
    case 'call':
      return serializeCall(node, context);
    case 'fraction':
      return `\\frac{${serializeNode(node.numerator, context)}}{${serializeNode(node.denominator, context)}}`;
    case 'script': {
      const base = serializeScriptBase(node.base, context);
      const sub = node.sub === undefined ? '' : `_{${serializeNode(node.sub, context)}}`;
      const sup = node.sup === undefined ? '' : `^{${serializeNode(node.sup, context)}}`;
      return `${base}${sub}${sup}`;
    }
    case 'matrix':
      return serializeMatrix(node, context);
    case 'binder':
      return serializeBinder(node, context);
    case 'slot':
      return renderSlotPlaceholder(node);
    case 'reference':
      return `\\text{${escapeFormulaText(node.label)}}`;
    default:
      return assertNeverNode(node);
  }
}

function assertNeverNode(node: never): never {
  throw new Error(`Unhandled formula node kind: ${String(node)}`);
}

function serializeNode(node: FormulaNode, context: SerializeContext): string {
  return annotateNode(node, serializeNodeBody(node, context), context);
}

/**
 * Serialize to LaTeX. Annotations are off by default; pass
 * `{ annotateNodes: true }` for editor-ready wrappers.
 */
export function formulaToLatex(
  input: FormulaRenderInput,
  options: LatexSerializeOptions = {},
): string {
  const context: SerializeContext = { annotateNodes: options.annotateNodes === true };
  return serializeNode(getFormulaRoot(input), context);
}

/** Serialize to LaTeX with no semantic wrappers at all. */
export function formulaToPlainLatex(input: FormulaRenderInput): string {
  return formulaToLatex(input, { annotateNodes: false });
}

/* ------------------------------------------------------------------ *
 * Alt text
 * ------------------------------------------------------------------ */

function categoryWord(category: SemanticCategory): string {
  switch (category) {
    case 'scalar':
      return 'scalar';
    case 'matrix':
      return 'matrix';
    case 'tensor':
      return 'tensor';
    case 'function':
      return 'function';
    case 'operator':
      return 'operator';
    case 'index':
      return 'index';
    case 'bound':
      return 'bound';
    case 'number':
      return 'number';
    case 'unit':
      return 'unit';
    case 'unknown':
      return 'expression';
    default:
      return 'expression';
  }
}

function binderWord(binder: BinderKind): string {
  switch (binder) {
    case 'sum':
      return 'sum';
    case 'int':
      return 'integral';
    case 'lambda':
      return 'lambda';
    default:
      return 'binder';
  }
}

function altForNode(node: FormulaNode): string {
  switch (node.kind) {
    case 'symbol':
      return node.category === 'unit' ? `unit ${node.name}` : node.name;
    case 'number':
      return node.value;
    case 'operator': {
      const definition = OPERATOR_DEFINITIONS[node.op];
      if (definition.fixity === 'infix') {
        const left = node.operands[0];
        const right = node.operands[1];
        if (left !== undefined && right !== undefined) {
          return `${altForNode(left)} ${definition.label} ${altForNode(right)}`;
        }
        return definition.label;
      }
      const operand = node.operands[0];
      return operand === undefined
        ? definition.label
        : `${definition.label} ${altForNode(operand)}`;
    }
    case 'call': {
      const definition = CALL_DEFINITIONS[node.name];
      return `${definition.label}(${node.args.map(altForNode).join(', ')})`;
    }
    case 'fraction':
      return `${altForNode(node.numerator)} over ${altForNode(node.denominator)}`;
    case 'script': {
      const pieces = [altForNode(node.base)];
      if (node.sub !== undefined) pieces.push(`subscript ${altForNode(node.sub)}`);
      if (node.sup !== undefined) pieces.push(`to the power of ${altForNode(node.sup)}`);
      return pieces.join(' ');
    }
    case 'matrix': {
      const width = node.rows[0]?.length ?? 0;
      const rows = node.rows.map((row) => `[${row.map(altForNode).join(', ')}]`).join('; ');
      return `matrix with ${node.rows.length} row${node.rows.length === 1 ? '' : 's'} and ${width} column${width === 1 ? '' : 's'}: ${rows}`;
    }
    case 'binder': {
      const variableText = node.vars.map(altForNode).join(', ');
      const domain = node.domain;
      const domainText =
        domain === undefined
          ? ''
          : domain.over !== undefined
            ? ` over ${altForNode(domain.over)}`
            : domain.lower !== undefined && domain.upper !== undefined
              ? ` from ${altForNode(domain.lower)} to ${altForNode(domain.upper)}`
              : domain.lower !== undefined
                ? ` from ${altForNode(domain.lower)}`
                : domain.upper !== undefined
                  ? ` up to ${altForNode(domain.upper)}`
                  : '';
      return `${binderWord(node.binder)} over ${variableText}${domainText} of ${altForNode(node.body)}`;
    }
    case 'slot': {
      const accepted = node.accepts.map(categoryWord).join(' or ');
      const label = node.label === undefined ? `${node.role.replace(/-/g, ' ')} slot` : node.label;
      return `${label} for ${accepted}`;
    }
    case 'reference':
      return `reference to ${node.label}`;
    default:
      return assertNeverNode(node);
  }
}

/** Human-readable, language-neutral (English) alternative text. */
export function formulaToAltText(input: FormulaRenderInput): string {
  return altForNode(getFormulaRoot(input));
}

/* ------------------------------------------------------------------ *
 * KaTeX rendering
 * ------------------------------------------------------------------ */

const KATEX_MAX_EXPAND = 100;

/**
 * Render the AST to a KaTeX HTML+MathML string. This is the only place this
 * module calls into KaTeX and it only ever passes AST-generated LaTeX.
 */
export function renderFormula(
  input: FormulaRenderInput,
  options: RenderFormulaOptions = {},
): RenderedFormula {
  const annotateNodes = options.annotateNodes ?? true;
  const latex = formulaToLatex(input, { annotateNodes });
  const altText = formulaToAltText(input);

  const html = katex.renderToString(latex, {
    displayMode: options.displayMode ?? false,
    output: 'htmlAndMathml',
    throwOnError: options.throwOnError ?? true,
    strict: options.strict ?? 'ignore',
    trust: isFormulaTrustedLatexCommand,
    macros: { ...FORMULA_MACROS },
    maxExpand: options.maxExpand ?? KATEX_MAX_EXPAND,
    maxSize: options.maxSize ?? 50,
    errorColor: options.errorColor ?? '#cc0000',
    globalGroup: false,
  });
  return { html, latex, altText };
}

export function renderFormulaToHtml(
  input: FormulaRenderInput,
  options: RenderFormulaOptions = {},
): string {
  return renderFormula(input, options).html;
}
