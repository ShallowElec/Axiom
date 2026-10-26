/* Exact rational arithmetic for every number shown in the atelier. */

const B0 = 0n;
const B1 = 1n;

function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || 1n;
}

function pow10(n) {
  return 10n ** BigInt(n);
}

function parseDecimalString(text) {
  let s = String(text).trim().replace(/[−–—]/g, '-').replace(/,/g, '');
  if (!s) throw new Error('空数值');
  if (/^[+-]?\d+\/\d+$/.test(s)) {
    const [a, b] = s.split('/');
    return { n: BigInt(a), d: BigInt(b) };
  }
  const sci = s.match(/^([+-]?)(\d*\.?\d+)(?:[eE]([+-]?\d+))?$/);
  if (!sci) throw new Error(`无法识别的数值「${text}」`);
  const sign = sci[1] === '-' ? -1n : 1n;
  const mantissa = sci[2];
  const exp = sci[3] ? Number(sci[3]) : 0;
  const dot = mantissa.indexOf('.');
  const decimals = dot === -1 ? 0 : mantissa.length - dot - 1;
  const digits = mantissa.replace('.', '') || '0';
  let n = BigInt(digits) * sign;
  let d = pow10(decimals);
  if (exp > 0) n *= pow10(exp);
  if (exp < 0) d *= pow10(-exp);
  return { n, d };
}

export class Q {
  constructor(n = 0n, d = 1n) {
    if (typeof n === 'number') n = BigInt(n);
    if (typeof d === 'number') d = BigInt(d);
    if (d === B0) throw new Error('分母不能为 0');
    if (d < B0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    this.n = n / g;
    this.d = d / g;
  }

  static of(value) {
    if (value instanceof Q) return value;
    if (typeof value === 'bigint') return new Q(value, B1);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('只支持有限实数');
      return Q.parse(String(value));
    }
    return Q.parse(value);
  }

  static parse(value) {
    const text = String(value).trim();
    if (!text) throw new Error('空数值');
    if (text.includes('/')) {
      const [a, b] = text.split('/');
      return new Q(...Object.values(parseDecimalString(a))).div(
        new Q(...Object.values(parseDecimalString(b))),
      );
    }
    const { n, d } = parseDecimalString(text);
    return new Q(n, d);
  }

  get isZero() {
    return this.n === B0;
  }

  get isOne() {
    return this.n === B1 && this.d === B1;
  }

  get isInteger() {
    return this.d === B1;
  }

  get sign() {
    return this.n === B0 ? 0 : this.n > 0 ? 1 : -1;
  }

  add(o) {
    const b = Q.of(o);
    return new Q(this.n * b.d + b.n * this.d, this.d * b.d);
  }

  sub(o) {
    const b = Q.of(o);
    return new Q(this.n * b.d - b.n * this.d, this.d * b.d);
  }

  mul(o) {
    const b = Q.of(o);
    return new Q(this.n * b.n, this.d * b.d);
  }

  div(o) {
    const b = Q.of(o);
    if (b.isZero) throw new Error('不能除以 0');
    return new Q(this.n * b.d, this.d * b.n);
  }

  neg() {
    return new Q(-this.n, this.d);
  }

  abs() {
    return this.n < 0 ? this.neg() : this;
  }

  pow(exp) {
    const e = Number(exp);
    if (!Number.isInteger(e)) throw new Error('幂次必须是整数');
    if (e === 0) return new Q(1n, 1n);
    if (e < 0) return new Q(this.d, this.n).pow(-e);
    return new Q(this.n ** BigInt(e), this.d ** BigInt(e));
  }

  cmp(o) {
    const b = Q.of(o);
    const left = this.n * b.d;
    const right = b.n * this.d;
    return left === right ? 0 : left < right ? -1 : 1;
  }

  eq(o) {
    try {
      return this.cmp(o) === 0;
    } catch {
      return false;
    }
  }

  toNumber() {
    return Number(this.n) / Number(this.d);
  }

  toString() {
    return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`;
  }

  toJSON() {
    return this.toString();
  }

  clone() {
    return new Q(this.n, this.d);
  }
}

export const ZERO = new Q(0n, 1n);
export const ONE = new Q(1n, 1n);

export function q(value) {
  return Q.of(value);
}

export function formatNumber(value, { approximate = false } = {}) {
  if (!(value instanceof Q)) value = Q.of(value);
  if (value.isInteger) return String(value.n);
  if (approximate) {
    const n = value.toNumber();
    return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }
  return value.toString();
}

export function formatCompact(value) {
  if (!(value instanceof Q)) value = Q.of(value);
  const text = value.toString();
  if (text.length <= 9) return text;
  if (value.isInteger) {
    const n = value.toNumber();
    return n.toExponential(3).replace('e+', 'e');
  }
  return value.toNumber().toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export function parseNumber(value) {
  return Q.parse(value);
}
