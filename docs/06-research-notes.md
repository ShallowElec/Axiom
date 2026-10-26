# 06 · 研究笔记：数值格式、公式库与信息架构

> 设计调研（2026-10）。版本与许可以接入时锁定的官方文档/LICENSE 为准；本文只记录可追溯事实与设计推论。

## 1. OCP MX v1.0

来源：Open Compute Project, *OCP Microscaling Formats (MX) Specification v1.0*, 2023-09（[PDF](https://www.opencompute.org/documents/ocp-microscaling-formats-mx-v1-0-spec-final-pdf)）。

- 每块 **32 个元素**共享一个 **E8M0** scale；MXFP4=E2M1，MXFP6=E3M2/E2M3，MXFP8=E4M3/E5M2，另有 MXINT8。
- 元素转换用 **RNE**；有限格式按规范**饱和**而非溢出到 inf。E5M2 元素允许 inf/NaN。
- E8M0 偏置 127，可用指数域 0–254 对应 2⁻¹²⁷–2¹²⁷；无零/inf，`0xFF` 为 NaN。
- 量化分两步：先由块内最大幅值推导 2 的幂作为共享 scale，clamp 到 E8M0 范围；再对 32 个元素按该 scale 做 RNE 与饱和。不能简化为“除以块最大值”，具体边界按规范算法。
- 软件实现必须按 32 元素块、scale 和元素码值处理，不能把 MX 当作独立 float8。

| 格式 | bias | 最大有限值 | 最小 normal | 最小 subnormal | 特殊值 |
|---|---:|---:|---:|---:|---|
| E2M1（MXFP4） | 1 | 6 | 1 | 0.5 | 无 inf/NaN；码值 ±{0,.5,1,1.5,2,3,4,6} |
| E3M2（MXFP6） | 3 | 28 | 0.25 | 0.0625 | — |
| E2M3（MXFP6） | 1 | 7.5 | 1 | 0.125 | — |
| E4M3（MXFP8） | 7 | 448 | 2⁻⁶ | 2⁻⁹ | — |
| E5M2（MXFP8） | 15 | 57344 | — | — | 允许 inf/NaN |
| E8M0（scale） | 127 | — | — | — | 无零/inf；`0xFF`=NaN |

表中“—”表示本文未引用该项，不代表规范没有该属性。

## 2. Float16 与原生能力

TC39 `Float16Array` 提案已 **Stage 4**、2025 年可用（[提案](https://github.com/tc39/proposal-float16array)），可用于 f16 存储；但 JS/Electron **没有原生 float8/MX**，打包、scale、舍入均须软件实现。精确有理数继续用 BigInt，不能靠 IEEE 浮点表达 0.1 这类输入。

## 3. 公式与编辑器库

| 项目 | 能力 | 许可 | 取舍与本项目结论 |
|---|---|---|---|
| KaTeX 0.19.1 | TeX 子集排版，HTML+MathML | MIT（本地 LICENSE 已确认） | 只渲染不解析；作必选只读渲染器，结构自建 |
| MathLive 0.111 | 数学输入、LaTeX 输出 | MIT（公开信息，复核） | 0.111 不直接输出 MathJSON；仅可选输入板，不作解析器 |
| Compute Engine | MathJSON、符号/数值 | MIT（公开信息，复核） | 能力较强但对象模型/bundle 需适配；只作可选后端 |
| CodeMirror 6 | 可扩展文本编辑器 | MIT（公开信息，复核） | 适合 JSON/算法源码，不是数学排版器 |
| pragmatic-drag-and-drop | 统一拖拽 | Apache-2.0（公开信息，复核） | 作基础设施；类型/吸附/键盘仍自建 |

参考：[KaTeX Security](https://katex.org/docs/security)、[MathLive Changelog](https://mathlive.io/mathfield/changelog/)、[Compute Engine](https://cortexjs.io/compute-engine/)、[CodeMirror Guide](https://codemirror.net/docs/guide/)、[pragmatic-drag-and-drop](https://github.com/atlassian/pragmatic-drag-and-drop)。

**关键判断**：成熟排版与成熟结构编辑不是同一问题。KaTeX 解决前者；MathLive 改善输入，但不能在没有解析层时产出可验证结构；结构由自有 typed AST/槽位/键盘模型承担。

## 4. 信息架构参照

- **RStudio**：项目为中心，编辑器/控制台/环境/文件多面板，可停靠调整；支持“资产架 + 可调中央分栏”的混合壳层（[Posit IDE](https://docs.posit.co/ide/user/)）。
- **Observable**：响应式 notebook 用依赖图决定重算；启发是派生关系显式化，不是照搬 notebook（[Reactivity](https://observablehq.com/framework/reactivity)）。
- **GeoGebra**：构造协议按顺序记录作图与依赖，可回看；对应 Trace/构造历史（[Construction Protocol](https://wiki.geogebra.org/en/Construction_Protocol)）。
- **Desmos**：直接操作、即时联动；借“操作即反馈”，用剧场补多步算法。
- **Halide**：算法与 schedule 分离；对应 Trace（事实）与 Storyboard/Scene（呈现编排/投影）（[论文](https://dl.acm.org/doi/10.1145/2499370.2462176)）。

IA 原则：左侧选对象/仓库，中央保持编辑与观看同一现场，右侧解释当前值，底部保留原始事实；每个面板绑定明确状态源。

## 5. Trace / Scene 与三维编码

- **Trace**：只追加事件 + 值存储，以 `ValueId`/`seq` 引用；可调试、导出、重放。
- **Storyboard**：教学编排；同一 Trace 可有不同讲法，但不得改值。
- **Scene**：renderer-neutral 节点/边/通道；参考 glTF 的节点/变换/场景图思想（[glTF](https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_002_BasicGltfStructure.html)），但首先服务层叠解释，不是建模格式。
- 坐标不进事实层；Scene 给 stage/lane/角色/值引用，像素由渲染器计算，才能在不同窗口和 2D/层叠/平铺中复用。
- 空间轴最多 x/y/z；z 只表达流水线层深。超过三维的数据走 hue/size/texture/border/motion/small multiples，不新增轴。连续色标用 viridis（[介绍](https://cran.r-project.org/web/packages/viridis/vignettes/intro-to-viridis.html)）；非文本对比 ≥3:1（[WAI](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)），且颜色有标签/形状/表格回退。
- 平铺“合成/RNA 式”是设计类比：值成链/瓦片，算子成窗口，循环展开成重复片段；不做生物学事实声明。

## 6. 渲染与性能栈

2D 小规模优先 DOM/SVG，密集后 Canvas；2.5D 用 CSS 3D transform + 分层 DOM，限制透视/层数/滤镜；未来中等规模 3D 再评估 three.js + React Three Fiber，并保留 2D 回退。计算进 Worker，渲染只读 Scene，大值延迟加载，动画只改 transform/opacity，事件/节点设上限。性能以冷启动、单帧 p95、拖动、内存、DOM 节点数实测，不做无基线优化。

## 7. 结论与缺口

| 结论 | 落点 |
|---|---|
| KaTeX 只读、结构自建 | 03；M3 |
| MathLive 0.111 不作 MathJSON 来源 | 03、05；M3 |
| 统一 Value + 显式 cast | 02；M4 |
| MX 32 块/E8M0/RNE/饱和 | 02；M4 规范 fixture |
| Trace/Storyboard/Scene 分层 | 01、04；M0/M1 |
| 2.5D 用 CSS，3D 后置 | 04；M6 或以后 |
| >3 维进视觉通道 | 04；Scene v2 |

**缺口**：MX scale 的逐条 clamp/scale 算法仍需对照 PDF 实现并以码值表验收；MathLive 未来版本行为不能假设；公式结构与屏幕阅读器需用户测试；2.5D/平铺的认知负担、层数和颜色映射需任务测试；复数 AD、SVD/特征值梯度、完整 3D 编辑尚未验证，不写入近期承诺。

## 8. 来源

- OCP MX v1.0：https://www.opencompute.org/documents/ocp-microscaling-formats-mx-v1-0-spec-final-pdf
- TC39 Float16Array：https://github.com/tc39/proposal-float16array
- KaTeX：https://katex.org/docs/security
- MathLive：https://mathlive.io/mathfield/changelog/
- Compute Engine：https://cortexjs.io/compute-engine/
- CodeMirror：https://codemirror.net/docs/guide/
- pragmatic-drag-and-drop：https://github.com/atlassian/pragmatic-drag-and-drop
- WAI 非文本对比：https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
- viridis：https://cran.r-project.org/web/packages/viridis/vignettes/intro-to-viridis.html
- Observable：https://observablehq.com/framework/reactivity
- GeoGebra：https://wiki.geogebra.org/en/Construction_Protocol
- glTF：https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_002_BasicGltfStructure.html
- Halide：https://dl.acm.org/doi/10.1145/2499370.2462176
- Posit IDE：https://docs.posit.co/ide/user/
- Desmos：https://www.desmos.com/

## 决策记录

**已决定**：OCP MX v1.0 是 MX 唯一规范来源；KaTeX 排版、MathLive 仅输入、Compute Engine 仅后端，事实层自建；借 RStudio 面板/ Observable 依赖/GeoGebra 历史/Desmos 反馈，不复制界面；2.5D 先 CSS，3D 后置；高维进属性通道，无障碍回退是验收项。

**待定**：外部符号后端是否进正式版；MathLive 后续接口变化；平铺布局的认知设计；完整 3D 编辑与 GPU 渲染的必要性。
