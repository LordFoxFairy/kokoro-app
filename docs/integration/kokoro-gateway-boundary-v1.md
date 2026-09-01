# Kokoro Gateway 边界契约 v1

状态：实施基线（2026-08-31）。Gateway = **independent compatible service / deployment optional**。
本文描述 `kokoro-app` 当前 Web 边界、独立统一业务网关的承接方式和实际迁移开关；当前 checkout
是否经过 Gateway 仍由 server-only 环境变量决定，本文不把未部署的真实 upstream 写成已上线。

## 1. 为什么 Chat 由 Gateway 承接

`kokoro-app` 是独立的产品 Web 子仓库，负责桌面 UI、Composer、胶囊、会话状态投影和同源
BFF 传输。Chat 的业务编排不应继续堆在页面组件，也不应让浏览器直接访问 Session/Agent
内部服务。

```text
当前：
浏览器 → same-origin kokoro-app: /api/session/*
       → server-only BFF → KOKORO_SESSION_BASE_URL

Gateway 接入（浏览器路径保持不变）：
浏览器 → same-origin kokoro-app: /api/session/*（保持不变）
       → server-only BFF/upstream adapter
       → LordFoxFairy/kokoro-gateway /sessions/*
       → Session runtime
```

Web 侧以单一 server-only `KOKORO_GATEWAY_BASE_URL` 作为推荐接入开关；该值是 Gateway
authority root，不包含 `/sessions` 等 namespace。未显式设置的各 `KOKORO_*_BASE_URL` 使用
这个 root，由 Web BFF 在 path 上拼接 Gateway namespace；显式服务地址可用于灰度迁移。

独立仓库为 [`LordFoxFairy/kokoro-gateway`](https://github.com/LordFoxFairy/kokoro-gateway)。它不是当前
checkout 的子目录、`kokoro-app` 的 workspace package 或页面代码。Gateway 已具备 Chat/Session
兼容面及 Hub/User/System/Agent/Payment/Billing 的可选 server-only namespace；真实生产接入仍需
按部署环境完成 upstream、ACL、secret 和 SSE/HITL/artifact 联调。每个 Web 产品仍保留自己的 UI、
路由和品牌配置。

## 2. 当前实现与目标状态

| 项目 | 状态（2026-08-31） |
|---|---|
| `kokoro-app` 同源 Session BFF | **current**；转发到 `KOKORO_SESSION_BASE_URL`，未覆盖时由 `KOKORO_GATEWAY_BASE_URL` 提供默认值 |
| `kokoro-gateway` | **compatible**；独立仓库已创建，是否接入由 Web server-only env 决定 |
| Agent 独立 surface | Preview closed；Web 已提供 `/api/agents/connections/setup` BFF；Live conditional on Agent upstream |
| Scheduled 独立 surface | Preview closed；Web/BFF live adapter 已注入；上游 scheduled capability pending |

### 当前已实现

- 浏览器只调用 `/api/session/*`；当前同源 BFF 将请求转发到
  `KOKORO_SESSION_BASE_URL`，或在统一配置下转发到 Gateway 的 `/sessions/*`。
- Chat 接入 Gateway 时仍只替换 Web BFF 后面的 upstream：`/api/session/*` 对应 Gateway 的
  `/sessions/*`；不新增浏览器 `/chat/*`，Direct/Project Chat 不分叉 transport。
- Gateway 另提供可选的 `/hub/*`、`/auth/*`、`/bff/*`、`/system/*`、`/connections/*`、
  `/payment/*`、`/billing-service/*` namespace；这些只存在于 Web BFF 与 Gateway 的服务网络。
- Session BFF 负责 origin 检查、HttpOnly sealed session、Bearer 注入、服务身份、
  `Forwarded`、允许的请求头、SSE/二进制流透传和错误状态保持。
- `src/engine/client.ts` 使用稳定的 Session client 接口，页面不依赖内部 upstream URL。

### Gateway 接入开关

- 将当前 BFF 后面的业务 upstream 按 namespace 替换为 Gateway；浏览器路径保持不变。
- Gateway 统一处理跨产品认证上下文、权限、业务校验、幂等、错误码、request id、审计、
  SSE 连接和 Session/Agent runtime 编排。
- Gateway 再向 Session/Agent runtime 发起受信任的服务间请求；runtime 只执行模型、工具、
  Run 和事件，不承担 Web 页面适配。

未完成项必须明确标记：当前 Web 的 Preview Chat 可以闭环；关闭 preview 后，Live Chat 仍取决于
`KOKORO_SESSION_BASE_URL` 指向的服务（直连 Session 或 Gateway）。Agent setup 的实际连接仍取决于
`KOKORO_AGENT_BASE_URL`，Scheduled live 仍取决于 Hub scheduled capability。本文不把 Web/BFF
配置存在写成 backend 已部署。

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
| `POST` | `/api/session/sessions/{session_id}/runs/{run_id}/control` | 取消或恢复 HITL Run |
| `PATCH` | `/api/session/sessions/{session_id}/title` | 修改会话标题 |
| `DELETE` | `/api/session/sessions/{session_id}` | 删除会话 |
| `GET` | `/api/session/models` | 获取模型列表 |
| `GET` | `/api/session/agents` | 获取 Agent 预设 |
| `GET` | `/api/session/artifacts` | 获取 Library 成果列表 |
| `GET` | `/api/session/billing/summary` | 获取计费摘要（与 Chat 共用 Session BFF 基址） |
| `GET` | `/api/session/billing/ledger` | 获取计费流水 |
| `GET` | `/api/session/billing/by-model` | 获取模型维度用量 |

Direct Chat 与项目 Chat 共用上表中除列表 scope 外的全部 endpoint、flat response、SSE event union
和 control body。Direct 清单使用 `scope=direct`（缺省也为 direct）；项目清单使用
`project_ref=PROJECT_REF`。项目消息请求必须带同一 opaque `project_ref`，Direct 消息请求不带；
snapshot、SSE envelope 和 cancel/resume body 均不重复携带该 scope。

`project_ref` 在 Web 路由中是一个编码后的 path segment：`kokoro-app` 先解码一次得到原始
引用，再由链接和 `URLSearchParams` 在 wire 上编码一次。Gateway/Session 侧只接收解码语义对应的
opaque 引用；调用方不要把已经编码的值再次交给 Web route adapter。

Gateway 兼容阶段必须注册 `/billing/*`，因为 Web 的 billing client 通过同一个
`/api/session` BFF 发起上述三个读取请求。Gateway 只转发这些读取，不在本阶段复制计费事实或
业务规则。

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

| 能力 | `kokoro-app` | `kokoro-gateway`（independent compatible layer） | Session/Agent runtime |
|---|---|---|---|
| 页面、Composer、胶囊、导航、响应式 | 负责 | 不负责 | 不负责 |
| 同源 `/api/session/*` | 暴露浏览器入口并保持契约 | 提供业务 upstream | 不直接暴露给浏览器 |
| 登录信封与请求来源 | 只发送同源 cookie；可带关联用 request id；不读内部 token | 解析受信身份并做权限/域名校验 | 执行 runtime 级授权 |
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
  header 由 BFF 丢弃。`x-kokoro-namespace` 同样是服务端请求头，仅在 Hub/Agent 等声明需要
  workspace scope 的 Gateway bounded context 中按路由 allowlist 转发；Session Chat 的
  `/sessions/*` 默认删除这类 principal header。已声明的 Hub public response 可以向浏览器返回
  `namespace` 展示投影，但它不能作为入站身份或 scope 选择器。Authorization、runtime JWT、
  workload token、internal secret 和内部 tenant id 不进入浏览器响应、URL、cookie、localStorage
  或 shared package 的 runtime 值。
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

1. **Compatibility migration**：使用 Gateway 的合成 Session upstream 先验证本文件第 3 节契约；本地 preview 仍可保持 `KOKORO_SESSION_BASE_URL` 直连或不配置。
2. 将非生产的 `KOKORO_GATEWAY_BASE_URL` 指向 Gateway；Web BFF 的 Session、Hub、System、Agent、Payment 和独立 Billing 基址会自动使用对应 Gateway namespace，保持浏览器仍访问 `/api/*`。
3. 验证消息幂等：刷新、重复点击发送、SSE 断线重连都不产生重复 Run。
4. 验证 `Forwarded` 只有一份且来自 `KOKORO_DOMAIN`，浏览器伪造 `X-Domain` 不生效。
5. 验证 JSON、SSE、artifact 下载（包括 `content-length` / `content-disposition`）、billing 读取、HITL cancel/resume、401/403/409/5xx 错误保持语义；上游网络失败或超时统一为 `502 {"error":"session_unreachable"}`。
6. 通过后才把对应部署标记为 live，并在本契约文档中记录 Gateway 版本、真实 upstream 和部署绑定；其它未联调 namespace 继续保持 optional。
