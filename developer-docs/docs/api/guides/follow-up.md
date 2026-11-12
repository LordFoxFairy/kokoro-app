# 在对话中继续

本页是[受信第一方服务端参考](/api/authentication)，不代表外部 API Key 可调用此任务接口。

后续 turn 使用前一轮相同的 session ID 和 message operation。

1. 等待当前 run 进入终态；若决定停止，先按[取消 run](./cancel-run)处理。
2. 向相同 session 提交新的 message。
3. 为新的逻辑 message 生成新的 idempotency key。
4. 从最后确认的 AG-UI cursor 重新打开 session event stream。

不要把第一条 message 的 key 用于不同 content。相同作用域的 key 配上不同请求语义应当被视为 `idempotency_conflict`，而不是新 turn。

当前固定合同的 RunControl 只声明取消和恢复，不声明 `run.steer`。修改执行中工作的产品交互不等于新增一个公开 control command；不要把未声明的 kind 发到这个接口。
