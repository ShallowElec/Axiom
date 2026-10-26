import { Q, formatNumber } from './rational.js';
import * as M from './matrix.js';
import { analyzeExpression, evaluateExpression, formatAst } from './expression.js';

/* ------------------------------------------------------------------ *
 * Shared story vocabulary
 * ------------------------------------------------------------------ */

const SUBS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
export function sub(n) {
  return String(n)
    .split('')
    .map((d) => SUBS[Number(d)] || d)
    .join('');
}
export function cellName(prefix, r, c) {
  return `${prefix}${sub(r + 1)}${sub(c + 1)}`;
}
export function fmt(value) {
  return formatNumber(value);
}
export function wrapped(value) {
  const text = fmt(value);
  return value.sign < 0 || text.includes('/') ? `(${text})` : text;
}
export function rowText(row) {
  return `[ ${row.map((v) => fmt(v)).join('    ')} ]`;
}
export function rowBrackets(row) {
  return `⟨ ${row.map((v) => fmt(v)).join(', ')} ⟩`;
}

const key = (r, c) => `${r},${c}`;

function cellsHidden(matrix) {
  const out = {};
  for (let r = 0; r < matrix.rows; r++) {
    for (let c = 0; c < matrix.cols; c++) out[key(r, c)] = { hidden: true };
  }
  return out;
}

function markCell(cells, r, c, state) {
  cells[key(r, c)] = { ...cells[key(r, c)], ...state, hidden: false };
}

function completeCells(matrix, cells) {
  for (let r = 0; r < matrix.rows; r++) {
    for (let c = 0; c < matrix.cols; c++) {
      if (!cells[key(r, c)] || cells[key(r, c)].hidden) {
        markCell(cells, r, c, { tone: 'done', text: fmt(matrix.data[r][c]) });
      }
    }
  }
}

export function panel(matrix, label, options = {}) {
  return {
    key: options.key || label,
    label,
    matrix,
    role: options.role || 'input',
    caption: options.caption || '',
    shape: `${matrix.rows}×${matrix.cols}`,
    cells: options.cells || {},
    rowFocus: options.rowFocus || [],
    colFocus: options.colFocus || [],
    dividerAfter: options.dividerAfter ?? null,
    bracketTone: options.bracketTone || options.role || 'input',
    emptyNote: options.emptyNote,
  };
}

function beat(id, fields) {
  return {
    id,
    title: fields.title,
    narration: fields.narration || '',
    panels: fields.panels || [],
    connectors: fields.connectors || [],
    lens: fields.lens || {},
    readout: fields.readout || null,
    isFinale: Boolean(fields.isFinale),
    duration: fields.duration || null,
  };
}

function chapter(id, title, tag, description, beats) {
  return { id, title, tag, description, beats };
}

function makeLens({
  kicker,
  heading,
  equation,
  terms = [],
  accumulator = null,
  note = '',
  rule = '',
}) {
  return { kicker, heading, equation, terms, accumulator, note, rule };
}

function scalarReadout(label, value, note = '', tone = 'live') {
  return { label, value: typeof value === 'string' ? value : fmt(value), note, tone };
}

/* ------------------------------------------------------------------ *
 * Operation vocabulary / rules
 * ------------------------------------------------------------------ */

export const OPERATION_COPY = {
  add: {
    eyebrow: 'ENTRYWISE SUM',
    title: '同位置相加，形状原地不动',
    rule: '两个同形矩阵逐格相加：Cᵢⱼ = Aᵢⱼ + Bᵢⱼ。没有行列交叉，也不改变形状。',
    meaning: '叠加的是同一坐标上的两个线性作用，结果仍是同一空间到同一空间的映射。',
    tag: '逐格',
  },
  subtract: {
    eyebrow: 'ENTRYWISE DIFFERENCE',
    title: '同位置相减，差异逐格显影',
    rule: '两个同形矩阵逐格相减：Cᵢⱼ = Aᵢⱼ − Bᵢⱼ。',
    meaning: 'C 保留每一对对应坐标之间的有符号差。',
    tag: '逐格',
  },
  hadamard: {
    eyebrow: 'HADAMARD PRODUCT',
    title: '对应坐标相乘，各管各的',
    rule: 'Hadamard 积只乘相同位置的元素：Cᵢⱼ = Aᵢⱼ · Bᵢⱼ，因此两矩阵必须同形。',
    meaning: '这不是矩阵乘法：没有行与列的交叉，得到的是一张“逐点调制”的表。',
    tag: '逐格',
  },
  scale: {
    eyebrow: 'SCALAR MULTIPLE',
    title: '每一个数，乘上同一个比例',
    rule: '标量 k 数乘矩阵 A：Cᵢⱼ = k · Aᵢⱼ。所有元素被同一个比例缩放。',
    meaning: '数乘改变的是线性变换的幅度，而不是它的维度。',
    tag: '数乘',
  },
  matmul: {
    eyebrow: 'MATRIX PRODUCT',
    title: '行 × 列，把两个作用编织起来',
    rule: 'Cᵢⱼ 是 A 的第 i 行与 B 的第 j 列的点积：Cᵢⱼ = Σₖ AᵢₖBₖⱼ。',
    meaning: '先做 B 再做 A。C 的每一列，都是 A 作用在 B 的对应列上的像。',
    tag: '行列扫描',
  },
  transpose: {
    eyebrow: 'TRANSPOSE',
    title: '沿对角线翻转，行与列交换身份',
    rule: '转置把 Aᵢⱼ 搬到 Aᵀⱼᵢ。形状由 m×n 变成 n×m。',
    meaning: '转置对应线性映射的对偶（伴随）作用，方向翻转，信息不丢。',
    tag: '结构',
  },
  determinant: {
    eyebrow: 'DETERMINANT',
    title: '把整张矩阵折叠成一个数',
    rule: '行列式沿一行做余子式展开：det(A) = Σⱼ (−1)ⁱ⁺ʲ Aᵢⱼ det(Mᵢⱼ)。',
    meaning: '这个数是有向体积的缩放因子；为 0 时，空间被压扁。',
    tag: '标量坍缩',
  },
  trace: {
    eyebrow: 'TRACE',
    title: '只沿主对角线走一遍',
    rule: 'trace(A) = Σᵢ Aᵢᵢ，只读取方阵的主对角线元素之和。',
    meaning: '迹是线性映射在所有基下的不变量之和，也是特征值之和。',
    tag: '标量坍缩',
  },
  inverse: {
    eyebrow: 'GAUSS–JORDAN INVERSE',
    title: '用行变换，把 A 还原成 I',
    rule: '对增广矩阵 [A | I] 做不改变解集的行变换，直到左侧成为 I：右侧就是 A⁻¹。',
    meaning: '逆矩阵是撤销 A 的唯一线性作用；只有行列式非零时才存在。',
    tag: '高斯–若尔当',
  },
  rref: {
    eyebrow: 'RREF',
    title: '一行一行，消成唯一的最简阶梯',
    rule: '主元归 1，主元所在列其余元素归 0。得到的 RREF 与 A 行等价。',
    meaning: 'RREF 暴露主元与秩，但不改变行空间与线性方程组的解集。',
    tag: '行变换',
  },
  rank: {
    eyebrow: 'RANK',
    title: '数一数真正独立的方向',
    rule: 'rank(A) 等于 RREF 中主元的个数，也就是线性无关的行（或列）的最大数量。',
    meaning: '秩衡量线性映射保留了多少维方向；它不会被可逆行变换改变。',
    tag: '行变换',
  },
  solve: {
    eyebrow: 'LINEAR SYSTEM',
    title: '让方程组在增广矩阵里排队',
    rule: '把 Ax = b 写成 [A | b]，做行变换化到 RREF，右端列便直接给出 x。',
    meaning: 'x 是在 A 的坐标系统里达到 b 所需的分量；行变换保持了全部等式。',
    tag: '线性系统',
  },
  kron: {
    eyebrow: 'KRONECKER PRODUCT',
    title: '每个 A 元素，生成一整块缩放后的 B',
    rule: 'A⊗B 的每个块是 Aᵢⱼ·B；总形状为 (m₁m₂)×(n₁n₂)。',
    meaning: 'Kronecker 积是两张离散结构的笛卡尔式组合。',
    tag: '结构扩张',
  },
  power: {
    eyebrow: 'MATRIX POWER',
    title: '把同一次作用叠加很多遍',
    rule: 'Aⁿ 表示 n 次 A 的复合；A² = A·A，A⁰ = I，A⁻¹ 是逆作用。',
    meaning: '指数记录的是同一条线性作用被重复施加的次数。',
    tag: '重复作用',
  },
  identity: {
    eyebrow: 'MATRIX IDENTITY',
    title: '什么也不改变，也是最重要的作用',
    rule: 'A⁰ = I；单位矩阵保持每个向量的坐标不变。',
    meaning: 'I 是所有维度中的“原地不动”。',
    tag: '恒等',
  },
  copy: {
    eyebrow: 'MATRIX COPY',
    title: '同一次作用，原样读取',
    rule: 'A¹ = A，矩阵本身不发生变化。',
    meaning: '一次作用只执行一次。',
    tag: '恒等',
  },
  concat: {
    eyebrow: 'BLOCK ASSEMBLY',
    title: '把矩阵当积木，严丝合缝地拼起来',
    rule: '分块拼接把源矩阵的每个元素搬到目标矩阵的指定行列偏移处；每个块行等高，每个块列等宽。',
    meaning: '大矩阵与它的分块视图承载同一张表；形状与位置都被完整保留。',
    tag: '结构',
  },
  generic: {
    eyebrow: 'OPERATION',
    title: '一次线性代数操作',
    rule: '对输入执行既定的矩阵运算，并保留形状与含义。',
    meaning: '线性代数的每一步都在某个空间里搬运结构。',
    tag: '运算',
  },
};

export function operationCopy(type) {
  return OPERATION_COPY[type] || OPERATION_COPY.generic;
}

function outputSymbols(op) {
  const label = op?.resultValue?.label || 'C';
  const entry = /^[A-Za-z]$/.test(label) ? label.toLowerCase() : 'c';
  return { label, entry };
}

function localizedRule(rule, label) {
  if (!label || label === 'C') return rule;
  return rule.replaceAll('Cᵢⱼ', `${label}ᵢⱼ`).replaceAll('C 的', `${label} 的`);
}

/* ------------------------------------------------------------------ *
 * Elementwise chapters: +, −, ⊙, scalar ×
 * ------------------------------------------------------------------ */

function buildElementwiseChapter(op) {
  const [a, b] = op.operands;
  const A = a.matrix;
  const isScale = op.type === 'scale';
  const B = isScale ? null : b.matrix;
  const R = op.resultValue.matrix;
  const symbol = isScale ? '×' : op.type === 'add' ? '+' : op.type === 'subtract' ? '−' : '⊙';
  const copy = operationCopy(op.type);
  const { label: outLabel, entry: outSym } = outputSymbols(op);
  const outputCells = cellsHidden(R);
  const beats = [];
  let index = 0;
  for (let r = 0; r < R.rows; r++) {
    for (let c = 0; c < R.cols; c++) {
      index += 1;
      const aCell = { tone: 'source' };
      const bCell = isScale ? null : { tone: 'source' };
      const sourceCellsA = { [key(r, c)]: aCell };
      const sourceCellsB = isScale ? {} : { [key(r, c)]: bCell };
      const prevCells = { ...outputCells };
      for (let rr = 0; rr < R.rows; rr++) {
        for (let cc = 0; cc < R.cols; cc++) {
          if ((rr < r || (rr === r && cc < c)) && prevCells[key(rr, cc)]?.hidden) {
            markCell(prevCells, rr, cc, { tone: 'done', text: fmt(R.data[rr][cc]) });
          }
        }
      }
      markCell(prevCells, r, c, {
        tone: 'live',
        text: fmt(R.data[r][c]),
      });
      Object.assign(outputCells, prevCells);
      const lhs = `${cellName(outSym, r, c)}`;
      const ar = isScale
        ? `${op.scalarLabel || fmt(op.scalar)} × ${fmt(A.data[r][c])}`
        : `${fmt(A.data[r][c])} ${symbol} ${fmt(B.data[r][c])}`;
      beats.push(
        beat(`entry-${r}-${c}`, {
          title: `落在第 ${r + 1} 行 · 第 ${c + 1} 列`,
          narration: isScale
            ? `把 ${op.scalarLabel || fmt(op.scalar)} 乘到 A 的这一个位置上，其他位置使用同一比例。`
            : `A 与 B 各交出同一坐标上的一个数字，按 ${symbol} 合成结果。`,
          panels: [
            panel(A, a.label, {
              cells: sourceCellsA,
              rowFocus: [r],
              colFocus: [c],
              role: 'input',
              caption: a.expr && a.expr !== a.label ? a.expr : '输入矩阵',
            }),
            ...(isScale
              ? []
              : [
                  panel(B, b.label, {
                    cells: sourceCellsB,
                    rowFocus: [r],
                    colFocus: [c],
                    role: 'input',
                    caption: b.expr && b.expr !== b.label ? b.expr : '输入矩阵',
                  }),
                ]),
            panel(R, op.resultValue.label, {
              cells: prevCells,
              role: 'result',
              rowFocus: [r],
              colFocus: [c],
              caption: '按位置生成',
            }),
          ],
          connectors: isScale ? [`× ${op.scalarLabel || fmt(op.scalar)}  =`] : [symbol, '='],
          lens: makeLens({
            kicker: `逐格 · 第 ${r + 1} 行 / 第 ${c + 1} 列`,
            heading: isScale ? '同一个比例，落到每一个坐标' : '同一坐标，各取一个数',
            equation: `${lhs} = ${ar} = ${fmt(R.data[r][c])}`,
            terms: isScale
              ? [
                  { label: '标量 k', expr: op.scalarLabel || fmt(op.scalar), value: '', state: 'active' },
                  { label: `A${sub(r + 1)}${sub(c + 1)}`, expr: fmt(A.data[r][c]), value: '', state: 'active' },
                ]
              : [
                  { label: `a${sub(r + 1)}${sub(c + 1)}`, expr: fmt(A.data[r][c]), value: '', state: 'active' },
                  { label: `b${sub(r + 1)}${sub(c + 1)}`, expr: fmt(B.data[r][c]), value: '', state: 'active' },
                ],
            accumulator: { label: '写成结果', value: fmt(R.data[r][c]) },
            note: `已完成 ${index} / ${R.rows * R.cols} 个位置；所有位置彼此独立。`,
            rule: localizedRule(copy.rule, outLabel),
          }),
          readout: scalarReadout(`${outLabel}${sub(r + 1)}${sub(c + 1)}`, fmt(R.data[r][c]), '当前输出格'),
        }),
      );
    }
  }
  return [
    chapter(
      `chapter-${op.type}`,
      isScale ? '统一缩放每个元素' : '逐格扫描整张表',
      copy.tag,
      isScale ? '标量乘法的规则简单，但每个位置都要被同样对待。' : '逐个坐标读取 A 与 B，再生成结果的同一坐标。',
      beats,
    ),
  ];
}

/* ------------------------------------------------------------------ *
 * Matrix multiplication
 * ------------------------------------------------------------------ */

function buildMatmulChapter(op) {
  const [a, b] = op.operands;
  const A = a.matrix;
  const B = b.matrix;
  const R = op.resultValue.matrix;
  const copy = operationCopy('matmul');
  const { label: outLabel, entry: outSym } = outputSymbols(op);
  const outputCells = cellsHidden(R);
  const beats = [];
  let total = 0;
  const totalDots = R.rows * R.cols;
  for (let i = 0; i < R.rows; i++) {
    for (let j = 0; j < R.cols; j++) {
      let accumulator = Q.of(0);
      const termsMeta = [];
      for (let k = 0; k < A.cols; k++) {
        const av = A.data[i][k];
        const bv = B.data[k][j];
        const product = av.mul(bv);
        termsMeta.push({ k, av, bv, product });
      }
      for (let step = 0; step < termsMeta.length; step++) {
        total += 1;
        const term = termsMeta[step];
        accumulator = accumulator.add(term.product);
        const isLast = step === termsMeta.length - 1;
        const sourceA = {};
        for (let c = 0; c < A.cols; c++) {
          sourceA[key(i, c)] = { tone: c === step ? 'source' : 'scan' };
        }
        const sourceB = {};
        for (let r2 = 0; r2 < B.rows; r2++) {
          sourceB[key(r2, j)] = { tone: r2 === step ? 'source' : 'scan' };
        }
        const nextCells = { ...outputCells };
        for (let rr = 0; rr < R.rows; rr++) {
          for (let cc = 0; cc < R.cols; cc++) {
            if (rr < i || (rr === i && cc < j)) {
              markCell(nextCells, rr, cc, { tone: 'done', text: fmt(R.data[rr][cc]) });
            } else if (rr === i && cc === j) {
              markCell(nextCells, rr, cc, {
                tone: isLast ? 'result' : 'live',
                text: fmt(isLast ? R.data[i][j] : accumulator),
              });
            }
          }
        }
        for (let rr = 0; rr < R.rows; rr++) {
          for (let cc = 0; cc < R.cols; cc++) {
            if (!nextCells[key(rr, cc)] || nextCells[key(rr, cc)].hidden) {
              nextCells[key(rr, cc)] = { hidden: true };
            }
          }
        }
        Object.assign(outputCells, nextCells);
        const kTerms = termsMeta.map((t, idx) => ({
          label: `k = ${idx + 1}`,
          expr: `${wrapped(t.av)} × ${wrapped(t.bv)}`,
          value: fmt(t.product),
          state: idx < step ? 'done' : idx === step ? 'active' : 'future',
        }));
        const numericSum = termsMeta.slice(0, step + 1).map((t) => wrapped(t.product)).join(' + ');
        beats.push(
          beat(`mul-${i}-${j}-${step}`, {
            title: `${outLabel} 的第 ${i + 1} 行第 ${j + 1} 列 · 第 ${step + 1} 个乘积`,
            narration: `A 的第 ${i + 1} 行横向走，B 的第 ${j + 1} 列纵向走；在第 ${step + 1} 个位置取一对数。`,
            panels: [
              panel(A, a.label, {
                cells: sourceA,
                rowFocus: [i],
                colFocus: [step],
                role: 'input',
                caption: `${a.expr && a.expr !== a.label ? a.expr : 'A'} · 第 ${i + 1} 行`,
              }),
              panel(B, b.label, {
                cells: sourceB,
                rowFocus: [step],
                colFocus: [j],
                role: 'input',
                caption: `${b.expr && b.expr !== b.label ? b.expr : 'B'} · 第 ${j + 1} 列`,
              }),
              panel(R, op.resultValue.label, {
                cells: nextCells,
                rowFocus: [i],
                colFocus: [j],
                role: 'result',
                caption: '结果正在累计',
              }),
            ],
            connectors: ['×', '='],
            lens: makeLens({
              kicker: `输出格 (${i + 1}, ${j + 1}) · 第 ${step + 1} / ${termsMeta.length} 项`,
              heading: '对应位置相乘，再往上累加',
              equation: `${cellName(outSym, i, j)} = ${termsMeta
                .slice(0, step + 1)
                .map((t, idx) => `${idx ? '+' : ''}${wrapped(t.av)}·${wrapped(t.bv)}`)
                .join(' ')}`,
              terms: kTerms,
              accumulator: {
                label: isLast ? '完成这一格' : '当前累加',
                value: `${numericSum || '0'} = ${fmt(accumulator)}`,
              },
              note: isLast
                ? `第 ${i + 1} 行与第 ${j + 1} 列的 ${termsMeta.length} 个乘积已经全部加入。`
                : `累计到 ${fmt(accumulator)}，还剩 ${termsMeta.length - step - 1} 个乘积。`,
              rule: localizedRule(copy.rule, outLabel),
            }),
            readout: scalarReadout(
              `${cellName(outSym, i, j)}${isLast ? '' : '（临时）'}`,
              fmt(isLast ? R.data[i][j] : accumulator),
              `第 ${total} / ${R.rows * R.cols * A.cols} 次乘积`,
              isLast ? 'done' : 'live',
            ),
          }),
        );
      }
    }
  }
  const firstChapter = chapter(
    `chapter-matmul`,
    '把每一行与每一列配成一次点积',
    copy.tag,
    `${A.rows}×${A.cols} 与 ${B.rows}×${B.cols} 相遇；结果保持 ${R.rows}×${R.cols}。`,
    beats,
  );
  return [firstChapter];
}

/* ------------------------------------------------------------------ *
 * Transpose & Kronecker
 * ------------------------------------------------------------------ */

function buildTransposeChapter(op) {
  const source = op.operands[0];
  const A = source.matrix;
  const R = op.resultValue.matrix;
  const copy = operationCopy('transpose');
  const outCells = cellsHidden(R);
  const beats = [];
  let index = 0;
  for (let r = 0; r < A.rows; r++) {
    for (let c = 0; c < A.cols; c++) {
      index += 1;
      const next = { ...outCells };
      markCell(next, c, r, { tone: 'live', text: fmt(A.data[r][c]) });
      for (let rr = 0; rr < A.rows; rr++) {
        for (let cc = 0; cc < A.cols; cc++) {
          if (rr < r || (rr === r && cc <= c)) {
            if (next[`${cc},${rr}`]?.hidden !== false) {
              markCell(next, cc, rr, { tone: 'done', text: fmt(A.data[rr][cc]) });
            }
          }
        }
      }
      Object.assign(outCells, next);
      beats.push(
        beat(`transpose-${r}-${c}`, {
          title: `a${sub(r + 1)}${sub(c + 1)} 搬到第 ${c + 1} 行第 ${r + 1} 列`,
          narration: '转置不做任何加减，只交换行下标与列下标。',
          panels: [
            panel(A, source.label, {
              cells: { [key(r, c)]: { tone: 'source' } },
              rowFocus: [r],
              colFocus: [c],
              caption: `${A.rows}×${A.cols}`,
            }),
            panel(R, op.resultValue.label, {
              cells: next,
              role: 'result',
              rowFocus: [c],
              colFocus: [r],
              caption: `${R.rows}×${R.cols}`,
            }),
          ],
          connectors: ['ᵀ →'],
          lens: makeLens({
            kicker: `元素映射 · ${index} / ${A.rows * A.cols}`,
            heading: '原地翻转坐标',
            equation: `(Aᵀ)${sub(c + 1)}${sub(r + 1)} = a${sub(r + 1)}${sub(c + 1)} = ${fmt(A.data[r][c])}`,
            terms: [
              { label: '源坐标', expr: `(${r + 1}, ${c + 1})`, value: fmt(A.data[r][c]), state: 'active' },
              { label: '目标坐标', expr: `(${c + 1}, ${r + 1})`, value: fmt(A.data[r][c]), state: 'active' },
            ],
            accumulator: { label: '形状变化', value: `${A.rows}×${A.cols} → ${R.rows}×${R.cols}` },
            note: '对角元素原地不动，其余元素成对交换位置。',
            rule: copy.rule,
          }),
          readout: scalarReadout('搬运', fmt(A.data[r][c]), `(${r + 1},${c + 1}) → (${c + 1},${r + 1})`, 'live'),
        }),
      );
    }
  }
  return [chapter('chapter-transpose', '交换行列坐标', copy.tag, '所有数字都在，只换位置。', beats)];
}

function buildKronChapter(op) {
  const [a, b] = op.operands;
  const A = a.matrix;
  const B = b.matrix;
  const R = op.resultValue.matrix;
  const copy = operationCopy('kron');
  const outCells = cellsHidden(R);
  const beats = [];
  let index = 0;
  for (let r = 0; r < A.rows; r++) {
    for (let c = 0; c < A.cols; c++) {
      index += 1;
      const scalar = A.data[r][c];
      const next = { ...outCells };
      const blockCells = {};
      const details = [];
      for (let br = 0; br < B.rows; br++) {
        for (let bc = 0; bc < B.cols; bc++) {
          const rr = r * B.rows + br;
          const cc = c * B.cols + bc;
          const value = scalar.mul(B.data[br][bc]);
          markCell(next, rr, cc, { tone: 'live', text: fmt(value) });
          blockCells[key(br, bc)] = { tone: 'source' };
          details.push({
            label: `${sub(r + 1)}${sub(c + 1)} · b${sub(br + 1)}${sub(bc + 1)}`,
            expr: `${fmt(scalar)} × ${fmt(B.data[br][bc])}`,
            value: fmt(value),
            state: 'active',
          });
        }
      }
      for (let rr = 0; rr < R.rows; rr++) {
        for (let cc = 0; cc < R.cols; cc++) {
          if (!next[key(rr, cc)] || next[key(rr, cc)].hidden) {
            const srcR = Math.floor(rr / B.rows);
            const srcC = Math.floor(cc / B.cols);
            const isEarlier = srcR < r || (srcR === r && srcC < c);
            if (isEarlier) {
              markCell(next, rr, cc, {
                tone: 'done',
                text: fmt(A.data[srcR][srcC].mul(B.data[rr % B.rows][cc % B.cols])),
              });
            } else {
              next[key(rr, cc)] = { hidden: true };
            }
          }
        }
      }
      Object.assign(outCells, next);
      beats.push(
        beat(`kron-${r}-${c}`, {
          title: `用 a${sub(r + 1)}${sub(c + 1)} 缩放一整块 B`,
          narration: `第 ${index} 个 A 元素接管 B 的一个副本，块内每个数字都乘上它。`,
          panels: [
            panel(A, a.label, {
              cells: { [key(r, c)]: { tone: 'source' } },
              rowFocus: [r],
              colFocus: [c],
              caption: '外层结构',
            }),
            panel(B, b.label, {
              cells: blockCells,
              role: 'auxiliary',
              caption: '被复制并缩放的块',
            }),
            panel(R, op.resultValue.label, {
              cells: next,
              role: 'result',
              rowFocus: Array.from({ length: B.rows }, (_, i) => r * B.rows + i),
              colFocus: Array.from({ length: B.cols }, (_, i) => c * B.cols + i),
              caption: `${R.rows}×${R.cols}`,
            }),
          ],
          connectors: ['⊠', '='],
          lens: makeLens({
            kicker: `块 ${index} / ${A.rows * A.cols}`,
            heading: '一个外层数字，一整块内层矩阵',
            equation: `a${sub(r + 1)}${sub(c + 1)} · B = ${fmt(scalar)} · B`,
            terms: details,
            accumulator: {
              label: '整体形状',
              value: `(${A.rows}×${A.cols}) ⊗ (${B.rows}×${B.cols}) → ${R.rows}×${R.cols}`,
            },
            note: 'Kronecker 积不丢掉任何元素：A 的每个位置生成一个完整的 B 副本。',
            rule: copy.rule,
          }),
          readout: scalarReadout('当前块', `a${sub(r + 1)}${sub(c + 1)} = ${fmt(scalar)}`, `第 ${index} / ${A.rows * A.cols} 块`, 'live'),
        }),
      );
    }
  }
  return [chapter('chapter-kron', '逐块复制的组合扩张', copy.tag, '外层每个数字决定一块内层矩阵的缩放。', beats)];
}

/* ------------------------------------------------------------------ *
 * Row reduction chapters
 * ------------------------------------------------------------------ */

function rowOperationLabel(step) {
  const target = `R${sub(step.target + 1)}`;
  if (step.type === 'swap') return `${target} ↔ R${sub(step.source + 1)}`;
  if (step.type === 'scale') {
    const k = step.factor;
    return `${target} ← ${k.isOne ? '' : `(1 / ${wrapped(k)}) · `}${target}`;
  }
  const factor = step.factor;
  if (factor.isZero) return `${target} 不变`;
  const sign = factor.sign > 0 ? '+' : '−';
  const abs = factor.abs();
  return `${target} ← ${target} ${sign} ${abs.isOne ? '' : wrapped(abs)}R${sub(step.source + 1)}`;
}

function rowPulseCells(width, row, col = null, sourceRow = null) {
  const cells = {};
  for (let c = 0; c < width; c++) {
    cells[key(row, c)] = { tone: c === col ? 'pivot' : 'active' };
  }
  if (sourceRow != null && sourceRow !== row) {
    for (let c = 0; c < width; c++) {
      if (!cells[key(sourceRow, c)]) cells[key(sourceRow, c)] = { tone: 'scan' };
    }
  }
  return cells;
}

function makeRowStepBeat({
  id,
  step,
  before,
  after,
  titlePrefix,
  copy,
  extraRule,
  pivotCol,
  dividerAfter,
  phase,
}) {
  const width = after.cols;
  const cells = rowPulseCells(width, step.target, step.pivotCol ?? pivotCol, step.source);
  if (step.pivotRow != null && step.type !== 'swap') {
    cells[key(step.pivotRow, step.pivotCol ?? pivotCol)] = { tone: 'pivot' };
  }
  if (step.type === 'swap') {
    for (let c = 0; c < width; c++) {
      cells[key(step.target, c)] = { tone: 'active' };
      cells[key(step.source, c)] = { tone: 'scan' };
    }
  }
  const beforeRow = before[step.target];
  const afterRow = after[step.target];
  const sourceRow = step.type !== 'scale' ? before[step.source] : null;
  let heading = '';
  if (step.type === 'swap') heading = '把可用的主元换到当前行';
  else if (step.type === 'scale') heading = '先把主元本身化为 1';
  else heading = `让第 ${(step.pivotCol ?? pivotCol) + 1} 列的其他行归零`;
  const equation = rowOperationLabel(step);
  const terms = [];
  if (sourceRow) {
    terms.push({
      label: `源行 R${sub(step.source + 1)}`,
      expr: rowText(sourceRow),
      value: '',
      state: 'done',
    });
  }
  terms.push({
    label: '操作前',
    expr: rowText(beforeRow),
    value: '',
    state: 'done',
  });
  terms.push({
    label: '操作后',
    expr: rowText(afterRow),
    value: '',
    state: 'active',
  });
  const workingMatrix = {
    name: '工作矩阵',
    rows: after.length,
    cols: after[0].length,
    data: after,
  };
  return beat(id, {
    title: `${titlePrefix} · ${equation}`,
    narration:
      step.type === 'swap'
        ? '当前列没有可用主元，交换两行不改变方程组的解，却能让主元出现。'
        : step.type === 'scale'
          ? `把整行同除 ${fmt(step.factor)}，等式仍然成立。`
          : `用主元行消去目标行的这一列；整行一起变，右边的增广部分也同步变。`,
    panels: [
      panel(workingMatrix, '工作矩阵', {
        cells,
        rowFocus: [step.target, step.pivotRow ?? step.source],
        colFocus: [step.pivotCol ?? pivotCol],
        role: 'workspace',
        dividerAfter,
        caption: phase,
      }),
    ],
    connectors: [],
    lens: makeLens({
      kicker: `行变换 · ${equation}`,
      heading,
      equation,
      terms,
      accumulator: {
        label: '主元位置',
        value:
          step.pivotCol != null
            ? `第 ${step.pivotRow + 1} 行 · 第 ${step.pivotCol + 1} 列`
            : '本步无主元',
      },
      note: step.type === 'add' ? '目标行整行参与运算；所有列同步更新，才能保持行等价。' : '行变换是可逆的操作，不会改变解集。',
      rule: extraRule || copy.rule,
    }),
    readout: scalarReadout(
      `R${sub(step.target + 1)} 更新`,
      `${fmt(before[step.target][step.pivotCol ?? 0])} → ${fmt(after[step.target][step.pivotCol ?? 0])}`,
      step.type === 'swap' ? '交换行' : step.type === 'scale' ? '归一化主元' : '整行消元',
      step.type === 'swap' ? 'pivot' : 'live',
    ),
  });
}

function buildInverseChapter(op) {
  const source = op.operands[0];
  const A = source.matrix;
  const trail = M.inverseTrail(A);
  const n = A.rows;
  const copy = operationCopy('inverse');
  const beats = [];
  const initial = trail.augmented;
  const initialCells = {};
  for (let r = 0; r < n; r++) initialCells[key(r, r)] = { tone: 'source' };
  beats.push(
    beat('inverse-setup', {
      title: '先搭好增广舞台 [A | I]',
      narration: '右侧放一个单位矩阵作为“记分板”。对左侧做的每一次行变换，都同步刻在右侧。',
      panels: [
        panel(initial, '增广矩阵 [A | I]', {
          cells: initialCells,
          role: 'workspace',
          dividerAfter: n,
          caption: '左侧是目标，右侧记录反转过程',
        }),
      ],
      lens: makeLens({
        kicker: '起点 · 增广矩阵',
        heading: '把要求逆的矩阵和单位矩阵并排放好',
        equation: `[ A | I ]  =  [ ${n}×${n}  |  ${n}×${n} ]`,
        terms: [
          { label: '左侧', expr: 'A', value: '待消元', state: 'active' },
          { label: '右侧', expr: 'I', value: '待记录', state: 'future' },
        ],
        accumulator: { label: '目标', value: `[ I | A⁻¹ ]` },
        note: '这不是把 A 变成 I 的魔法，而是记录“哪些行变换刚好能撤销 A”。',
        rule: copy.rule,
      }),
    }),
  );
  trail.steps.forEach((step, index) => {
    beats.push(
      makeRowStepBeat({
        id: `inv-step-${index}`,
        step,
        before: step.before,
        after: step.after,
        titlePrefix: `第 ${index + 1} 步行变换`,
        copy,
        pivotCol: step.pivotCol,
        dividerAfter: n,
        phase: `主元 ${Math.min(
          trail.pivots.findIndex((p) => p.col === step.pivotCol) + 1 || 1,
          n,
        )} / ${n} · 左侧归约中`,
      }),
    );
  });
  const rightStart = n;
  const finalCells = {};
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      finalCells[key(r, c)] = { tone: 'done', text: fmt(trail.matrix.data[r][c]) };
      finalCells[key(r, c + rightStart)] = { tone: 'result', text: fmt(trail.inverse.data[r][c]) };
    }
  }
  beats.push(
    beat('inverse-done', {
      title: '左侧已经站成 I，右侧自然成为 A⁻¹',
      narration: '同样的行变换让 A 变成单位矩阵，那么它对 I 做过的全部操作，就是撤销 A 的逆作用。',
      panels: [
        panel(trail.matrix, '终点 [I | A⁻¹]', {
          cells: finalCells,
          role: 'workspace',
          dividerAfter: n,
          caption: '左：单位矩阵 · 右：逆矩阵',
        }),
      ],
      lens: makeLens({
        kicker: '终点 · 归约完成',
        heading: 'A 被还原，记录板留下逆变',
        equation: `${source.label} · ${source.label}⁻¹ = I`,
        terms: trail.pivots.map((p, i) => ({
          label: `主元 ${i + 1}`,
          expr: `第 ${p.col + 1} 列`,
          value: '已归一',
          state: 'done',
        })),
        accumulator: { label: 'A⁻¹ 的形状', value: `${n}×${n}` },
        note: '逆矩阵和原矩阵形状相同：它必须从同一个空间回到同一个空间。',
        rule: copy.rule,
      }),
      readout: scalarReadout('A⁻¹ 已求出', `${n}×${n}`, '右侧全部元素', 'done'),
    }),
  );
  return [
    chapter(
      'chapter-inverse',
      '用行变换反转整个线性作用',
      copy.tag,
      '左侧归约成 I，右侧同步记录全部逆操作。',
      beats,
    ),
  ];
}

function buildRrefChapter(op, { forRank = false } = {}) {
  const source = op.operands[0];
  const A = source.matrix;
  const trail = M.rowReduceTrail(A);
  const copy = operationCopy(forRank ? 'rank' : 'rref');
  const beats = [];
  beats.push(
    beat('rref-setup', {
      title: '从原矩阵开始，记录每一次行操作',
      narration: 'RREF 不直接改数字，而是用三类可逆行变换——换行、归一、消元——把结构逼出来。',
      panels: [
        panel(A, source.label, {
          rowFocus: [],
          role: 'workspace',
          caption: '原矩阵 · 行空间不变',
        }),
      ],
      lens: makeLens({
        kicker: '起点 · 原矩阵',
        heading: `先寻找第 1 个可用主元`,
        equation: `${source.label} 的形状：${A.rows}×${A.cols}`,
        terms: [
          { label: '行操作', expr: 'Swap · Scale · Add', value: '保持行等价', state: 'active' },
          { label: '目标', expr: '唯一 RREF', value: `${trail.rank} 个主元`, state: 'future' },
        ],
        accumulator: { label: '预计主元数', value: `${trail.rank}` },
        note: '每列从左侧开始寻找主元；主元列之上和之下都要被清零。',
        rule: copy.rule,
      }),
    }),
  );
  trail.steps.forEach((step, index) => {
    beats.push(
      makeRowStepBeat({
        id: `rref-step-${index}`,
        step,
        before: step.before,
        after: step.after,
        titlePrefix: `第 ${index + 1} 步行变换`,
        copy,
        pivotCol: step.pivotCol,
        dividerAfter: null,
        phase: `主元 ${Math.min(trail.pivots.filter((p) => p.col <= step.pivotCol).length, trail.rank) || 0} / ${trail.rank}`,
      }),
    );
  });
  const pivotCells = {};
  for (const p of trail.pivots) pivotCells[key(p.row, p.col)] = { tone: 'pivot' };
  beats.push(
    beat('rref-summary', {
      title: forRank ? `主元一共有 ${trail.rank} 个` : `最简阶梯形只有 ${trail.rank} 个主元`,
      narration: forRank
        ? '数主元，就是数独立方向。其余列都可以由主元列线性组合得到。'
        : '所有主元都是 1，主元列的其他位置都是 0，归约到唯一形态。',
      panels: [
        panel(trail.matrix, forRank ? '归约后矩阵' : 'rref(A)', {
          cells: pivotCells,
          role: 'result',
          caption: forRank ? '主元被点亮' : '每个主元列都是单位方向',
        }),
      ],
      lens: makeLens({
        kicker: forRank ? '读数 · 主元总数' : '终点 · RREF',
        heading: forRank ? '秩就是主元的数量' : '结构被压缩到最简',
        equation: forRank ? `rank(${source.label}) = ${trail.rank}` : `rref(${source.label}) 完成`,
        terms: trail.pivots.map((p, i) => ({
          label: `主元 ${i + 1}`,
          expr: `R${sub(p.row + 1)} · C${sub(p.col + 1)}`,
          value: fmt(trail.matrix.data[p.row][p.col]),
          state: 'done',
        })),
        accumulator: {
          label: forRank ? '秩' : '主元数',
          value: `${trail.rank}`,
        },
        note: `原矩阵形状 ${A.rows}×${A.cols} 保持不变；行等价不改变行空间与方程组的解集。`,
        rule: copy.rule,
      }),
      readout: scalarReadout(forRank ? 'rank(A)' : '主元', forRank ? String(trail.rank) : `${trail.rank} 个`, forRank ? '独立方向数' : 'RREF 完成', forRank ? 'done' : 'done'),
    }),
  );
  return {
    chapters: [
      chapter(
        'chapter-rref',
        forRank ? '用消元数出独立方向' : '把矩阵消成最简阶梯形',
        copy.tag,
        forRank ? '每次行变换都保持秩不变。' : '换行、归一、消元，直到没有可消的元素。',
        beats,
      ),
    ],
    trail,
  };
}

/* ------------------------------------------------------------------ *
 * Determinant & trace
 * ------------------------------------------------------------------ */

function buildDeterminantChapter(op) {
  const source = op.operands[0];
  const A = source.matrix;
  const copy = operationCopy('determinant');
  const n = A.rows;
  const beats = [];

  if (n === 1) {
    const only = A.data[0][0];
    return [
      chapter('chapter-det', '一个 1×1 矩阵的行列式', copy.tag, '退化为它唯一的那一个数。', [
        beat('det-1', {
          title: '唯一元素就是行列式',
          panels: [
            panel(A, source.label, {
              cells: { '0,0': { tone: 'result' } },
              role: 'input',
            }),
          ],
          lens: makeLens({
            kicker: '1×1 的行列式',
            heading: '只有一个数',
            equation: `det(${source.label}) = ${fmt(only)}`,
            terms: [{ label: 'a₁₁', expr: fmt(only), value: fmt(only), state: 'active' }],
            accumulator: { label: 'det(A)', value: fmt(only) },
            note: '1×1 矩阵的“有向体积”就是它本身。',
            rule: copy.rule,
          }),
          readout: scalarReadout(`det(${source.label})`, fmt(only), '唯一元素'),
        }),
      ]),
    ];
  }

  if (n === 2) {
    const [a, b] = [A.data[0][0], A.data[0][1]];
    const [c, d] = [A.data[1][0], A.data[1][1]];
    const main = a.mul(d);
    const anti = b.mul(c);
    const cells1 = {
      '0,0': { tone: 'source' },
      '1,1': { tone: 'source' },
      '0,1': { tone: 'dim' },
      '1,0': { tone: 'dim' },
    };
    const cells2 = {
      '0,1': { tone: 'source' },
      '1,0': { tone: 'source' },
      '0,0': { tone: 'dim' },
      '1,1': { tone: 'dim' },
    };
    const cellsDone = {
      '0,0': { tone: 'done' },
      '0,1': { tone: 'done' },
      '1,0': { tone: 'done' },
      '1,1': { tone: 'done' },
    };
    return [
      chapter(
        'chapter-det',
        '两条对角线，决定整块面积',
        copy.tag,
        '2×2 的行列式只有两股贡献，一正一负。',
        [
          beat('det-main', {
            title: '主对角线：先记下正贡献',
            narration: '从左上到右下的路径，产生了 ad 这一项。',
            panels: [panel(A, source.label, { cells: cells1, rowFocus: [0, 1], colFocus: [0, 1] })],
            lens: makeLens({
              kicker: '展开项 1 / 2 · 正号',
              heading: '主对角线乘积',
              equation: `det(${source.label}) = a₁₁·a₂₂ − a₁₂·a₂₁`,
              terms: [
                { label: '+ a₁₁·a₂₂', expr: `${fmt(a)} × ${fmt(d)}`, value: fmt(main), state: 'active' },
                { label: '− a₁₂·a₂₁', expr: `${fmt(b)} × ${fmt(c)}`, value: fmt(anti.neg()), state: 'future' },
              ],
              accumulator: { label: '暂时累计', value: fmt(main) },
              note: '展开还未结束，另一条对角线会以负号加入。',
              rule: copy.rule,
            }),
            readout: scalarReadout('+ ad', fmt(main), '主对角线'),
          }),
          beat('det-anti', {
            title: '副对角线：这一次带负号',
            narration: '从右上到左下的路径贡献 bc，但展开式前面是减号。',
            panels: [panel(A, source.label, { cells: cells2, rowFocus: [0, 1], colFocus: [1, 0] })],
            lens: makeLens({
              kicker: '展开项 2 / 2 · 负号',
              heading: '副对角线乘积',
              equation: `det(${source.label}) = ${fmt(main)} − (${fmt(b)}·${fmt(c)})`,
              terms: [
                { label: '+ a₁₁·a₂₂', expr: `${fmt(a)} × ${fmt(d)}`, value: fmt(main), state: 'done' },
                { label: '− a₁₂·a₂₁', expr: `− (${fmt(b)} × ${fmt(c)})`, value: fmt(anti.neg()), state: 'active' },
              ],
              accumulator: { label: 'det(A)', value: `${fmt(main)} − ${fmt(anti)} = ${fmt(main.sub(anti))}` },
              note: '两个对角项已经全部到齐。',
              rule: copy.rule,
            }),
            readout: scalarReadout(`det(${source.label})`, fmt(main.sub(anti)), '两项合并'),
          }),
          beat('det-sum', {
            title: '两条路径合拢成一个数',
            narration: '这个数就是线性变换对面积的缩放倍数；负号表示方向发生翻转。',
            panels: [panel(A, source.label, { cells: cellsDone, role: 'input' })],
            lens: makeLens({
              kicker: '合拢 · 行列式',
              heading: '有向面积缩放为一个标量',
              equation: `${fmt(a)}·${fmt(d)} − ${fmt(b)}·${fmt(c)} = ${fmt(main.sub(anti))}`,
              terms: [
                { label: '正贡献', expr: fmt(main), value: '', state: 'done' },
                { label: '负贡献', expr: fmt(anti.neg()), value: '', state: 'done' },
              ],
              accumulator: { label: 'det(A)', value: fmt(M.determinant(A)) },
              note: '行列式不是矩阵的一部分，而是整张矩阵作为一个变换的体积标度。',
              rule: copy.rule,
            }),
            readout: scalarReadout('det(A)', fmt(M.determinant(A)), '面积缩放因子', 'done'),
          }),
        ],
      ),
    ];
  }

  // Laplace expansion along the row with the most zeros.
  let expandRow = 0;
  let bestZeros = -1;
  for (let r = 0; r < n; r++) {
    const zeros = A.data[r].filter((v) => v.isZero).length;
    if (zeros > bestZeros) {
      bestZeros = zeros;
      expandRow = r;
    }
  }
  const terms = [];
  let running = Q.of(0);
  for (let c = 0; c < n; c++) {
    const value = A.data[expandRow][c];
    const minor = M.minorMatrix(A, expandRow, c);
    const minorDet = M.determinant(minor);
    const sign = (expandRow + c) % 2 === 0 ? 1 : -1;
    const contribution = sign > 0 ? value.mul(minorDet) : value.mul(minorDet).neg();
    running = running.add(contribution);
    terms.push({
      label: `项 ${c + 1} · ${sign > 0 ? '+' : '−'}a${sub(expandRow + 1)}${sub(c + 1)} det(M)`,
      expr: `${sign > 0 ? '' : '−'}${wrapped(value)} × ${fmt(minorDet)}`,
      value: fmt(contribution),
      state: c === n - 1 ? 'active' : 'active',
    });
    const sourceCells = {};
    for (let cc = 0; cc < n; cc++) {
      sourceCells[key(expandRow, cc)] = { tone: cc === c ? 'source' : 'dim' };
    }
    for (let rr = 0; rr < n; rr++) {
      if (rr !== expandRow) sourceCells[key(rr, c)] = { tone: 'scan' };
    }
    sourceCells[key(expandRow, c)] = { tone: 'source' };
    const previousRunning = running.sub(contribution);
    beats.push(
      beat(`det-term-${c}`, {
        title: `沿第 ${expandRow + 1} 行展开 · 第 ${c + 1} 项`,
        narration: `选中 a${sub(expandRow + 1)}${sub(c + 1)}，划掉它所在的行与列，得到一个 ${n - 1}×${n - 1} 的余子式。`,
        panels: [
          panel(A, source.label, {
            cells: sourceCells,
            rowFocus: [expandRow],
            colFocus: [c],
            caption: `沿第 ${expandRow + 1} 行展开${bestZeros > 0 ? '（含有零，可少算几项）' : ''}`,
          }),
          panel(minor, `M${sub(expandRow + 1)}${sub(c + 1)}`, {
            role: 'auxiliary',
            caption: `划掉第 ${expandRow + 1} 行、第 ${c + 1} 列`,
          }),
        ],
        connectors: ['↘'],
        lens: makeLens({
          kicker: `Laplace 展开 · 第 ${c + 1} / ${n} 项`,
          heading: '一个元素，配一个余子式',
          equation: `det(${source.label}) = Σ (−1)^{i+j} aᵢⱼ det(Mᵢⱼ)`,
          terms: [
            { label: '符号', expr: `(−1)^(${expandRow + 1}+${c + 1}) = ${sign > 0 ? '+1' : '−1'}`, value: '', state: 'active' },
            { label: `a${sub(expandRow + 1)}${sub(c + 1)}`, expr: fmt(value), value: '', state: 'active' },
            { label: `det(M${sub(expandRow + 1)}${sub(c + 1)})`, expr: fmt(minorDet), value: '', state: 'active' },
            { label: '本项贡献', expr: `${sign > 0 ? '+' : '−'}${fmt(value.abs())} × ${fmt(minorDet)}`, value: fmt(contribution), state: 'active' },
          ],
          accumulator: {
            label: '累计行列式',
            value: `${previousRunning.isZero ? '' : fmt(previousRunning) + ' + '}${wrapped(contribution)} = ${fmt(running)}`,
          },
          note:
            c < n - 1
              ? `还剩 ${n - c - 1} 项没有展开；本次余子式的行列式为 ${fmt(minorDet)}。`
              : '最后一项已经并入，总和就是完整的行列式。',
          rule: copy.rule,
        }),
        readout: scalarReadout(
          `det(${source.label}) 累计`,
          fmt(running),
          `第 ${c + 1} / ${n} 项已加入`,
          c === n - 1 ? 'done' : 'live',
        ),
      }),
    );
  }
  beats.push(
    beat('det-final-sum', {
      title: '所有展开项汇成一个有向体积',
      narration: '每一项都来自一个元素及其余子式；符号由它们的位置决定。',
      panels: [panel(A, source.label, { role: 'input', caption: '原方阵' })],
      lens: makeLens({
        kicker: '收束 · 标量结果',
        heading: '整张矩阵最终只留下一个数',
        equation: `det(${source.label}) = ${terms.map((t) => t.value).join(' + ').replace(/\+ -/g, '− ')} = ${fmt(running)}`,
        terms: terms.map((t) => ({ ...t, state: 'done' })),
        accumulator: { label: 'det(A)', value: fmt(running) },
        note:
          running.isZero
            ? '行列式为 0：至少有一个方向被压扁，矩阵不可逆。'
            : '行列式非零：这个线性变换没有把空间压扁，因此可逆。',
        rule: copy.rule,
      }),
      readout: scalarReadout('det(A)', fmt(running), running.isZero ? '空间被压扁' : '有向体积缩放', 'done'),
    }),
  );
  return [
    chapter(
      'chapter-det',
      `沿一行层层展开，最后归成一个数`,
      copy.tag,
      `选择第 ${expandRow + 1} 行（含零最多），一共 ${n} 个余子式项。`,
      beats,
    ),
  ];
}

function buildTraceChapter(op) {
  const source = op.operands[0];
  const A = source.matrix;
  const copy = operationCopy('trace');
  const beats = [];
  let running = Q.of(0);
  for (let i = 0; i < A.rows; i++) {
    running = running.add(A.data[i][i]);
    const cells = {};
    for (let r = 0; r < A.rows; r++) {
      for (let c = 0; c < A.cols; c++) {
        if (r === c && r < i) cells[key(r, c)] = { tone: 'done' };
        else if (r === c && r === i) cells[key(r, c)] = { tone: 'source' };
        else if (r !== c) cells[key(r, c)] = { tone: 'dim' };
      }
    }
    beats.push(
      beat(`trace-${i}`, {
        title: `第 ${i + 1} 个对角元素加入`,
        narration: '迹只读取主对角线，其他位置完全不参与。',
        panels: [panel(A, source.label, { cells, rowFocus: [i], colFocus: [i] })],
        lens: makeLens({
          kicker: `对角线扫描 · ${i + 1} / ${A.rows}`,
          heading: '只把主对角线上的数相加',
          equation: `trace(${source.label}) = a₁₁ + a₂₂ + … + a${sub(A.rows)}${sub(A.rows)}`,
          terms: Array.from({ length: A.rows }, (_, j) => ({
            label: `a${sub(j + 1)}${sub(j + 1)}`,
            expr: fmt(A.data[j][j]),
            value: '',
            state: j < i ? 'done' : j === i ? 'active' : 'future',
          })),
          accumulator: { label: '当前迹', value: fmt(running) },
          note: i < A.rows - 1 ? '还有对角元素尚未加入。' : '主对角线已经走完。',
          rule: copy.rule,
        }),
        readout: scalarReadout('trace 累计', fmt(running), `对角线 ${i + 1} / ${A.rows}`),
      }),
    );
  }
  return [chapter('chapter-trace', '主对角线求和', copy.tag, '迹不触碰非对角元素。', beats)];
}

/* ------------------------------------------------------------------ *
 * Solve Ax = b
 * ------------------------------------------------------------------ */

function buildSolveChapter(op) {
  const [aValue, bValue] = op.operands;
  const A = aValue.matrix;
  const b = bValue.matrix;
  const { x, trail, augmented } = M.solveLinear(A, b);
  const copy = operationCopy('solve');
  const n = A.rows;
  const beats = [];
  beats.push(
    beat('solve-setup', {
      title: '把方程组装进增广矩阵 [A | b]',
      narration: '每一行是一条方程，最后一列是右端项；行变换不会改变方程组的解。',
      panels: [
        panel(augmented, '[A | b]', {
          role: 'workspace',
          dividerAfter: n,
          caption: '左侧系数矩阵 · 右侧常数项',
        }),
      ],
      lens: makeLens({
        kicker: '起点 · 方程组',
        heading: 'A x = b，排成一列',
        equation: `A x = b  ⇔  [A | b]`,
        terms: [
          { label: 'A', expr: `${A.rows}×${A.cols}`, value: '系数', state: 'active' },
          { label: 'b', expr: `${b.rows}×${b.cols}`, value: '目标', state: 'active' },
        ],
        accumulator: { label: '目标', value: 'RREF → 读出 x' },
        note: '每一次整行操作，都是对一条等式两边同时做同一件事。',
        rule: copy.rule,
      }),
    }),
  );
  trail.steps.forEach((step, index) => {
    beats.push(
      makeRowStepBeat({
        id: `solve-step-${index}`,
        step,
        before: step.before,
        after: step.after,
        titlePrefix: `第 ${index + 1} 步行变换`,
        copy,
        pivotCol: step.pivotCol,
        dividerAfter: n,
        phase: '消元 · 等式同步',
      }),
    );
  });
  const extractionCells = {};
  for (let r = 0; r < n; r++) {
    for (let c = 0; c <= n; c++) {
      extractionCells[key(r, c)] =
        c === n ? { tone: 'result', text: fmt(trail.matrix.data[r][n]) } : { tone: 'done' };
    }
  }
  beats.push(
    beat('solve-extract', {
      title: '左端成为 I，右端直接读出 x',
      narration: '增广矩阵到达 [I | x]；每一行现在是一条“变量 = 数”的结论。',
      panels: [
        panel(trail.matrix, '终点 [I | x]', {
          cells: extractionCells,
          dividerAfter: n,
          caption: '最后一行就是最后一列解',
          role: 'workspace',
        }),
        panel(x, op.resultValue.label, {
          role: 'result',
          cells: Object.fromEntries(Array.from({ length: n }, (_, r) => [key(r, 0), { tone: 'result' }])),
          caption: '解向量',
        }),
      ],
      connectors: ['→'],
      lens: makeLens({
        kicker: '读数 · 每个变量',
        heading: '单位矩阵把变量一个个释放出来',
        equation: `x = A⁻¹ b = [${x.data.map((row) => fmt(row[0])).join(', ')}]ᵀ`,
        terms: Array.from({ length: n }, (_, r) => ({
          label: `x${sub(r + 1)}`,
          expr: `第 ${r + 1} 行右侧`,
          value: fmt(x.data[r][0]),
          state: 'active',
        })),
        accumulator: { label: '解的形状', value: `${x.rows}×${x.cols}` },
        note: '解是一个列向量；它保留 A 的变量顺序，也保留 b 的维度含义。',
        rule: copy.rule,
      }),
      readout: scalarReadout('x 已求出', `${n}×1`, '列向量解', 'done'),
    }),
  );
  return [chapter('chapter-solve', '把方程组消成直接读答案的形状', copy.tag, '每一条等式同步变形，直到变量彼此独立。', beats)];
}

/* ------------------------------------------------------------------ *
 * Generic fallback + Block assembly
 * ------------------------------------------------------------------ */

function buildGenericChapter(op) {
  const first = op.operands?.[0];
  const copy = operationCopy(op.type);
  const panels = [];
  if (first?.kind === 'matrix') panels.push(panel(first.matrix, first.label, { role: 'input' }));
  if (op.operands?.[1]?.kind === 'matrix') {
    panels.push(panel(op.operands[1].matrix, op.operands[1].label, { role: 'input' }));
  }
  if (op.resultValue?.kind === 'matrix') {
    panels.push(panel(op.resultValue.matrix, op.resultValue.label, { role: 'result' }));
  }
  return [
    chapter('chapter-generic', '执行这次线性运算', copy.tag, '保存输入与输出的形状。', [
      beat('generic-step', {
        title: op.expr || '矩阵运算',
        narration: '这一次运算被完整执行；形状与含义随结果一起保留。',
        panels,
        connectors: Array.from({ length: Math.max(0, panels.length - 1) }, () => '→'),
        lens: makeLens({
          kicker: '执行',
          heading: '输入、规则、输出',
          equation: op.expr || '',
          terms: op.operands?.map((operand) => ({
            label: operand.label,
            expr: operand.kind === 'matrix' ? `${operand.matrix.rows}×${operand.matrix.cols}` : fmt(operand.value),
            value: '',
            state: 'done',
          })) || [],
          accumulator: op.resultValue?.kind === 'matrix'
            ? { label: '结果形状', value: `${op.resultValue.matrix.rows}×${op.resultValue.matrix.cols}` }
            : op.resultValue?.kind === 'scalar'
              ? { label: '结果', value: fmt(op.resultValue.value) }
              : null,
          note: copy.meaning,
          rule: copy.rule,
        }),
        readout: op.resultValue?.kind === 'scalar'
          ? scalarReadout(op.resultValue.label, fmt(op.resultValue.value), '结果', 'done')
          : null,
      }),
    ]),
  ];
}

function buildIdentityChapter(ast, library) {
  const name = ast.type === 'group' ? ast.operand.name : ast.name;
  const entry = library[name];
  if (!entry) return [];
  return [
    chapter('chapter-identity', '矩阵原样入场', '读取', '没有计算，只有对象本身。', [
      beat('identity-step', {
        title: name,
        narration: '这是一次只读取矩阵对象的表达式；给运算符加上另一个矩阵，才会开始改变它。',
        panels: [panel(entry, name, { role: 'input' })],
        lens: makeLens({
          kicker: '读取',
          heading: '矩阵对象可以被搬进表达式',
          equation: name,
          terms: [{ label: '形状', expr: `${entry.rows}×${entry.cols}`, value: '', state: 'active' }],
          accumulator: { label: '含义', value: '保持原样' },
          note: '矩阵对象既能与运算符组合，也能作为更大的矩阵的块。',
          rule: '任何运算都必须先知道形状；形状是矩阵的第一层含义。',
        }),
      }),
    ]),
  ];
}

/* ------------------------------------------------------------------ *
 * Finale
 * ------------------------------------------------------------------ */

function formattedResult(op) {
  if (!op) return '';
  if (op.resultValue.kind === 'matrix') return `${op.resultValue.label}`;
  return fmt(op.resultValue.value);
}

function makeFinale({ expression, result, rootType, extraNote, extraPanels = [] }) {
  const isScalar = result.kind === 'scalar';
  const scalarValue = isScalar ? result.value : null;
  const panels = [...extraPanels];
  if (!isScalar) {
    const matrix = result.matrix;
    const cells = {};
    for (let r = 0; r < matrix.rows; r++) {
      for (let c = 0; c < matrix.cols; c++) cells[key(r, c)] = { tone: 'result' };
    }
    panels.push(
      panel(matrix, result.label, {
        cells,
        role: 'result',
        caption: `最终结果 · ${matrix.rows}×${matrix.cols}`,
      }),
    );
  }
  return chapter('chapter-finale', '收束到最简表达', '结论', '把沿途的中间结果重新压缩成一个最终对象。', [
    beat('finale', {
      title: isScalar ? '计算收束为一个标量' : '计算收束为一个完整矩阵',
      narration: isScalar
        ? '所有数字已经汇入一个标量。它没有行列形状，却仍然携带整张矩阵的体积或结构信息。'
        : '中间步骤可以很多，但对象最终被保留：维度、位置和含义都在。',
      panels,
      connectors: panels.length > 1 ? Array.from({ length: panels.length - 1 }, () => '→') : [],
      lens: makeLens({
        kicker: '最简表达 · FINAL FORM',
        heading: isScalar ? '最终是一个数' : '形状与含义被一起保留',
        equation: isScalar
          ? `${expression} = ${fmt(scalarValue)}`
          : `${expression} = ${result.label}`,
        terms: isScalar
          ? [{ label: '结果类型', expr: '标量', value: fmt(scalarValue), state: 'active' }]
          : [
              {
                label: '结果形状',
                expr: `${result.matrix.rows}×${result.matrix.cols}`,
                value: '',
                state: 'active',
              },
              {
                label: '元素总数',
                expr: String(result.matrix.rows * result.matrix.cols),
                value: '',
                state: 'active',
              },
            ],
        accumulator: isScalar
          ? { label: '最终值', value: fmt(scalarValue) }
          : { label: '最终对象', value: `${result.matrix.rows}×${result.matrix.cols}` },
        note: extraNote || '每一个中间数字都可以回放到它来自的那一行、那一列、那一次操作。',
        rule: operationCopy(rootType).rule,
      }),
      readout: isScalar ? scalarReadout('最终结果', fmt(scalarValue), '标量 · 没有丢失来源', 'done') : null,
      isFinale: true,
      duration: 2400,
    }),
  ]);
}

/* ------------------------------------------------------------------ *
 * Chapter router
 * ------------------------------------------------------------------ */

function chaptersForOperation(op, context = {}) {
  switch (op.type) {
    case 'add':
    case 'subtract':
    case 'hadamard':
    case 'scale':
      return buildElementwiseChapter(op);
    case 'matmul':
      return buildMatmulChapter(op);
    case 'transpose':
      return buildTransposeChapter(op);
    case 'kron':
      return buildKronChapter(op);
    case 'inverse':
      return buildInverseChapter(op);
    case 'rref':
      return buildRrefChapter(op).chapters;
    case 'rank':
      return buildRrefChapter({ ...op, operands: op.operands, resultValue: op.resultValue }, { forRank: true }).chapters;
    case 'determinant':
      return buildDeterminantChapter(op);
    case 'trace':
      return buildTraceChapter(op);
    case 'solve':
      return buildSolveChapter(op);
    case 'power': {
      const e = op.exponent;
      if (e === 1 || e === 0) return buildGenericChapter({ ...op, type: 'copy' });
      if (e === 2) {
        const base = op.operands[0];
        const result = op.resultValue;
        const synthetic = {
          ...op,
          type: 'matmul',
          operands: [base, { ...base, expr: base.label }],
          resultValue: result,
        };
        return buildMatmulChapter(synthetic);
      }
      return buildGenericChapter(op);
    }
    case 'adjugate':
      return buildGenericChapter(op);
    case 'identity':
    case 'copy':
      return buildGenericChapter(op);
    default:
      return buildGenericChapter(op);
  }
}

/* ------------------------------------------------------------------ *
 * Scalar-only expressions
 * ------------------------------------------------------------------ */

function buildScalarOnlyStory(expression, resultValue, library) {
  const value = resultValue.value;
  const copy = {
    eyebrow: 'SCALAR READOUT',
    title: '这一个表达式没有行列形状，只留下一个数',
    rule: '标量结果没有行列结构；它仍然可能携带整张矩阵的体积、迹或秩等不变量信息。',
    meaning: '当表达式只剩标量运算时，形状从矩阵退化为一个点：0 维，但来源仍然可追溯。',
    tag: '标量读数',
  };
  const chapters = [
    makeFinale({
      expression,
      result: resultValue,
      rootType: 'generic',
      extraNote: copy.meaning,
    }),
  ];
  return {
    id: `story-${Date.now()}`,
    title: copy.title,
    eyebrow: copy.eyebrow,
    expression,
    inputExpression: expression,
    description: copy.meaning,
    chapters,
    meta: {
      expression,
      rule: copy.rule,
      meaning: copy.meaning,
      tag: copy.tag,
      eyebrow: copy.eyebrow,
      operationCount: 0,
      sources: [],
      result: { kind: 'scalar', label: '结果', formatted: fmt(value) },
      shapeChain: '标量',
      rootType: 'generic',
    },
    resultValue,
    source: 'expression',
  };
}

function buildScalarMergeChapter(expression, value, ops) {
  const scalarOps = ops.filter((op) => op.resultValue?.kind === 'scalar');
  const terms = scalarOps.map((op, index) => ({
    label: op.semantic || `标量 ${index + 1}`,
    expr: op.expr,
    value: fmt(op.resultValue.value),
    state: 'done',
  }));
  return chapter(
    'chapter-scalar-merge',
    '把标量结果重新合成',
    '标量合成',
    '前面的矩阵已经坍缩成标量；这一步在标量层面完成最后的算术。',
    [
      beat('scalar-merge', {
        title: '标量层面的最后一次合成',
        narration: '这些标量来自前面的矩阵读数。它们没有行列形状，但仍保留来源与含义。',
        panels: [],
        lens: makeLens({
          kicker: 'SCALAR ARITHMETIC / 标量算术',
          heading: '把前几层的读数按表达式合在一起',
          equation: `${expression} = ${fmt(value)}`,
          terms,
          accumulator: { label: '最终标量', value: fmt(value) },
          note: '标量作为终点没有形状；如果想知道它来自哪里，可以回到上一幕查看具体的矩阵与不变量。',
          rule: '标量运算遵循普通算术优先级；在这一步不再有矩阵元素被扫描。',
        }),
        readout: scalarReadout('标量合成', fmt(value), '最终读数', 'done'),
      }),
    ],
  );
}

/* ------------------------------------------------------------------ *
 * Public: story from expression
 * ------------------------------------------------------------------ */

function relabelRoot(op, label = 'C') {
  if (!op) return op;
  const resultValue = op.resultValue;
  if (resultValue.kind === 'matrix') {
    const matrix = { ...resultValue.matrix, name: label };
    return { ...op, resultValue: { ...resultValue, matrix, label }, label, isRoot: true };
  }
  return { ...op, resultValue: { ...resultValue, label: '结果' }, label: '结果', isRoot: true };
}

function chooseRootLabel(library) {
  for (const candidate of ['C', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z']) {
    if (!library[candidate]) return candidate;
  }
  return 'C';
}

function uniqueSources(ops) {
  const seen = new Set();
  const sources = [];
  for (const op of ops) {
    for (const operand of op.operands || []) {
      if (operand.origin === 'input' && operand.kind === 'matrix' && !seen.has(operand.label)) {
        seen.add(operand.label);
        sources.push({ name: operand.label, matrix: operand.matrix });
      }
    }
  }
  return sources;
}

function shapeOfValue(value) {
  return value?.kind === 'matrix' ? `${value.matrix.rows}×${value.matrix.cols}` : '标量';
}

function deriveShapeChain(ops, result) {
  if (!ops.length) {
    return result.kind === 'matrix' ? `${result.matrix.rows}×${result.matrix.cols}` : '标量';
  }
  const root = ops.at(-1);
  const [left, right] = root.operands || [];
  const out = result.kind === 'scalar' ? '标量' : `${result.matrix.rows}×${result.matrix.cols}`;
  const leftShape = shapeOfValue(left);
  const rightShape = shapeOfValue(right);
  if (result.kind === 'scalar' && ops.length > 1) {
    const shapes = [];
    for (const op of ops) {
      for (const operand of op.operands || []) {
        if (operand.kind === 'matrix') {
          const label = `${operand.matrix.rows}×${operand.matrix.cols}`;
          if (!shapes.includes(label)) shapes.push(label);
        }
      }
    }
    if (shapes.length) return `${shapes.join(' + ')} → 标量`;
  }
  switch (root.type) {
    case 'add':
      return `${leftShape} + ${rightShape} → ${out}`;
    case 'subtract':
      return `${leftShape} − ${rightShape} → ${out}`;
    case 'hadamard':
      return `${leftShape} ⊙ ${rightShape} → ${out}`;
    case 'matmul':
      return `${leftShape} × ${rightShape} → ${out}`;
    case 'kron':
      return `${leftShape} ⊗ ${rightShape} → ${out}`;
    case 'scale':
      return `${leftShape} × k → ${out}`;
    case 'solve':
      return `[${leftShape} | ${rightShape}] → ${out}`;
    case 'determinant':
    case 'trace':
    case 'rank':
      return `${leftShape} → 标量`;
    case 'transpose':
      return `${leftShape} → ${out}`;
    case 'inverse':
      return `${leftShape} → ${out}（逆）`;
    case 'rref':
      return `${leftShape} → ${out}（行等价）`;
    case 'power':
      return `${leftShape} → ${out}（同阶方阵）`;
    default:
      return `${leftShape} → ${out}`;
  }
}

export function buildStoryFromExpression(expression, library, options = {}) {
  const analysis = analyzeExpression(expression, library);
  if (!analysis.ok) throw new Error(analysis.error);
  const ast = analysis.ast;
  if (!ast) throw new Error('表达式为空');
  const evaluated = evaluateExpression(ast, library, { record: true });
  const ops = evaluated.ops;
  const finalResult = evaluated.result;

  if (!ops.length) {
    if (finalResult.kind === 'scalar') {
      return buildScalarOnlyStory(formatAst(ast), finalResult, library);
    }
    const chapters = buildIdentityChapter(ast, library);
    const rootType = 'identity';
    const copy = operationCopy(rootType);
    if (!chapters.length) throw new Error('没有可演示的内容');
    chapters.push(
      makeFinale({
        expression: formatAst(ast),
        result: finalResult,
        rootType,
        extraNote: copy.meaning,
      }),
    );
    return {
      id: `story-${Date.now()}`,
      title: copy.title,
      eyebrow: copy.eyebrow,
      expression: formatAst(ast),
      inputExpression: expression,
      description: copy.meaning,
      chapters,
      meta: buildMeta({ expression: formatAst(ast), ops, result: finalResult, rootType, ast }),
      resultValue: finalResult,
      source: 'expression',
    };
  }

  const rootLabel = chooseRootLabel(library);
  let storyOps = ops.map((op, index) => (index === ops.length - 1 ? relabelRoot(op, rootLabel) : op));
  const rootOp = storyOps[storyOps.length - 1];
  const displayResult =
    finalResult.kind === 'matrix'
      ? { ...finalResult, label: rootLabel, matrix: { ...finalResult.matrix, name: rootLabel } }
      : { ...finalResult, label: '结果' };
  const rootType = rootOp.type;
  const copy = operationCopy(rootType);
  const chapters = [];
  for (let i = 0; i < storyOps.length; i++) {
    const op = storyOps[i];
    let built = chaptersForOperation(op);
    if (!built || !built.length) built = buildGenericChapter(op);
    built = built.map((chapterItem, chapterIndex) => ({
      ...chapterItem,
      id: `op-${i + 1}-${chapterItem.id}`,
      beats: chapterItem.beats.map((chapterBeat) => ({
        ...chapterBeat,
        id: `op-${i + 1}-${chapterBeat.id}`,
      })),
      tag:
        storyOps.length > 1
          ? `${String(i + 1).padStart(2, '0')} · ${chapterItem.tag}`
          : chapterItem.tag,
      title:
        storyOps.length > 1 && chapterIndex === 0
          ? `${i === 0 ? '先算' : '再算'}：${chapterItem.title}`
          : chapterItem.title,
    }));
    chapters.push(...built);
  }

  const lastOp = storyOps[storyOps.length - 1];
  const lastScalar = lastOp?.resultValue?.kind === 'scalar' ? lastOp.resultValue.value : null;
  if (
    finalResult.kind === 'scalar' &&
    (!lastScalar || !lastScalar.eq(finalResult.value))
  ) {
    chapters.push(buildScalarMergeChapter(formatAst(ast), finalResult.value, storyOps));
  }

  // Use the first input as a contextual panel in the finale when the result is scalar.
  let extraPanels = [];
  if (finalResult.kind === 'scalar') {
    const firstMatrixOperand = storyOps
      .flatMap((op) => op.operands)
      .find((operand) => operand.kind === 'matrix');
    if (firstMatrixOperand) {
      extraPanels = [
        panel(firstMatrixOperand.matrix, firstMatrixOperand.label, {
          role: 'input',
          caption: '被读取的对象',
        }),
      ];
    }
  }
  chapters.push(
    makeFinale({
      expression: formatAst(ast),
      result: displayResult,
      rootType,
      extraNote: copy.meaning,
      extraPanels,
    }),
  );

  let title = copy.title;
  let eyebrow = copy.eyebrow;
  let description = copy.meaning;
  if (options.template) {
    title = options.template.title || title;
    eyebrow = options.template.eyebrow || eyebrow;
    description = options.template.description || description;
  } else if (storyOps.length > 1) {
    title = '一次表达式，拆成层层可验证的运算';
    eyebrow = 'LAYERED EVALUATION';
    description = `按求值顺序拆成 ${storyOps.length} 次独立运算，每次只改变一件事。`;
  }

  const meta = buildMeta({
    expression: formatAst(ast),
    ops: storyOps,
    result: displayResult,
    rootType,
    ast,
  });
  if (chapters.some((chapterItem) => chapterItem.id === 'chapter-scalar-merge')) {
    meta.rule = '先把每个矩阵读数分别求出，再在标量层面完成最后的合成；标量不再携带行列形状。';
    meta.meaning = '最终只留下一个数。它没有行列，却仍然来自前面每个矩阵的不变量与具体数字。';
    meta.tag = '标量合成';
  }
  return {
    id: `story-${Date.now()}`,
    title,
    eyebrow,
    expression: formatAst(ast),
    inputExpression: expression,
    description,
    chapters,
    meta,
    resultValue: displayResult,
    source: 'expression',
    options,
  };
}

function buildMeta({ expression, ops, result, rootType, ast }) {
  const sources = uniqueSources(ops);
  const copy = operationCopy(rootType);
  const chaptersCount = ops.length;
  const resultLabel = result.kind === 'matrix' ? result.label : 'C';
  return {
    expression,
    rule: localizedRule(copy.rule, resultLabel),
    meaning: copy.meaning.replaceAll('C 的', `${resultLabel} 的`),
    tag: copy.tag,
    eyebrow: copy.eyebrow,
    operationCount: chaptersCount,
    sources,
    result: {
      kind: result.kind,
      label: result.label,
      rows: result.kind === 'matrix' ? result.matrix.rows : null,
      cols: result.kind === 'matrix' ? result.matrix.cols : null,
      formatted: result.kind === 'scalar' ? fmt(result.value) : `${result.matrix.rows}×${result.matrix.cols}`,
    },
    shapeChain: deriveShapeChain(ops, result),
    rootType,
  };
}

/* ------------------------------------------------------------------ *
 * Public: block assembly story
 * ------------------------------------------------------------------ */

export function buildBlockStory({ grid, built, expression = '分块组合', resultName = 'K' }) {
  const copy = operationCopy('concat');
  const result = { ...built.matrix, name: resultName };
  const beats = [];
  const outCells = cellsHidden(result);
  let index = 0;
  const totalCells = result.rows * result.cols;
  const placementFor = (r, c) =>
    built.placements.find(
      (p) =>
        r >= p.rowOffset &&
        r < p.rowOffset + p.block.rows &&
        c >= p.colOffset &&
        c < p.colOffset + p.block.cols,
    );
  for (let r = 0; r < result.rows; r++) {
    for (let c = 0; c < result.cols; c++) {
      index += 1;
      const placement = placementFor(r, c);
      const sourceCells = {};
      if (placement) {
        const sr = r - placement.rowOffset;
        const sc = c - placement.colOffset;
        sourceCells[key(sr, sc)] = { tone: 'source' };
        markCell(outCells, r, c, { tone: 'live', text: fmt(result.data[r][c]) });
        for (let prev = 0; prev < r * result.cols + c; prev++) {
          const pr = Math.floor(prev / result.cols);
          const pc = prev % result.cols;
          if (outCells[key(pr, pc)]?.hidden !== false) markCell(outCells, pr, pc, { tone: 'done', text: fmt(result.data[pr][pc]) });
        }
        beats.push(
          beat(`block-${r}-${c}`, {
            title: `把 ${placement.block.name} 的第 ${sr + 1} 行第 ${sc + 1} 列搬进来`,
            narration: '拼接不是做算术，而是把已有矩阵的数字放到大矩阵的精确坐标上。',
            panels: [
              panel(placement.block, placement.block.name, {
                cells: sourceCells,
                role: 'input',
                caption: `块位置 (${placement.blockRow + 1}, ${placement.blockCol + 1})`,
              }),
              panel(result, `组合矩阵 ${resultName}`, {
                cells: { ...outCells },
                role: 'result',
                rowFocus: [r],
                colFocus: [c],
                caption: `${built.rowHeights.join('+')} 行 × ${built.colWidths.join('+')} 列`,
              }),
            ],
            connectors: ['→'],
            lens: makeLens({
              kicker: `逐格搬运 · ${index} / ${totalCells}`,
              heading: '块的局部坐标，映射到整体的全局坐标',
              equation: `${resultName}${sub(r + 1)}${sub(c + 1)} = ${placement.block.name}${sub(sr + 1)}${sub(sc + 1)} = ${fmt(result.data[r][c])}`,
              terms: [
                {
                  label: '所在块',
                  expr: `第 ${placement.blockRow + 1} 块行 · 第 ${placement.blockCol + 1} 块列`,
                  value: placement.block.name,
                  state: 'active',
                },
                {
                  label: '整体坐标',
                  expr: `(${r + 1}, ${c + 1})`,
                  value: fmt(result.data[r][c]),
                  state: 'active',
                },
              ],
              accumulator: {
                label: '已铺设',
                value: `${index} / ${totalCells} 个位置`,
              },
              note: `块行高度分别为 ${built.rowHeights.join(', ')}；块列宽度分别为 ${built.colWidths.join(', ')}。`,
              rule: copy.rule,
            }),
            readout: scalarReadout('搬运元素', fmt(result.data[r][c]), `第 ${index} / ${totalCells} 格`, 'live'),
          }),
        );
      }
    }
  }
  beats.push(
    beat('block-finale', {
      title: '分块视图成立，形状严丝合缝',
      narration: '大矩阵的每一个位置都能指出它来自哪一块、哪一行、哪一列。',
      panels: [
        panel(result, `组合矩阵 ${resultName}`, {
          cells: Object.fromEntries(
            Array.from({ length: result.rows }, (_, r) =>
              Array.from({ length: result.cols }, (_, c) => [key(r, c), { tone: 'result' }]),
            ).flat(),
          ),
          role: 'result',
          caption: `${result.rows}×${result.cols}`,
        }),
      ],
      lens: makeLens({
        kicker: '收束 · 分块组合',
        heading: '矩阵变大了，但结构仍然可追溯',
        equation: `block(${grid.flat().filter(Boolean).map((b) => b.name).join(', ')}) = ${resultName}`,
        terms: built.placements.map((p) => ({
          label: p.block.name,
          expr: `块 (${p.blockRow + 1}, ${p.blockCol + 1})`,
          value: `${p.block.rows}×${p.block.cols}`,
          state: 'done',
        })),
        accumulator: { label: '整体形状', value: `${result.rows}×${result.cols}` },
        note: '每个块行等高、每个块列等宽，这是拼接成立的条件。',
        rule: copy.rule,
      }),
      readout: scalarReadout('组合完成', `${result.rows}×${result.cols}`, '结构保留', 'done'),
      isFinale: true,
      duration: 2400,
    }),
  );
  const chapters = [chapter('chapter-block', '把矩阵当作可以嵌套的块', copy.tag, '逐格映射全局坐标，拼出更大的矩阵。', beats)];
  const chapterTitle = expression || '分块组合';
  return {
    id: `story-block-${Date.now()}`,
    title: copy.title,
    eyebrow: copy.eyebrow,
    expression: chapterTitle,
    inputExpression: resultName,
    description: copy.meaning,
    chapters,
    meta: {
      expression: chapterTitle,
      rule: copy.rule,
      meaning: copy.meaning,
      tag: copy.tag,
      eyebrow: copy.eyebrow,
      operationCount: 1,
      sources: grid.flat().filter(Boolean),
      result: {
        kind: 'matrix',
        label: resultName,
        rows: result.rows,
        cols: result.cols,
        formatted: `${result.rows}×${result.cols}`,
      },
      shapeChain: `${grid.length}×${grid[0].length} 块格 → ${result.rows}×${result.cols}`,
      rootType: 'concat',
    },
    resultValue: { kind: 'matrix', matrix: result, label: resultName, expr: resultName },
    source: 'block',
  };
}

export function countBeats(story) {
  return story.chapters.reduce((sum, ch) => sum + ch.beats.length, 0);
}

export function flattenBeats(story) {
  const result = [];
  story.chapters.forEach((chapter, chapterIndex) => {
    chapter.beats.forEach((b, beatIndex) => {
      result.push({
        ...b,
        chapterIndex,
        beatIndex,
        chapterTitle: chapter.title,
        chapterTag: chapter.tag,
        index: result.length,
      });
    });
  });
  return result;
}
