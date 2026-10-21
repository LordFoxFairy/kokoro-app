# 在对话中继续

后续 turn 使用前一轮相同的 session ID 和 message operation。

1. 等待 active run 进入终态，或明确决定 steer 当前 run。
2. 向相同 session 提交新的 message。
3. 为新的逻辑 message 生成新的 idempotency key。
4. 从最后确认的 AG-UI cursor 重新打开 session event stream。

不要把第一条 message 的 key 用于不同 content。相同作用域的 key 配上不同请求语义应当被视为 `idempotency_conflict`，而不是新 turn。

如果目的是修改仍在执行的工作，而不是添加下一条对话消息，则使用 `run.steer`，并携带稳定的 `message_id` 与非空 `content`；是否接受该 command 仍由当前 run 状态决定。
