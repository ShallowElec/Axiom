# 08 · Phase E 实施记录：Native Trace 与 Checkpoint Branch

> 状态：已实施，2026-10-27。  
> 范围：exact-Q 表达式原生执行记录、operation/cell checkpoints、Native 面板、从 checkpoint 物化状态并创建带 lineage 的新分支。  
> 未包含：持久化、Rust/WASM、AD/MX、native function-story trace、对同一 AST 的原地 resume。

## 1. 为什么不是把 DERIVED 改个标签

Phase B+C 的 trace 从 Story/FlatBeat 派生；Phase E 新增 `src/runtime/native.ts`，直接消费 `evaluateExpression()` 的 `OperationRecord`，并把真实操作值记录为 native operations/checkpoints。Story 仍然存在，但只承担 presentation：

- `provenance: native`：expression run 的执行记录来自 exact-Q 操作。
- `presentationProvenance: derived`：Stage/Flat/Layers 仍由故事板适配而来。
- Function/block run 没有 native checkpoint，继续标 derived。
- UI 同时显示 `PROVENANCE NATIVE` 与 `PRESENTATION DERIVED`，不混淆两者。

## 2. Native trace

- `NativeTrace` 绑定 runId、engine、granularity、耗时、operations、checkpoints。
- `matmul` / `add` / `subtract` / `hadamard` / `scale` / `transpose` 采用 cell-level decomposition：
  - matmul 每个输出 cell 实际用对应行/列点积计算；
  - 其他操作按对应 cell 计算；
  - 每个 cell 产生 partial checkpoint；最后产生 complete checkpoint。
- `det` / `inv` / `rref` / `solve` 等当前以 operation-level checkpoint 记录。
- 每个 checkpoint 保存当时的 exact-Q value snapshots（矩阵和标量），可直接物化回矩阵对象。
- Native trace 的数值计算是真实 exact-Q；没有从 story beat 复制展示文案。

## 3. Checkpoint fork

- 底部 dock 新增 `NATIVE` 面板，显示 operation、checkpoint、complete/partial、FORK 操作。
- Fork 流程：
  1. 选中 native checkpoint；
  2. 检查点中的矩阵 snapshot 物化为当前 session 的新对象（例如 `F1`）；
  3. 用户编辑从该状态出发的表达式；
  4. 新 Run 带 `lineage: { parentRunId, forkedFromStepId, checkpointId }`；
  5. 父 Run 不被修改；由于文档 revision 变化，父 run 会显示 stale，这是预期。
- 这不是“Rerun 换个 id”：分支从 checkpoint 的实际值出发，且可以输入新的表达式。
- Fork 不是对同一 AST 的执行器原地 resume；Phase E 选择更稳妥的 checkpoint materialization。下一步若要 AST 内部 resume，需要把 checkpoint 绑定到 evaluator continuation。

## 4. UI

- Native tab：`NATIVE` 计数、cell/operation 粒度、checkpoint 状态、FORK。
- Fork dialog：父 run、operation、checkpoint、partial 提示、checkpoint matrix、branch expression。
- 分支运行后在 Inspector 显示 `LINEAGE`，在 viewbar 显示 `NATIVE`/`BRANCH`。
- 全新截图：`screenshots/axiom-native-fork.jpg`、`screenshots/axiom-native-branch.jpg`。

## 5. 验证

- `npm run typecheck`：通过。
- `npm test`：104 项通过。
- `npm run build`：通过。
- 生产 Electron：
  - `A × B` → 9 derived presentation steps / 5 native cell+result operations；
  - 打开 NATIVE tab，看到 5 checkpoints；
  - FORK checkpoint-1 → materialize partial F1 → branch expression F1 → run-002 native 1 operation；
  - Inspector 显示 `LINEAGE run-001 · checkpoint-1`、`PRESENTATION DERIVED`；
  - 无 console error。

## 6. 后置

- native function/block trace，而不是只有 expression trace。
- AST-level resumable checkpoint（当前是 value materialization）。
- `channels`、更大的 trace 压缩/分页。
- 持久化、Rust/WASM、AD/VJP、MX/FP4–FP64。
