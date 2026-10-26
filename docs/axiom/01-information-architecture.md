# 01 · Axiom 信息架构与工作台布局

> 状态：已批准；Phase B + C 已按此基线实施。
> 目标：让 Axiom 看起来并像一个可长期使用的数学仪器，而不是一个演示页面。主流程不依赖模态弹窗；所有视图共享同一个选中对象和重播游标。

## 1. 设计目标

1. **一屏完成主要工作**：编辑表达式、运行、观察 2D/平铺/层叠、检查对象、重播，不需要离开工作台。
2. **固定解剖结构**：活动栏、资源栏、中央工作区、检查器、底部 dock、状态栏。用户可预期各类信息在哪里。
3. **主流程无弹窗**：运行历史、Trace、调试、公式/算法资源均在 dock 中进行；只有矩阵编辑、确认、命令面板使用临时层。
4. **状态可追踪**：选中对象、时间游标、过滤器、折叠状态都有明确归属；不用“上次点了哪里”的记忆猜测。
5. **第一刀可落地**：当前引擎、矩阵操作、公式模板、逐帧故事板、flat/layers 原型仍保留；不做持久化/引擎重写。

## 2. 默认窗口布局（1440×900）

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ AXIOM  │ UNTITLED SESSION · IN-MEMORY │  Run 03 · Ready  │  ⌘K   │ Light │ Run / Stop │ 44
├────┬──────────────────────┬──────────────────────────────────────────┬──────────────┤
│ 46 │ RESOURCE DOCK  264px │ CENTER WORKSPACE                         │ INSPECTOR 320│
│    │                      │                                          │              │
│ OB │ OBJECTS  12          │ EXPRESSION / 表达式                       │ C[1,2]       │
│ FX │  A   2×2   matrix    │ A × B                          RUN  F5    │ matrix 2×2   │
│ AL │  B   2×2   matrix    │                                          │ Q · exact     │
│ RN │  M   3×3   matrix    │ ┌ STAGE | FLAT | LAYERS ───────────────┐ │              │
│    │  ...                 │ │                                      │ │ Overview     │
│    │                      │ │        white math canvas             │ │ Data         │
│    │                      │ │                                      │ │ Trace        │
│    │                      │ └──────────────────────────────────────┘ │              │
│    │                      │ ◀  ▶  Step 04/09  [STEPS|MICRO]  1.0×    │              │
├────┴──────────────────────┴──────────────────────────────────────────┴──────────────┤
│ REPLAY  TRACE  CONSOLE  PROBLEMS                                             ▲ 236  │
│ Run 03  ready · derived trace · 9 steps  [timeline ruler + playhead + event strip]  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ IN-MEMORY │ exact Q │ run 03 · step 04/09 │ selected C[1,2] │ Light │ zoom 100%        │ 22
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- 顶部命令栏 44px；活动栏 46px；资源栏 264px；检查器 320px；底部 dock 236px；状态栏 22px。
- 中央工作区是唯一弹性区域，最小建议 600px；其内部为“公式条 + 视图 + 快速 transport”三段。
- 所有边界使用 1px 规则线，不做投影卡片。

## 3. 顶部命令栏

从左到右：

1. **AXIOM 字标**（固定 88–96px），点击打开 About/命令面板。
2. **会话标识**：`UNTITLED SESSION` + `IN-MEMORY` 小标签。没有项目保存按钮。
3. **运行状态**：`Run 03 · Ready` / `Computing…` / `Failed` / `Stale`；点击打开运行选择 popover。
4. **命令搜索**：窄态可折叠为图标；`⌘K / Ctrl+K` 打开命令面板。
5. **右侧工具**：主题切换（Light/Dark）、布局 reset、帮助。
6. **运行控制**：`Run` 主按钮（F5）、`Stop`（仅运行中）、可选 `Run without replay` 放到命令面板而非主栏。

行为：

- `Run` 创建新的不可变 run；不复用旧 run。
- 运行进行中禁用会造成状态歧义的编辑命令；可暂停动画，但计算完成后才进入可检查重放。
- 窗口窄于 1280 时，会话标识可缩短为 `SESSION`，命令搜索只保留图标；`Run` 始终可见。

## 4. 活动栏与资源栏

### 4.1 活动栏（46px）

| 项 | 内容 | 说明 |
|---|---|---|
| Session | 当前会话对象 | 默认 |
| Formulas | 公式资产 | 选择后资源栏切换 |
| Algorithms | 算子/算法目录 | 可送入 Console |
| Runs | 内存中的运行历史 | 不持久化 |
| Settings | 主题、布局、减少动态、快捷键 | 底部 |

- 活动项：2px 黑色左侧条 + `sky-100` 底；图标与文字使用 ink。
- 不使用彩色填充圆角块。
- 底部只有设置；不把帮助、导出、赞助塞进活动栏。

### 4.2 资源栏（264px，可折叠）

统一结构：

```text
RESOURCE HEADER        [count] [+]
[search field]
─────────────────────────────
compact list rows
─────────────────────────────
[dock footer: session/runs summary]
```

#### Objects

- 列出当前 session 的矩阵/向量对象，每行：名称、shape、kind、简短 note。
- 选中行更新检查器；双击插入表达式。
- `+` 新建矩阵；编辑按钮在行右侧 hover 出现，或用右键/命令面板。
- 不展示大块矩阵缩略图；缩略图在检查器/画布。

#### Formulas

- 列表显示公式名、分类、单行 LaTeX 预览/纯文本、来源。
- 选中显示检查器中的输入约束和可加载动作；双击或 Enter 装填表达式。
- 公式仓库不再是模态画廊；`Formula structure lab` 作为可进入的中央视图/独立面板，后续阶段加入。

#### Algorithms

- 显示注册表中的算法签名（mono）和分组；选中后在检查器显示端口/参数/测试状态。
- `Open in Console` 打开底部 dock 的 Console 并预选。
- 不在这里直接运行；避免“点击即执行”的误触。

#### Runs

- 内存运行列表：`Run 03 · completed · 12 steps · A × B`；状态、provenance（`derived`/`native`）。
- 点击加载该 run 的 Replay；当前 run 有 2px 黑色左边线。
- `Clear runs` 为显式命令，需要确认；没有保存/导出。
- 无任何持久化徽标或“已保存”谎言。

### 4.3 资源栏折叠

- 顶部按钮或 `Ctrl/Cmd+B` 折叠到活动栏。
- 折叠不改变当前活动项；再次展开恢复滚动位置（本阶段只在内存）。
- 1120–1279px 默认折叠资源栏，避免中央画布被压窄。

## 5. 中央工作区

### 5.1 三段结构

```text
┌ EXPRESSION STRIP 96px ──────────────────────────────┐
│ EXPRESSION / 表达式      A × B           [RUN F5]   │
│ validation line · selection context                   │
├ VIEW TABS 32px ─── STAGE | FLAT | LAYERS ────────────┤
│                                                     │
│                 math viewport                       │
│                                                     │
├ TRANSPORT 30px ─────────────────────────────────────┤
│ ◀◀  ◀  ▶  ▶▶   step 04/09   STEPS|MICRO   1.0×     │
└─────────────────────────────────────────────────────┘
```

- **表达式条**是本阶段对当前单行表达式的工程化承载；全结构公式画布在后续阶段展开。它始终可见，避免编辑公式时必须离开动画。
- **视图 tab** 只改变投影，不重新计算：`Stage`（2D 舞台）、`Flat`（平铺合成）、`Layers`（2.5D 层叠）。`Graph` 目标后续加入，本阶段不显示假按钮。
- **快速 transport** 提供当前步骤/微观层的播放控制；详细时间轴在底部 Replay dock。两者共享一个游标，不产生两套状态。
- 中央画布顶部不要营销式标题；显示当前步骤名、shape chain、provenance 和小型状态。

### 5.2 表达式条

- 左侧固定标签 `EXPRESSION`（10px mono），副行显示当前对象/形状。
- 输入行 28px，等宽/公式混排；有效时下方 1 行显示 `2×2 × 2×2 → 2×2`，错误时显示 `ERR · 内维不匹配`。
- `RUN` 黑底主按钮；旁有 `F5` 键提示。
- 支持从资源栏插入、命令面板插入；结构化槽位编辑后续接入。
- 只改表达式不会自动重跑；已有 run 会进入 `Stale`，并在中央视图顶部显示一条窄状态条：
  `当前表达式已修改。Run 03 仍可重播；按 Run 创建 Run 04。`
- 不弹出“表达式已修改，按开演”的提示 toast；状态条即可。

### 5.3 Stage（2D）

- 白底技术网格（非常淡）；矩阵用直角矩形、1px 黑线和等宽数字排列。
- 行/列/元素使用 `sky-100` 选区 + 黑/蓝 1px 线；不发光、不彩色填充。
- 运算符号与规则行保持对齐；不将公式排版做成海报。
- 顶部小工具：fit、缩放、显示网格、显示标签；位置固定在画布右上角。
- 选中 cell `/ row / column / matrix` 通过 `selection` 反映到检查器、Trace、时间轴和所有视图。
- 当前步骤的 provenance 若为 `derived`，画布角落显示 `DERIVED`，不能隐藏。

### 5.4 Flat（平铺）

- 输入串、算子窗口、结果轨道横向排列；每个 tile 用 1px 边框与 role 标签。
- 活动对象的移动/扫描使用短促的 1px 轨迹或高亮带；不使用发光扫描线。
- 当画布宽度不足时横向滚动；不使用自动缩放把数字变得不可读。
- tile 与 Step/Microframe 的 source ID 对齐；点击 tile 即选中对应值。

### 5.5 Layers（2.5D）

- 层叠方向必须标注为计算阶段，不伪装成数据维度。
- 层片用白色/浅蓝填充、1px 线；活动层用 2px 黑边，不用彩色发光。
- 折叠用 `×N` 与 bracket；展开只影响显示，不重算。
- 反向梯度未来使用独立反向轨道/箭头，不加入当前正向层。

### 5.6 视图之间

- 切换 tab 保持 cursor、selection、折叠状态；不改变计算结果。
- 选中对象跨视图保持；若某视图没有对应元素，检查器仍显示 source ID 与“当前视图不可见”的说明。
- 不能悄悄切到另一份数据或重新执行表达式。

## 6. 右侧检查器（320px）

### 6.1 结构

```text
SELECTION / C[1,2]                    [pin]
matrix · 2×2 · Q
────────────────────────────────────────
Overview | Data | Trace
────────────────────────────────────────
TYPE        matrix
SHAPE       2 × 2
DTYPE       Q (exact rational)
SOURCE      Run 03 / step 07 / C
VALUE       10
DEPENDENCY  A[0,:] · B[:,1]
WARNINGS    —
────────────────────────────────────────
[related resources]
```

- 头部只显示选中对象的稳定标识；无选中时显示操作提示。
- `pin` 固定当前检查对象，不随画布 hover 变化；默认不固定。
- `Overview`：类型、shape、dtype、值/范围、来源、依赖、警告、耗时。
- `Data`：矩阵/向量表格、选中 cell、复制、查看 full precision；只读，不在此直接改源数据。
- `Trace`：该对象对应的 step/source、输入输出、provenance、相关事件。
- 未来 `Gradients` 作为独立 tab，在 AD 实现后出现；本阶段不显示。
- 行高 24–28px；label 固定 92px；数值右对齐等宽。
- 检查器不可被模态遮挡；窄屏以抽屉形式从右侧进入，并按 Esc 关闭。

## 7. 底部 dock（236px，可折叠）

### 7.1 通用

- 高度可拖拽 30–340px；折叠到 30px 标题栏；`Ctrl/Cmd+J` 切换。
- tab：`REPLAY` / `TRACE` / `CONSOLE` / `PROBLEMS`。
- 运行完成后，默认打开 Replay；没有运行时默认折叠或打开 Console。
- tab 状态、高度、折叠均仅在内存；不持久化。

### 7.2 Replay

布局（高 236px）：

```text
run 03  ready  derived trace  · A × B     9 steps     1.0×  [loop]
──────────────────────────────────────────────────────────────
 step    01       02        03        04       05  ...
 phase   ├── dot ──┼── dot ──┼── resolve ──┤
         │   ● playhead
──────────────────────────────────────────────────────────────
 selected step: 04 · C[1,2] = 10
 [prev step] [play/pause] [next step] [steps|micro] [speed]
```

- 时间轴单位是 **step index**，不是伪造的毫秒精度；实际耗时只作为 metadata。
- 步骤是主要刻度；微观帧默认折叠；展开后出现细分刻度。
- 章节/循环用 phase band 与 bracket；未来循环显示 `×N`。
- 游标可在拖动时预览，但拖动结束前不触发计算；只改变 presentation。
- 播放中选中事件：暂停并定位到该步骤起点（可在设置里改为不暂停；默认暂停）。
- 运行失败仍显示已完成的步骤与错误事件；不允许点击“分支”伪造恢复。

### 7.3 Trace

- 全宽表格：`seq / phase / node / op / shape / dtype / status / source / duration`。
- 行选择与 Replay/场景/检查器同步；双击聚焦步骤。
- 用虚拟列表；本阶段运行很小，但结构必须支持 >1000 行。
- `DERIVED` provenance 在表头持续可见；不可仅隐藏在 tooltip。

### 7.4 Console

- 函数注册表调试器：选择算法、JSON/表单参数、运行、输出、trace。
- 它的运行也创建 `RunRecord`（kind=`function`），与表达式运行共享 Replay 模型；不是第二套调试系统。
- 不把 debug console 做回覆盖全屏的浮层。

### 7.5 Problems

- 结构化错误/警告：位置、级别、message、source ID、修复建议。
- 错误不使用红色；用 hatch/`ERROR`/错误码。
- 点击问题定位到对应表达式/节点/步骤。

## 8. 状态栏（22px）

- 左：`IN-MEMORY`、`exact Q`、当前文档 revision。
- 中：`run 03 · step 04/09 · derived trace`。
- 右：选中 ID、主题、缩放、面板布局 preset。
- 状态栏文本 10–11px mono；不在状态栏放大按钮。

## 9. 关键工作流

### 9.1 冷启动

```text
session 初始化：
  A, B 示例对象
  表达式 A × B
  无运行结果
  Stage 显示未运行占位（输入矩阵 + RUN 提示）
  Replay dock 折叠或显示 “No runs”
```

- 不自动运行，不自动打开大弹窗。
- 不再有品牌大标语；资源栏顶部只有 session 名称和对象数量。

### 9.2 运行

1. 用户按 `RUN` / F5。
2. 当前表达式和对象快照生成 `RunRecord`（provenance 本阶段为 derived）。
3. 计算完成；默认打开 Replay dock，游标到步骤 0，并按默认设置自动播放一次。
4. 播放到末尾后停在最后一步；不循环。
5. 选择任意步骤/对象，检查器与所有视图同步。
6. 修改表达式 → 旧 run 标记 stale；不自动重跑。

### 9.3 检查

- 点击 cell/trace 行/视图 tile → 统一 selection。
- 检查器固定显示；不因 hover 改变 pin 状态。
- 任何视图切换不改变 cursor 和 selection。
- 键盘 `F6` 聚焦 Replay，`F7` 聚焦检查器，`Esc` 返回画布。

### 9.4 调试函数

1. Algorithms 资源选中算法 → 检查器显示签名/参数。
2. `Open in Console` → 底部 Console。
3. 运行 → 产生 function run，Replay/Trace 可用同一 Timeline、同一 trace 表格。
4. 不覆盖公式运行的当前 stage，除非用户显式 `Open run`。

### 9.5 分支/重跑（本阶段边界）

- **Rerun**：用当前文档创建新 run，旧 run 保留（内存）。
- **True fork from step**：设计目标，待内核 snapshot；本阶段不提供会造成错误联想的假按钮。
- Run 列表显示 lineage 字段；若将来有 parent，显示 `from run 02 · step 07`。
- 关闭/刷新应用即丢弃所有运行；没有“保存”按钮。

## 10. 当前 UI 到新 IA 的映射

| 现有组件/行为 | 新位置 | 处置 |
|---|---|---|
| `LibraryPanel` 品牌/介绍/矩阵卡片/项目条 | 活动栏 + Objects 资源 + Session 标识 | 重写；品牌介绍删除 |
| `ProjectModal` / 多项目 localStorage | 无 | 本阶段移除；不做项目保存/切换 |
| `ExpressionBar` | 中央 Expression Strip | 重做视觉与状态；保留语法 |
| `Theater` | 中央 Stage 视图 | 拆分出 view tabs/transport；去掉深色舞台 |
| `Inspector` | 右侧检查器 | 改为紧凑属性/表格；移除大卡片 |
| `DebugConsole` | 底部 Console dock | 从浮层改为 dock tab；运行记录统一 |
| `TemplateModal` | Formulas 资源 + 检查器操作 | 不再用大画廊弹窗；本阶段保留“装填”动作 |
| `OpsModal` | Algorithms 资源 | 不再用独立满屏手册 |
| `BlockModal` | 中央命令/临时面板 | 第一刀可保留为矩阵编辑类浮层，后续再嵌入 |
| `MatrixEditorModal` | 临时编辑面板 | 保留，但白底、直角、紧凑 |
| `FormulaLabModal` | Formula 结构视图/临时面板 | 本阶段可保留，作为未来中央 Formula 视图的过渡 |
| `scene` 层叠/平铺 | 中央 Flat/Layers tabs | 保留数据与渲染，去色/去发光 |
| 项目保存/导出/恢复 | 无 | 明确删除，不提供假入口 |

## 11. 响应式与窗口尺寸

### ≥ 1440×900

完整四区：活动栏 + 资源栏 + 中央 + 检查器；底部 dock 236。

### 1280–1439

- 资源栏 240；检查器 300；中央至少 640。
- 极长资源名截断，tooltip 显示全名。

### 1120–1279

- 资源栏默认折叠到活动栏；检查器保留 280–300，或转为右侧抽屉。
- 中央至少 600。
- 顶部会话名缩写；命令搜索变图标。

### < 1120

不支持正式工作布局；Electron 最小窗口仍保持 1120×760，避免出现压缩到不可读的“移动端式”面板。

### 高度

- < 820px：公式条可收为一行；底部 dock 默认折叠；检查器优先保留。
- 底部 dock 高度不得超过窗口的 45%；可拖拽调整。

## 12. 键盘与命令

| 快捷键 | 动作 | 备注 |
|---|---|---|
| `⌘/Ctrl + K` | 命令面板 | 全局 |
| `F5` / `⌘/Ctrl + Enter` | Run | 创建新 run |
| `Space` | Play/Pause | 输入框内不拦截 |
| `←/→` | 上一/下一微帧 | 焦点在 Replay 或画布时 |
| `Shift + ←/→` | 上一/下一执行步骤 | 与滑杆一致 |
| `Home/End` | Run 开始/结束 | 重播 |
| `F6` | 聚焦 Replay | 面板焦点 |
| `F7` | 聚焦检查器 | 面板焦点 |
| `F8` | 下一个问题 | Problems |
| `Ctrl/Cmd + B` | 折叠资源栏 | 内存状态 |
| `Ctrl/Cmd + J` | 折叠底部 dock | 内存状态 |
| `Esc` | 关闭浮层/抽屉/命令面板 | 不关闭应用 |
| `?` | 快捷键帮助 | 非输入框 |

- 所有动作有命令面板入口，不以记住快捷键为前提。
- 焦点可见；不得用 `outline: none` 移除。

## 13. 空态、加载、错误

- **No run**：画布显示输入对象 + `未运行。按 F5 运行 A × B。`；不显示空动画。
- **Computing**：顶部状态行和 `STOP` 可用；画布保留当前文档；不伪造进度百分比。
- **Failed**：Stage 显示最后已知状态 + Problems 标记；Trace 中错误事件可选中；没有任何结果就显示错误卡片。
- **Stale run**：视图顶部的窄状态条；操作仍可播放旧 run；Run 创建新 run。
- **No selection**：检查器显示“未选择对象”与当前运行的简单摘要；不显示空白 300px 卡片。
- **No algorithms/formulas**：一行说明；不要把功能区做空。

## 14. 可访问性

- 活动栏、tab、树、表格、dock 全部支持键盘；有 `aria-current`/`aria-selected`。
- 时间轴不是只有鼠标的 canvas：提供可聚焦的 step 列表/表格作为等价控制。
- 颜色不是唯一状态；role/status 都有文字或几何。
- 检查器与画布之间可跳转；屏幕阅读器读到稳定 ID、shape、dtype、status。
- 减少动态：自动播放变“跳到终态”，用户仍可手动逐帧。
- 1px 线不承担唯一边界：焦点/选中另有背景或文字标记。

## 15. 决策记录

**已决定**

- IDE 式四区 + 底部 dock；主流程无模态。
- 活动栏保留 Session/Formulas/Algorithms/Runs；本阶段没有 Projects。
- 中央表达式条常驻；完整 Formula canvas 是后续独立视图。
- `Stage / Flat / Layers` 三个视图先落地；`Graph` 不显示假入口。
- 运行完成后打开 Replay dock，自动播放一次后停在末尾；用户可改为手动（见重播文档）。
- 没有持久化：无保存、无导出、无“已保存”状态；关闭即丢。
- 1120 以下不承诺工作布局。

**设计期待定 / 后置项**

- 资源栏默认宽度 264 还是 256（建议 264；视觉评审时可微调）。
- 是否在顶部命令栏放“Run without replay”或只在命令面板提供。
- 公式结构实验当前放在资源/临时面板还是中央 view（建议本阶段仍可从 Formulas 打开，中央化在公式阶段完成）。
- 检查器默认 tab：Overview 还是 Data（建议 Overview）。
- 是否在第一刀保留 BlockModal 的现有交互（建议保留但重新皮肤）。
