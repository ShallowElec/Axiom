# 04 · 视觉语言与场景：同一事实，三种看法

> 状态：设计基线。现状为 2D 剧场 + 左右两栏；层叠/平铺已接入 Theater 视图切换与调试台，Scene 仍为 v1。

## 信息架构

长期壳层 = 绘画应用的**项目/素材架** + 代码编辑器的**可调分栏**：

```text
┌ 项目/资产架 ─┬ 中央工作区（可水平/垂直分栏） ────┬ 检查器 ──┐
│ 项目切换      │ Tab: 舞台 / 公式 / 算法 / 运行      │ 语义      │
│ 矩阵对象      │ Stage（2D / 层叠 / 平铺）            │ Trace     │
│ 公式仓库      │ 编辑区（矩阵/公式/算法）             │ Scene     │
│ 算法仓库      │ 调试控制台（可折叠）                 │ 属性/来源 │
│ 固定运行/历史 │                                      │           │
└───────────────┴──────────────────────────────────────┴───────────┘
```

左轨深色素材架负责“选什么”，中央近黑舞台/编辑区负责“看/改什么”，右栏纸面检查器负责“为什么”。现状已有三段式、项目切换与对象/公式/算法三页；尚无真正可调分栏，调试台仍是底部浮层，仓库也还只是静态模板/函数清单。中央 Tab 是打开的文档，切换 Tab 不丢 Stage；检查器按需切换。

## Stage 与 View

**Stage** 是稳定观看现场，绑定 `runId` 或项目对象；**View** 是投影（2D 剧场、层叠、平铺、未来图/表格）。切换 View 不重算、不改选中值。当前 2D 剧场由 Storyboard 章节/帧驱动，支持播放/逐帧/跳章/变速，是时间剧场基线；三种视图必须能显示同一个 `ValueId` 并共享 Trace 选中态。

## 三种视图

- **2D 剧场（现状）**：面板从左到右表达输入/中间/结果，连接符表达关系；`CellTone` 控制高亮；右侧检查器给规则与累加器。矩阵始终正交，不做透视，坐标可信。
- **2.5D 层叠**：Z 轴只表达**计算流水线深度**，不把矩阵维度伪装成第三维。第 0 层输入，后续层算子/章节，末层结果；同层矩阵保持平面。当前实现用 CSS 3D + 拖拽旋转（yaw 约 ±22°，pitch −2°–26°），点击层查看读数；轻量、无需 WebGL，但只是“层叠示意”，不是完整 3D 编辑。限制透视与单元格拉伸，深度用层距/阴影/连线表达。
- **平铺合成（flat/tiled）**：值变瓦片/条带，算子变窗口，数据沿轨道流动；适合扫描、循环展开、反馈和多中间值比较。“RNA 式”只是折叠/拼接/链式结构的视觉隐喻，不做生物学断言。平铺与层叠共享节点/边语义，布局算法完全不同。

未来 three.js + React Three Fiber 只用于“中等规模、确需空间操作”的折叠/展开层，且必须能退化为层列表/2D 卡片；不得让 three.js 对象进入事实层。

## Scene Schema

现状 v1 已有 `space/nodes/edges/legend/a11y`，节点有 `stage/lane/status/shape/matrix`。方向正确：**Scene 只含语义、值、布局提示，不含像素坐标**。

```ts
type VisualChannel = 'x'|'y'|'z'|'hue'|'size'|'texture'|'border'|'motion'|'smallMultiples';
interface Scene {
  schemaVersion:2; id:string; traceRef:string;
  space:'theater'|'layered'|'flat'|'graph';
  nodes:SceneNode[]; edges:SceneEdge[]; groups:SceneGroup[];
  legend:LegendItem[];
  a11y:{ altText:string; summary:string; tableFallback?:string };
}
interface SceneNode {
  id:string; role:'input'|'parameter'|'operation'|'intermediate'|'result'|'observation'|'error';
  valueRef?:string; opRef?:string;
  status:'past'|'active'|'future'|'done';
  stage:number; lane:number;
  extent?:{rows:number;cols:number};              // 抽象网格，不是 px
  channels?:Partial<Record<VisualChannel,string|number>>;
  labels:{primary:string;secondary?:string};
}
```

像素、字体、响应式间距由渲染器决定；Scene 决定“哪个层、哪条泳道、什么角色、绑定哪个值”。

## 超过三维：对象属性

空间轴最多三个，其余维度进入通道，禁止偷偷加轴。

| 维度 | 通道 | 约束 |
|---|---|---|
| D1/D2 | x/y（列/行/泳道） | 保因果方向，避免重叠 |
| D3 | z（层）或分组 | 层叠用 z；平铺用分组 |
| D4 | hue（分类） | 最多 6–8 类，需图例+标签 |
| D5 | size（数量） | 面积/长度单调，不用体积 |
| D6 | texture（纹理） | 低分辨率仍可辨 |
| D7 | border（边框） | 可同时表达选择/状态 |
| D8 | small multiples | 分面优先于继续塞颜色 |
| D9 | motion/phase | 仅表达时间/迭代，遵守减动效 |
| D10+ | 过滤/聚合/表格 | 不再堆通道 |

连续量用感知均匀、色盲友好的 viridis（[介绍](https://cran.r-project.org/web/packages/viridis/vignettes/intro-to-viridis.html)），分类用语义色；同一图只用一种连续色标。数值大小不得映射到透视缩放；任何编码都要有图例/读数/无障碍摘要。

## 循环、反馈与折叠

循环在**时间上线性展开**：第 i 次迭代是独立 Stage/帧，节点带 `iteration`；回边标 `feedback`，不形成不可解释的隐式环。默认迭代上限 100，有收敛标记和最终摘要；超限是显式错误。折叠组显示子节点数、当前迭代、结果摘要、错误/饱和计数；折叠只改视图，不改 Trace 或结果。反馈必须在 Trace 有对应事件，用户能定位哪次输出回到哪次输入。

## 色彩、无障碍与交互

语义色与数据色分离：输入/对象 mint `#8fe2c0`，参数 amber `#f4cb72`，操作 lime `#d8fa70`，中间量 lavender `#d8e6ff`，结果 coral `#ff8169`，读数 cream，错误 danger `#b8462f`。非文本对比 ≥3:1、正文 ≥4.5:1（[WAI](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)）；现有纸面珊瑚色需审计。颜色之外必须有标签/线型/表格回退；每个 Scene 有 altText、summary、可选 tableFallback；播放状态 `aria-live="polite"` 播报；遵守 `prefers-reduced-motion`。

交互：左轨拖矩阵到槽位/舞台；舞台与检查器选中同步；双击检查值，右键固定/比较/复制引用；层叠拖拽需 pointer capture，Esc/重置恢复，键盘方向键等价；时间轴/章节/速度沿用现状；分栏用指针+键盘微调，布局存 workspace，不进 Trace。任何交互落到 command 或 view state，不直接改 Story/Scene 数组。

## 性能与现状

2D 小规模用 DOM/SVG（文字和无障碍友好），密集单元再 Canvas；2.5D 用 CSS transform + 分层 DOM，单场景 ≤40 层、≤1500 节点，超出转列表/平铺；未来 3D 用实例化、按需渲染、2D 回退。避免大面积 blur/filter、每帧读布局；动画只改 transform/opacity；格式化/Scene 构建放 Worker 或编译期。

| 能力 | 现状 | 计划 |
|---|---|---|
| 三段式布局 | 已实现（左 258px/右 354px，项目与资产三页） | 可调分栏 + 常驻底部控制台 |
| 2D 剧场 | 已实现 | 与 Trace seq 对齐、语义色统一 |
| 层叠/平铺 | 已接入 Theater 与调试台 | 选中同步、Scene v2 |
| Scene v2 | v1 类型 | groups/channels/tableFallback |
| 三维 | CSS 2.5D | 后续 three.js/R3F，非当前承诺 |

## 决策记录

**已决定**：Stage/View 分离，一运行多 Scene；空间轴最多三维，其余进属性通道；2.5D 用 CSS 而非提前引入 three.js；循环线性展开 + 显式 feedback；语义色与连续色标分离，颜色必须有冗余编码与表格回退。

**待定**：默认分栏方式与窄窗折叠；平铺布局用轨道还是力导向；2.5D 最大可读层数；相机/时间是否进 Scene v2；完整 3D 编辑是否值得长期投入。
