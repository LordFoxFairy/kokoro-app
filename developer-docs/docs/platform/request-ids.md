# 请求 ID（Request ID）

请求ID由对应 operation 的 owner 契约定义，不等于资源ID、AG-UI replay cursor 或幂等key，不作为授权凭据。

| 当前接口 | 关联信息 |
| --- | --- |
| `GET /v1/skill.list` | body 顶层 `request_id`，header `X-Request-Id`，成功 `{ok, request_id, data}`。 |
| 本站 message/control 示例 | JSON envelope 的 `meta.request_id`。 |
| `GET /v1/sessions/{id}/events` | SSE 无JSON envelope，握手header为 `X-Kokoro-Request-Id`。 |

不要全局重命名这些字段或给全部响应补同一个包装。具体状态码、header、约束和是否接受调用方request ID，均看[生成Reference](/reference/v1/)的对应operation，不自造输入字段。

记录 operationId、HTTP status、耗时和返回的请求ID；凭据、用户完整消息、tool参数和provider payload默认脱敏。
