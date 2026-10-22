# 异步 Agent run

当 message operation 返回 `202 Accepted` 时，run 已被接纳。保存返回的 `run_id`，在控制 command 的路径中与 session ID 一起使用；进度和终态通过 session event stream 观察。

## 为什么 admission 与完成分开

模型和 tool 工作可能超过一次 HTTP 请求的生命周期。receipt 只确认接纳与稳定身份，AG-UI frame 才传达进度、等待交互和完成。这使 retry、cancel、resume 与 reconnect 都成为明确的客户端状态。

## Control command

当前 `RunControlRequest` 是按 `kind` 区分的 union：

- `run.cancel` 请求停止活跃 run；
- `run.resume` 提交等待交互所需的 decisions；
- `run.steer` 携带 message ID 和新 instruction 来调整工作。

control operation 的 canonical idempotency 标为 `required`，并返回独立的 control receipt。`pending`、`succeeded`、`failed` 描述 command 处理状态，不是整个 Agent run 的终态。

## 终态观察

`RUN_FINISHED` 表示成功完成，`RUN_ERROR` 表示失败。传输断开不代表业务终态；使用最后确认的 AG-UI cursor 重连。当前 live adapter 是否已提供完整行为，仍以实际部署的 smoke/health 证据为准。
