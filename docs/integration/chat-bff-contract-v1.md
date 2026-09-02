# Kokoro Chat BFF 契约 v1

状态：阶段 1 当前基线（2026-09-01）。

本文冻结 `kokoro` Web、`kokoro-bff` 和 `kokoro-agent` 三仓之间的 Chat 责任边界。
路径、字段和错误码属于 Kokoro 自己的 v1 契约；Manus API 文档只作为资源化、异步化、游标、
幂等和错误包络的设计参考，不直接复用其版本或内部字段。

## 1. 所有权和调用链

```text
浏览器
  → kokoro Web 同源 /api/session/*（兼容适配层，不是业务版本号）
  → kokoro-bff /v1/*（Chat 业务模块，唯一 Web 业务入口）
  → kokoro-agent 内部 Run/Control/Worker 契约
```

- `kokoro` 只负责页面、Composer、SessionEngine、SSE 消费和同源安全边界。
- `kokoro-bff` 的 Chat 业务边界负责 Chat 业务编排、身份投影、幂等、错误归一、Mock/Live
  选择和向 Agent 的内部适配；当前实现集中在 BFF 的 `src/main.ts`、`src/store.ts` 与
  `src/contracts.ts`，不是一个跨仓目录。
- `kokoro-agent` 只负责 Run、Control、HITL、事件、outbox 和 worker 执行，不暴露浏览器 HTTP API。
- `kokoro-gateway` 不在阶段 1 链路中；不新增独立 `kokoro-session` 或 `kokoro-chat` 仓库。
- Web、BFF、Agent 均不把另一个仓库的源码复制进来；跨仓只通过本契约和各自的内部 adapter。

## 2. BFF v1 通用包络

所有 BFF JSON 成功响应：

```json
{
  "data": { "sessions": [] },
  "meta": { "request_id": "req_01J..." }
}
```

所有 BFF JSON 错误响应：

```json
{
  "error": { "code": "run_not_active", "message": "Run is not active" },
  "meta": { "request_id": "req_01J..." }
}
```

`request_id` 由 Web 生成或继承入站值，BFF 必须原样回传并写入日志。Web 同源适配层只对成功响应
解包 `data` 为浏览器保留的 flat Chat DTO，并把 BFF `meta.request_id` 映射到公开的
`x-request-id` 响应头。错误响应不再 flatten：Web 必须保留 `error.code`、`error.message` 和
`meta.request_id` 的嵌套形状，并使用同一个 `x-request-id` 响应头。

Web route 自身产生的错误也使用同一错误包络：`message` 在没有更具体文案时等于稳定 `code`。
上游 BFF 的 HTTP 状态在 `400+` 时原样返回；`2xx` 携带错误包络或响应不符合成功契约时统一为
`502`；JSON 成功投影保持既有资源状态语义，Billing/Manifest 成功投影固定返回 `200`。429 等响应的
`Retry-After` 头按 allowlist 透传。

## 3. 身份和部署域名

Web 服务端从 HttpOnly `kokoro_session` envelope 派生以下 BFF 入站头：

```http
x-kokoro-service: web-bff
x-kokoro-internal-secret: <KOKORO_INTERNAL_SECRET_WEB_BFF>
x-kokoro-namespace: <sealed-session.namespace>
x-kokoro-principal-id: <trusted-principal-id>
x-kokoro-request-id: <request id>
```

浏览器不能选择 namespace、user、site 或部署域名。`KOKORO_DOMAIN` 只在服务端转换为标准
`Forwarded: host=<KOKORO_DOMAIN>`；不使用自定义 `X-Domain` 作为身份或路由依据。

## 4. Chat 资源

### 4.1 会话列表

```http
GET /v1/sessions?scope=direct&cursor=CURSOR
GET /v1/sessions?project_ref=PROJECT_REF&cursor=CURSOR
```

返回：`data.sessions[]` 为 `{session_id,title,updated_at}`，可选 `next_cursor`。
`scope=direct` 与 `project_ref` 是互斥的会话投影；项目引用是不透明值，BFF 不接受浏览器
传入 namespace/site 作为替代。

### 4.2 Snapshot 和消息

```http
GET  /v1/sessions/{SESSION_ID}
POST /v1/sessions/{SESSION_ID}/messages
```

消息请求的稳定字段：

```json
{
  "idempotency_key": "msg_01J...",
  "content": "请整理今天的更新",
  "project_ref": "project_kokoro",
  "model": "provider:model",
  "agent": "general",
  "thinking": false,
  "pinned_skills": [],
  "mcp_servers": []
}
```

`project_ref` 仅项目 Chat 发送；Direct Chat 不发送。成功数据为：
`{run_id,user_message_id,assistant_message_id}`。

### 4.3 SSE 事件和 Run control

```http
GET  /v1/sessions/{SESSION_ID}/events
POST /v1/sessions/{SESSION_ID}/runs/{RUN_ID}/control
```

SSE 使用既有 `SessionEvent` union；客户端通过 `Last-Event-ID` 发送最近确认的 `seq`，
BFF 不重排、不丢弃已持久化事件。Control body 使用 `run.cancel`、`run.resume` 或 `run.steer`，
通过标准 `Idempotency-Key` 幂等，成功返回 `202 Accepted` 和异步 control receipt。BFF 校验
`session_id` 与 `run_id` 的绑定后才调用 Agent adapter，并把外部 command identity 传入 Agent。

### 4.4 生命周期和只读投影

```http
PATCH  /v1/sessions/{SESSION_ID}/title
DELETE  /v1/sessions/{SESSION_ID}
POST   /v1/sessions/{SESSION_ID}/share
DELETE /v1/sessions/{SESSION_ID}/share
GET    /v1/models
GET    /v1/agents
GET    /v1/artifacts?cursor=CURSOR
GET    /v1/artifacts/{CONTENT_HASH}
```

文件和 delivery 仍属于 Chat 事实投影，若返回二进制，BFF 和 Web 适配层保持 body 流式，
不把内容整体读入内存。

## 5. 幂等、错误和重试

- 除 GET、HEAD 和明确的 GitHub preview 外，所有 mutation 必须带 `Idempotency-Key`。
- 幂等范围是 `namespace + method + canonical path + key`；相同请求重放第一次状态和响应。
- 同 key 不同请求体必须返回 `409 idempotency_conflict`，不能复用旧结果。
- 认证失败：`401 unauthenticated`；BFF service 凭据错误：`401/403 service_auth_failed`。
- 未配置业务上游：`503 upstream_not_configured`；不可达：`502 upstream_unreachable`。
- 上游返回非契约 JSON：`502 upstream_bad_response`；BFF 不把堆栈、SQL 或凭据回给 Web。
- 业务状态冲突使用 `409`，资源不存在使用 `404`，格式错误使用 `400`。

## 6. Mock/Live 和本地配置

阶段 1 本地默认：

```dotenv
KOKORO_BFF_MODE=mock
KOKORO_BFF_BASE_URL=http://127.0.0.1:4300
KOKORO_DOMAIN=dev.kokoro.localhost
```

Web 的 Chat 始终指向同源 `/api/session/*`，由 Web server route 使用
`KOKORO_BFF_BASE_URL` 转换到 `/v1/*`。`KOKORO_SESSION_BASE_URL` 不再是 Chat 的运行依赖，
只可出现在迁移测试或历史文档中；不能作为 Gateway fallback。

Mock 必须在 BFF 仓库内提供确定性 Chat 响应和 SSE fixture。Live 只将 BFF 的已冻结模块
替换为显式 upstream 或 Agent adapter，不改变 Web 路径和 v1 JSON 形状。

## 7. 三仓验收顺序

1. BFF：OpenAPI、mock 路由、幂等冲突、错误归一、Chat SSE 和 `readyz` 测试通过。
2. Agent：Run control session 绑定、outbox 修复、resume/HITL、模型 allowlist 和 worker 测试通过。
3. Web：同源 route、BFF envelope 解包、SSE 续流、Composer 发送和项目 scope 测试通过。
4. 启动 BFF mock 与 Web dev，访问 `http://dev.kokoro.localhost:3000/app`，完成 Direct Chat、
   项目 Chat、刷新重连、control 和错误态验收。
