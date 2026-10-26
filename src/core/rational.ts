/**
 * Exact rational arithmetic.
 *
 * This module is pure computation: it has no DOM, React, or renderer imports.
 * Every number displayed by the workbench can ultimately be traced back here.
 */

const B0 = 0n;
const B1 = 1n;

export type RationalInput = Q | bigint | number | string;

interface DecimalParts {
  n: bigint;
  d: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < B0 ? -a : a;
  b = b < B0 ? -b : b;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || B1;
}

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

function parseDecimalString(text: string): DecimalParts {
  const s = String(text).trim().replace(/[−–—]/g, '-').replace(/,/g, '');
  if (!s) throw new Error('空数值');
  const sci = s.match(/^([+-]?)(\d*\.?\d+)(?:[eE]([+-]?\d+))?$/);
  if (!sci) throw new Error(`无法识别的数值「${text}」`);
  const sign = sci[1] === '-' ? -1n : 1n;
  const mantissa = sci[2] ?? '0';
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
  readonly n: bigint;
  readonly d: bigint;

  constructor(n: bigint = B0, d: bigint = B1) {
    if (d === B0) throw new Error('分母不能为 0');
    if (d < B0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    this.n = n / g;
    this.d = d / g;
  }

  static of(value: RationalInput): Q {
    if (value instanceof Q) return value;
    if (typeof value === 'bigint') return new Q(value, B1);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('只支持有限实数');
      return Q.parse(String(value));
    }
    return Q.parse(value);
  }

  static parse(value: string | number | bigint): Q {
    const text = String(value).trim();
    if (!text) throw new Error('空数值');
    if (text.includes('/')) {
      const parts = text.split('/');
      if (parts.length !== 2) throw new Error(`无法识别的分数「${value}」`);
      const [aText, bText] = parts as [string, string];
      const a = parseDecimalString(aText);
      const b = parseDecimalString(bText);
      return new Q(a.n, a.d).div(new Q(b.n, b.d));
    }
    const { n, d } = parseDecimalString(text);
    return new Q(n, d);
  }

  get isZero(): boolean {
    return this.n === B0;
  }

  get isOne(): boolean {
    return this.n === B1 && this.d === B1;
  }

  get isInteger(): boolean {
    return this.d === B1;
  }

  get sign(): -1 | 0 | 1 {
    return this.n === B0 ? 0 : this.n > 0 ? 1 : -1;
  }

  add(value: RationalInput): Q {
    const b = Q.of(value);
    return new Q(this.n * b.d + b.n * this.d, this.d * b.d);
  }

  sub(value: RationalInput): Q {
    const b = Q.of(value);
    return new Q(this.n * b.d - b.n * this.d, this.d * b.d);
  }

  mul(value: RationalInput): Q {
    const b = Q.of(value);
    return new Q(this.n * b.n, this.d * b.d);
  }

  div(value: RationalInput): Q {
    const b = Q.of(value);
    if (b.isZero) throw new Error('不能除以 0');
    return new Q(this.n * b.d, this.d * b.n);
  }

  neg(): Q {
    return new Q(-this.n, this.d);
  }

  abs(): Q {
    return this.n < 0 ? this.neg() : this;
  }

  pow(exp: number): Q {
    if (!Number.isInteger(exp)) throw new Error('幂次必须是整数');
    if (exp === 0) return new Q(1n, 1n);
    if (exp < 0) return new Q(this.d, this.n).pow(-exp);
    return new Q(this.n ** BigInt(exp), this.d ** BigInt(exp));
  }

  cmp(value: RationalInput): -1 | 0 | 1 {
    const b = Q.of(value);
    const left = this.n * b.d;
    const right = b.n * this.d;
    return left === right ? 0 : left < right ? -1 : 1;
  }

  eq(value: RationalInput): boolean {
    try {
      return this.cmp(value) === 0;
    } catch {
      return false;
    }
  }

  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }

  toString(): string {
    return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`;
  }

  toJSON(): string {
    return this.toString();
  }

  clone(): Q {
    return new Q(this.n, this.d);
  }
}

export const ZERO = new Q(0n, 1n);
export const ONE = new Q(1n, 1n);

export function q(value: RationalInput): Q {
  return Q.of(value);
}

export function formatNumber(value: RationalInput, options: { approximate?: boolean } = {}): string {
  const rational = Q.of(value);
  if (rational.isInteger) return String(rational.n);
  if (options.approximate) {
    const n = rational.toNumber();
    return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }
  return rational.toString();
}

export function formatCompact(value: RationalInput): string {
  const rational = Q.of(value);
  const text = rational.toString();
  if (text.length <= 9) return text;
  if (rational.isInteger) return rational.toNumber().toExponential(3).replace('e+', 'e');
  return rational.toNumber().toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export function parseNumber(value: string): Q {
  return Q.parse(value);
}
