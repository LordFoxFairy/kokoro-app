# 速率限制与重试

## 当前 contract 事实

当前 public artifact 已声明部分 IAM admission 的 `429` 与 `Retry-After`；出现在哪些 operation、响应格式及header约束，以[生成Reference](/reference/v1/)为准。并未发布全站统一的 numeric quota，不把某次观测阈值当作公开配额。

## 客户端策略建议

下表是调用方建议，不属于新增服务端契约。

| 情况 | 建议 |
| --- | --- |
| 安全read的暂时性5xx | 在总预算内有界backoff和jitter，传播取消。 |
| 明确429 | 按该operation的 `Retry-After` 与总预算处理；缺失/坏值不猜无限等待。 |
| mutation响应未知 | 先确认接口的恢复语义；有幂等key时保留原key和完全相同body，不另发新意图。 |
| `idempotency_in_progress` | 有界等待后恢复同一command。 |
| `idempotency_conflict` | 停止补发，检查原key与意图绑定。 |
| validation/auth/not-found类4xx | 修正请求或权限，不无限循环。 |

每次重试仍核当前身份和对象权限。`Idempotency-Key` 是否需要由owner metadata及参数声明决定，不按POST/PUT等动词自行推断；CAS或明确无幂等键的操作遵守自身契约。
