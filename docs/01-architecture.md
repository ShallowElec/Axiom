# 01 · 架构：从计算事实到可渲染数据

> 状态：设计基线（2026-10）。现行 Electron 39 + React 19 + Vite 7 + TS 5.9（strict），精确核心在 `src/core`；调试台、Scene 视图与多项目切换已有初版。

## 原则与边界

1. **计算与渲染硬隔离**：`core` 不 import React/DOM/Electron；渲染器只消费 Storyboard/Scene，不调用数学函数。
2. **事实 → 编排 → 投影单向流动**：Trace 是计算事实，Storyboard 是教学编排，Scene 是空间投影，不能互相冒充。
3. **边界收窄**：输入用 `unknown`，校验后进入领域类型；`any`、类实例、DOM、函数不得进入可序列化状态。
4. **UI 状态与文档状态分离**：悬停、相机、播放头不持久化；项目、仓库条目、固定运行有稳定 ID 和版本。
5. **主进程最小权限**：sandbox、context isolation、无 Node 集成；文件/系统能力经窄 IPC 白名单进入。
6. **单包先守边界**：暂不拆 monorepo，用依赖检查再决定物理拆包。

```text
src/
  core/          # 现状：Q、Matrix、表达式、Trace 协议；纯计算
  values/        # 计划：统一 Value/DType、cast、算子注册
  kernel/        # 计划：RunRequest、函数注册表、Trace、worker 门面
  formula/       # 计划：AST、typed slots、公式模型
  project/       # 计划：项目/工作区/仓库、命令与迁移
  presentation/  # 现状：Story/Storyboard 编译器
  scene/         # 现状：Scene 类型与 builder 原型
  renderers/     # 现状：2D/2.5D/flat 渲染原型
  components/    # 现状：工作台壳与面板
electron/        # 现状：main/preload
```

依赖方向：`components/renderers → formula/project/kernel/presentation/scene → values/core`。`renderers` 不得 import `core`；Scene 预格式化数值。已用架构测试守住边界，后续补构建期检查；违反即失败。

## 数据流

```text
矩阵 / 线性文本 / typed AST / 调试参数
        → RunRequest（注册表 + 参数校验）
        → backend（q.exact | sym | f16/f32/f64 | mx.*）
        → ValueStore + Trace(events)
        → Storyboard / Scene 编译器
        → 2D / 层叠 / 平铺渲染器
```

现状 `App.tsx` 仍编排解析、求值、故事编译与剧场状态；调试注册表已能生成简化 Trace 和两种 Scene，但 Trace 仍由 Storyboard 步骤投影，没有值存储/cast 事件；2.5D/平铺已接入 Theater 与调试台。下一阶段先抽值级 Run/Trace，再让两个编译器消费。

**硬约束**：调试台的原始 Trace 和舞台的 Storyboard 必须来自同一次运行，不能为展示重算，否则高亮与数值会漂移。

## Trace 与调试协议

当前 `ComputationTrace` 由调试注册表生成，步骤来自 Storyboard；建议 M0 将 v1 草案就地补全为值级 Trace 并冻结：

```ts
interface TraceRun {
  schemaVersion: 1; id: string; entryId: string; backend: string;
  status: 'ok' | 'error'; durationMs: number;
  values: ValueRecord[]; events: TraceEvent[];
  resultRef: string; error?: { code: string; message: string; eventSeq?: number };
}
interface TraceEvent {
  seq: number; kind: 'input'|'read'|'op'|'cast'|'write'|'note'|'error';
  title: string; valueRefs?: string[];
  highlights?: Array<{ panel: string; row?: number; col?: number; role: string }>;
  payload?: JsonValue; // 纯数据
}
```

`ValueRecord` 含 id、dtype、shape、preview 和值存储引用。事件只追加；Story/Scene 按 `seq` 对齐。大值可延迟载入，但引用稳定，超出预算不能悄悄换 `null`。

计算能力以注册表暴露，调试台与公式编译器共用：

```ts
interface FunctionEntry {
  id: string; title: string; category: string;
  args: ArgSpec[]; backends: string[]; dtypes: DTypeId[];
  run(args: unknown, ctx: RunContext): Promise<RunOutput>;
}
interface RunRequest {
  entryId: string; args: unknown; backend?: string; dtypeProfile?: DTypeId;
  options?: { record?: boolean; grad?: 'none' | 'reverse' };
}
```

条目必须纯、确定性（随机需显式 seed）、可取消、声明资源上限；不执行任意字符串代码。参数错误返回结构化结果，不抛给 UI。

**调试控制台**目标五视图共享一个 `runId`：参数区、输出、原始 Trace、Storyboard、Scene。现状初版已有函数搜索、JSON 参数、输出/轨迹/故事板/场景四页及原始 JSON；尚缺类型化参数表单、值存储与完整验收。渲染器不知道数学实现。

## 项目、工作区、仓库

- **Project**：可保存、可移植、可迁移的文档。含仓库引用、布局、设置、固定运行。
- **Workspace**：当前编辑会话。标签、分栏、选中、播放头；可恢复但不属于科学事实。
- **Repository**：带稳定 ID/revision 的条目目录；内置、用户级、项目级三层。
- **Run**：一次 Trace 与值快照，可固定为 provenance。

```ts
interface ProjectFile {
  format: 'matrix-atelier.project'; formatVersion: 1; schemaVersion: 1;
  id: string; name: string; updatedAt: string;
  repositories: { matrices: RepositoryRef; formulas: RepositoryRef; algorithms: RepositoryRef };
  workspace: JsonValue; pinnedRuns: string[];
  settings: { defaultDtype: string; exactFirst: boolean; theme: 'atelier'|'contrast' };
}
```

规则：仓库条目不可原地改，编辑产生新 revision，项目固定具体 revision；删除先做全仓库引用检查；撤销记录**命令**，不记录派生 Scene；自动保存写恢复快照，正式文件由主进程写入，旧格式先备份。现状 `localStorage['matrix-atelier.workspace.v1']` 已是 v2 多项目快照；项目文件、仓库 revision 仍属 M2。

## 状态归属

| 状态 | 所有者 | 持久化 |
|---|---|---|
| 窗口、菜单、文件句柄 | Electron 主进程 | 系统/设置 |
| 项目、仓库、固定运行 | 渲染器应用层 | 项目文件 |
| 布局、标签、选择 | 渲染器应用层 | workspace/恢复快照 |
| 播放头、相机、悬停、拖拽 | 视图层 | 不持久化 |
| 计算缓存、Trace | Worker | 仅固定运行进入项目 |

React 只负责视图。应用层用 command → store → selector；异步运行按 `runId` 关联，取消用 `AbortSignal`。

## Electron 与 TypeScript

现状 `electron/main.ts` 已启用 contextIsolation、sandbox、关闭 nodeIntegration；外部链接仅 https，preload 只暴露平台/版本。继续保持并补齐：文件 IPC 做路径校验与授权目录限制；严格 CSP；导入项目视为不可信输入；计算在渲染器 Web Worker，主进程不参与数学；崩溃恢复不覆盖原文件。

TS：`strict`、判别联合、`readonly`、type import；预期失败返回 `Result<T,E>`；边界 `unknown` + 运行时校验；可序列化数据只用 JSON 兼容类型（BigInt 转字符串）；ID 用 branded type；禁止 `as` 绕过校验。

## 测试与性能

现状 Vitest 在 Node 测核心、调试注册表与架构边界；有截图/场景测量脚本但无 CI；类型检查、构建需在 M0 门禁中保持通过。

| 层 | 必测 | 手段 |
|---|---|---|
| 核心 | Q、形状、消元/逆/行列式、退化输入 | 单元 + 手写性质测试 |
| 值/Trace | cast、错误、事件顺序、上限 | golden Trace、schema、fixtures |
| 编译器 | 引用完整性、确定性 | golden JSON（字节稳定） |
| 渲染 | 只消费数据、空/错态、键盘 | 组件测试 + 无障碍快照 |
| Electron | 启动、加载失败、外链、损坏项目 | 打包 smoke + `MATRIX_CAPTURE` |
| 迁移 | 每个历史版本可打开 | 固定旧文件 fixtures |

视觉测试不能替代数据测试。里程碑退出必须含 typecheck、构建、关键路径手测。

| 性能指标 | 预算 |
|---|---|
| 冷启动到可交互 | < 2.0s（M 系列 Mac，1440×940） |
| 播放单帧渲染 p95 | < 8ms，无 > 50ms 长任务 |
| 时间轴拖动 | 10×10、≤8 面板时 p95 < 30ms |
| 小规模精确运算 | p95 < 50ms；更长进可取消 worker |
| 初始渲染 JS | ≤ 1.6MB gzip（不含字体），M0 校准 |
| 典型 Trace | < 8MB，事件上限 5000 |
| 2.5D 同屏 | ≤ 40 层 / ≤ 1500 DOM 节点 |
| 打开 1000 值引用项目 | < 500ms，无整库重算 |

## 版本与迁移

应用版本 semver；项目 `formatVersion`、Trace/Scene `schemaVersion`、仓库 `revision` 独立演进。迁移是纯函数 + 旧→新 fixture；失败保留原文件；禁止自动降级。固定运行保存 engineVersion、backend、dtypeProfile 和内容哈希，确保复现条件可查。项目可打包为 JSON/zip 容器，内部路径稳定。

## 现状与下一步

| 能力 | 现状 | 缺口 |
|---|---|---|
| 纯计算 | 已实现 | 统一 Value、注册表 |
| Trace | story 派生的简化 Trace | 值存储、cast 事件、Run 服务 |
| Scene | 已接入 Theater/调试台（v1） | Schema v2、选中同步、测试 |
| 项目/仓库 | localStorage v2 多项目 | 项目文件、revision、引用图 |
| Electron 安全 | 基线良好 | 文件 IPC、CSP、签名 |
| 测试/性能 | 核心 + 注册表测试 | Trace/Scene/E2E/预算 |

## 决策记录

**已决定**：采用“计算 → Trace → Storyboard/Scene → 渲染”单向流，渲染器不调用数学核心；Trace 为只追加事件 + 值存储；单包内按 core/values/kernel/formula/project/scene/renderers 分界；计算移入 Worker；项目文件是权威持久化。

**待定**：项目容器 JSON 还是 zip；注册表静态还是可安装扩展；是否引入运行时 schema 库；IPC 是每次对话框还是长期目录授权；Scene 在 M1 是否继续经 Storyboard 中间层。
