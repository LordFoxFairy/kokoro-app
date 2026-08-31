# Kokoro Gateway 边界契约 v1

状态：规划基线（2026-08-31）。Gateway = **planned / not current / not created or deployed**。
本文只描述 `kokoro-app` 当前已经存在的 Web 边界，以及未来统一业务/网关子仓库的拆分方式；
当前 live upstream 仍由 `KOKORO_SESSION_BASE_URL` 配置，不是规划中的 gateway。

## 1. 为什么 Chat 由 Gateway 承接

`kokoro-app` 是独立的产品 Web 子仓库，负责桌面 UI、Composer、胶囊、会话状态投影和同源
BFF 传输。Chat 的业务编排不应继续堆在页面组件，也不应让浏览器直接访问 Session/Agent
内部服务。

```text
当前：
浏览器 → same-origin kokoro-app: /api/session/*
       → server-only BFF → KOKORO_SESSION_BASE_URL

规划迁移：
浏览器 → same-origin kokoro-app: /api/session/*（保持不变）
       → server-only BFF/upstream adapter
       → planned LordFoxFairy/kokoro-gateway
       → Session / Agent runtime
```

建议仓库名暂定为 `LordFoxFairy/kokoro-gateway`。它是 proposed repository，不是当前
checkout 的子目录、当前 upstream 或 `kokoro-app` 的 workspace package，也不表示远端仓库已创建。第二个真实产品接入时，
由网关承接跨产品的通用业务规则；每个 Web 产品仍保留自己的 UI、路由和品牌配置。

## 2. 当前实现与目标状态

| 项目 | 状态（2026-08-31） |
|---|---|
| `kokoro-app` 同源 Session BFF | **current**；转发到 `KOKORO_SESSION_BASE_URL` |
| `kokoro-gateway` | **planned**；未作为当前 upstream 接入 |
| Agent 独立 surface | Preview closed；Live not closed（client target 无 BFF route） |
| Scheduled 独立 surface | Preview closed；Live not closed（未注入 adapter） |

### 当前已实现

- 浏览器只调用 `/api/session/*`；当前同源 BFF 将请求转发到
  `KOKORO_SESSION_BASE_URL`。
- Session BFF 负责 origin 检查、HttpOnly sealed session、Bearer 注入、服务身份、
  `Forwarded`、允许的请求头、SSE/二进制流透传和错误状态保持。
- `src/engine/client.ts` 使用稳定的 Session client 接口，页面不依赖内部 upstream URL。

### 规划中的 gateway 接入

- 将当前 BFF 后面的业务 upstream 替换为 gateway；浏览器路径优先保持不变。
- Gateway 统一处理跨产品认证上下文、权限、业务校验、幂等、错误码、request id、审计、
  SSE 连接和 Session/Agent runtime 编排。
- Gateway 再向 Session/Agent runtime 发起受信任的服务间请求；runtime 只执行模型、工具、
  Run 和事件，不承担 Web 页面适配。

未完成项必须明确标记：在 gateway 仓库尚未实现前，当前 Web 的 Preview Chat 可以闭环，
Live Chat 仍取决于 `KOKORO_SESSION_BASE_URL` 对应服务；Agent/Scheduled 的独立页面只在各自
Preview fixture 下闭环，不能把该 Preview 闭环写成 Live backend 已接通。本文不把规划目标写成 Live 已完成。

## 3. Chat 浏览器契约

浏览器契约固定为 `/api/session` 前缀。`{session_id}`、`{run_id}` 和 `project_ref` 都是
不透明引用，不代表租户、站点或 namespace。

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/session/sessions?scope=direct&cursor=CURSOR` | 获取直接会话列表 |
| `GET` | `/api/session/sessions?project_ref=PROJECT_REF&cursor=CURSOR` | 获取项目会话列表 |
| `POST` | `/api/session/sessions/{session_id}/messages` | 创建用户消息并启动/续接 Run |
| `GET` | `/api/session/sessions/{session_id}` | 获取会话快照 |
| `GET` | `/api/session/sessions/{session_id}/events` | 订阅 SSE 事件 |
| `POST` | `/api/session/sessions/{session_id}/runs/{run_id}/control` | 取消、暂停或恢复 Run |
| `PATCH` | `/api/session/sessions/{session_id}/title` | 修改会话标题 |
| `DELETE` | `/api/session/sessions/{session_id}` | 删除会话 |
| `GET` | `/api/session/models` | 获取模型列表 |
| `GET` | `/api/session/agents` | 获取 Agent 预设 |
| `GET` | `/api/session/artifacts` | 获取 Library 成果列表 |

Direct Chat 与项目 Chat 共用上表中除列表 scope 外的全部 endpoint、flat response、SSE event union
和 control body。Direct 清单使用 `scope=direct`（缺省也为 direct）；项目清单使用
`project_ref=PROJECT_REF`。项目消息请求必须带同一 opaque `project_ref`，Direct 消息请求不带；
snapshot、SSE envelope 和 cancel/resume body 均不重复携带该 scope。

### Message request

```json
{
  "idempotency_key": "IDEMPOTENCY_KEY",
  "content": "用户输入内容",
  "model": "MODEL_NAME",
  "agent": "AGENT_NAME",
  "thinking": true,
  "pinned_skills": ["SKILL_NAME"],
  "mcp_servers": ["MCP_SERVER_NAME"],
  "project_ref": "PROJECT_REF"
}
```

服务端返回扁平的 receipt，不套 Hub 的 `{data: ...}` 包络：

```json
{
  "run_id": "RUN_ID",
  "user_message_id": "MESSAGE_ID",
  "assistant_message_id": "MESSAGE_ID"
}
```

同一个 `idempotency_key` 在业务作用域内重复提交必须返回同一 receipt，不能创建第二个 Run。
网关负责幂等记录和超时恢复；Web 只生成请求级 key，不保存服务端 secret。

### SSE 与 HITL

`GET /events` 使用 `Accept: text/event-stream`，支持 `Last-Event-ID` 续接。事件名沿用当前
Session union，例如 `session.created`、`run.created`、`message.delta`、
`tool.awaiting_approval`、`tool.returned`、`run.completed` 和 `run.failed`。网关不得把
SSE 聚合成一次性 JSON；断线重连依靠 event watermark/Last-Event-ID 去重。

当前浏览器 control schema 只有两种 body：

```json
{"kind":"run.cancel","decision_id":"DECISION_ID"}
```

```json
{
  "kind":"run.resume",
  "decision_id":"DECISION_ID",
  "decisions":[
    {"type":"approve","tool_id":"TOOL_ID"},
    {"type":"edit","tool_id":"TOOL_ID","args":{}},
    {"type":"reject","tool_id":"TOOL_ID","reason":"REASON"},
    {"type":"respond","tool_id":"TOOL_ID","response":"RESPONSE"},
    {"type":"submit","request_id":"REQUEST_ID","value":{"field":"VALUE"}}
  ]
}
```

`run.resume.decisions` 至少一项；`submit.value` 是结构化 object。HITL approval/input 通过
`run.resume` 的 decision 表达，当前不存在独立浏览器 `run.pause` 或 approval endpoint。
等待、过期和重复 resume 的冲突会以当前 Session contract 的稳定错误语义返回，包括
`run_not_active`、`no_pending_pause` 和 `session_deleted`；其它状态/响应仍由 BFF 原样保持。

## 4. 责任矩阵

| 能力 | `kokoro-app` | `kokoro-gateway`（规划） | Session/Agent runtime |
|---|---|---|---|
| 页面、Composer、胶囊、导航、响应式 | 负责 | 不负责 | 不负责 |
| 同源 `/api/session/*` | 暴露浏览器入口并保持契约 | 提供业务 upstream | 不直接暴露给浏览器 |
| 登录信封与请求来源 | 只发送同源 cookie；不读内部 token | 解析受信身份并做权限/域名校验 | 执行 runtime 级授权 |
| 消息、Run、SSE、HITL | 调用契约并渲染状态 | 业务编排、幂等、错误映射、审计 | 模型/工具执行和事件产生 |
| Skills/MCP/Project 业务规则 | 展示与提交 public contract | 跨产品编排和授权 | 运行时消费配置 |
| 数据库、队列、内部凭据 | 不持有 | 负责网关侧业务存储/凭据边界 | 负责执行侧状态 |

## 5. 域名、认证与 header

- `KOKORO_DOMAIN` 是每个部署自己的 server-only hostname，例如 `dev.kokoro.localhost`；
  浏览器不把它当 selector，也不把它写入 body、localStorage 或公开 UI 状态。
- Web BFF 删除浏览器可控的 `Host`、`Forwarded`、`X-Forwarded-*`、`X-Domain`、旧
  tenant/site header，再生成唯一的 RFC 7239：

  ```http
  Forwarded: host=<KOKORO_DOMAIN>
  ```

- Gateway 只信任来自 Web BFF/受信网络路径的 `Forwarded` 和服务身份；不能信任浏览器
  自行提交的同名 header。
- `Forwarded` 只存在于 BFF → upstream 的服务端 wire，不进入浏览器请求/响应；浏览器伪造同名
  header 由 BFF 丢弃。`x-kokoro-namespace` 同样是服务端请求头；已声明的 Hub public response
  可以向浏览器返回 `namespace` 展示投影，但它不能作为入站身份或 scope 选择器。Authorization、
  runtime JWT、workload token、internal secret 和内部 tenant id 不进入浏览器响应、URL、cookie、
  localStorage 或 shared package 的 runtime 值。
- 浏览器只携带 HttpOnly session cookie；跨服务凭据在 BFF/Gateway server-only 边界注入。

## 6. 仓库与 shared package 边界

`kokoro-app` 内不引入 `src/site`、其它产品源码、跨仓库相对路径或 git submodule。未来
gateway 是独立部署单元，不作为 Web 的 `file:` 依赖或 workspace 子目录引入。

若确实需要共享 package，内容仅限：

- TypeScript request/response 类型；
- Zod schema 和 SSE event name 常量；
- 浏览器安全的 client interface；
- 版本化 API contract 与错误码常量。

以下内容必须留在 gateway/runtime 仓库：数据库模型、业务规则、服务端 adapter、密钥、
JWT/workload token、内部 URL、队列实现和部署凭据。Web 更新 shared package 后，仍须在本仓库
独立完成 lint、test、typecheck、build 和桌面交互验收。

## 7. 迁移验收

1. **Planned migration only**：先在 gateway 提供与本文件第 3 节兼容的 Session upstream；在此之前保持当前 `KOKORO_SESSION_BASE_URL` 直连。
2. 将 `KOKORO_SESSION_BASE_URL` 指向 gateway，保持浏览器仍访问 `/api/session/*`。
3. 验证消息幂等：刷新、重复点击发送、SSE 断线重连都不产生重复 Run。
4. 验证 `Forwarded` 只有一份且来自 `KOKORO_DOMAIN`，浏览器伪造 `X-Domain` 不生效。
5. 验证 JSON、SSE、artifact 下载、HITL cancel/resume、401/403/409/5xx 错误保持语义。
6. 通过后再把 gateway 从 planned 标记为 live，并在本契约文档中记录实际版本和部署绑定。
