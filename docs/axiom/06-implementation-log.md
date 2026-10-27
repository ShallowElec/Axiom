# 06 · Phase B + C 实施记录

> 状态：已实施，2026-10-26。
> 范围：Axiom 视觉/壳层 + 现有精确 Q 引擎上的不可变 Run / Trace / Replay 垂直切片。
> 未包含：持久化、真实 step fork、native kernel trace、Rust/WASM、AD/MX、完整公式编辑器。

## 1. 已落地

### 壳层与视觉

- 新增 `src/axiom/theme.css`：白色工程纸面、INK/SKY 单色相、Light/Dark token、0–2px 圆角、1px 硬线、无渐变/发光/阴影。
- 新增 Axiom 壳层：`CommandBar`、`ActivityRail`、`ResourceDock`、`ExpressionStrip`、`StageView`、`FlatView`、`LayersView`、`Inspector`、`ReplayDock`、`TracePanel`、`ConsolePanel`、`ProblemsPanel`、`StatusBar`。
- 产品标识改为 Axiom：窗口标题、Electron app name、菜单、favicon、package name/version（`axiom-workbench@0.3.0`）。
- 自托管 IBM Plex Sans/Mono（Fontsource）；公式仍用 KaTeX 字体。
- 浅色为默认；深色为近黑 + 白字 + 亮蓝，不保留旧青柠/珊瑚/暖纸张色。
- 旧深色舞台、奶油卡片、大圆角品牌侧栏不再出现在新壳层。

### 信息架构

- 左侧 46px 活动栏：Objects / Formulas / Algorithms / Runs。
- 资源 dock 264px（1120 宽默认折叠）；中央表达式条 + Stage/Flat/Layers；右侧检查器；底部 Replay/Trace/Console/Problems dock；状态栏。
- 无项目保存/导出/恢复入口；全局 `IN-MEMORY` 标识。
- MatrixEditor 保留为临时功能；Formula 结构在 Phase D 已迁入中央视图。
- 公式模板改为 Axiom 风格 `TemplateDialog`，不再打开旧画廊模态。
- 旧 ProjectModal、旧 DebugConsole overlay、旧主壳层已在 Phase D 删除。

### Runtime / Trace

- 新增 `src/runtime/types.ts`、`derived.ts`、`document.ts`、`workbench-store.ts`。
- 每次 Run 捕获文档 revision、表达式、时间、引擎信息和不可变 RunRecord。
- Phase B+C 时 trace 从 Story/FlatBeat 派生并标 `provenance: derived`；Phase E 已为 expression run 增加 native trace，见 [08-phase-e-log.md](08-phase-e-log.md)。
- Run 包含 groups、steps、values、stage frames、microframes、flat/layers Scene、summary 和 error。
- Scene 附加 `sourceStepId` / `sourceValueIds`，便于检查器与后续视图联动。
- 编辑文档不覆盖旧 run；旧 run 保留并显示 STALE；再次 Run 创建新 run。
- 未提供 fake fork：RunRecord 预留 lineage，但 UI 没有不可用的“分支”按钮。
- 计算失败会生成 failed run + 结构化 Problem，而不是只抛 toast。

### Replay

- 默认按执行步骤播放；完成后停在末尾；从 Runs 打开旧 run 也停在末尾；按播放从第一步重新开始。
- `STEPS / MICRO` 粒度切换；Micro 模式展开当前 step 的 presentation microframes。
- 播放/暂停、前后 step、首尾、倍速、loop、时间轴 step 直接跳转。
- 拖动/跳转只移动 cursor，不调用 exact engine；runtime 测试验证 seek 不触发 runner。
- `prefers-reduced-motion` 时 Run 不自动播放，直接落在末尾；仍可手动步进。
- 状态栏与 dock 显示 run、step、provenance、selection。

### 视图与检查器

- Stage 使用白色技术网格、矩阵边框、SKY 语义高亮；点击 cell/panel 更新检查器。
- Flat/Layers 消费同一份 `Scene` + 同一 cursor/selection；切换视图不重算。
- Inspector：Overview / Trace，展示 shape、dtype、value、source ID、provenance、microframes；可存回结果矩阵。
- Console：函数选择、JSON args、输出 artifacts、trace JSON、把 story 结果打开成 function Run。
- Problems：失败运行的结构化错误，不依赖红色语义。

## 2. 与设计稿的差异

1. **Scene v2 已进入 runtime。** schemaVersion 升到 2，并加入 scene/node 级 `sourceStepId` / `sourceValueIds`、groups 与 a11y table fallback；channels 仍是后续扩展。
2. **Microframe 是 presentation 派生，不是内核 micro-trace。** 这与 `provenance: derived` 一致；不能当作 native 执行细节。Formula structure 在 Phase D 已升级为中央视图。
3. **Formula 结构编辑仍是受控模板原型，不是通用公式编辑器。**
4. **真正 step-level fork 在 Phase B+C 未实现。** Phase E 已为 native expression checkpoints 增加 checkpoint branch；function/block fork 仍后置。
5. **Block composer / Ops reference 已在 Phase D 迁入新壳层；公式结构已中央化。**
6. **底部 dock 可折叠；Phase D 已加入可拖拽高度与横向分栏。** 可拆卸窗口后置。
7. **命令面板与主操作键盘路径已在 Phase D 加入。**
8. **没有持久化。** 刷新即回到 seed session；符合批准范围。
9. **Function run 只对带 Story 的调试函数生成可 Replay run。** 纯 artifact 函数仍在 Console 查看输出；native/synthetic frame 统一留到执行引擎阶段。

## 3. 验证

- `npm run typecheck`：通过。
- `npm run build`：Vite + Electron 构建通过。
- `npm test`：Phase E 后 104 项通过。
- 手工 E2E：
  - Run `A × B` → 9 steps → pause/seek/step/micro → view switch → cell select → stale → new run.
  - Run `A + M` → failed run → Problems → no success state.
  - Template dialog → `det(A)` scalar run → 4 steps.
  - Console `matmul` → artifacts → OPEN REPLAY → function run.
  - Formula 中央视图 `A × B` → send to Stage → 9-step derived run.
  - Light/Dark; 1440×940 与 1120×760；资源栏折叠。
- 生产 Electron 构建与启动已验证；窗口加载 Axiom、无 localStorage 写入、Run/Trace 可生成、Formula Asset 对话框可用、惰性 FormulaView chunk 可用。
- 生产验证覆盖 1440×940；浏览器验证覆盖 1120×760。

## 4. Phase D 之后的剩余

- 完整通用公式编辑器；当前 Formula 视图仍是受控三模板原型。
- Phase E 的 native checkpoint branch 已落地，见 08；native function/block trace 仍后置。
- 可拆卸调试窗口、布局 preset、自定义命令。
- 真实 native trace、execution checkpoints、step fork；之后再接 Rust/WASM/AD/MX。
- 文件/项目持久化作为独立阶段，不与 Axiom shell 混做。
