# 03 · 公式系统：KaTeX 负责排版，自己负责结构

> 状态：设计基线。现状已有线性文本表达式、headless AST（`src/formula/ast.ts`）、KaTeX 序列化/受限注解渲染（`latex.ts`）以及矩阵乘法/标量乘法/行列式的 typed 槽位结构实验；完整任意嵌套编辑器、公式仓库 revision 与公式块编排未接入。

## 结论

**AST 优先 + 结构编辑 + KaTeX 只读排版**：公式唯一事实是自家 typed AST，不是 LaTeX 字符串也不是 DOM；KaTeX 只渲染 AST 片段；模板是带类型槽位的 AST，不是 `build: (s) => ...` 字符串拼接；MathLive 0.111 只作可选 LaTeX 输入板，**没有直接 MathJSON 输出，不能当解析器**；Compute Engine 只能经适配器作可选后端。

## AST 与类型槽位

```ts
type Dim = number | `?${string}`;
type TypePattern =
  | { kind:'matrix'; rows:Dim; cols:Dim; dtype?:DTypeId }
  | { kind:'scalar'; dtype?:DTypeId }
  | { kind:'any' };

interface SlotSpec {
  id:string; label:string; accepts:TypePattern; optional?:boolean;
}
interface FormulaDefinition {
  schemaVersion:1; id:string; revision:number; title:string;
  params:SlotSpec[]; body:FormulaNode; displayTex?:string; // 缓存，可重建
}
interface SourceSpan { from:number; to:number }
interface NodeBase { id:string; span:SourceSpan }
type FormulaNode =
  | (NodeBase & { kind:'ref'; name:string })
  | (NodeBase & { kind:'number'; value:string })
  | (NodeBase & { kind:'binary'; op:'add'|'sub'|'mul'|'hadamard'|'kron'; left:FormulaNode; right:FormulaNode })
  | (NodeBase & { kind:'call'; fn:string; args:FormulaNode[] })
  | (NodeBase & { kind:'slot'; slotId:string; binding?:FormulaNode });
```

约束在装填前用形状变量统一：`matmul` 要求 `cols(left)=rows(right)`，输出 `(rows(left),cols(right))`；`add/hadamard` 要求同形；`det/inv` 要求方阵；`solve` 要求方阵且右端行数一致；dtype 冲突报错，不自动 cast。槽位是类型的空洞，替换/删除产生新 revision 并进入撤销栈。

## 结构编辑

- 展示模式整条 KaTeX 输出 HTML+MathML；编辑模式按 AST 分段渲染，槽位/可选中节点有 `data-node-id`/`data-slot-id`，命中测试不猜数学结构。
- 逻辑选择模型 `{nodeId, slotId?}`，键盘遍历 AST；不用整条公式的 contenteditable——其 DOM 没有稳定语义树，输入法、撤销和选区会破坏结构。
- 公式结构不接收中文组合输入；名称/备注正常使用 IME。线性文本输入在 `compositionstart/end` 期间不提交、不重排，Enter 不触发运行。
- 删除导致非法父节点时保留“带错误的草稿”，显示诊断，不静默改公式。

## 拖拽与吸附

采用 [pragmatic-drag-and-drop](https://github.com/atlassian/pragmatic-drag-and-drop) 统一指针/键盘/触控。载荷是版本化 JSON `{kind, id, revision}`，接收端重新校验，不执行载荷字段。拖动时对槽位做类型/形状匹配并按距离/嵌套排序，显示落点；不兼容给出原因（“需要 3×3，当前 2×3”）。放下执行 `bind(slotId, payload)` command，失败不改原公式。**键盘必须等价**：聚焦槽位 → Enter 选择 → 搜索/方向键 → Enter。动画仅 80–140ms，遵守 `prefers-reduced-motion`。

## 排版、语义色与无障碍

- KaTeX 0.19.1 的 `renderToString`/React 包装：`trust` 只放行自有 `\htmlClass`/`\htmlData` 注解白名单，拒绝 `\href`/`\url`/`\htmlStyle`，限制 `maxExpand`/尺寸、禁用任意外部宏；安全以 [KaTeX Security](https://katex.org/docs/security) 为准。错误由自有诊断呈现。
- 数学文本交 KaTeX；角色/dtype/槽位标记由 React 负责，不信任任意 `\htmlClass`/`\htmlData`，只允许自有白名单注解。语义色按输入/参数/操作/中间量/结果/错误分配，与舞台/检查器共用 token，且有文字/形状冗余。
- KaTeX 的 MathML 供屏幕阅读器；视觉层可 `aria-hidden`。另给结构树或线性摘要（“矩阵 A，2 行 2 列，乘以矩阵 B”）。对比遵循 [WAI 非文本对比](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)。
- 按 AST 子树规范哈希缓存渲染，编辑一个槽位不重排全公式。

## 组合与序列化

**Formula** 是参数化、可实例化、可嵌套的定义；**Algorithm block** 是带输入/输出端口的步骤图，每步调用注册表算子或已发布公式。公式可作算法块的一步，算法结果可绑定为公式值；循环必须显式、有迭代上限，禁止隐式递归。实例保存“定义引用 + 绑定 + revision”，不保存展开字符串。分块矩阵应生成 `block` AST 节点，而不只是结果矩阵。

持久化 AST + 槽位 + 约束 + revision；`displayTex` 只是缓存；节点 ID 在公式内稳定，跨文档用 `(formulaId, revision, nodeId)` 引用，禁止数组下标。JSON 字段顺序稳定，导入先校验再迁移。线性表达式仍是入口/出口格式，不是编辑器内部事实；转换需经解析器并报告语义丢失。

## 安全

KaTeX 使用受限 `trust` 回调，仅允许自有注解；禁用 `\href`、`\url`、`\includegraphics`、`\htmlStyle` 等外部能力；宏白名单、展开/尺寸上限防 DoS；用户标签不拼 HTML；剪贴板/拖拽数据按不可信输入校验，拒绝 `__proto__` 等键。若接 Compute Engine：限长/限时/限内存，输出重新包成自有 Value/AST，不直接渲染其对象。

## 库与取舍

| 库 | 角色 | 许可 | 取舍 |
|---|---|---|---|
| KaTeX 0.19.1 | 只读排版 | MIT（本地 LICENSE 已确认） | 快、稳定；无编辑/语义树，需自建结构层 |
| MathLive 0.111 | 可选 LaTeX 输入板 | MIT（公开信息，接入前复核） | 输入体验好；无直接 MathJSON，不能作解析器 |
| Compute Engine | 可选符号后端 | MIT（公开信息，接入前复核） | MathJSON/化简强；对象模型、bundle、版本需适配 |
| CodeMirror 6 | JSON/算法源码文本编辑 | MIT（公开信息，接入前复核） | 模块化；不是数学排版器 |
| pragmatic-drag-and-drop | 拖拽基础设施 | Apache-2.0（公开信息，接入前复核） | 行为一致；类型约束仍要自建 |

参考：[MathLive changelog](https://mathlive.io/mathfield/changelog/)、[Compute Engine](https://cortexjs.io/compute-engine/)、[CodeMirror Guide](https://codemirror.net/docs/guide/)。许可/版本在接入时锁定 tag 复核，非法律意见。

## 落地顺序

| 步骤 | 范围 | 验收 |
|---|---|---|
| F0 | 检查器只读 KaTeX | 显示不回归；XSS 测试 |
| F1 | AST + 模板迁移 | 11 个模板等价；旧表达式可解析 |
| F2 | 槽位构建器 | 键盘可完成 matmul/det/inv；错误可读 |
| F3 | 拖拽/吸附 + 撤销 | 类型冲突有原因；键盘等价 |
| F4 | 可选 MathLive 输入 | LaTeX 转自有 AST；往返测试 |
| F5 | 公式/算法块 + 仓库 | revision/迁移测试通过 |

## 决策记录

**已决定**：AST 是唯一事实，KaTeX 只读；模板改为 typed AST；不依赖 MathLive 0.111 输出 MathJSON；拖拽必须有校验和键盘等价；公式与算法块共用 revision 引用。

**待定**：Compute Engine 是否作符号后端；自由结构编辑的深度（先槽位优先）；公式仓库先项目级还是全局级；KaTeX 宏白名单；无障碍摘要文本的最终规范。
