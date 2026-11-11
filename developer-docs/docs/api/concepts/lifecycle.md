# 生命周期与状态

Kokoro 暴露多个相关但独立的状态机。客户端不要把它们压成一个 enum，也不要从一个 projection 推断另一个 projection 的状态。

## Run status

```text
running ── awaiting approval ──> waiting
   │                              │
   │                              └─ run.resume ─> running
   ├─ run.cancel ─> cancelled
   ├─ success ─> completed
   └─ failure ─> failed
```

当前 `ChatRun` schema 暴露 `running`、`waiting`、`completed`、`cancelled` 和 `failed`。最初的 `202` receipt 只表示 admission；后续 snapshot 或 AG-UI frame 才确认状态。

## Message status

Assistant message 可以从 `pending` 到 `streaming`，再到 `completed` 或 `failed`。在 message-end 或终态 frame 提交前，partial content 应标记为 provisional。

## Control receipt status

control command 有独立的 `pending`、`succeeded`、`failed` receipt。这描述 command processing，不是 Agent run 的整体状态。

## Scheduled task status

scheduled task 暴露 `active`、`paused`、`failed`，另有 `enabled` flag 和可选 expiry。某次 occurrence 启动的 run 不能反推 scheduled task 本身的生命周期。

这些状态集合、大小写和必填字段均由 BFF public artifact 生成；本页图示只是阅读辅助。
