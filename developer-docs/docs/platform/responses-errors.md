# 响应与错误 envelope

字段级 response shape 的唯一事实源是 pinned BFF public OpenAPI；本页只说明常见读取方式。JSON 成功通常采用：

```json
{
  "data": {},
  "meta": { "request_id": "req_example" }
}
```

JSON 错误通常采用：

```json
{
  "error": {
    "code": "stable_error_code",
    "message": "Log-safe message"
  },
  "meta": { "request_id": "req_example" }
}
```

## 客户端处理

程序应依据 HTTP status、`error.code` 和该 operation 的生成 response schema 做分支。`message` 是诊断文本，不是稳定的本地化 key；`details` 或其他可选字段出现时，先按 schema 校验再读取。不要把未知 error code 当成成功。

AG-UI SSE operation 不是 JSON success envelope；握手 response 的 request correlation header 是 `X-Kokoro-Request-Id`，随后每个 frame 遵循 AG-UI/SSE 形状。

## 明确的 contract 例外

`GET /v1/skill.list` 成功使用 `{ok: true, request_id, data}`，失败使用 `{ok: false, request_id, error}`，相关响应头为 `X-Request-Id`。不要为接入它再套一层 `meta`，也不要把这个规则推广到仍声明 `meta.request_id` 的 session command 或 SSE。

`GET /readyz` 在依赖未就绪时返回 `503 HealthResponse`，不是 `ErrorEnvelope`。这是 canonical contract 明确的 probe 例外；不要仅凭 status `503` 就强制解析 `error.code`。其他 operation 的成功/失败 schema 请打开对应生成页核对。

本页的 JSON 片段是阅读示意，不新增字段，也不替代 generated schema。字段变化先由 BFF owner 更新 artifact，再由门户重新生成。
