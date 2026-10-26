/**
 * Expression parser and evaluator.
 *
 * Parsing is intentionally small and explicit. Evaluation returns both values
 * and an ordered operation record; presentation layers can reconstruct every
 * intermediate value without re-running mathematics.
 */

import { Q, formatNumber } from './rational.js';
import type { RationalInput } from './rational.js';
import {
  add,
  adjugate,
  determinant,
  divide,
  hadamard,
  inverse,
  kronecker,
  matmul,
  minor,
  power,
  rank,
  rref,
  scale,
  solveLinear,
  subtract,
  trace,
  transpose,
} from './matrix.js';
import type { Matrix } from './matrix.js';
import type {
  EvaluationResult,
  MatrixRuntimeValue,
  OperationRecord,
  OperationType,
  RuntimeValue,
  ScalarRuntimeValue,
  Shape,
} from './protocol.js';

/* ------------------------------------------------------------------ *
 * AST
 * ------------------------------------------------------------------ */

export type BinaryOperator = '+' | '-' | '*' | '/' | '⊙' | '⊗';
export type CallName = 'det' | 'inv' | 'rank' | 'trace' | 'rref' | 'transpose' | 'adj' | 'solve' | 'minor';

export interface NumberNode {
  type: 'number';
  value: Q;
  raw: string;
  pos: number;
}

export interface MatrixNode {
  type: 'matrix';
  name: string;
  pos: number;
}

export interface GroupNode {
  type: 'group';
  operand: AstNode;
  pos: number;
}

export interface UnaryNode {
  type: 'unary';
  op: '-';
  operand: AstNode;
  pos: number;
}

export interface BinaryNode {
  type: 'binary';
  op: BinaryOperator;
  left: AstNode;
  right: AstNode;
  pos: number;
}

export interface PowerNode {
  type: 'power';
  base: AstNode;
  exponent: AstNode;
  pos: number;
}

export interface TransposeNode {
  type: 'transpose';
  operand: AstNode;
  pos: number;
}

export interface CallNode {
  type: 'call';
  name: CallName;
  args: AstNode[];
  pos: number;
}

export type AstNode =
  | NumberNode
  | MatrixNode
  | GroupNode
  | UnaryNode
  | BinaryNode
  | PowerNode
  | TransposeNode
  | CallNode;

export interface MatrixLibrary {
  [name: string]: Matrix;
}

/* ------------------------------------------------------------------ *
 * Errors & tokens
 * ------------------------------------------------------------------ */

export class ExpressionError extends Error {
  readonly position: number | null;

  constructor(message: string, position: number | null = null) {
    super(message);
    this.name = 'ExpressionError';
    this.position = position;
  }
}

type TokenType = 'number' | 'name' | '^' | '+' | '-' | '*' | '/' | '(' | ')' | ',' | '⊙' | '⊗' | 'ᵀ' | 'eof';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const FUNCTION_NAMES: Record<string, { min: number; max: number }> = {
  det: { min: 1, max: 1 },
  inv: { min: 1, max: 1 },
  inverse: { min: 1, max: 1 },
  rank: { min: 1, max: 1 },
  trace: { min: 1, max: 1 },
  rref: { min: 1, max: 1 },
  transpose: { min: 1, max: 1 },
  adj: { min: 1, max: 1 },
  solve: { min: 2, max: 2 },
  minor: { min: 3, max: 3 },
};

function normalizeInput(input: string): string {
  return String(input)
    .replace(/[−–—]/g, '-')
    .replace(/[×·⋅∙]/g, '*')
    .replace(/\*\*/g, '^')
    .replace(/[ᵀᵗ]/g, 'ᵀ')
    .replace(/⁻¹/g, '^(-1)')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .trim();
}

export function tokenize(input: string): Token[] {
  const source = normalizeInput(input);
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < source.length && /[0-9.]/.test(source[j] as string)) j++;
      const value = source.slice(i, j);
      if ((value.match(/\./g) ?? []).length > 1) throw new ExpressionError(`小数格式有误：${value}`, i);
      tokens.push({ type: 'number', value, pos: i });
      i = j;
      continue;
    }
    if (/[A-Za-z_\u03b1-\u03c9]/.test(ch)) {
      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_\u03b1-\u03c9]/.test(source[j] as string)) j++;
      tokens.push({ type: 'name', value: source.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if ('^+-*/()'.includes(ch)) {
      tokens.push({ type: ch as TokenType, value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === ',' || ch === '⊙' || ch === '⊗' || ch === 'ᵀ') {
      tokens.push({ type: ch, value: ch, pos: i });
      i++;
      continue;
    }
    throw new ExpressionError(`无法识别字符「${ch}」`, i);
  }
  tokens.push({ type: 'eof', value: '', pos: source.length });
  return tokens;
}

/* ------------------------------------------------------------------ *
 * Parser
 * ------------------------------------------------------------------ */

class Parser {
  private readonly tokens: Token[];
  private pos = 0;
  private readonly library: MatrixLibrary;

  constructor(input: string, library: MatrixLibrary) {
    this.tokens = tokenize(input);
    this.library = library;
  }

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? { type: 'eof', value: '', pos: 0 };
  }

  private match(type: TokenType): Token | null {
    if (this.peek().type === type) {
      const token = this.peek();
      this.pos++;
      return token;
    }
    return null;
  }

  private expect(type: TokenType, message?: string): Token {
    const token = this.match(type);
    if (!token) throw new ExpressionError(message ?? `这里需要一个「${type}」`, this.peek().pos);
    return token;
  }

  parse(): AstNode {
    if (this.peek().type === 'eof') throw new ExpressionError('写一个矩阵表达式，例如 A × B');
    const node = this.parseAdditive();
    if (this.peek().type !== 'eof') {
      throw new ExpressionError(`表达式在「${this.peek().value}」处无法继续`, this.peek().pos);
    }
    return node;
  }

  private parseAdditive(): AstNode {
    let node = this.parseMultiplicative();
    while (this.peek().type === '+' || this.peek().type === '-') {
      const token = this.tokens[this.pos++];
      if (!token) break;
      const right = this.parseMultiplicative();
      node = {
        type: 'binary',
        op: token.type as BinaryOperator,
        left: node,
        right,
        pos: token.pos,
      };
    }
    return node;
  }

  private parseMultiplicative(): AstNode {
    let node = this.parseUnary();
    while (['*', '/', '⊙', '⊗'].includes(this.peek().type)) {
      const token = this.tokens[this.pos++];
      if (!token) break;
      const right = this.parseUnary();
      node = {
        type: 'binary',
        op: token.type as BinaryOperator,
        left: node,
        right,
        pos: token.pos,
      };
    }
    return node;
  }

  private parseUnary(): AstNode {
    const token = this.match('-');
    if (token) return { type: 'unary', op: '-', operand: this.parseUnary(), pos: token.pos };
    return this.parsePower();
  }

  private parsePower(): AstNode {
    let node = this.parsePostfix();
    if (this.match('^')) {
      const next = this.peek();
      if (next.type === 'name' && (next.value === 'T' || next.value === 't')) {
        this.pos++;
        return { type: 'transpose', operand: node, pos: node.pos };
      }
      const right = this.parseUnary();
      node = { type: 'power', base: node, exponent: right, pos: node.pos };
    }
    return node;
  }

  private parsePostfix(): AstNode {
    let node = this.parsePrimary();
    while (this.peek().type === 'ᵀ') {
      this.pos++;
      node = { type: 'transpose', operand: node, pos: node.pos };
    }
    return node;
  }

  private parsePrimary(): AstNode {
    const token = this.peek();
    if (token.type === 'number') {
      this.pos++;
      return { type: 'number', value: Q.parse(token.value), raw: token.value, pos: token.pos };
    }
    if (token.type === '(') {
      this.pos++;
      const node = this.parseAdditive();
      this.expect(')', '缺少右括号 )');
      return { type: 'group', operand: node, pos: token.pos };
    }
    if (token.type === 'name') {
      this.pos++;
      const name = token.value;
      if (this.peek().type === '(') {
        this.pos++;
        const args: AstNode[] = [];
        if (this.peek().type !== ')') {
          args.push(this.parseAdditive());
          while (this.match(',')) args.push(this.parseAdditive());
        }
        this.expect(')', `函数 ${name}(...) 缺少右括号`);
        const meta = FUNCTION_NAMES[name.toLowerCase()];
        if (!meta) throw new ExpressionError(`未知函数「${name}」`, token.pos);
        if (args.length < meta.min || args.length > meta.max) {
          throw new ExpressionError(
            `函数 ${name} 需要 ${meta.min === meta.max ? meta.min : `${meta.min}–${meta.max}`} 个参数`,
            token.pos,
          );
        }
        const callName: CallName =
          name.toLowerCase() === 'inverse'
            ? 'inv'
            : (name.toLowerCase() as CallName);
        return { type: 'call', name: callName, args, pos: token.pos };
      }
      if (!this.library[name]) {
        const examples = Object.keys(this.library).slice(0, 6).join('、');
        throw new ExpressionError(
          `矩阵库里没有「${name}」${examples ? `（现有：${examples}）` : ''}`,
          token.pos,
        );
      }
      return { type: 'matrix', name, pos: token.pos };
    }
    if (token.type === 'eof') throw new ExpressionError('表达式还没有写完', token.pos);
    throw new ExpressionError(`这里不能放「${token.value}」`, token.pos);
  }
}

export interface ParseSuccess {
  ok: true;
  ast: AstNode;
}

export interface ParseFailure {
  ok: false;
  error: string;
}

export type ParseResult = ParseSuccess | ParseFailure;

export function parseExpression(input: string, library: MatrixLibrary): ParseResult {
  try {
    const parser = new Parser(input, library);
    return { ok: true, ast: parser.parse() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const BINARY_SYMBOL: Record<BinaryOperator, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
  '⊙': '⊙',
  '⊗': '⊗',
};

export function formatAst(node: AstNode): string {
  switch (node.type) {
    case 'matrix':
      return node.name;
    case 'number':
      return formatNumber(node.value);
    case 'group':
      return `(${formatAst(node.operand)})`;
    case 'unary':
      return `−${formatAst(node.operand)}`;
    case 'binary':
      return `${formatAst(node.left)} ${BINARY_SYMBOL[node.op]} ${formatAst(node.right)}`;
    case 'power':
      return `${formatAst(node.base)}^${formatAst(node.exponent)}`;
    case 'transpose':
      return `${formatAst(node.operand)}ᵀ`;
    case 'call':
      return `${node.name}(${node.args.map(formatAst).join(', ')})`;
  }
}

/* ------------------------------------------------------------------ *
 * Runtime value helpers
 * ------------------------------------------------------------------ */

function asMatrixValue(value: RuntimeValue, context: string): MatrixRuntimeValue {
  if (value.kind !== 'matrix') {
    throw new ExpressionError(`${context} 需要矩阵，但 ${value.label} 是标量`);
  }
  return value;
}

function asScalar(value: RuntimeValue, context: string): Q {
  if (value.kind !== 'scalar') {
    throw new ExpressionError(`${context} 需要标量数字，但 ${value.label} 是矩阵`);
  }
  return value.value;
}

function scalarInteger(value: RuntimeValue, context: string): number {
  const scalar = asScalar(value, context);
  if (!scalar.isInteger) {
    throw new ExpressionError(`${context} 需要整数标量，得到 ${formatNumber(scalar)}`);
  }
  return Number(scalar.n);
}

type RuntimeValueDraft =
  | Omit<MatrixRuntimeValue, 'label'>
  | Omit<ScalarRuntimeValue, 'label'>;

interface OperationDraft {
  type: OperationType;
  operands: RuntimeValue[];
  expr: string;
  resultValue: RuntimeValueDraft;
  semantic: string;
  scalar?: Q;
  scalarLabel?: string;
  division?: boolean;
  exponent?: number;
}

/**
 * Evaluate a parsed expression while recording a flat, ordered list of
 * operations. Each intermediate gets a label M₁, M₂, … (or s₁ for scalars).
 */
export function evaluateExpression(
  ast: AstNode,
  library: MatrixLibrary,
  options: { record?: boolean } = {},
): EvaluationResult {
  const { record = true } = options;
  const ops: OperationRecord[] = [];
  let computedCount = 0;

  const makeRecord = (draft: OperationDraft): RuntimeValue => {
    computedCount += 1;
    const label = draft.resultValue.kind === 'matrix' ? `M${computedCount}` : `s${computedCount}`;
    const resultValue: RuntimeValue =
      draft.resultValue.kind === 'matrix'
        ? {
            kind: 'matrix',
            matrix: { ...draft.resultValue.matrix, name: label },
            expr: draft.resultValue.expr,
            label,
          }
        : {
            kind: 'scalar',
            value: draft.resultValue.value,
            expr: draft.resultValue.expr,
            label,
          };
    if (record) {
      ops.push({
        id: `op-${computedCount}`,
        type: draft.type,
        label,
        expr: draft.expr,
        semantic: draft.semantic,
        operands: draft.operands,
        resultValue,
        ...(draft.scalar !== undefined ? { scalar: draft.scalar } : {}),
        ...(draft.scalarLabel !== undefined ? { scalarLabel: draft.scalarLabel } : {}),
        ...(draft.division !== undefined ? { division: draft.division } : {}),
        ...(draft.exponent !== undefined ? { exponent: draft.exponent } : {}),
      });
    }
    return resultValue;
  };

  const visit = (node: AstNode): RuntimeValue => {
    switch (node.type) {
      case 'number':
        return {
          kind: 'scalar',
          value: node.value,
          label: formatNumber(node.value),
          expr: formatNumber(node.value),
        };

      case 'matrix': {
        const entry = library[node.name];
        if (!entry) throw new ExpressionError(`找不到矩阵 ${node.name}`);
        return { kind: 'matrix', matrix: entry, label: node.name, expr: node.name, origin: 'input' };
      }

      case 'group':
        return visit(node.operand);

      case 'unary': {
        const value = visit(node.operand);
        if (node.op === '-') {
          if (value.kind === 'matrix') {
            const result = scale(value.matrix, -1);
            return makeRecord({
              type: 'scale',
              scalar: Q.of(-1),
              scalarLabel: '−1',
              operands: [value],
              expr: `−${value.expr}`,
              resultValue: { kind: 'matrix', matrix: result, expr: `−${value.expr}` },
              semantic: '数乘',
            });
          }
          return {
            kind: 'scalar',
            value: value.value.neg(),
            label: `−${value.label}`,
            expr: `−${value.expr}`,
          };
        }
        return value;
      }

      case 'transpose': {
        const value = asMatrixValue(visit(node.operand), '转置');
        const result = transpose(value.matrix);
        return makeRecord({
          type: 'transpose',
          operands: [value],
          expr: `${value.expr}ᵀ`,
          resultValue: { kind: 'matrix', matrix: result, expr: `${value.expr}ᵀ` },
          semantic: '转置',
        });
      }

      case 'power': {
        const base = visit(node.base);
        const exponent = visit(node.exponent);
        if (base.kind === 'matrix') {
          const exp = scalarInteger(exponent, '矩阵幂');
          const result = power(base.matrix, exp);
          return makeRecord({
            type: exp === -1 ? 'inverse' : exp === 0 ? 'identity' : exp === 1 ? 'copy' : 'power',
            exponent: exp,
            operands: [base],
            expr: `${base.expr}^${exp}`,
            resultValue: { kind: 'matrix', matrix: result, expr: `${base.expr}^${exp}` },
            semantic: '矩阵幂',
          });
        }
        const result = asScalar(base, '标量幂').pow(scalarInteger(exponent, '标量幂'));
        return {
          kind: 'scalar',
          value: result,
          label: formatNumber(result),
          expr: `${base.expr}^${exponent.expr}`,
        };
      }

      case 'binary': {
        const left = visit(node.left);
        const right = visit(node.right);
        const symbol = BINARY_SYMBOL[node.op];

        if (node.op === '+' || node.op === '-') {
          if (left.kind === 'scalar' && right.kind === 'scalar') {
            const value = node.op === '+' ? left.value.add(right.value) : left.value.sub(right.value);
            return {
              kind: 'scalar',
              value,
              label: formatNumber(value),
              expr: `${left.expr} ${symbol} ${right.expr}`,
            };
          }
          const a = asMatrixValue(left, `矩阵${symbol}法`);
          const b = asMatrixValue(right, `矩阵${symbol}法`);
          const result = node.op === '+' ? add(a.matrix, b.matrix) : subtract(a.matrix, b.matrix);
          return makeRecord({
            type: node.op === '+' ? 'add' : 'subtract',
            operands: [a, b],
            expr: `${a.expr} ${symbol} ${b.expr}`,
            resultValue: { kind: 'matrix', matrix: result, expr: `${a.expr} ${symbol} ${b.expr}` },
            semantic: node.op === '+' ? '矩阵加法' : '矩阵减法',
          });
        }

        if (node.op === '*') {
          if (left.kind === 'matrix' && right.kind === 'matrix') {
            const result = matmul(left.matrix, right.matrix);
            return makeRecord({
              type: 'matmul',
              operands: [left, right],
              expr: `${left.expr} × ${right.expr}`,
              resultValue: { kind: 'matrix', matrix: result, expr: `${left.expr} × ${right.expr}` },
              semantic: '矩阵乘法',
            });
          }
          if (left.kind === 'scalar' && right.kind === 'matrix') {
            const result = scale(right.matrix, left.value);
            return makeRecord({
              type: 'scale',
              scalar: left.value,
              scalarLabel: left.label,
              operands: [right],
              expr: `${left.label} × ${right.expr}`,
              resultValue: { kind: 'matrix', matrix: result, expr: `${left.label} × ${right.expr}` },
              semantic: '数乘',
            });
          }
          if (left.kind === 'matrix' && right.kind === 'scalar') {
            const result = scale(left.matrix, right.value);
            return makeRecord({
              type: 'scale',
              scalar: right.value,
              scalarLabel: right.label,
              operands: [left],
              expr: `${left.expr} × ${right.label}`,
              resultValue: { kind: 'matrix', matrix: result, expr: `${left.expr} × ${right.label}` },
              semantic: '数乘',
            });
          }
          const value = asScalar(left, '标量乘法').mul(asScalar(right, '标量乘法'));
          return { kind: 'scalar', value, label: formatNumber(value), expr: `${left.expr} × ${right.expr}` };
        }

        if (node.op === '/') {
          if (left.kind === 'matrix') {
            const scalar = asScalar(right, '矩阵除法');
            if (scalar.isZero) throw new ExpressionError('不能除以 0');
            const result = divide(left.matrix, scalar);
            return makeRecord({
              type: 'scale',
              scalar: scalar.pow(-1),
              scalarLabel: `1/${formatNumber(scalar)}`,
              division: true,
              operands: [left],
              expr: `${left.expr} ÷ ${right.label}`,
              resultValue: { kind: 'matrix', matrix: result, expr: `${left.expr} ÷ ${right.label}` },
              semantic: '数除',
            });
          }
          const value = asScalar(left, '除法').div(asScalar(right, '除法'));
          return { kind: 'scalar', value, label: formatNumber(value), expr: `${left.expr} ÷ ${right.expr}` };
        }

        if (node.op === '⊙') {
          const a = asMatrixValue(left, 'Hadamard 乘积');
          const b = asMatrixValue(right, 'Hadamard 乘积');
          const result = hadamard(a.matrix, b.matrix);
          return makeRecord({
            type: 'hadamard',
            operands: [a, b],
            expr: `${a.expr} ⊙ ${b.expr}`,
            resultValue: { kind: 'matrix', matrix: result, expr: `${a.expr} ⊙ ${b.expr}` },
            semantic: 'Hadamard 逐项乘积',
          });
        }

        if (node.op === '⊗') {
          const a = asMatrixValue(left, 'Kronecker 积');
          const b = asMatrixValue(right, 'Kronecker 积');
          if (a.matrix.rows * b.matrix.rows > 50 || a.matrix.cols * b.matrix.cols > 50) {
            throw new ExpressionError('演示尺寸上限为 50×50，请换小一些的矩阵');
          }
          const result = kronecker(a.matrix, b.matrix);
          return makeRecord({
            type: 'kron',
            operands: [a, b],
            expr: `${a.expr} ⊗ ${b.expr}`,
            resultValue: { kind: 'matrix', matrix: result, expr: `${a.expr} ⊗ ${b.expr}` },
            semantic: 'Kronecker 积',
          });
        }

        throw new ExpressionError(`暂不支持运算符 ${node.op}`);
      }

      case 'call': {
        const args = node.args.map(visit);
        switch (node.name) {
          case 'det': {
            const a = asMatrixValue(args[0]!, 'det');
            const value = determinant(a.matrix);
            return makeRecord({
              type: 'determinant',
              operands: [a],
              expr: `det(${a.expr})`,
              resultValue: { kind: 'scalar', value, expr: `det(${a.expr})` },
              scalar: value,
              semantic: '行列式',
            });
          }
          case 'trace': {
            const a = asMatrixValue(args[0]!, 'trace');
            const value = trace(a.matrix);
            return makeRecord({
              type: 'trace',
              operands: [a],
              expr: `trace(${a.expr})`,
              resultValue: { kind: 'scalar', value, expr: `trace(${a.expr})` },
              scalar: value,
              semantic: '迹',
            });
          }
          case 'rank': {
            const a = asMatrixValue(args[0]!, 'rank');
            const value = Q.of(rank(a.matrix));
            return makeRecord({
              type: 'rank',
              operands: [a],
              expr: `rank(${a.expr})`,
              resultValue: { kind: 'scalar', value, expr: `rank(${a.expr})` },
              scalar: value,
              semantic: '秩',
            });
          }
          case 'inv': {
            const a = asMatrixValue(args[0]!, 'inv');
            const result = inverse(a.matrix);
            return makeRecord({
              type: 'inverse',
              operands: [a],
              expr: `inv(${a.expr})`,
              resultValue: { kind: 'matrix', matrix: result, expr: `inv(${a.expr})` },
              semantic: '逆矩阵',
            });
          }
          case 'adj': {
            const a = asMatrixValue(args[0]!, 'adj');
            const result = adjugate(a.matrix);
            return makeRecord({
              type: 'adjugate',
              operands: [a],
              expr: `adj(${a.expr})`,
              resultValue: { kind: 'matrix', matrix: result, expr: `adj(${a.expr})` },
              semantic: '伴随矩阵',
            });
          }
          case 'rref': {
            const a = asMatrixValue(args[0]!, 'rref');
            const result = rref(a.matrix);
            return makeRecord({
              type: 'rref',
              operands: [a],
              expr: `rref(${a.expr})`,
              resultValue: { kind: 'matrix', matrix: result, expr: `rref(${a.expr})` },
              semantic: '简化行阶梯形',
            });
          }
          case 'transpose': {
            const a = asMatrixValue(args[0]!, 'transpose');
            const result = transpose(a.matrix);
            return makeRecord({
              type: 'transpose',
              operands: [a],
              expr: `transpose(${a.expr})`,
              resultValue: { kind: 'matrix', matrix: result, expr: `transpose(${a.expr})` },
              semantic: '转置',
            });
          }
          case 'solve': {
            const a = asMatrixValue(args[0]!, 'solve');
            const b = asMatrixValue(args[1]!, 'solve');
            const { x } = solveLinear(a.matrix, b.matrix);
            return makeRecord({
              type: 'solve',
              operands: [a, b],
              expr: `solve(${a.expr}, ${b.expr})`,
              resultValue: { kind: 'matrix', matrix: x, expr: `solve(${a.expr}, ${b.expr})` },
              semantic: '线性方程组求解',
            });
          }
          case 'minor': {
            const a = asMatrixValue(args[0]!, 'minor');
            const row = scalarInteger(args[1]!, 'minor 行号');
            const col = scalarInteger(args[2]!, 'minor 列号');
            const value = minor(a.matrix, row - 1, col - 1);
            return {
              kind: 'scalar',
              value,
              label: formatNumber(value),
              expr: `minor(${a.expr},${row},${col})`,
            };
          }
        }
      }
    }
  };

  const result = visit(ast);
  if (record && ops.length) {
    const last = ops[ops.length - 1];
    if (last) last.isRoot = true;
  }
  return { result, ops };
}

/* ------------------------------------------------------------------ *
 * Analysis facade
 * ------------------------------------------------------------------ */

export interface AnalysisSuccess {
  ok: true;
  ast: AstNode;
  result: RuntimeValue;
  formatted: string;
  opCount: number;
  label: string;
  kind: 'matrix';
  shape: Shape;
}

export interface ScalarAnalysisSuccess {
  ok: true;
  ast: AstNode;
  result: ScalarRuntimeValue;
  formatted: string;
  opCount: number;
  label: string;
  kind: 'scalar';
  value: Q;
}

export interface AnalysisFailure {
  ok: false;
  input: string;
  error: string;
  ast?: AstNode;
}

export type ExpressionAnalysis = AnalysisSuccess | ScalarAnalysisSuccess | AnalysisFailure;

export function analyzeExpression(input: string, library: MatrixLibrary): ExpressionAnalysis {
  const parsed = parseExpression(input, library);
  if (!parsed.ok) return { ok: false, error: parsed.error, input };
  try {
    const { result, ops } = evaluateExpression(parsed.ast, library, { record: true });
    const formatted = formatAst(parsed.ast);
    if (result.kind === 'matrix') {
      return {
        ok: true,
        ast: parsed.ast,
        result,
        formatted,
        opCount: ops.length,
        label: result.label,
        kind: 'matrix',
        shape: { rows: result.matrix.rows, cols: result.matrix.cols },
      };
    }
    return {
      ok: true,
      ast: parsed.ast,
      result,
      formatted,
      opCount: ops.length,
      label: result.label,
      kind: 'scalar',
      value: result.value,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      input,
      ast: parsed.ast,
    };
  }
}

export function describeShape(value: RuntimeValue | null | undefined): string {
  if (!value) return '';
  if (value.kind === 'scalar') return `标量 ${formatNumber(value.value)}`;
  return `${value.matrix.rows}×${value.matrix.cols}`;
}

export interface InsertResult {
  value: string;
  cursor: number;
}

export function insertAtCursor(
  text: string,
  insert: string,
  selectionStart?: number | null,
  selectionEnd?: number | null,
): InsertResult {
  const start = selectionStart ?? text.length;
  const end = selectionEnd ?? text.length;
  const before = text.slice(0, start);
  const after = text.slice(end);
  const startsWithSpace = /^\s/.test(insert);
  const endsWithSpace = /\s$/.test(insert);
  const needsSpaceBefore =
    before.length > 0 && !/[\s(]$/.test(before) && !/^[+\-*/^,)]/.test(insert) && !startsWithSpace;
  const needsSpaceAfter =
    after.length > 0 && !/^[\s)]/.test(after) && !/[+\-*/^,(]$/.test(insert) && !endsWithSpace;
  const value = `${needsSpaceBefore ? ' ' : ''}${insert}${needsSpaceAfter ? ' ' : ''}`;
  return { value: before + value + after, cursor: start + value.length };
}

export type { RationalInput };
