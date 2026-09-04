# Kokoro User Web 数据模型与 Owner

状态：当前数据边界，2026-09-03。

## 1. Web 无业务数据库 Owner

`kokoro` 不拥有业务数据库、数据库 schema、migration、ORM entity、Redis logical DB 或服务端
repository。本仓没有 `database/` 目录，也不应新增 `db:apply-schema`。

Web 只拥有展示和浏览器交互状态。任何需要跨浏览器、跨设备、审计、恢复、授权或服务端并发控制的
事实都必须由后端 owner 持久化，并通过版本化 contract 返回 Web。

| 事实 | Owner |
| --- | --- |
| Conversation、Message、Share、Project、ScheduledTask、public AG-UI projection | `kokoro-bff` |
| Run、Checkpoint、Lease、Tool Journal、HITL、执行事件、Evidence | `kokoro-agent` |
| Tenant、Identity、Authentication、Authorization、Role、Permission、Audit | `kokoro-iam` |
| Site、Host、Workspace、Runtime Manifest、System Policy | `kokoro-system` |
| Model Catalog、Provider Metadata、Routing Policy | `kokoro-model` |
| Payment、Subscription、Credit、Ledger、Metering | `kokoro-billing` |
| Skill、MCP、Installation、Capability Authorization | `kokoro-capability` |
| Blob、Upload、Asset、Artifact、Scan | `kokoro-storage` |
| Schedule、Occurrence、Lease、Retry、Dispatch | `kokoro-scheduler` |

Web 不复制这些表、DTO 或状态机，也不通过数据库 JOIN 获取跨 owner 数据。

## 2. Web 持有的数据类别

### 2.1 Server-side cookie

| 名称 | 内容与用途 | 生命周期 | 安全属性 |
| --- | --- | --- | --- |
| `kokoro_session` | AES-256-GCM sealed envelope；含 runtime credential、refresh token、user/namespace 和过期时间 | 对齐 refresh expiry；支持多密钥解封轮换 | HttpOnly、SameSite=Lax、Path=/；production Secure |
| `kokoro_auth_nonce` | magic-link 请求与消费设备绑定 nonce | 当前实现 900 秒 | HttpOnly、SameSite=Lax；production Secure |
| `sidebar_state` | 非敏感 Rail 展开偏好 | 当前实现 7 天 | 浏览器可读 UI cookie，不是身份依据 |

`kokoro_session` 中的 namespace/user 只在 Web server 解封后用于构造上游受信上下文；浏览器脚本不能
读取。它是 Web session transport，不改变 IAM/BFF 对认证与授权事实的 owner 地位。

### 2.2 localStorage

当前可见类别：

| 类别 | 示例 key | 语义 |
| --- | --- | --- |
| UI preference | `kokoro.theme`、`kokoro.locale`、`kokoro.web.chat-prefs`、`kokoro.web.pinned_skills` | 本浏览器偏好，可清除、可重建 |
| Draft/local projection | `kokoro.web.drafts`、`kokoro.web.conversations`、`kokoro.web.process-disclosure` | 编辑草稿或有限 UI 索引；不是 Message/Conversation 事实源 |
| Preview fixture | `kokoro.preview.sessions.v1`、`kokoro.preview.scheduled-tasks` | local/test 合成数据；production 不启用 |
| Preview project state | `kokoro.preview.project.<ref>.instructions` 等 | 合成项目编辑状态；不是跨设备 Project 事实 |

规则：

- 不保存 access token、refresh token、internal secret、service URL、tenant/site selector 或支付凭据。
- 外部 JSON 必须在读取后以 `unknown` 经 Zod/显式检查校验；坏数据降为空态或明确错误。
- 用户登出、共享设备处置与 preview 重置要考虑清理非必要草稿；当前没有统一的隐私清理流程，属于缺口。
- localStorage 不参与授权、幂等、durable replay 或审计。

### 2.3 sessionStorage 与 URL

- `sessionStorage` 承载一次性 project draft handoff、creation intent 和 preview sequence；关闭 tab 后失效。
- URL/query/hash 承载可导航 surface、project/conversation 引用和非敏感筛选状态。
- magic-link token 当前会进入 callback URL；route 必须避免 referrer 泄漏并在消费后重定向清除。
- runtime JWT、refresh token、internal secret、tenant/site 不进入 URL。

### 2.4 内存状态

React state、query resource store、Chat engine 和 optimistic receipt projection 都是进程内/标签页内状态。
刷新后必须从 URL、browser preference 或 BFF snapshot/event 恢复，不能把未持久化内存状态当成功事实。

## 3. Chat 数据投影

```text
BFF snapshot + command receipt + durable AG-UI events
  -> Web contract validation
  -> UIMessage parts / reducer projection
  -> React view state
```

- BFF cursor 是唯一网络 replay axis。
- Web 可缓存最大已确认 cursor，但不成为 ledger owner。
- optimistic user message 只有在 receipt/event reconciliation 后才收敛为服务端状态。
- `SessionEvent` 是当前内部 reducer shape，迁移完成后不得继续作为独立 wire contract。

## 4. 时间、标识与分页

- 服务端 timestamp 使用 RFC 3339 UTC，例如 `2026-09-03T12:34:56.123Z`；Web 只在展示层本地化。
- opaque ID 不解析业务含义，不拼装 tenant 或 owner 信息。
- 列表使用 BFF opaque cursor；Web 不把数据库 offset 暴露为长期协议。
- 同一毫秒内的顺序由服务端 cursor/sequence 与稳定 ID 决定，不用浏览器时钟裁决事实顺序。

## 5. Retention 与删除

| 数据 | Retention owner | Web 行为 |
| --- | --- | --- |
| 服务端业务事实/事件 | 对应后端 owner | 发出删除/撤销 command，并依据 receipt/event 更新 UI |
| HttpOnly session | IAM/Web session policy | logout 清 cookie并请求服务端吊销；失败需要记录并靠 expiry 兜底 |
| UI preference/draft | Web | 用户清除浏览器数据或产品提供的清理动作 |
| Preview fixture | Web local/test | 可直接删除对应 browser key；不得作为 live 删除证据 |

当前缺少统一 browser-data inventory 自动测试、logout 后草稿清理策略和用户可见数据清理入口；这些是隐私
与产品决策项，不通过新增 Web 数据库解决。
