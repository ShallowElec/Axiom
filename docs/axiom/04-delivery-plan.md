# 04 · 实施计划与验收门槛

> 状态：Phase B + C + D 已实施；后续进入 runtime/engine 阶段。
> 本文件保留为实施顺序与验收基线。

## 1. 第一刀范围（批准后立即执行）

### 1.1 交付目标

用户在 Axiom 的新壳层里，完成一次 `A × B` 的运行，并能够：

1. 在白色工程画布上看到输入、步骤和结果；
2. 使用底部 Replay 时间轴播放/暂停、前后 step、拖拽/跳转；
3. 选中一个矩阵 cell，检查器、场景、Trace 同步；
4. 切换 Stage / Flat / Layers，不重算、不丢 selection；
5. 修改表达式后，旧 run 可重播并显示 STALE；新 run 产生新记录；
6. 在 Console 中独立运行一个函数，也进入同一个 Run/Trace 体系；
7. 在浅色/深色主题间切换；刷新后 session 重置（IN-MEMORY，明确告知）。

### 1.2 明确不包含

- 项目保存/导出/迁移、SQLite、`.mathproj`/`.axiomproj`。
- 原生执行 trace、真实 step checkpoint、true fork。
- Rust/WASM、AD/VJP、MX/FP4、多后端、GPU、Worker。
- 完整任意嵌套 Formula 编辑器/公式仓库 revision。
- 执行图/Gradients 视图、run 对比、多窗口。
- 账号、云、网络、遥测。

## 2. 阶段与评审门

### Phase A：设计批准（当前）

**交付**：本 `docs/axiom/` 文档包 + 参考材料。
**退出标准**：你明确批准/修订 [05-approval-checklist.md](05-approval-checklist.md)。
**不做**：任何业务代码。

### Phase B：Axiom foundation（视觉壳层）

**目标**：先让应用看起来像 Axiom，功能不倒退。

交付：

- `theme/tokens.css` 与 `theme/theme.css`；Light/Dark 切换（内存）。
- 新壳层：命令栏、活动栏、资源栏、中央视图、检查器、底部 dock、状态栏。
- 基础组件：Button/Input/Tabs/Panel/Table/Status/Splitter/Tooltip/Dialog。
- 将当前矩阵库、表达式输入、Stage、检查器、Flat/Layers 初步迁入新布局；旧品牌/绿色/深色舞台不再出现。
- 保持现有数学行为；旧 `MatrixEditorModal` 等辅助浮层重新皮肤。
- **不要求**此阶段完成新 Run/Trace；可以先用现有 story 数据填充 Stage，但不对用户宣称新重播。

**退出标准**：

- 1440×900 与 1120×760 截图通过；无横向溢出；所有现有操作可达。
- 旧测试/类型检查/构建通过。
- 浅/深主题 token 达标；无旧青柠/珊瑚/深绿可见。
- 与批准的设计稿一致；无 12px+ 圆角/渐变/发光/彩色底托。

**Review Gate B**：你批准截图/主题/布局后，才进入 runtime 集成。

### Phase C：Run / Trace / Replay vertical slice

**目标**：只对 `A × B` 跑通完整不可变运行与重播，然后扩展到全部操作。

交付：

- `WorkbenchController`、`WorkbenchStore`、`ReplayStore`、`SelectionStore`（或合并 store）。
- `ExactEngineAdapter` + `DerivedTraceAdapter` + `PresentationCompiler`。
- RunRecord/Trace/Presentation 的内部 schema 与 test fixtures。
- Replay dock：状态行、step 时间轴、播放/暂停、前后 step、speed、STEPS/MICRO。
- Stage 由 Run/Replay selector 驱动；底部 Trace 表可选中；检查器联动。
- 无重算测试：seek/切视图时 engine call count 不增加。
- Derived provenance 可见。

**退出标准**：

- `A × B` 验收清单全部通过：播放/暂停/前后/拖拽/选中/切视图/stale/new run。
- 旧操作数学结果不回归。
- Replay 不使用 `Story` 以外的隐藏旧状态；run 完成后只读。
- 至少新增 12 项 runtime/replay 测试。

**Review Gate C**：你检查 Trace/Replay 实际交互后，才迁移所有操作/视图。

### Phase D：完整工作台迁移

**目标**：把现有功能全部移入 Axiom IA，删除旧主壳层。

交付：

- 全部矩阵操作/公式模板/分块/表达式/调试函数的 Run 适配。
- Objects / Formulas / Algorithms / Runs 资源栏。
- Formula structure lab 的新入口（保留现有功能，完整 Formula canvas 仍后置）。
- Flat/Layers 使用 Scene v2 source IDs + 同一 cursor/selection。
- Console 从 overlay 迁入 bottom dock。
- Problems 面板、stale banner、run list。
- 删除或隔离 ProjectModal/localStorage/自动保存/导出迁移入口。
- 旧 `App.tsx`/`LibraryPanel`/旧主题 CSS 退场；旧组件只有在有回归测试时保留。

**退出标准**：

- 当前 README 的所有主要能力在新 IA 中可达。
- 刷新后明确回到 seed session，无保存提示；`IN-MEMORY` 可见。
- 无旧品牌/旧色/大圆角残留；无项目 modal 诱导入口。
- 全量测试通过；新增 E2E 通过。
- 截图覆盖主界面、Replay、Flat、Layers、Light/Dark、Console、Runs。

### Phase E：硬化与可访问性

交付：

- 键盘全路径、focus 管理、减少动态、屏幕阅读器文本。
- 性能基准（1,000 step fixture、虚拟化、scene 懒编译）。
- 防止颜色唯一编码的视觉检查。
- CSP/安全基线（不扩大范围；至少确保无新增危险 IPC）。
- 记录 native engine 接入所需的接口空洞。

**退出标准**：

- 验收清单、性能目标、可访问性检查全部通过。
- 用户能够在一个会话内完成“运行→检查→重播→切视图→修改→新 run”。
- 已明确下一步（native trace/WASM/AD）的接口。

## 3. 文件/任务分解（编码阶段）

### 3.1 Foundation

- [ ] 新建 `src/axiom/theme/tokens.css`、`theme.css`。
- [ ] 新建 `src/axiom/ui/` 基础组件。
- [ ] 新建 `AxiomShell`、`ActivityRail`、`ResourceDock`、`Inspector`、`ReplayDock`、`StatusBar`、`SplitPane`。
- [ ] 新建 `src/runtime/document.ts`、`run-record.ts`、`trace.ts`、`presentation-document.ts`。
- [ ] 把当前 root CSS 中的变量替换为 `--ax-*`；旧 CSS 组件逐块迁移/删除。

### 3.2 Runtime

- [ ] `workbench-controller.ts`：run/load/seek/select/rerun 命令。
- [ ] `exact-engine-adapter.ts`：包装现有 `buildStoryFromExpression`/`buildBlockStory`/debug registry。
- [ ] `derived-trace-adapter.ts`：Story → Run/Trace/Presentation；`provenance:'derived'`。
- [ ] `presentation-compiler.ts`：Story + Scene → PresentationDocument，Scene v2 source IDs。
- [ ] `run-store.ts` + `replay-store.ts` + selection selectors。
- [ ] `playback-controller.ts`：rAF 时钟；只推进 presentation。
- [ ] `debug` function run 接入统一 controller。

### 3.3 UI integration

- [ ] ExpressionStrip -> Run command。
- [ ] Stage/Flat/Layers selectors + cursor。
- [ ] Replay dock timeline/controls + Trace table。
- [ ] Inspector Overview/Data/Trace。
- [ ] Runs/Objects/Formulas/Algorithms resource panels。
- [ ] Console migration。
- [ ] Light/Dark toggle。
- [ ] Remove old project/localStorage UI.

### 3.4 Tests

- [ ] Runtime schema/fixture tests。
- [ ] No-recompute on seek/view switch。
- [ ] Immutable run / stale document。
- [ ] Cursor boundary / step-micro mode。
- [ ] Scene source ID validity。
- [ ] Architecture boundaries (UI/runtime/renderers/core)。
- [ ] Playwright E2E for the main acceptance flow。
- [ ] Visual screenshots at 1440/1120, light/dark。

## 4. 验收用例（第一刀）

### T1 · Run

- 输入 `A × B`，按 F5。
- 出现 Run 记录；底部 Replay 打开。
- Step 从上到下完整；来源标记 DERIVED。
- 计算完成后才播放。

### T2 · 重播

- Space 播放/暂停；←/→ micro/step；Shift+←/→ step；Home/End。
- 拖拽滑杆到 step 7，Stage/检查器/Trace 同步。
- 从 7 拖动到 3 再到 7，无重新计算（engine spy count 0）。
- 到末尾后按播放从头开始。

### T3 · 选择

- 点击 C[1,2]；检查器显示 value/shape/dtype/source；场景高亮。
- Trace 对应行选中；Flat/Layers 同一对象对应（若该视图有对应节点）。
- 固定检查器后，hover 其他 cell 不改变 pin。

### T4 · 视图

- Stage→Flat→Layers→Stage；cursor 保持 step 7，selection 保持 C[1,2]。
- 视图切换无重新计算。

### T5 · 修改 / Stale

- 修改表达式为 `A + B`；旧 run 显示 stale。
- 旧 run 仍可播放/检查。
- Run 产生新 run；旧 run 仍在 Runs 列表。
- 不自动覆盖、不自动重跑。

### T6 · 失败

- 输入 `A × B` 形状不匹配（使用不同 shape fixture）。
- 出现 Problems；Replay 不显示成功完成；错误 step 可选中。
- 不出现“保存/导出”的假入口。

### T7 · Console

- 从 Algorithms 打开 Console，选择一个函数，运行。
- 生成 function run；可在 Replay/Trace 中检查。
- 不覆盖当前公式 Stage，除非显式选择 Open run（行为与设计一致）。

### T8 · 主题 / 布局 / 键盘

- Light/Dark 切换；刷新回 Light（本阶段）。
- 1120×760 下资源栏折叠/检查器抽屉可用；无横向滚动。
- 所有主操作只用键盘可完成；焦点可见；reduced-motion 下不自动播放。

## 5. 验收非目标

- 不能用“视觉上像”替代运行时正确性。
- 不能把 `derived` trace 隐藏在 UI 深处。
- 不能为了让播放更顺滑而改变 step 顺序或 shape/数学结果。
- 不能新增第三种色相或恢复旧青柠/珊瑚。
- 不能通过 mock 数据绕过真实当前引擎做 vertical slice；第一阶段必须包装真实引擎。
- 不能宣称 true branch/AD/MX 已实现。

## 6. 风险与回退

| 风险 | 应对 |
|---|---|
| 壳层改动造成功能倒退 | 旧 tests 作为回归；Stage 先只读展示，后接 run；每个操作至少 smoke |
| derived adapter 语义漂移 | 明确映射表、provenance、fixture；不让 UI 直接读 Story |
| 迁移 UI 与 runtime 同时出错 | Phase B/C 分开评审；Phase C 只做 A×B，再扩全部 |
| 旧 CSS 拖累 | 新组件新 token；旧 CSS 逐块删除，禁止覆盖式补丁 |
| 无持久化误用 | 全局 IN-MEMORY 标签；删除保存按钮；关闭即丢 |
| “分支”承诺过度 | 本阶段只提供 rerun/lineage；true fork 进入后续 run engine 阶段 |
| 色彩约束影响可读性 | 单色阶+文本/线型冗余；contrast 检查；视觉评审 |

## 7. 需要批准的具体范围

见 [05-approval-checklist.md](05-approval-checklist.md)。批准后我会从 Phase B 开始，**不会**同时改引擎/存储/AD。
