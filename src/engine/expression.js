import { Q, formatNumber } from './rational.js';
import {
  add,
  adjugate,
  determinant,
  hadamard,
  inverse,
  kronecker,
  matmul,
  power,
  rank,
  rref,
  scale,
  subtract,
  trace,
  transpose,
  divide,
  solveLinear,
  minor,
} from './matrix.js';

const FUNCTION_NAMES = new Map([
  ['det', { min: 1, max: 1 }],
  ['inv', { min: 1, max: 1 }],
  ['inverse', { min: 1, max: 1 }],
  ['rank', { min: 1, max: 1 }],
  ['trace', { min: 1, max: 1 }],
  ['rref', { min: 1, max: 1 }],
  ['transpose', { min: 1, max: 1 }],
  ['adj', { min: 1, max: 1 }],
  ['solve', { min: 2, max: 2 }],
  ['minor', { min: 3, max: 3 }],
]);

export class ExpressionError extends Error {
  constructor(message, position = null) {
    super(message);
    this.name = 'ExpressionError';
    this.position = position;
  }
}

function normalizeInput(input) {
  return String(input)
    .replace(/[−–—]/g, '-')
    .replace(/[×·⋅∙]/g, '*')
    .replace(/\*\*/g, '^')
    .replace(/[ᵀᵗ]/g, 'ᵀ')
    .replace(/⁻¹/g, '^(-1)')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⊙/g, '⊙')
    .replace(/⊗/g, '⊗')
    .trim();
}

export function tokenize(input) {
  const s = normalizeInput(input);
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const text = s.slice(i, j);
      if ((text.match(/\./g) || []).length > 1) throw new ExpressionError(`小数格式有误：${text}`, i);
      tokens.push({ type: 'number', value: text, pos: i });
      i = j;
      continue;
    }
    if (/[A-Za-z_\u03b1-\u03c9]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_\u03b1-\u03c9]/.test(s[j])) j++;
      tokens.push({ type: 'name', value: s.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (ch === '^' || ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')' || ch === ',') {
      tokens.push({ type: ch, value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === '⊙' || ch === '⊗' || ch === 'ᵀ') {
      tokens.push({ type: ch, value: ch, pos: i });
      i++;
      continue;
    }
    throw new ExpressionError(`无法识别字符「${ch}」`, i);
  }
  tokens.push({ type: 'eof', value: '', pos: s.length });
  return tokens;
}

class Parser {
  constructor(input, library) {
    this.input = input;
    this.tokens = tokenize(input);
    this.pos = 0;
    this.library = library;
  }

  peek(offset = 0) {
    return this.tokens[this.pos + offset];
  }

  match(type) {
    if (this.peek().type === type) {
      const token = this.peek();
      this.pos++;
      return token;
    }
    return null;
  }

  expect(type, message) {
    const token = this.match(type);
    if (!token) throw new ExpressionError(message || `这里需要一个「${type}」`, this.peek().pos);
    return token;
  }

  parse() {
    if (this.peek().type === 'eof') throw new ExpressionError('写一个矩阵表达式，例如 A × B');
    const node = this.parseAdditive();
    if (this.peek().type !== 'eof') {
      throw new ExpressionError(`表达式在「${this.peek().value}」处无法继续`, this.peek().pos);
    }
    return node;
  }

  parseAdditive() {
    let node = this.parseMultiplicative();
    while (this.peek().type === '+' || this.peek().type === '-') {
      const op = this.pos++;
      const right = this.parseMultiplicative();
      node = { type: 'binary', op: this.tokens[op].type, left: node, right, pos: this.tokens[op].pos };
    }
    return node;
  }

  parseMultiplicative() {
    let node = this.parseUnary();
    while (['*', '/', '⊙', '⊗'].includes(this.peek().type)) {
      const token = this.pos++;
      const right = this.parseUnary();
      node = {
        type: 'binary',
        op: this.tokens[token].type,
        left: node,
        right,
        pos: this.tokens[token].pos,
      };
    }
    return node;
  }

  parseUnary() {
    const token = this.match('-');
    if (token) return { type: 'unary', op: '-', operand: this.parseUnary(), pos: token.pos };
    return this.parsePower();
  }

  parsePower() {
    let node = this.parsePostfix();
    if (this.match('^')) {
      const next = this.peek();
      if (next.type === 'name' && (next.value === 'T' || next.value === 't')) {
        this.pos++;
        node = { type: 'transpose', operand: node, pos: node.pos };
        return node;
      }
      const right = this.parseUnary();
      node = { type: 'power', base: node, exponent: right, pos: node.pos };
    }
    return node;
  }

  parsePostfix() {
    let node = this.parsePrimary();
    while (this.peek().type === 'ᵀ') {
      this.pos++;
      node = { type: 'transpose', operand: node, pos: node.pos };
    }
    return node;
  }

  parsePrimary() {
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
        const args = [];
        if (this.peek().type !== ')') {
          args.push(this.parseAdditive());
          while (this.match(',')) args.push(this.parseAdditive());
        }
        this.expect(')', `函数 ${name}(...) 缺少右括号`);
        const meta = FUNCTION_NAMES.get(name.toLowerCase());
        if (!meta) throw new ExpressionError(`未知函数「${name}」`, token.pos);
        if (args.length < meta.min || args.length > meta.max) {
          throw new ExpressionError(`函数 ${name} 需要 ${meta.min === meta.max ? meta.min : `${meta.min}–${meta.max}`} 个参数`, token.pos);
        }
        return {
          type: 'call',
          name: name.toLowerCase() === 'inverse' ? 'inv' : name.toLowerCase() === 'transpose' ? 'transpose' : name.toLowerCase(),
          args,
          pos: token.pos,
        };
      }
      if (!this.library[name]) {
        const examples = Object.keys(this.library).slice(0, 6).join('、');
        throw new ExpressionError(`矩阵库里没有「${name}」${examples ? `（现有：${examples}）` : ''}`, token.pos);
      }
      return { type: 'matrix', name, pos: token.pos };
    }
    if (token.type === 'eof') throw new ExpressionError('表达式还没有写完', token.pos);
    throw new ExpressionError(`这里不能放「${token.value}」`, token.pos);
  }
}

export function parseExpression(input, library) {
  try {
    const parser = new Parser(input, library);
    return { ok: true, ast: parser.parse() };
  } catch (error) {
    return { ok: false, error: error instanceof ExpressionError ? error.message : String(error) };
  }
}

const BINARY_SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷', '⊙': '⊙', '⊗': '⊗' };

export function formatAst(node, { pretty = true } = {}) {
  if (!node) return '';
  switch (node.type) {
    case 'matrix':
      return node.name;
    case 'number':
      return formatNumber(node.value);
    case 'group':
      return `(${formatAst(node.operand, { pretty })})`;
    case 'unary':
      return `−${formatAst(node.operand, { pretty })}`;
    case 'binary':
      return `${formatAst(node.left, { pretty })} ${BINARY_SYMBOL[node.op] || node.op} ${formatAst(node.right, { pretty })}`;
    case 'power':
      return `${formatAst(node.base, { pretty })}^${formatAst(node.exponent, { pretty })}`;
    case 'transpose':
      return `${formatAst(node.operand, { pretty })}ᵀ`;
    case 'call':
      return `${node.name}(${node.args.map((arg) => formatAst(arg, { pretty })).join(', ')})`;
    default:
      return '';
  }
}

function valueLabel(value) {
  return value.label;
}

function asMatrix(value, context) {
  if (value.kind !== 'matrix') {
    throw new ExpressionError(`${context} 需要矩阵，但 ${value.label} 是标量`);
  }
  return value.matrix;
}

function asScalar(value, context) {
  if (value.kind !== 'scalar') {
    throw new ExpressionError(`${context} 需要标量数字，但 ${value.label} 是矩阵`);
  }
  return value.value;
}

function scalarInteger(value, context) {
  const scalar = asScalar(value, context);
  if (!scalar.isInteger) throw new ExpressionError(`${context} 需要整数标量，得到 ${formatNumber(scalar)}`);
  return Number(scalar.n);
}

/**
 * Evaluate a parsed expression and record a linear list of operations.
 * Each intermediate matrix gets a label M₁, M₂, … for later animation.
 */
export function evaluateExpression(ast, library, { record = true } = {}) {
  const ops = [];
  let computedCount = 0;

  const makeRecord = (op) => {
    computedCount += 1;
    const resultValue = op.resultValue;
    const label = resultValue.kind === 'matrix' ? `M${computedCount}` : `s${computedCount}`;
    const labeledResult =
      resultValue.kind === 'matrix'
        ? { ...resultValue, matrix: { ...resultValue.matrix, name: label }, label }
        : { ...resultValue, label };
    const record = { ...op, id: `op-${computedCount}`, label, operands: op.operands, resultValue: labeledResult };
    if (record) ops.push(record);
    return labeledResult;
  };

  const visit = (node) => {
    switch (node.type) {
      case 'number':
        return { kind: 'scalar', value: node.value, label: formatNumber(node.value), expr: formatNumber(node.value) };
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
              resultMatrix: result,
              semantic: '数乘',
            });
          }
          return { kind: 'scalar', value: value.value.neg(), label: `−${value.label}`, expr: `−${value.expr}` };
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
          resultMatrix: result,
          semantic: '转置',
        });
      }
      case 'power': {
        const base = visit(node.base);
        const exponent = visit(node.exponent);
        if (base.kind === 'matrix') {
          const e = scalarInteger(exponent, '矩阵幂');
          const result = power(base.matrix, e);
          return makeRecord({
            type: e === -1 ? 'inverse' : e === 0 ? 'identity' : e === 1 ? 'copy' : 'power',
            exponent: e,
            operands: [base],
            expr: `${base.expr}^${e}`,
            resultValue: { kind: 'matrix', matrix: result, expr: `${base.expr}^${e}` },
            resultMatrix: result,
            semantic: '矩阵幂',
          });
        }
        const s = asScalar(base, '标量幂').pow(scalarInteger(exponent, '标量幂'));
        return {
          kind: 'scalar',
          value: s,
          label: formatNumber(s),
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
            return { kind: 'scalar', value, label: formatNumber(value), expr: `${left.expr} ${symbol} ${right.expr}` };
          }
          const a = asMatrixValue(left, `矩阵${symbol}法`);
          const b = asMatrixValue(right, `矩阵${symbol}法`);
          const result = node.op === '+' ? add(a.matrix, b.matrix) : subtract(a.matrix, b.matrix);
          return makeRecord({
            type: node.op === '+' ? 'add' : 'subtract',
            operands: [a, b],
            expr: `${a.expr} ${symbol} ${b.expr}`,
            resultValue: { kind: 'matrix', matrix: result, expr: `${a.expr} ${symbol} ${b.expr}` },
            resultMatrix: result,
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
              resultMatrix: result,
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
              resultMatrix: result,
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
              resultMatrix: result,
              semantic: '数乘',
            });
          }
          const value = left.value.mul(right.value);
          return { kind: 'scalar', value, label: formatNumber(value), expr: `${left.expr} × ${right.expr}` };
        }
        if (node.op === '/') {
          if (left.kind === 'matrix') {
            const s = asScalar(right, '矩阵除法');
            if (s.isZero) throw new ExpressionError('不能除以 0');
            const result = divide(left.matrix, s);
            return makeRecord({
              type: 'scale',
              scalar: s.pow(-1),
              scalarLabel: `1/${formatNumber(s)}`,
              division: true,
              operands: [left],
              expr: `${left.expr} ÷ ${right.label}`,
              resultValue: { kind: 'matrix', matrix: result, expr: `${left.expr} ÷ ${right.label}` },
              resultMatrix: result,
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
            resultMatrix: result,
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
            resultMatrix: result,
            semantic: 'Kronecker 积',
          });
        }
        throw new ExpressionError(`暂不支持运算符 ${node.op}`);
      }
      case 'call': {
        const args = node.args.map(visit);
        switch (node.name) {
          case 'det': {
            const a = asMatrixValue(args[0], 'det');
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
            const a = asMatrixValue(args[0], 'trace');
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
            const a = asMatrixValue(args[0], 'rank');
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
            const a = asMatrixValue(args[0], 'inv');
            const result = inverse(a.matrix);
            return makeRecord({
              type: 'inverse',
              operands: [a],
              expr: `inv(${a.expr})`,
              resultValue: { kind: 'matrix', matrix: result, expr: `inv(${a.expr})` },
              resultMatrix: result,
              semantic: '逆矩阵',
            });
          }
          case 'adj': {
            if (args[0].kind !== 'matrix') throw new ExpressionError('adj 需要矩阵参数');
            const result = adjugate(args[0].matrix);
            return makeRecord({
              type: 'adjugate',
              operands: [args[0]],
              expr: `adj(${args[0].expr})`,
              resultValue: { kind: 'matrix', matrix: result, expr: `adj(${args[0].expr})` },
              resultMatrix: result,
              semantic: '伴随矩阵',
            });
          }
          case 'rref': {
            const a = asMatrixValue(args[0], 'rref');
            const result = rref(a.matrix);
            return makeRecord({
              type: 'rref',
              operands: [a],
              expr: `rref(${a.expr})`,
              resultValue: { kind: 'matrix', matrix: result, expr: `rref(${a.expr})` },
              resultMatrix: result,
              semantic: '简化行阶梯形',
            });
          }
          case 'transpose': {
            const a = asMatrixValue(args[0], 'transpose');
            const result = transpose(a.matrix);
            return makeRecord({
              type: 'transpose',
              operands: [a],
              expr: `transpose(${a.expr})`,
              resultValue: { kind: 'matrix', matrix: result, expr: `transpose(${a.expr})` },
              resultMatrix: result,
              semantic: '转置',
            });
          }
          case 'solve': {
            if (args[0].kind !== 'matrix' || args[1].kind !== 'matrix') {
              throw new ExpressionError('solve(A, b) 需要两个矩阵参数');
            }
            const { x } = solveLinear(args[0].matrix, args[1].matrix);
            return makeRecord({
              type: 'solve',
              operands: [args[0], args[1]],
              expr: `solve(${args[0].expr}, ${args[1].expr})`,
              resultValue: { kind: 'matrix', matrix: x, expr: `solve(${args[0].expr}, ${args[1].expr})` },
              resultMatrix: x,
              semantic: '线性方程组求解',
            });
          }
          case 'minor': {
            if (args[0].kind !== 'matrix') throw new ExpressionError('minor 的第一个参数需要矩阵');
            const row = scalarInteger(args[1], 'minor 行号');
            const col = scalarInteger(args[2], 'minor 列号');
            const value = minor(args[0].matrix, row - 1, col - 1);
            return {
              kind: 'scalar',
              value,
              label: formatNumber(value),
              expr: `minor(${args[0].expr},${row},${col})`,
            };
          }
          default:
            throw new ExpressionError(`暂不支持函数 ${node.name}`);
        }
      }
      default:
        throw new ExpressionError('表达式结构无法识别');
    }
  };

  const result = visit(ast);
  if (record && ops.length && result.kind === 'matrix') {
    // The last result is the one shown in the conclusion. Mark its friendly label.
    const last = ops[ops.length - 1];
    last.isRoot = true;
  }
  if (record && ops.length && result.kind === 'scalar') {
    const last = ops[ops.length - 1];
    last.isRoot = true;
  }
  return { result, ops };
}

function asMatrixValue(value, context) {
  if (value.kind !== 'matrix') {
    throw new ExpressionError(`${context} 需要矩阵，但 ${value.label} 是标量`);
  }
  return value;
}

export function analyzeExpression(input, library) {
  const parsed = parseExpression(input, library);
  if (!parsed.ok) return { ok: false, error: parsed.error, input };
  try {
    const { result, ops } = evaluateExpression(parsed.ast, library, { record: true });
    if (result.kind === 'matrix') {
      return {
        ok: true,
        ast: parsed.ast,
        kind: 'matrix',
        shape: { rows: result.matrix.rows, cols: result.matrix.cols },
        label: result.label,
        result,
        opCount: ops.length,
        formatted: formatAst(parsed.ast),
      };
    }
    return {
      ok: true,
      ast: parsed.ast,
      kind: 'scalar',
      value: result.value,
      label: result.label,
      result,
      opCount: ops.length,
      formatted: formatAst(parsed.ast),
    };
  } catch (error) {
    return { ok: false, error: error.message, input, ast: parsed.ast };
  }
}

export function describeShape(value) {
  if (!value) return '';
  if (value.kind === 'scalar') return `标量 ${formatNumber(value.value)}`;
  return `${value.matrix.rows}×${value.matrix.cols}`;
}

export function insertAtCursor(text, insert, selectionStart, selectionEnd) {
  const start = selectionStart ?? text.length;
  const end = selectionEnd ?? text.length;
  const before = text.slice(0, start);
  const after = text.slice(end);
  const startsWithSpace = /^\s/.test(insert);
  const endsWithSpace = /\s$/.test(insert);
  const needsSpaceBefore =
    before && !/[\s(]$/.test(before) && !/^[+\-*/^,)]/.test(insert) && !startsWithSpace;
  const needsSpaceAfter =
    after && !/^[\s)]/.test(after) && !/[+\-*/^,(]$/.test(insert) && !endsWithSpace;
  const value = `${needsSpaceBefore ? ' ' : ''}${insert}${needsSpaceAfter ? ' ' : ''}`;
  return { value: before + value + after, cursor: start + value.length };
}
