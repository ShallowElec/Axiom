# 07 · Phase D 实施记录：Axiom 工作台补完

> 状态：已实施，2026-10-26。  
> 范围：命令面板、可拖拽分栏、Block Composer、Ops/Syntax reference、Scene v2、旧主壳删除。  
> 仍然不做：持久化、native kernel trace、真正 step fork、WASM/AD/MX、完整公式编辑器。

## 1. 本轮落地

### 命令面板

- `Cmd/Ctrl + K` 打开 Axiom command palette，也可从顶部 `SEARCH COMMANDS` 打开。
- 支持搜索、↑↓ 选择、Enter 执行、Esc 关闭；列表分组为 RUN / VIEW / RESOURCE / DEBUG / EDIT / FORMULA / REFERENCE / UI。
- 可执行：Run、打开 Runs、Stage/Flat/Layers、Objects/Formulas/Algorithms、Console、New matrix、Formula Structure Lab、Block Composer、Syntax reference、Light/Dark、资源栏/Dock 折叠。
- 命令面板没有持久化状态；当前 session 内有效。

### 可拖拽分栏

- Resource dock、Inspector、Bottom replay dock 支持鼠标拖拽改变尺寸。
- 宽度/高度只在内存中保存；刷新回到默认布局。
- 根据窗口宽度动态限制横向尺寸，保证中央工作区至少约 500px；窄窗下不允许把画布挤到不可用。
- `ax-platform-darwin` 下仍为原生 traffic lights 保留左侧空间。

### Block Composer 回到新 IA

- Objects 资源 footer 和命令面板都能打开 Block Composer。
- BlockModal 已重新皮肤；支持横排、竖排、2×2、自定义块布局、形状检查、预览和组合。
- 组合逻辑移入 `WorkbenchStore.runBlock()`：新建组合矩阵、写入当前文档、构建 block story、生成 immutable Run。
- 组合 run 与普通表达式 run 共用 Replay/Trace/Stage/Inspector；`provenance` 仍为 derived。
- 不再需要旧 `App.tsx`/旧项目存储。

### Ops / Syntax reference

- Algorithms 资源 footer 和命令面板可打开 Axiom Syntax reference。
- 基于 `OPS_REFERENCE`，按分组展示表达式语法、说明、代码/操作名，并提供 expression examples。
- 这不是执行器：执行仍走 expression strip 或 Console；也没有伪装成 native kernel。
- 旧 OpsModal 已从新应用移除。

### Scene v2 与 source IDs

- `Scene.schemaVersion` 升为 2。
- 增加 `SceneGroup` 类型、`Scene.sourceStepId`、Scene node 的 `sourceStepId` / `sourceValueIds`。
- DerivedTraceAdapter 为每个 step 的 flat/layered Scene 填 source step / value IDs。
- Runtime 测试覆盖 schemaVersion 2、scene sourceStepId、node sourceStepId。
- 完整 groups/channels/table fallback 仍是后续 Scene v2 细化，不伪称已完成。

### 旧主壳清理

删除以下未挂载文件：

- `src/App.tsx`
- `src/components/LibraryPanel.tsx`
- `src/components/ExpressionBar.tsx`
- `src/components/Theater.tsx`
- `src/components/Inspector.tsx`
- `src/components/TemplateModal.tsx`
- `src/components/OpsModal.tsx`
- `src/components/ProjectModal.tsx`
- `src/debug/DebugConsole.tsx`
- `src/workspace/project.ts`（旧 localStorage 多项目存储）

保留并重新皮肤：

- `MatrixEditorModal`（临时入口）
- `BlockModal`
- `FormulaLabModal`（临时入口）
- `MatrixPanel`（Block 预览需要）
- `Modal` / `Icons`

旧 `styles.css` 仍保留部分遗留样式，因为它们服务上述临时模态；新 Axiom 主界面完全走 `src/axiom/theme.css`。

## 2. 验证

- `npm run typecheck`：通过。
- `npm test`：103 项通过（core 41、debug 19、formula 31、scene/runtime 7、architecture 5）。
- `npm run build`：通过。
- 手工验证：
  - Cmd/Ctrl+K → search/select/execute/Esc。
  - 拖动 resource/inspector/dock；1120 下中央工作区不被压穿。
  - Block Composer → 生成矩阵 + 13-step derived run。
  - Syntax reference 搜索和 examples。
  - Dark mode 下 Block Composer 与 Syntax 可读。
  - 先前 B+C 的 Run/Replay/Stale/Flat/Layers/Console 流程不回归。

## 3. 后置项

- 旧 `styles.css` 的逐段裁剪（等临时 MatrixEditor/FormulaLab 迁入新组件后）。
- 完整中央 FormulaLab view、Scene v2 groups/channels/table fallback。
- 真实 step checkpoint/fork、native trace、WASM/AD/MX。
- 可拆卸窗口、布局 preset、命令面板自定义命令。
