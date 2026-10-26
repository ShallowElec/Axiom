# 02 · 重播、Trace 与时间轴

> 状态：已批准；Phase B + C 已按此基线实施。
> 决策：可检查重放；Run / 执行步骤 / 微观帧三层；运行不可变；修改产生新 run；默认按步骤播放。

## 1. 目标与非目标

### 1.1 目标

- 任何一次计算都能被重新打开、逐步检查、拖动时间轴、切换视图，而不重新执行数学。
- 运行结果、播放位置、选中对象、视图投影之间有稳定 ID 对应。
- 用户能看到“这个值由哪一步产生、下一步依赖什么”，而不是只看动画。
- 为未来的内核 trace、AD 反向传播、循环折叠、分支运行留出真实语义。
- 复用现有故事板与 Scene 原型；不重写数学引擎即可先完成体验闭环。

### 1.2 本阶段非目标

- 不做内核级 micro-trace（真实 cell 级执行记录）；本阶段微观帧来自现有故事板的 presentation 派生。
- 不做真实 step checkpoint / 从步骤恢复内核状态。
- 不做持久化、trace 导出、项目文件、跨启动恢复。
- 不做实时流式执行与“边算边看”；先完成“完成后的可检查重放”。
- 不做 run 对比 UI（数据结构预留，不先显示假入口）。

## 2. 概念模型

### 2.1 六个核心对象

| 对象 | 含义 | 可变性 |
|---|---|---|
| **Document** | 可编辑的当前工作文档：矩阵对象、表达式、后续 Math IR | 编辑中可变 |
| **Run** | 对某一版 Document 的一次执行记录 | 完成后不可变 |
| **Step** | 一个有数学语义的执行步骤（算子/公式块/输出 cell 的计算） | 属于 Run |
| **Microframe** | 步骤内的呈现动作：取源、相乘、累加、结果落位等 | 属于 presentation，不是数学事实 |
| **PresentationDocument** | 某 Run 的所有视图结构（Stage/Flat/Layers） | 由 Run 确定性生成，只读 |
| **ReplaySession** | 当前播放头、速度、折叠等 UI 状态 | 可变，不属于 Run，不持久化 |

### 2.2 三层粒度

```text
Run
└── Phase / Group（章节、循环、阶段）
    ├── Step 01  C[1,1] = A[0,:] · B[:,0]
    │   ├── Microframe 01: reveal A row
    │   ├── Microframe 02: reveal B column
    │   ├── Microframe 03: multiply k=0
    │   ├── Microframe 04: accumulate
    │   └── Microframe 05: write result
    ├── Step 02 ...
    └── ...
```

- **默认播放粒度 = Step。** 每个 step 显示其终态和简短过渡，不逐个 cell 演示。
- **Micro 模式**：展开当前 step 后，transport 进入 microframe 级；播放头和 step 列表都能进入微观动作。
- **Group** 不是第四层执行事实，只是时间轴的折叠容器；组内仍是真实 step 序列。
- 未来循环：overview 折叠为 `×N`，展开后显示每个实际 step；不允许用一条“假循环”替代真实顺序。

### 2.3 Cursor 与 Selection 分离

```ts
type RunId = string;
type StepId = string;
type MicroframeId = string;
type ValueId = string;
type SceneNodeId = string;

interface ReplayCursor {
  runId: RunId;
  stepId: StepId | null;
  microframeId: MicroframeId | null; // null = 步骤终态
}

interface Selection {
  runId: RunId | null;
  stepId: StepId | null;
  valueId: ValueId | null;
  sceneNodeId: SceneNodeId | null;
  cell?: { row: number; col: number };
}
```

- Cursor 决定“现在看到哪个时刻”。
- Selection 决定“检查器/高亮聚焦哪个对象”。
- 点击 canvas 中的 cell 可以更新 Selection 而**不改变 Cursor**；点击 trace 行或时间轴会改变 Cursor，同时把 Selection 定位到该 step 的主输出。
- 时间轴 hover 只产生临时预览，不移动 Cursor。

## 3. 不变量

1. **Run 终态不可变。** 完成后不能追加/修改 step；重播只读。
2. **Seek 不执行计算。** 任何 cursor 移动只选择已存在的 step/scene，不调用数学函数。
3. **Document 修改不覆盖旧 Run。** 旧 run 保留并标记 stale；新 run 有新 ID。
4. **Microframe 不是数学事实。** 它可以重新生成；不得成为唯一的值来源。
5. **Derived provenance 必须可见。** 从现有故事板派生的事件必须显示 `DERIVED`；未来 native trace 显示 `NATIVE`。
6. **视图切换不改 Run / Cursor。** Flat、Layers、Stage 消费同一个 cursor 与 presentation doc。
7. **颜色不是唯一通道。** 播放/选中/错误同时使用文本、形状、线型。
8. **无持久化。** 运行、cursor、折叠、选择都在内存；刷新即丢失。

## 4. 运行生命周期

```text
Document revision N
        │
        ├── Run (kind=expression | function)
        │     status: computing
        │       → completed  (trace + values + presentation)
        │       → failed     (error event; partial trace if available)
        │       → cancelled  (partial trace; no playable result beyond last step)
        │
        └── Document 修改 → revision N+1
              old run becomes STALE (still replayable)
```

### 4.1 Run 状态机

```text
queued → computing → completed
                  ├→ failed
                  └→ cancelled
```

- 本阶段计算是同步/快速的；`queued/computing` 可能只显示一个 loading 帧，但状态必须存在，避免未来异步时改语义。
- 计算完成后才创建 PresentationDocument；Stage 不依赖计算中的半成品。
- failed run 若有已完成 step，仍可播到最后一个成功 step；错误作为终态事件显示。

### 4.2 Playback 状态机

```text
ready ──play──→ playing ──pause──→ paused
  ↑                │                 │
  └────restart─────┴──ended←─────────┘
                   │
                scrub（暂停并定位）
```

- 初次 Run 完成后：默认 `ready`，由用户按播放或按设置自动播放一次。
- **推荐默认**：用户显式 Run 后自动播放一次，从 step 0 到末尾；结束后停在末尾，不循环。`prefers-reduced-motion` 或设置关闭时，直接停在末尾。
- 从 Runs 打开旧 run：停在末尾，按播放从头开始。
- 播放期间选择 trace 行：暂停并定位到该 step（默认；可在设置改为不暂停）。
- 编辑 Document：立即暂停；旧 run 变 stale。

### 4.3 自动播放细节

- 仅在“用户显式 Run”时自动播放一次，不在切换视图、打开运行、编辑后自动播放。
- `STEPS` 模式：每个 step 之间的过渡建议 180–260ms。
- `MICRO` 模式：microframe 使用其 `durationHintMs`，总时长通常 120–600ms/step。
- 默认 1.0×；速度 0.25/0.5/1/2/4× 只改变动画时钟，不影响数学。
- 播放不阻塞计算；本阶段计算已在播放前完成。
- 循环默认关闭；用户可开启 loop run（重播）或 loop step（局部循环，P1）。
- 最小帧率目标 60fps；低性能时可降低动画细节但不改变 step 顺序。

## 5. 数据结构（Provisional v0.1）

> 这是第一刀使用的内部协议，不是最终 ABI；没有持久化，不承诺向前/向后兼容。字段可按原型结果调整。

### 5.1 Run / Trace

```ts
type RunKind = 'expression' | 'function';
type RunStatus = 'computing' | 'completed' | 'failed' | 'cancelled';
type Provenance = 'derived' | 'native';

interface RunRecord {
  schemaVersion: 1;
  id: RunId;
  kind: RunKind;
  status: RunStatus;
  provenance: Provenance;
  documentRevision: number;
  expression: string;
  engine: { id: 'exact-q'; version: 1; backend: 'ts' };
  createdAtIso: string;
  completedAtIso?: string;
  values: Record<ValueId, ValueSnapshot>;
  trace: TraceDocument;
  presentation: PresentationDocument;
  lineage?: { parentRunId: RunId; forkedFromStepId: StepId };
  error?: RunError;
}

interface ValueSnapshot {
  id: ValueId;
  label: string;
  kind: 'matrix' | 'scalar' | 'symbolic';
  shape?: { rows: number; cols: number };
  dtype: 'Q' | string;
  preview: string;
  cells?: string[][]; // 本阶段小矩阵；未来改为 value ref
}

interface TraceDocument {
  schemaVersion: 1;
  groups: TraceGroup[];
  steps: TraceStep[];
}

interface TraceGroup {
  id: string;
  label: string;
  kind: 'chapter' | 'phase' | 'loop';
  stepIds: StepId[];
  collapsedByDefault?: boolean;
}

interface TraceStep {
  id: StepId;
  index: number;
  groupId: string;
  phase: 'forward' | 'control' | 'backward';
  nodeId: string;
  op: string;
  label: string;
  status: 'ok' | 'warning' | 'error' | 'skipped';
  inputs: ValueId[];
  outputs: ValueId[];
  durationUs?: number;
  warningCode?: string;
  errorMessage?: string;
}
```

### 5.2 Microframe / Presentation

```ts
interface PresentationDocument {
  schemaVersion: 1;
  runId: RunId;
  views: {
    stage: SceneDocument;
    flat: SceneDocument;
    layers: SceneDocument;
  };
  microframes: Record<StepId, Microframe[]>;
}

interface Microframe {
  id: MicroframeId;
  stepId: StepId;
  index: number;
  kind: 'reveal' | 'source' | 'multiply' | 'accumulate' | 'write' | 'gradient' | 'control';
  durationHintMs: number;
  targetIds: SceneNodeId[];
  valueId?: ValueId;
  equation?: string;
  readout?: string;
}

interface SceneDocument {
  schemaVersion: 2;
  runId: RunId;
  view: 'stage' | 'flat' | 'layers';
  nodes: SceneNode[];
  edges: SceneEdge[];
  // node/edge 必须有 sourceStepId/sourceValueId，见 03
}
```

**关键边界：** Microframe 属于 PresentationDocument，不属于数学 Trace。它可以从 step + display rule 重新生成；不能反过来成为计算输入。

### 5.3 ReplaySession

```ts
type PlaybackStatus = 'ready' | 'playing' | 'paused' | 'scrubbing' | 'ended';

interface ReplaySession {
  runId: RunId | null;
  cursor: ReplayCursor;
  status: PlaybackStatus;
  speed: number;          // 0.25..4
  detail: 'step' | 'micro';
  loop: 'off' | 'run';
  expandedStepId: StepId | null;
  expandedGroups: string[];
  reducedMotion: boolean;
}
```

- 这些字段只在 UI store 中；不进入 RunRecord，不持久化。
- 播放头更新通过纯 selector 计算当前 Scene/Value；不调用引擎。

## 6. 现有引擎的适配：Derived Trace

现有 `buildStoryFromExpression` / `buildBlockStory` 同时完成数值计算与教学编排，不能直接冒充内核 trace。第一刀这样接入：

```text
现有表达式/矩阵
  → legacy exact engine 计算（不变）
  → 现有 Story（chapter/beat）
  → DerivedTraceAdapter
       step   := beat / 可定义的语义步骤
       group  := chapter
       micro  := beat 内的 presentation 动作（由 beat panels/readout 派生）
       values := 结果矩阵/标量
  → RunRecord(provenance: 'derived')
  → PresentationDocument + Replay
```

规则：

- `provenance` 在 Run 列表、Replay 头部、检查器、Trace 表头持续显示 `DERIVED`。
- 不修改现有 `core` 数学语义；当前 102 项测试必须保持通过。
- `FlatBeat` 不是天然的内核事件；适配层负责把“教学 beat”映射为“step”，并在文档中记录映射规则。
- 当前 micro 级别没有每个 cell 的独立计算记录，必须从 beat panels/readout 生成 **view-only** microframes。
- 未来 native engine 必须保留 `provenance: 'native'`，UI 不因适配层而改变交互。

**建议的首版映射**

| 当前对象 | Axiom |
|---|---|
| `Story` | 一个 Run 的 presentation source |
| `StoryChapter` | `TraceGroup(kind=chapter)` |
| `FlatBeat` | `TraceStep`（一个可观察语义步骤） |
| `beat.panels / readout` | `Microframe[]` + `Scene` |
| `StoryPanel.matrix/cells` | ValueSnapshot + Scene nodes |
| `Story.resultValue` | final ValueSnapshot |

- 这保留了现有动画的细腻度，但默认 `detail=step` 时只展示 step 终态；展开后使用 microframes。
- 若一个 beat 跨越多个数学算子，适配层要避免把它标成单一内核事件；首版标注为 derived presentation step，后续 native trace 再拆细。

## 7. 时间轴与 Replay dock UX

### 7.1 版面（底部 236px）

```text
┌ REPLAY  TRACE  CONSOLE  PROBLEMS                                  [⌃][×]┐
│ Run 03  ready   DERIVED    A × B       9 steps   0.8s   1.0× [loop]  │
│ ───────────────────────────────────────────────────────────────────── │
│ phase │ dot products           │ resolve  ×1                           │
│       │ 01  02  03  04  05     │ 06                                   │
│       │       ● playhead        │                                      │
│ ───────────────────────────────────────────────────────────────────── │
│ ◀ step  ▶ play  step ▶  [STEPS] [MICRO]   step 04/09   ⌘/Ctrl+J collapse│
└────────────────────────────────────────────────────────────────────────┘
```

- 时间轴主刻度是 step number，不是毫秒。
- 顶部状态行显示 provenance、step 数、总耗时（metadata）、速度、loop。
- 阶段 band 来自 `TraceGroup`；循环未来显示 bracket + `×N`。
- micro 未展开时只显示一条步骤轨道；展开后在当前 step 下方显示局部 micro 刻度。
- 错误事件用 `×` 标记；警告用 `△`；都带文字，不依赖颜色。
- 拖动时间轴：
  - 进入 `scrubbing`，暂停播放；
  - 以最近 step 吸附；
  - 实时更新 Scene/Inspector（只读 presentation）；
  - 松开后保持 paused，不自动恢复播放。
- 点击 step：选中并暂停；step 终态显示；检查器打开对应输出。
- hover step：预览高亮，不改变 cursor；离开恢复。
- 双击 step：展开 micro strip；再次双击收起。

### 7.2 控件

| 控件 | 行为 |
|---|---|
| Run selector | 切换当前 replay 的 run；旧 run 保留 |
| Play/Pause | 播放/暂停；在 ended 状态 play 从 step 0 重播 |
| Prev/Next Step | 跳 step；与 Shift+←/→ 一致 |
| Prev/Next Micro | 仅 micro 展开时可用；与 ←/→ 一致 |
| Start/End | 跳到 run 首/末 step |
| STEPS / MICRO | 播放粒度；micro 未展开时自动展开当前 step |
| Speed | 0.25×、0.5×、1×、2×、4× |
| Loop | 默认 off；可切换 run loop |
| Collapse | dock 折叠为 30px 标题栏 |

- 不提供“拖动进度条到任意毫秒”的伪精度；滑杆按 step 吸附。
- 键盘只在非输入控件中生效；有可见 focus。

### 7.3 与视图 / 检查器同步

- 单一 `ReplaySession` 驱动：
  - Stage/Flat/Layers 的当前 scene state；
  - Replay 时间轴游标；
  - Trace 选中行；
  - Inspector 的当前 step/value；
  - 场景内选中对象仍由 `Selection` 独立控制。
- 视图切换只改 projection，不重置 cursor。
- 选中 matrix cell 时，检查器显示 value/cell；时间轴不移动；按 `F6` 可跳到对应 step。
- 选中 step 时，检查器主输出与 Stage 高亮同步；若用户 pin 了另一个对象，检查器保留 pin，但显示“当前 step”双栏/指示，避免静默抢焦点。

## 8. 运行创建、陈旧与重跑

### 8.1 显式 Run

- `Run` 使用当前 Document revision 的不可变快照。
- 创建新 `RunRecord`，分配新的 `runId`；旧 run 不修改。
- 运行期间禁止修改当前 document 或至少标记为新建草稿；推荐直接锁定表达式/对象编辑直到完成（首版同步执行，影响小）。
- 完成后选择新 run 为当前 replay；旧 run 仍在 Runs 列表。

### 8.2 编辑与 Stale

- 编辑 Document 后：
  - 不自动运行；
  - 当前 replay 仍显示旧 run；
  - header/status 显示 `STALE · run 03 from revision 7; document revision 8`；
  - `Run` 创建新 run；如果用户对旧 run 按下 run，询问/使用当前文档，绝不覆盖旧 run。
- Stale 不是错误事件，不能改变旧 run 的 trace。

### 8.3 Rerun / Fork

- **Rerun**：用当前 Document 新建 run，旧 run 保留。第一刀可用。
- **Fork from step**：
  - 目标语义：以选定 step 的输入/输出快照为检查点，在原执行图/参数上修改后继续执行，生成新 run；
  - 必要能力：execution graph revision、value snapshot、可恢复执行点、参数/节点修改；
  - 当前 legacy story 没有 checkpoints；**第一刀不提供可点击的 fake fork**；
  - 在 RunRecord 预留 `lineage: { parentRunId, forkedFromStepId }`，但 UI 只在真实支持后展示；
  - 未来在 step 右键菜单/命令面板提供 `Fork from this step…`，并显示恢复失败原因（如“含不可重放随机数”“该算子无 checkpoint”）。
- 分支不复制数学真相：新 run 必须重新执行后缀；不得复制父 run 的 trace 后缀冒充执行记录。

## 9. 循环、反馈与反向阶段

### 9.1 循环

- 执行 trace 中循环是**展开的真实步骤**，并用 `groupId` 标记同一 loop 的实例。
- overview 层可以折叠成一条 `×N` 轨道，但内部步骤顺序保留；
- 展开后显示 `iteration 1…N`，每个 step 有实际索引；
- 重播播放头按实际 time/sequence 遍历；折叠不改变数据。
- 不允许将重复步骤压缩成“单个代表值”而不显示实例。

### 9.2 反向传播（未来）

- TraceStep 增加 `phase: 'backward'`；时间轴增加第二条 lane。
- 方向从 loss 到输入；使用双线/向上箭头 + `GRAD` 标签，不使用第三色相。
- 播放可以只前向、只反向、或完整前向→反向；默认完整显示。
- 本阶段只保留 phase 字段，不显示梯度功能或假按钮。

### 9.3 局部反馈

- 控制流回边不改变因果顺序；时间轴必须显示真实 sequence。
- 在 overview 用带标签的回边；展开后回到实际线性步骤。
- 不把回边画成同时发生的新层。

## 10. 错误、取消和空状态

- **计算失败**：
  - 创建 `RunRecord(status='failed')`；
  - 若存在已完成的 steps，允许重播到最后一个成功 step；
  - 错误 step 出现在 timeline/trace，选中显示原因；
  - Stage 显示失败标记与最后状态，不播放底部“成功完成”状态。
- **取消**：
  - 状态 `cancelled`；保留已完成的 steps，标记「 Cancelled 」；
  - 不提供分支，除非未来明确支持从取消点恢复。
- **无 run**：
  - Replay dock 折叠；画布显示当前 document 与 Run 提示；
  - 不伪造空白时间轴。
- **无 step / 空表达式**：
  - 不创建 run；在 expression strip 显示错误；不弹出 toast。

## 11. 键盘与可访问性

| 键 | 行为 |
|---|---|
| `Space` | Play/Pause（焦点不在输入框） |
| `←` / `→` | 上一/下一 microframe（micro 展开或 detail=micro） |
| `Shift+←/→` | 上一/下一 step |
| `Home` / `End` | Run 首/尾 |
| `Enter` | 在 trace list 中打开 step |
| `F6` | 聚焦 Replay |
| `Esc` | 从时间轴返回画布/关闭浮层 |
| `[` / `]` | 设置/清除 loop（后续） |

- 时间轴提供一个可聚焦的 `Trace` 表格作为语义等价控制；屏幕阅读器可读 `step 04 of 09, C[1,2], completed`。
- 播放状态变化使用 `aria-live="polite"`，不要每帧播报。
- 减少动态：不自动播放；step 切换用即时高亮；micro 动画只保留颜色/线宽变化。
- 颜色不是唯一标记；所有 step 状态带文本。

## 12. 性能与容量

| 指标 | 第一刀目标 |
|---|---|
| 1,000 step trace 初始加载 | < 100ms（不渲染全部 row） |
| 拖动时间轴 | < 16ms/帧（当前小矩阵） |
| 播放 | 60fps 目标；退化时保持 step 顺序 |
| 场景编译 | 每个 step 懒生成并缓存；不在播放时扫描全 trace |
| 内存 | 当前矩阵 ≤10×10，可存完整值；>1000 step 只保留摘要+选中 step 的值 |
| DOM | Trace 表虚拟化；矩阵格不为大矩阵逐格建 DOM 以外的方式 |
| 不重算 | seek 期间 engine.runCount 恒为 0 增量 |

- 播放使用 `requestAnimationFrame` 驱动的逻辑时钟；step 进度由 presentation duration 计算，不依赖 wall-clock trace。
- 切换视图不重建 run；只切换预编译 Scene/selector。
- 未来 large values 改为 ValueRef + 按需切片，本阶段不提前实现。

## 13. 验收条件

### 13.1 功能验收

1. 运行 `A × B` 后，Replay 打开；能播放、暂停、上一/下一 step、首页/末尾。
2. 拖拽时间轴到任意 step，Stage 状态改变；数学引擎不会再次执行。
3. 切换到 Flat/Layers，再切回 Stage，cursor 和 selection 不变。
4. 选中 C[1,2]，Trace/检查器/场景高亮对应；选中 trace step，Stage 定位到对应步骤。
5. 修改表达式后，旧 run 显示 STALE 且仍可重播；Run 创建新 run，旧 run 不消失。
6. 运行失败表达式，Problems 显示原因；不出现成功状态或伪造结果。
7. Console 运行一个函数，生成 function run，并能在同一 Replay/Trace 中检查。
8. `prefers-reduced-motion` 下不自动播放，直接到终态，仍能逐 step 检查。
9. 刷新应用后 run 列表为空（与无持久化决策一致）。
10. 所有主要操作可用键盘完成，焦点可见。

### 13.2 结构验收

- Run 完成后，UI 无法修改其 `trace.steps` / `values`。
- 任意 seek / 切视图不调用计算模块；可在测试中计数。
- 所有 step 有稳定 ID、index、phase、status、inputs/outputs。
- provenance=`derived` 在 UI 中可见，不隐藏于 tooltip。
- Microframe 可重新生成，且没有反向写回数学值。
- 颜色关闭模拟后，用户仍能区分输入/结果/错误/选中（文本+形状）。

## 14. 决策记录

**已决定**

- 可检查重放，而不是仅影院式播放。
- Run / Step / Microframe 三层；默认按 step 播放。
- Run 终态不可变；编辑后会创建新 run；旧 run 可回看。
- 不自动覆盖旧 run；不重算 seek。
- 当前阶段的 trace 来自故事板派生，明确标 `DERIVED`。
- 无持久化；刷新即丢。
- 真分支需要 checkpoint，当前不伪造。

**设计期待定 / 后置项**

- 默认“Run 后自动播放一次”还是“打开即暂停在末尾”。文档当前建议**自动播放一次，结束停在末尾**；减少动态时跳到末尾。
- 打开旧 run 时默认落在末尾还是第一 step；当前建议落在末尾，播放键从头重播。
- 第一刀是否展示 disabled 的 `Fork from this step` 入口；建议不展示，避免假能力。
- 是否在 step 选择时默认暂停播放；建议是。
- 未来 native trace 是否允许 live stream + detach；本阶段不做。
