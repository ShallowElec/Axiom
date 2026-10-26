# 02 · 值系统与自动微分：一个信封，多种后端

> 状态：设计基线。精确有理数是现状；调试台已有 story 派生的简化 Trace，值级 Trace、符号、浮点、MX、AD 为计划。原则：**显示层可近似，事实层不可静默降级。**

## 统一 Value

```ts
type DTypeId = 'q.exact'|'sym'|'f16'|'f32'|'f64'
  |'mx.fp4'|'mx.fp6.e3m2'|'mx.fp6.e2m3'|'mx.fp8.e4m3'|'mx.fp8.e5m2'|'mx.int8';

interface ValueEnvelope {
  id: ValueId; dtype: DTypeId;
  shape: readonly number[];          // 暂保持 rank-2；列向量 [n,1]
  layout: 'dense'|'blocked'|'sparse';
  data: ValueData;                   // 内存可为 TypedArray/BigInt
  meta?: {
    requiresGrad?: boolean;
    logicalShape?: readonly number[]; // MX 补零时
    quantization?: { blockSize: 32; scaleDType: 'e8m0'; rounding: 'rne'; saturation: boolean;
      loss?: { maxAbs: number; saturations: number; nanCount: number } };
  };
}
```

不变量：shape 是逻辑形状、行主序，不做隐式 squeeze/转置；dtype 决定算术、可微策略与序列化；data 不含 DOM、函数、类实例；同一值可有多种显示，事实只有一个。值不可变，运算生成新 `ValueId`。

**精确有理数**（现状 `src/core/rational.ts`）：BigInt 分子/分母、约分、分母为正、零的分母为 1；只做精确算术，`toNumber()` 仅供显示或显式浮点后端；JSON 用 `"3"`、`"-3/4"`，绝不用 JSON number。比较用交叉相乘。大整数必须限额。

**符号 DAG**：`sym` 值与字符串分离，节点 `{id, op, args, shape, assumptions?}`，哈希共享、无环；只做安全重写（常量折叠、稳定排序），求值/化简是显式操作。外部 CAS 只能作后端，其对象不得成为项目格式。

## MX 与浮点 profile

MX 事实来自 OCP MX v1.0（2023-09，[规范](https://www.opencompute.org/documents/ocp-microscaling-formats-mx-v1-0-spec-final-pdf)）：**每块 32 元素共享一个 E8M0 scale**；MXFP4=E2M1，MXFP6=E3M2/E2M3，MXFP8=E4M3/E5M2，另有 MXINT8。E8M0 偏置 127，无零/inf，`0xFF` 为 NaN；元素转换用 RNE，有限格式按规范饱和，E5M2 允许元素 inf/NaN。scale 由块量化选择，clamp/舍入细节必须按规范 fixture 实现，不能只“除以最大绝对值”。

| profile | 说明 |
|---|---|
| `q.exact` | BigInt 有理数，事实层 |
| `sym` | 符号 DAG，可求值/化简 |
| `f16/f32/f64` | IEEE 存储；`f16` 可用 `Float16Array`，但需在 Electron 运行时探测 |
| `mx.fp4` | E2M1，码值 ±{0,.5,1,1.5,2,3,4,6}；无 inf/NaN |
| `mx.fp6.*` | E3M2 max 28 / E2M3 max 7.5 |
| `mx.fp8.*` | E4M3 max 448；E5M2 max 57344，允许 inf/NaN |
| `mx.int8` | 8-bit 整数 + E8M0 块 scale，与浮点 MX 分开 |

`Float16Array` 提案已达 Stage 4、2025 年可用（[TC39](https://github.com/tc39/proposal-float16array)），但 JS/Electron **无原生 float8/MX**，必须软件打包/量化。

## Cast 与 promotion

只有显式 cast 或算子声明的 cast 才能改 dtype。

| 组合 | 结果 |
|---|---|
| `q+q` | `q`，精确 |
| `q+浮点` | 拒绝；先显式 cast，保留原值 |
| 同族浮点 | 按 `f16→f32→f64` 提升 |
| MX + 同为 MX | 同 profile；不同 profile 显式转换 |
| MX + IEEE 浮点 | 拒绝；先 dequantize/quantize |
| `mx.int8` + `mx.fp*` | 拒绝 |
| `sym+数值` | 由后端声明，不猜语义 |

cast 产出新值 + `CastReceipt`（rounding、maxAbs、saturations、nanCount、subnormals）。量化先算块 E8M0 scale，再对元素 RNE；饱和必须可见。逐元素运算暂要求同形，标量乘法是独立算子；未来广播要显式并记录展开规则。

## 算子注册表

```ts
interface OpSpec {
  id: string;                                   // 'linalg.matmul'
  shapeRule(args: Shape[]): Shape | ShapeError;
  impl: Partial<Record<DTypeId, BackendImpl>>;
  vjp?(op: OpRecord): Partial<Record<ValueId, ValueEnvelope>>;
  nonDifferentiable?: string;
}
```

后端由 `(opId, dtypeProfile)` 决定，禁止失败后偷偷换浮点。精确、浮点、符号、MX 共用 shapeRule；实现声明是否支持 batched/稀疏/原地。注册表同时服务公式、调试台、故事编译器和算法块。

## 自动微分

- **前向**：播种方向向量，逐算子 JVP；适合输入少/方向导数。
- **反向**：记录 tape（op、输入/输出引用、保存量、VJP），从标量损失反扫；默认用于梯度。闭包不持久化，序列化只存 opId + 引用。
- 精确 `q` 上 AD 仍精确；浮点按配置用 f32/f64 累加；**MX 默认不可微**，启用 STE 必须显式标记在配置与 Trace 中。
- `rref/rank/pivot`、取整、比较默认不可微，报 `NON_DIFFERENTIABLE`。梯度只在请求时进入 Trace。

实值 VJP（`G` 为上游梯度，`α` 为标量上游）：

| 前向 | 反向 |
|---|---|
| `Y=A+B` | `GA=G, GB=G` |
| `Y=cA` | `GA=cG, Gc=Σ(G⊙A)` |
| `Y=AB` | `GA=GBᵀ, GB=AᵀG` |
| `Y=A⊙B` | `GA=G⊙B, GB=G⊙A` |
| `Y=Aᵀ` | `GA=Gᵀ` |
| `y=det(A)` | `GA=α·adj(A)ᵀ`，奇异时也成立 |
| `Y=A⁻¹` | `GA=−A⁻ᵀ·G·A⁻ᵀ`，要求可逆 |
| `AX=B` | `GB=A⁻ᵀGX, GA=−GBXᵀ` |
| `y=trace(A)` | `GA=αI` |
| `Y=A⊗B` | 索引 scatter；用 JVP 对拍 |
| `Y=Aⁿ` | 展开 matmul；负指数经逆 |
| 特征值/SVD | M5 再定；简并情形必须拒绝或标记 |

验收：浮点有限差分（避开尖点）、精确/符号对拍、matmul 解析式。MX 只验收量化值、饱和记录和 STE 显式性。

## Trace、序列化与安全

```ts
interface ValueRecord {
  id: ValueId; dtype: DTypeId; shape: readonly number[];
  preview: string; payloadRef?: string;
  quantization?: QuantizationInfo; requiresGrad?: boolean;
}
```

Trace 的 `cast` 事件记录损失；`op` 事件记录输入/输出与后端；反向产生 `vjp` 事件或独立 grad 区块，按 `seq` 与计算对齐。超预算保留引用与 preview，不悄悄丢值。

序列化：JSON 元数据 + `q` 字符串 + little-endian base64 字节（float）；MX 保存打包元素、每块 E8M0、逻辑形状；符号 DAG 稳定拓扑；不序列化闭包/原型。内容哈希用 SHA-256，时间戳不参与。反序列化先校验版本、形状、块数、scale（拒绝 `0xFF`）和预算。

安全：禁止 eval/new Function；限制元素数、单值位数、运算次数、tensor 字节、tape 长度与执行时间；导入 MX 校验块对齐/NaN/逻辑形状；标签只当文本；worker 执行并可取消。

## 现状

| 能力 | 现状 | 计划 |
|---|---|---|
| 精确有理数 | 已实现并测试 | 接入统一信封 |
| f16/32/64、MX、sym、AD | 未实现 | M4/M5 |
| Trace cast/vjp | 简化 story Trace 已有 | M0/M1 值级事件 |

## 决策记录

**已决定**：统一信封 + 显式 cast，禁止跨家族静默升格；精确优先，浮点/MX 仅观察 profile；MX 严格按 32 块、E8M0、RNE/饱和；AD 与注册表共用实现；MX 默认不穿过量化求导；序列化只接受纯数据。

**待定**：tape 是否跨运行 checkpoint；梯度内部累加用 f32 还是 f64；符号化简重写集合；是否支持 bfloat16/复数 AD/SVD 梯度；非 32 对齐 MX 补零还是拒绝（倾向补零 + logicalShape）。
