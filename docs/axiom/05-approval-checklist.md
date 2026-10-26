# 05 · 设计批准清单

> 这是编码前的最后一道门。**在你明确批准之前，我不会改 `src/`、`package.json`、Electron 主进程或任何业务代码。**

## 1. 请先看

- [Axiom 设计包索引](README.md)
- [品牌与视觉系统](00-brand-visual-system.md)
- [信息架构](01-information-architecture.md)
- [重播与 Trace](02-replay-and-trace.md)
- [Runtime/IR 重构](03-runtime-refactor.md)
- [实施计划](04-delivery-plan.md)
- [原始色卡](reference/COLOR_CARD.md) / [色卡样张](reference/EP01_color_card.png)
- [新架构设计稿 v1.1](reference/math_workbench_design_v1.1.md)

## 2. 本次设计已经锁定的方向

| 项 | 方案 |
|---|---|
| 品牌 | Axiom 英文主品牌；中文正文可称“公理” |
| 主主题 | 纯白/墨黑/天蓝；白底黑字，蓝色数据阶；低圆角、硬边界、无渐变/发光/阴影 |
| 第二主题 | 可切换深色：近黑底、白字、亮蓝线/字、蓝色阶；不使用旧奶油/青柠/珊瑚 |
| 布局 | 活动栏 + 资源栏 + 中央工作区 + 检查器 + 底部 Replay dock + 状态栏 |
| 重播 | 可检查重放；Run / Step / Microframe 三层；默认步骤播放，展开后微观帧 |
| 运行 | 完成后不可变；编辑不覆盖旧 run；seeking 不重算 |
| 第一刀 | 可见 Axiom 工作台 + 当前引擎的 Run/Trace/Replay 闭环；不先写 Rust/WASM |
| 存储 | 本阶段不做产品级持久化；无项目保存/导出/迁移/旧数据兼容 |
| 分支 | 设计目标保留；第一刀只做 rerun/lineage，不伪造 step-level fork |

## 3. 需要你确认的三个具体默认值

这些默认值会影响第一刀的交互。请在批准时明确选择；不选择则按“推荐”执行。

### Q1. 运行完成后是否自动播放一次？

- **[推荐] A. 自动播放一次，结束停在末尾。**
  - 用户按 Run 后看到完整过程；播放结束后仍可拖动/逐 step。
  - reduced-motion 用户直接跳到末尾。
- B. 不自动播放，直接停在末尾；用户按 Space 重播。
- C. 不自动播放，停在第一个 step；用户按 Space 开始。

> 我建议 A：显式 Run 是用户主动启动演示，自动播放一次最符合当前产品遗留，也不妨碍检查。重播不循环，不自动重跑。

### Q2. 从 Runs 打开旧 run 时，默认落在哪里？

- **[推荐] A. 落在末尾（先看最终结果）；按 Play 从头重播。**
- B. 落在第一个 step，直接从头开始播放。
- C. 落在上次离开的位置（需要额外状态，且无持久化时只保留内存）。

### Q3. 第一刀是否强求真正的 step-level fork？

- **[推荐] A. 不在第一刀伪装 fork。** 先做不可变 run、rerun、run 列表和 lineage 字段；等内核支持 checkpoint/快照后再开 step fork。
- B. 第一刀必须做“从选中 step 修改后继续”的真分支；这会把范围扩大到执行器/checkpoint，而不是可见工作台重构。
- C. 第一刀做一个“fork”视觉按钮但只复制 run；不建议，会误导。

## 4. 额外需要你确认的边界

| 问题 | 推荐 | 如果不接受会怎样 |
|---|---|---|
| 没有持久化：关闭即丢，启动回到 seed session | 接受；UI 明确 `IN-MEMORY` | 需要提前做 SQLite/JSON 项目容器，不属于当前主重构 |
| 现有项目/自动保存/导出入口删除 | 接受 | 用户会误以为已保存；与无持久化冲突 |
| 第一刀保留 `FormulaLabModal` 并重新皮肤，完整公式编辑器后置 | 接受 | 第一刀范围会大幅增加 |
| MatrixEditorModal 继续作为临时编辑面板（重新皮肤） | 接受 | 要同时做完整的“就地矩阵编辑”交互，会拖慢重播主线 |
| 开发期暂时保留旧 UI 的 dev flag 对照，不交付给用户 | 接受（最多保留一个迭代） | 旧主题 CSS 会拖慢清理；需要更严格的自测 |
| 自托管 IBM Plex Sans/Mono，避免 mac/win 字体漂移 | 接受 | 跨平台视觉会不一致，工程感不稳定 |
| 1120×760 以下不承诺工作布局 | 接受 | 需要额外投入窄屏折叠/抽屉，且本产品定位桌面 |
| 错误不使用红色，使用黑/hatch/文本 | 接受 | 需要用户适应；但符合单色卡 |
| 第一阶段不展示 Graph/Gradients/AD/MX 假入口 | 接受 | 会误导已完成能力 |

## 5. 批准方式

请回复以下任一项：

### 方案 A：整体批准（推荐）

```text
批准 Axiom 设计与第一刀范围。
Q1 选 A，Q2 选 A，Q3 选 A。
按推荐执行：无持久化、无真实 fork、保留 FormulaLab/MatrixEditor 临时入口。
进入 Phase B + C。
```

### 方案 B：批准视觉，先只做壳层

```text
批准视觉/IA，但先只做 Phase B（主题 + 工作台壳层），Replay 下一轮再开始。
```

> 不推荐：会让用户先看到新壳层但仍是旧播放逻辑，容易造成“新 UI 旧能力”的落差。

### 方案 C：需要修改

```text
保留/修改：
- 主题：
- 布局：
- 重播默认：
- 分支范围：
- 持久化：
```

## 6. 批准后的第一组动作（预告）

批准后我不会直接大改全部代码，而会按 [04-delivery-plan.md](04-delivery-plan.md)：

1. 建立 Axiom theme tokens 与基础壳层；
2. 用 Phase B 截图和 1120 布局给你 review；
3. 接入 `A × B` 的 Run/Trace/Replay vertical slice；
4. 通过 Gate C 后再迁移所有现有功能；
5. 最后才删除旧壳层/旧主题/旧持久化入口。

## 7. 仍然诚实保留的不确定性

- 现有 `stories.ts` 同时承担了计算与教学编排，第一刀只能做 **derived** trace；真正 native trace 要等引擎事件化。
- 不做持久化意味着无法恢复 run；这是本阶段接受的 trade-off。
- step-level fork 依赖执行器 checkpoint；本轮不假装完成。
- 深色主题和紧凑面板需要在真实窗口/真实字体下再做一次视觉校准，而不是只靠 token 表。

---

**请批准方案，或指出要改的具体条目。**
