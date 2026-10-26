# 03 · Runtime / IR 重构与现有代码映射

> 状态：已批准；Phase B + C + D 已按此基线实施。
> 目标：第一刀把当前“表达式 → 故事板 → UI 一条长链”拆成 **Document → Run/Trace → Presentation → Replay → Renderer**，但保留现有精确矩阵内核与操作语义，不先重写 Rust/WASM。

## 1. 当前代码审计

### 1.1 当前做得好的部分

- `src/core` 是纯计算：BigInt 有理数、矩阵运算、消元轨迹、LU/QR/特征值；不依赖 React/DOM。
- `src/presentation` 能编译出细腻的教学故事板；`src/scene` + `src/renderers/scene` 已证明同一故事可以投射到 2D/层叠/平铺。
- `src/debug` 有独立函数注册表、trace 雏形、调试控制台。
- `src/formula` 有 headless typed AST、KaTeX 渲染、槽位与安全测试。
- 103 项测试通过，严格 TypeScript；这些资产必须保留。

### 1.2 当前的结构性问题

| 问题 | 证据/影响 |
|---|---|
| UI 与执行状态混在 `App.tsx` | 884 行；持有 projects/objects/expression/story/beat/playing/speed/modal 等全部状态 |
| 计算与教学编排混合 | `presentation/stories.ts` 2189 行，`buildStoryFromExpression` 既求值又生成 beat |
| 没有 Run/Trace Store | 没有 runId、文档 revision、step/value 稳定引用；debug 的 runCounter 仅用于调试 |
| 没有真正的重播 | 只有 story + beatIndex + playing；seek 是切故事板，不是消费不可变 trace |
| 旧视觉与 CSS 耦合 | `styles.css` 7782 行；多主题色和组件类互相覆盖；暗绿/奶油/青柠主导 |
| 持久化绑在 UI | `workspace/project.ts` + localStorage + 多项目弹窗，与用户决定的本阶段无持久化冲突 |
| 调试是覆盖层 | `DebugConsole` 固定浮层，打断工作台；函数运行时也没有进入统一 run 模型 |
| 视图依赖故事板结构 | 无法自然扩展到 native trace / 反向 / 平移时间轴 |
| 测试边界不完整 | 有核心/注册表/公式测试，但没有“seek 不重算”“run 不可变”“Presentation 只读”测试 |

**结论：** 不是原地给现有组件换 CSS。需要新增运行层与工作台壳层，逐步把 UI 从 `Story` 和 `storyBoard beatIndex` 上解耦。现有核心与公式/矩阵渲染组件可作为引擎和渲染资产保留。

## 2. 第一刀目标架构

### 2.1 分层

```text
┌────────────────────────────────────────────────────────────┐
│ App / Axiom Shell                                          │
│   activity rail · resource dock · central views · inspector │
│   replay dock · command palette                             │
└───────────────┬────────────────────────────────────────────┘
                │ commands / selectors
┌───────────────▼────────────────────────────────────────────┐
│ Workbench Controller + Stores                              │
│   DocumentStore · RunStore · ReplayStore · SelectionStore  │
└───────────────┬────────────────────────────────────────────┘
                │ run(snapshot)
┌───────────────▼────────────────────────────────────────────┐
│ Runtime                                                     │
│   ExactEngineAdapter → DerivedTraceAdapter                  │
│   PresentationCompiler                                      │
└───────────────┬────────────────────────────────────────────┘
                │ immutable RunRecord / PresentationDocument
┌───────────────▼────────────────────────────────────────────┐
│ Renderers                                                   │
│   Stage · Flat · Layers · Matrix · Formula                   │
└────────────────────────────────────────────────────────────┘
                ▲
                │ no math imports
        Core exact math / legacy story / formula AST
```

### 2.2 模块归属（逻辑包，先单 package）

第一刀不拆 monorepo；先在单 package 内建立边界，避免同时改构建、IPC、文件格式和 UI。

```text
src/
  axiom/                     # 新增：Axiom UI 与工作台
    app/
      AxiomShell.tsx
      layout/
      commands/
    ui/
      panels/
      timeline/
      inspector/
      controls/
    theme/
      tokens.css
      theme.css
    replay/
      playback-controller.ts   # rAF/时钟适配，不碰数学
  runtime/                   # 新增：纯 TS、无 React/DOM
    document.ts
    run-record.ts
    trace.ts
    presentation-document.ts
    exact-engine-adapter.ts
    derived-trace-adapter.ts
    presentation-compiler.ts
    run-store.ts
    replay-store.ts
    selection.ts
    commands.ts
  core/                      # 继续作为 exact engine；先不动数学语义
  content/                   # 示例资产/模板数据；命名后续再换
  presentation/              # 现有 Story/Scene 编译；逐步变成 legacy adapter 的输入
  renderers/                 # 只消费 Presentation IR
  debug/                     # registry 保留；console UI 迁移到 axiom/replay dock
  formula/                   # headless AST；UI 后续迁移到 axiom/formula
  workspace/                 # 本阶段不接入产品；仅供 dev fixture，后续删
```

**物理 monorepo 拆分时机：** 当 native engine / WASM / AD 真正进入，且 runtime 与 UI 边界经第一轮验证后再拆 `apps/`、`packages/`、`crates/`。现在为了视觉重构先拆包会显著增加风险。

### 2.3 依赖方向（必须测试）

允许：

```text
axiom → runtime, renderers, content, formula, debug(types)
runtime → core, presentation(legacy adapter), formula(types)
presentation → core, runtime types (只读)
renderers → presentation types, runtime value types (只读)
core → 无 UI/runtime
formula → 无 React/DOM
```

禁止：

- `core`、`runtime`、`presentation` import React、Electron、DOM。
- renderer import `core/matrix` 或调用数学函数。
- runtime import Axiom UI components。
- 任何 store 直接 `localStorage`。
- 任何组件持有“第二份权威运行状态”。

用现有 `src/architecture.test.ts` 扩展 import 扫描；新增边界测试。

## 3. 数据流与命令

### 3.1 一次 Run

```text
UI command: Run(documentSnapshot)
  → WorkbenchController.captureDocumentRevision()
  → ExactEngineAdapter.execute(snapshot)
       current: buildStoryFromExpression
       returns: computed result + legacy story
  → DerivedTraceAdapter.fromStory(...)
       → RunRecord { raw values, trace, provenance: derived }
  → PresentationCompiler.compile(run)
       → PresentationDocument { stage/flat/layers scenes, microframes }
  → RunStore.add(run)
  → ReplayStore.open(run, at=start or end per policy)
  → UI selectors render
```

- 计算与 presentation 编译都在主线程/同一调用链内完成；未来可移 Worker，不改变接口。
- `RunRecord` 完成前不进入 UI；failed run 也生成可诊断的 record。
- 不写盘。

### 3.2 Seek / 切视图

```text
UI command: Seek(stepId/microframeId) | SetView(flat)
  → ReplayStore.reduce()
  → selectors current step/value/scene
  → renderers render
  ✗ ExactEngineAdapter never called
```

- 需要测试：进入 run 后清空/替换 engine 函数，seek 仍正常工作。
- 视图切换只选择不同的 `SceneDocument`，不重建 Run。

### 3.3 命令边界

建议使用显式命令函数而非全局事件总线，减少隐式耦合：

```ts
type WorkbenchCommand =
  | { type: 'run'; source: 'button' | 'shortcut' | 'console' }
  | { type: 'stop' }
  | { type: 'seek'; cursor: ReplayCursor }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'select'; selection: SelectionPatch }
  | { type: 'set-view'; view: 'stage' | 'flat' | 'layers' }
  | { type: 'open-replay'; runId: RunId };
```

- UI 不直接调用 `buildStoryFromExpression`。
- Debug Console 的“运行函数”也走 `WorkbenchController.runFunction(...)`，生成 kind=`function` 的 RunRecord。
- 命令结果通过 store 订阅更新 UI，不把 Promise 结果直接塞进组件局部状态。

## 4. 状态归属

| 状态 | 所属 | 生命周期 | 是否持久化 |
|---|---|---|---|
| 矩阵对象、表达式、文档 revision | DocumentStore | session | 否 |
| RunRecord、Trace、Presentation | RunStore | session | 否 |
| cursor、播放状态、速度、展开 group | ReplayStore | session | 否 |
| selected value/step/cell | SelectionStore | session | 否 |
| 面板宽度、折叠、主题 | UI store | session | 否 |
| 编辑中的临时输入 | 组件局部 | 短 | 否 |

- 一个 run 的 `trace`、`values`、`presentation` 在 terminal 后 deep-freeze（开发模式）并只读。
- 不再有 `projects`、activeProjectId、autosave、project modal。
- 关闭/刷新应用：seed session 重新出现；所有 run 丢失。状态栏必须显示 `IN-MEMORY`，不得给用户“已保存”的错觉。

### 4.1 Store 形式

- 不引入 Redux/Zustand；用小型外部 store + reducer，React 通过 `useSyncExternalStore` 订阅。
- 纯 reducer/selectors 放 `runtime/`；rAF 时钟和 store subscription 放 `axiom/replay/`。
- Store 需要支持测试：无 React 直接 dispatch/select。
- 对当前规模，两个 store 足够：
  - `WorkbenchStore`：document + runs + replay + selection（用一个 reducer 保证跨状态原子性）；
  - `UiStore`：面板/主题/命令面板等纯 UI 偏好。
  - 若后续运行时异步，再拆 RunStore；不要在文档阶段为了“架构感”过度分层。

> 推荐第一刀用一个 `WorkbenchStore`（含 runs/replay/selection）而不是四个独立 store；不可变性由 reducer 保证。文档中的逻辑职责仍分开。

## 5. Document / Run / Presentation 合约

### 5.1 Document

第一刀复用当前矩阵/表达式结构，增加一个轻量 envelope：

```ts
interface WorkbenchDocument {
  schemaVersion: 1;
  revision: number;
  objects: WorkbenchMatrix[];
  expression: string;
  seed: number; // 目前无随机；保留确定性运行位
}
```

- 当前 `expression.ts` 的 AST 继续作为内部表达；不在这轮引入完整 Math IR。
- Document 只描述“要算什么”，不包含 Run/Trace/Selection。
- 未来 Math IR 替换 expression 时，Document envelope 保持稳定。

### 5.2 Run

见 [02-replay-and-trace.md](02-replay-and-trace.md) 的 `RunRecord` / `TraceDocument` / `PresentationDocument`。

补充：

- `engine: { id:'exact-q', backend:'ts' }` 必须写入 trace metadata，便于以后区分 native/WASM。
- `provenance` 是伦理字段：derived 不得隐藏。
- `values` 存小矩阵的 string/Q 数据；本阶段形状 ≤10×10，无需 ValueRef。未来大张量再用 `ValueId` + 句柄，不现在造空抽象。
- `lineage` 只在真实 branch 时填写；第一刀 rerun 不写 parent，避免把 rerun 伪装成 fork。

### 5.3 Presentation

- Scene 已在 Phase D 升为 schemaVersion 2；增加 scene/node 级 `sourceStepId`、`sourceValueIds`，SceneGroup 类型已落位；更细的 microframe 关联与 groups 仍待扩展。
- 每个 SceneNode / Edge 必须能反查到 step/value；否则检查器只能猜。
- Microframes 归 PresentationDocument；不能写回 ValueSnapshot。
- Scene 的视图差异（Stage/Flat/Layers）是 projection，不是三份数学结果。

## 6. 适配现有引擎

### 6.1 ExactEngineAdapter

职责：

- 接收 Document snapshot；
- 调用当前 `buildStoryFromExpression` / `buildBlockStory` / debug function；
- 不依赖 React；
- 返回 `{ resultValues, legacyStory, operationRecords }`；
- 捕获异常，生成 failed run，而不是只 toast。

第一刀不拆 `stories.ts` 的 2189 行；在其外围加 adapter，先把线接对。**不要边重构 UI 边重写故事编译器**，否则风险叠加。

### 6.2 DerivedTraceAdapter

职责：

- 把 `Story` 的 chapter/beat/panel/readout 映射成 Run/Trace/Presentation；
- 产生稳定的 step/group/value ID；
- 标记 `provenance:'derived'`；
- 将现有 `buildStoryScene` 包成 PresentationCompiler 的一个 adapter；
- 不改核心数学。

映射细节见 [02-replay-and-trace.md](02-replay-and-trace.md#6-现有引擎的适配derived-trace)。

### 6.3 从 Story 解耦 UI

目标 UI 不接收 `Story` / `FlatBeat`：

```text
RunRecord + ReplayCursor + Selection
  → selector:
      currentStep: TraceStep
      currentScene: SceneDocument
      currentValues: ValueSnapshot[]
      currentMicroframes: Microframe[]
```

如果第一刀某些老组件仍需要 `FlatBeat`，把它们限制在 `presentation/legacy` 或临时的 Stage adapter 中，不让 `Inspector`、`TraceDock`、`RunsPanel` 依赖故事板对象。后续 native trace 只需替换 adapter。

## 7. 主题与组件重构

### 7.1 CSS 策略

- 删除旧 `:root` 语义色和旧组件样式；建立 `theme/tokens.css` + `theme/theme.css`。
- 先做少量基础组件（Panel、Button、Input、Tabs、Table、Status、Splitter），再迁移页面；避免在 7782 行旧 CSS 上叠 3000 行新皮肤。
- 所有组件使用 `--ax-*` token，不硬编码 hex。
- 浅/深主题通过 `[data-theme="light|dark"]` 切换；本阶段不持久化。
- 旧组件若暂时保留（如 MatrixEditorModal），单独适配 token，停止使用旧色。

### 7.2 旧组件处置

| 旧组件 | 第一刀处置 |
|---|---|
| `App.tsx` | 替换为 AxiomShell + WorkbenchStore 编排；旧逻辑提取到 controller |
| `LibraryPanel` | 拆为 ActivityRail、SessionObjectsPanel、ResourcesPanel；删除品牌介绍 |
| `ExpressionBar` | 新 ExpressionStrip；保留 parser 行为 |
| `Theater` | 新 StageView 使用 selectors + Scene；去掉深色舞台 |
| `Inspector` | 新 Inspector 使用 Selection + Run；紧凑表格 |
| `DebugConsole` | 迁入 bottom Console tab；构造 function run |
| `ProjectModal` | 删除；本阶段无项目存储 |
| `TemplateModal` | 公式资源/检查器替代；可暂时保留为 dev 过渡但不作为主流程 |
| `OpsModal` | 算法资源替代；删除满屏手册弹窗 |
| `BlockModal` | 可暂时保留为一个临时面板重新皮肤 |
| `FormulaView` | Phase D 已迁移到中央 Formula 视图 |
| `scene`/`renderers/scene` | 升级 source IDs，重写 renderer 外观但保留数据边界 |

## 8. 命名、包与品牌迁移

- 产品名：Axiom；`productName`、窗口标题、菜单、About、图标、安装包。
- 代码包名建议：`axiom-workbench`；Electron `appId` 建议 `app.axiom.workbench`（最终域名/组织待定）。
- 本地项目目录名可以暂时保留 `matrix`，但 `package.json`、`index.html` title、README、数据目录名改 Axiom。
- 因为本阶段没有持久化，**不需要旧项目路径迁移**；删除旧 localStorage 逻辑，不保留兼容桥。
- Git 仓库不重命名/不改 remote；只改产品/包标识，避免同时丢历史。
- 旧 `matrix-atelier` CSS class/BEM 可以逐步改，不要求一次完成；但不能保留旧品牌可见文本。

## 9. 测试策略

### 9.1 必保留

- 现有 103 项 core/formula/debug/architecture 测试通过。
- 当前矩阵值、shape、story 计算不回归。

### 9.2 新增

- `run-store`：run 完成不可变、ID 稳定、failed/cancelled 状态。
- `replay-store`：cursor 边界、step/micro 切换、ended→play 从头、速度不变数学。
- `seek-no-recompute`：spy engine count，seek/切换视图后为 0。
- `derived-provenance`：Run/DTO 到 UI selector 都保留 derived。
- `presentation-provenance`：每个 SceneNode/Edge 的 sourceIds 可解析。
- `stale-run`：Document revision 增加不影响旧 run。
- `branch-lineage`：第一刀不生成假分支；未来 fork 测试预留。
- `theme tokens`：对比度/关键字 token 测试或构建检查；不把颜色当唯一语义。
- `architecture boundaries`：UI 不 import core math/story；runtime 无 React/DOM；renderer 无 core。
- 端到端（E2E）：Run → Replay → pause/seek → view switch → selection → stale → new run；键盘；减少动态。

### 9.3 视觉回归

- 用固定 fixture 生成 Stage/Flat/Layers 的截图；视觉回归先在小范围建立（Playwright/Chrome headless）。
- 用同一 run 比较浅/深主题、1440/1120。
- 不把“像素完全一致”作为早期门槛，先验证 token、布局、选中和文本可读性。

## 10. 性能与安全

- 当前矩阵规模小，优先避免无意义抽象；不引入 WASM/Worker。
- 时间轴虚拟化、scene 按 step 懒编译、microframes 按需展开。
- 不每个 cell 建 DOM；当前小矩阵可接受，但 Layout API 保留虚拟化方向。
- Electron 继续 `contextIsolation`、`nodeIntegration:false`、`sandbox:true`；本阶段不新增文件权限。
- 不新增网络请求、遥测、账户；本地运行。
- 未来项目存储/CSP/WASM 单独阶段处理；现在不写文件格式。

## 11. 风险

| 风险 | 缓解 |
|---|---|
| 视觉重写拖垮现有功能 | UI shell 与 runtime adapter 并行落地；先锁定 Run/Trace 不变式；每个旧功能有回归用例 |
| derived trace 被误当 native | provenance 字段 + 持续 UI 标记 + 文档 |
| 一次改 CSS 7782 行导致样式失控 | 新 token/主题 + 新组件；旧组件逐项迁移，不在旧 CSS 上叠新风格 |
| “无持久化”造成误解/数据丢失 | 全界面 `IN-MEMORY` 状态；删除保存/导出入口；文档明示 |
| 分支实现被低估 | 第一刀只做 rerun/lineage，true fork 等 checkpoint；不伪造 |
| 删除项目系统造成功能缺失 | 用户已确认本阶段不做；把对象/公式/算法资源保留在 session 内 |
| 组件迁移范围过大 | 先完成 main vertical slice，再迁 secondary modals |
| 主题 token 违反色卡 | token 表 + 对比度测试 + 设计评审 |

## 12. 决策记录

**已决定**

- 单 package 逻辑分层，暂不物理 monorepo；等 native runtime 稳定后再拆包。
- UI 只通过 WorkbenchController/Store 触发计算；renderer 不 import core。
- 第一刀复用 exact Q 引擎与现有故事板，新增 ExactEngineAdapter/DerivedTraceAdapter/PresentationCompiler。
- Run/Trace/Presentation 使用内部 schema，但不需要持久化兼容。
- 删除 localStorage/项目保存/旧数据迁移；session 启动 seed。
- 第一刀不提供 fake step fork。

**设计期待定 / 后置项**

- 是否保留旧 UI 作为开发期 `?legacy=1` 对照入口，还是直接替换（建议保留一两个 sprint 的开发 flag，不交付给用户）。
- 是否在第一刀自托管 IBM Plex 字体。
- 是否把 `debug` registry 的 trace 直接升级为 native 事件，还是继续 derived 直到 engine 阶段（建议后者）。
- 未来 Monorepo 拆包边界与构建工具。
