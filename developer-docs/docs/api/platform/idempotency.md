# 幂等性

每个 operation 页都会从 canonical metadata 展示 `x-kokoro-idempotency`：`required` 的 mutation 需要 `Idempotency-Key`；`none` 的 operation 不声明该key；`inherent` 表示owner明确声明的资源级自然幂等，也不声明该key，不由HTTP动词推断。这个清单由 BFF artifact 生成，不由手写页面维护。

`inherent` 的当前例子是当前租户积分账户的显式 PUT 初始化：不等于任意 GET 可以写库，不改变实际余额或授予执行权限。未知回执先按operation约定读取核实，不因自然幂等就自动重发请求；retryable与重试策略仍受该operation契约和预算限制。

## Key 生命周期（仅 required）

1. 在第一次尝试前为一条逻辑 mutation 创建 key。
2. 将 key 与完整请求语义一起持久保存到本地 command 状态。
3. timeout、disconnect 或可重试 response 后，使用相同 key 和不变请求重试。
4. 结果确定后回收该 key；不要把它复用于无关 command。

`idempotency_conflict` 表示同一个作用域的 key 被用于不同语义；`idempotency_in_progress` 表示另一次尝试仍在处理。前者应修正 command 绑定，后者可用有界 backoff 重试原请求。

幂等 admission 不会自动让 UI reducer、文件处理或未来 webhook consumer 幂等；这些消费者仍需依靠稳定的资源和事件 ID。当前 fingerprint 的实际覆盖范围属于实现细节，调用方应保持 method、URL、query、选定 header 和 body 全部稳定。
