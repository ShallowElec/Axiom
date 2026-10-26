import { determinant, matrixFromRows } from '../core/matrix.js';
import type { Matrix } from '../core/matrix.js';
import type { MatrixLibrary } from '../core/expression.js';

export interface SeedMatrixDefinition {
  id: string;
  name: string;
  note: string;
  rows: number;
  cols: number;
  data: number[][];
}

export interface SeedMatrixObject extends Matrix {
  id: string;
  note: string;
}

export type TemplateCategory = 'product' | 'eliminate' | 'structure' | 'readout';
export type TemplateAccent = 'lime' | 'coral' | 'mint' | 'amber';
export type SlotAccept = 'any' | 'square' | 'vector';

export interface TemplateSlot {
  key: string;
  label: string;
  hint: string;
  accept: SlotAccept;
}

export interface FormulaTemplate {
  id: string;
  category: TemplateCategory;
  title: string;
  subtitle: string;
  formula: string;
  symbol: string;
  accent: TemplateAccent;
  description: string;
  eyebrow?: string;
  slots: TemplateSlot[];
  build: (selection: Record<string, string>) => string;
  validate: (selected: (Matrix | undefined)[]) => string | null;
  checkLines: string[];
}

export interface OperationReferenceItem {
  syntax: string;
  name: string;
  desc: string;
  code: string;
  advanced?: boolean;
}

export interface OperationReferenceGroup {
  group: string;
  items: OperationReferenceItem[];
}

export const SEED_MATRICES: SeedMatrixDefinition[] = [
  {
    id: 'seed-a',
    name: 'A',
    note: '可逆的 2×2 变换',
    rows: 2,
    cols: 2,
    data: [
      [2, 1],
      [-1, 3],
    ],
  },
  {
    id: 'seed-b',
    name: 'B',
    note: '二维的另一个作用',
    rows: 2,
    cols: 2,
    data: [
      [4, 0],
      [2, 5],
    ],
  },
  {
    id: 'seed-c',
    name: 'M',
    note: '三维示例方阵',
    rows: 3,
    cols: 3,
    data: [
      [1, 2, 0],
      [0, 1, 3],
      [2, 0, 1],
    ],
  },
  {
    id: 'seed-b-vector',
    name: 'b',
    note: '三维右端向量',
    rows: 3,
    cols: 1,
    data: [[5], [1], [2]],
  },
  {
    id: 'seed-v-vector',
    name: 'v',
    note: '用于内积 / 外积的列向量',
    rows: 3,
    cols: 1,
    data: [[2], [-1], [3]],
  },
];

export function seedObjects(): SeedMatrixObject[] {
  return SEED_MATRICES.map((definition) => {
    const matrix = matrixFromRows(definition.data, definition.name);
    return { ...matrix, id: definition.id, note: definition.note };
  });
}

export function libraryFrom(objects: readonly Matrix[]): MatrixLibrary {
  return Object.fromEntries(objects.map((matrix) => [matrix.name, matrix]));
}

export interface ExpressionExample {
  expression: string;
  label: string;
}

export const EXPRESSION_EXAMPLES: ExpressionExample[] = [
  { expression: 'A × B', label: '两个作用相遇' },
  { expression: 'A × B + A', label: '复合表达式' },
  { expression: 'det(M)', label: '行列式展开' },
  { expression: 'inv(A)', label: '高斯–若尔当' },
  { expression: 'solve(M, b)', label: '解方程组' },
  { expression: 'A ⊙ B', label: '逐项乘积' },
  { expression: 'Aᵀ', label: '转置' },
  { expression: 'A ⊗ B', label: 'Kronecker 积' },
  { expression: '2 × A', label: '数乘' },
  { expression: 'A^2', label: '矩阵幂' },
];

export interface TemplateCategoryOption {
  id: TemplateCategory | 'all';
  label: string;
}

export const TEMPLATE_CATEGORIES: TemplateCategoryOption[] = [
  { id: 'all', label: '全部' },
  { id: 'product', label: '乘法' },
  { id: 'eliminate', label: '消元' },
  { id: 'structure', label: '结构' },
  { id: 'readout', label: '标量' },
];

export const TEMPLATES: FormulaTemplate[] = [
  {
    id: 'matmul',
    category: 'product',
    title: '矩阵乘法 · 行列扫描',
    subtitle: '每一个输出格，都由一条行和一条列相遇生成',
    formula: 'A × B',
    symbol: '×',
    accent: 'lime',
    description: '逐项展示 A 的第 i 行与 B 的第 j 列的点积，并把每一次乘积加入累加器。矩阵乘法不保留元素位置，而是重新编织行列关系。',
    slots: [
      { key: 'left', label: '左矩阵 A', hint: 'm × k', accept: 'any' },
      { key: 'right', label: '右矩阵 B', hint: 'k × n', accept: 'any' },
    ],
    build: (s) => `${s.left} × ${s.right}`,
    validate: (selected) => {
      const [a, b] = selected;
      if (!a || !b) return '请选择两个矩阵';
      if (a.cols !== b.rows)
        return `内维不相容：${a.name}（${a.rows}×${a.cols}）的列数必须等于 ${b.name}（${b.rows}×${b.cols}）的行数。`;
      return null;
    },
    checkLines: [
      '内维一致：A 的列数 = B 的行数',
      '结果形状：A 的行数 × B 的列数',
      '不是逐项相乘；每个输出格都是点积',
    ],
  },
  {
    id: 'hadamard',
    category: 'product',
    title: 'Hadamard 积 · 逐点调制',
    subtitle: '两个同形矩阵只交换对应位置的数',
    formula: 'A ⊙ B',
    symbol: '⊙',
    accent: 'coral',
    description: '把两个同形矩阵的相同坐标直接相乘。它与矩阵乘法不同：没有行的横向扫描，也没有列的纵向扫描。',
    slots: [
      { key: 'left', label: '矩阵 A', hint: '同形', accept: 'any' },
      { key: 'right', label: '矩阵 B', hint: '同形', accept: 'any' },
    ],
    build: (s) => `${s.left} ⊙ ${s.right}`,
    validate: (selected) => {
      const [a, b] = selected;
      if (!a || !b) return '请选择两个矩阵';
      if (a.rows !== b.rows || a.cols !== b.cols)
        return `形状不同：${a.name} 是 ${a.rows}×${a.cols}，${b.name} 是 ${b.rows}×${b.cols}。Hadamard 积要求完全同形。`;
      return null;
    },
    checkLines: ['两个矩阵同形', '每个位置独立相乘', '结果形状与输入完全一致'],
  },
  {
    id: 'inverse',
    category: 'eliminate',
    title: '逆矩阵 · 高斯–若尔当',
    subtitle: '在 [A | I] 上同步行变换，直到左边成为 I',
    formula: 'A⁻¹  ←  [A | I]',
    symbol: '⁻¹',
    accent: 'mint',
    description: '从增广矩阵 [A | I] 开始，逐行归一与消元。左侧变成单位矩阵的那一刻，右侧记录的所有逆操作就是 A⁻¹。',
    slots: [{ key: 'a', label: '方阵 A', hint: 'n × n · det ≠ 0', accept: 'square' }],
    build: (s) => `inv(${s.a})`,
    validate: (selected) => {
      const a = selected[0];
      if (!a) return '请选择一个方阵';
      if (a.rows !== a.cols) return `${a.name} 是 ${a.rows}×${a.cols}，求逆只对方阵有定义。`;
      if (determinant(a).isZero) return `${a.name} 的行列式为 0。空间已被压扁，这个方阵没有逆。`;
      return null;
    },
    checkLines: ['必须是方阵', '行列式不能为 0', '左侧归约成 I，右侧成为 A⁻¹'],
  },
  {
    id: 'determinant',
    category: 'readout',
    title: '行列式 · 余子式展开',
    subtitle: '沿一行切开矩阵，把体积折叠成一个数',
    formula: 'det(A)',
    symbol: 'det',
    accent: 'amber',
    description: '选择含零最多的一行做 Laplace 展开。每个元素配对一个小一号的余子式，正负号按棋盘规律交替，最终汇成有向体积的缩放因子。',
    slots: [{ key: 'a', label: '方阵 A', hint: 'n × n', accept: 'square' }],
    build: (s) => `det(${s.a})`,
    validate: (selected) => {
      const a = selected[0];
      if (!a) return '请选择一个方阵';
      if (a.rows !== a.cols) return `${a.name} 是 ${a.rows}×${a.cols}，行列式只对方阵有定义。`;
      return null;
    },
    checkLines: ['只能读取方阵', '一个个元素配一个余子式', '最终结果是没有形状的标量'],
  },
  {
    id: 'rref',
    category: 'eliminate',
    title: 'RREF · 最简行阶梯',
    subtitle: '主元归一，所属列其余位置清零',
    formula: 'A ⟶ rref(A)',
    symbol: '⌟',
    accent: 'mint',
    description: '逐列寻找主元，将主元化 1 并消掉同一列的其他行。到达最简行阶梯形后，主元直接暴露矩阵的秩。',
    slots: [{ key: 'a', label: '任意矩阵 A', hint: 'm × n', accept: 'any' }],
    build: (s) => `rref(${s.a})`,
    validate: (selected) => (selected[0] ? null : '请选择一个矩阵'),
    checkLines: ['可处理任意形状', '三类行变换保持行等价', '主元数量 = 矩阵的秩'],
  },
  {
    id: 'rank',
    category: 'readout',
    title: '秩 · 数出独立方向',
    subtitle: '消元后剩下的主元，就是空间真正的维度',
    formula: 'rank(A)',
    symbol: 'rk',
    accent: 'amber',
    description: '对矩阵做高斯–若尔当消元，统计主元数量。秩是线性映射保留的维数，也是线性无关列的最大数量。',
    slots: [{ key: 'a', label: '矩阵 A', hint: 'm × n', accept: 'any' }],
    build: (s) => `rank(${s.a})`,
    validate: (selected) => (selected[0] ? null : '请选择一个矩阵'),
    checkLines: ['行变换不改变秩', '主元数量即秩', '结果是一个整数标量'],
  },
  {
    id: 'solve',
    category: 'eliminate',
    title: '解方程组 · 增广消元',
    subtitle: 'A x = b，最后在 [I | x] 里直接读出 x',
    formula: 'A x = b  ⇔  [A | b]',
    symbol: 'x',
    accent: 'coral',
    description: '把线性方程的所有右端项并入增广矩阵，对整行同步做变换。左侧归约为 I 时，右侧就是解向量 x。',
    slots: [
      { key: 'a', label: '系数方阵 A', hint: 'n × n', accept: 'square' },
      { key: 'b', label: '右端向量 b', hint: 'n × 1', accept: 'vector' },
    ],
    build: (s) => `solve(${s.a}, ${s.b})`,
    validate: (selected) => {
      const [a, b] = selected;
      if (!a || !b) return '请选择系数矩阵与右端向量';
      if (a.rows !== a.cols) return '系数矩阵 A 必须是方阵。';
      if (b.cols !== 1) return '右端项 b 必须是列向量。';
      if (a.rows !== b.rows) return `维度不匹配：A 有 ${a.rows} 行，而 b 有 ${b.rows} 行。`;
      if (determinant(a).isZero) return `${a.name} 不可逆，这个方程组没有唯一解。`;
      return null;
    },
    checkLines: ['A 为方阵，b 为同高列向量', '行变换对等式两边同步进行', '解的每一项都保留变量顺序'],
  },
  {
    id: 'transpose',
    category: 'structure',
    title: '转置 · 行与列交换身份',
    subtitle: '只搬动坐标，不改变任何数值',
    formula: 'Aᵀ',
    symbol: 'ᵀ',
    accent: 'mint',
    description: '把每个 Aᵢⱼ 搬到 Aᵀⱼᵢ。转置改变形状，却不丢失任何一个元素；它对应线性映射在对偶空间中的方向。',
    slots: [{ key: 'a', label: '矩阵 A', hint: '任意形状', accept: 'any' }],
    build: (s) => `${s.a}ᵀ`,
    validate: (selected) => (selected[0] ? null : '请选择一个矩阵'),
    checkLines: ['每个元素换坐标', '形状 m×n 变为 n×m', '所有数值原样保留'],
  },
  {
    id: 'power',
    category: 'product',
    title: '矩阵幂 · 重复施加同一作用',
    subtitle: 'A² 不是把元素各自平方，而是 A 与自己相乘',
    formula: 'A² = A · A',
    symbol: '²',
    accent: 'lime',
    description: '矩阵幂表示同一次线性作用的复合。虽然显示成上标，但每次乘法的内部仍然是完整的行 × 列点积。',
    slots: [{ key: 'a', label: '方阵 A', hint: 'n × n', accept: 'square' }],
    build: (s) => `${s.a}^2`,
    validate: (selected) => {
      const a = selected[0];
      if (!a) return '请选择一个方阵';
      if (a.rows !== a.cols) return '只有方阵才有整数幂。';
      return null;
    },
    checkLines: ['必须是方阵', 'A² = A × A', '不是逐元素平方'],
  },
  {
    id: 'kron',
    category: 'structure',
    title: 'Kronecker 积 · 逐块扩张',
    subtitle: '外层每个数字决定一整块内层矩阵的缩放',
    formula: 'A ⊗ B',
    symbol: '⊗',
    accent: 'coral',
    description: '把 A 的每个元素与整个 B 相乘并排列成块。形状按两个方向的尺寸相乘而扩张：m₁m₂ × n₁n₂。',
    slots: [
      { key: 'left', label: '外层 A', hint: '任意形状', accept: 'any' },
      { key: 'right', label: '内层 B', hint: '任意形状', accept: 'any' },
    ],
    build: (s) => `${s.left} ⊗ ${s.right}`,
    validate: (selected) => {
      const [a, b] = selected;
      if (!a || !b) return '请选择两个矩阵';
      if (a.rows * b.rows > 20 || a.cols * b.cols > 20) return '演示尺寸上限为 20×20，请选择更小的矩阵。';
      return null;
    },
    checkLines: ['总形状为 m₁m₂ × n₁n₂', '每个 A 元素生成一个 B 的副本', 'B 的每个数都会被同一系数缩放'],
  },
  {
    id: 'add',
    category: 'product',
    title: '矩阵加法 · 同位置叠加',
    subtitle: '两个同形矩阵在每个坐标上各自相加',
    formula: 'A + B',
    symbol: '+',
    accent: 'amber',
    description: '最简单的矩阵运算：形状不变，每个输出位置只读取两个输入中同一位置的数。',
    slots: [
      { key: 'left', label: '矩阵 A', hint: '同形', accept: 'any' },
      { key: 'right', label: '矩阵 B', hint: '同形', accept: 'any' },
    ],
    build: (s) => `${s.left} + ${s.right}`,
    validate: (selected) => {
      const [a, b] = selected;
      if (!a || !b) return '请选择两个矩阵';
      if (a.rows !== b.rows || a.cols !== b.cols) return '矩阵加法要求两个矩阵同形。';
      return null;
    },
    checkLines: ['两矩阵同形', '逐格相加', '结果形状保持不变'],
  },
];

export const OPS_REFERENCE: OperationReferenceGroup[] = [
  {
    group: '逐格运算',
    items: [
      { syntax: 'A + B', name: '矩阵加法', desc: '同形矩阵逐格相加', code: 'add' },
      { syntax: 'A - B', name: '矩阵减法', desc: '同形矩阵逐格相减', code: 'sub' },
      { syntax: 'A ⊙ B', name: 'Hadamard 积', desc: '同形矩阵逐格相乘', code: 'hadamard' },
      { syntax: 'k × A', name: '数乘', desc: '所有元素乘同一个标量', code: 'scale' },
      { syntax: 'A / k', name: '数除', desc: '所有元素除以同一个非零标量', code: 'divide' },
    ],
  },
  {
    group: '线性结构',
    items: [
      { syntax: 'A × B', name: '矩阵乘法', desc: '行与列做点积，复合两个作用', code: 'matmul' },
      { syntax: 'Aᵀ', name: '转置', desc: '交换行与列的身份', code: 'transpose' },
      { syntax: 'A^2', name: '矩阵幂', desc: '重复施加同一个线性作用', code: 'power' },
      { syntax: 'A ⊗ B', name: 'Kronecker 积', desc: '逐块组合，形状相乘', code: 'kron' },
      { syntax: '[A | B]', name: '分块拼接', desc: '按行列拼成更大的矩阵', code: 'block' },
    ],
  },
  {
    group: '标量不变量',
    items: [
      { syntax: 'det(A)', name: '行列式', desc: '有向体积的缩放因子', code: 'det' },
      { syntax: 'trace(A)', name: '迹', desc: '主对角线元素之和', code: 'trace' },
      { syntax: 'rank(A)', name: '秩', desc: '线性无关方向的数量', code: 'rank' },
    ],
  },
  {
    group: '消元与系统',
    items: [
      { syntax: 'rref(A)', name: '最简行阶梯形', desc: '主元归 1，主元列其余归 0', code: 'rref' },
      { syntax: 'inv(A)', name: '逆矩阵', desc: '用 [A | I] 的行变换求逆', code: 'inv' },
      { syntax: 'solve(A, b)', name: '解线性方程组', desc: '把 Ax = b 消成 [I | x]', code: 'solve' },
      { syntax: 'adj(A)', name: '伴随矩阵', desc: '余子式矩阵的转置（结果预览）', code: 'adj' },
    ],
  },
  {
    group: '向量构造',
    items: [
      { syntax: 'u · v', name: '内积', desc: '两个同高列向量的点积', code: 'dot', advanced: true },
      { syntax: 'u vᵀ', name: '外积', desc: '列向量 × 行向量，生成秩 1 矩阵', code: 'outer', advanced: true },
    ],
  },
  {
    group: '工程读数',
    items: [
      { syntax: 'χ(λ)=det(λI−A)', name: '特征多项式', desc: '方阵的谱多项式的系数', code: 'charpoly', advanced: true },
      { syntax: 'eig(A)', name: '特征值', desc: '方阵的谱读数（分析抽屉）', code: 'eig', advanced: true },
      { syntax: 'A = LU', name: 'LU 分解', desc: '置换、下三角与上三角分解', code: 'lu', advanced: true },
      { syntax: 'A = QR', name: 'QR 分解', desc: '正交基与上三角因子（数值）', code: 'qr', advanced: true },
      { syntax: 'null(A)', name: '零空间', desc: '被 A 压到零的向量基', code: 'null', advanced: true },
      { syntax: '‖A‖F', name: 'Frobenius 范数', desc: '所有元素平方和的平方根', code: 'norm', advanced: true },
    ],
  },
];
