# 对话与消息

v1 wire contract 将 conversation 称为 **session**。session snapshot 是有界的产品投影，可包含对话元数据、有限消息、active run、pending pause、文件、delivery 和当前 event watermark；它不是无限历史数据库导出。

## Message 是异步 command

`POST /v1/sessions/{id}/messages` 接纳一条用户消息并返回 receipt。receipt 中的 `run_id`、`user_message_id` 和 `assistant_message_id` 是稳定标识；receipt 不代表答案已经生成完成。

需要完整历史时，使用单独的 cursor-paginated messages operation。分页 cursor 必须原样保存和回传，不能改成 offset，也不能跨 session 使用。

## 后续消息

把新的 message 提交到相同 session ID 即可继续对话。每一条新的逻辑消息都创建新的幂等 key；如果同一请求的响应不确定，则用原 key 和完全相同的语义重试。

## 当前 beta 边界

public wire contract 和 AG-UI projection 的 owner 是 `kokoro-bff`。contract 中有 operation 不等于 Conversation、Message、Share 的每条 live persistence 或 SLO 都已被证明；请把 receipt、snapshot、stream 和实际 health/ready 结果分别记录。
