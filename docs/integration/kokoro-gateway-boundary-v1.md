# Kokoro Gateway 边界契约 v1（历史归档）

> **历史文档，不是当前运行时、部署或接入入口。** 本文保留早期 Gateway 兼容层的设计考古，避免旧决策失去上下文；当前实现统一以 [`business-bff-contract-v1.md`](./business-bff-contract-v1.md) 和 [`user-web-api-contract-v4.md`](./user-web-api-contract-v4.md) 为准。

## 1. 当前结论

阶段 2 的正式拓扑只有：

```text
浏览器
  → kokoro-app（Web，同源 /api/*）
  → kokoro-bff（Chat + 业务编排，/v1/*）
  → owner repos（IAM / System / Model / Billing / Capability / Storage / Scheduler）

kokoro-bff（Chat 业务边界）
  → kokoro-agent（内部 Run/Control/Worker 契约）
```

- `kokoro-bff` 是当前业务层，不是 Gateway 的替代部署别名；Chat 属于 BFF 的 Chat 业务边界，不再创建独立 `kokoro-chat` 或 `kokoro-session` 运行仓。
- `kokoro-app` 只保留同源 Web route adapter。浏览器不直连 BFF、Agent 或 owner repo，也不携带服务间凭据。
- `kokoro-gateway` 已退出当前拓扑；其仓库、环境变量、CI、Docker 和部署入口都不属于当前阶段 2 闭环。
- Credit 是 `kokoro-billing` 内部 bounded context；Scheduler 是独立 Go owner；阶段 2 的存储基线是 PostgreSQL + Redis，Storage 的对象字节使用 S3-compatible ObjectStore。

当前接口、错误包络、幂等、SSE 和 owner 路由请直接阅读 [`business-bff-contract-v1.md`](./business-bff-contract-v1.md)。Web 浏览器路径与 BFF v1 的映射请阅读 [`user-web-api-contract-v4.md`](./user-web-api-contract-v4.md)。

## 2. 历史设计保留范围

早期方案曾将 `kokoro-gateway` 设计为独立 compatible layer，并尝试让它承接 `/sessions/*`、`/hub/*`、`/billing/*` 等 namespace。这个方案只说明当时为什么保留浏览器 `/api/*` 路径，以及为什么要把服务端认证、幂等、错误归一和 SSE 放在页面之外；它没有形成当前运行时依赖。

下列名称只在历史资料、迁移审阅和考古检索中出现：

| 历史名称/开关 | 当前处理 | 当前权威入口 |
|---|---|---|
| `kokoro-gateway` | 已归档，不部署、不作为 Web 依赖 | [`business-bff-contract-v1.md`](./business-bff-contract-v1.md) |
| `kokoro-session` | 会话是 BFF Chat 的业务资源，不是独立仓库 | [`chat-handoff-contract-v1.md`](./chat-handoff-contract-v1.md) |
| `KOKORO_GATEWAY_BASE_URL` | 当前配置不读取 | `KOKORO_BFF_BASE_URL` |
| `KOKORO_SESSION_BASE_URL` | 当前配置不读取 | `KOKORO_BFF_BASE_URL`，路径为 `/v1/sessions/*` |
| `kokoro-platform` / `kokoro-hub` | 历史父模块/能力边界记录；当前由 BFF adapter 对接 owner repos | Capability 与 BFF v1 契约 |
| `kokoro-credit` | 已并入 Billing | Billing API 与 Billing SQL 契约 |

旧文档中的 Gateway/Session 直连图、namespace 列表、灰度开关和“独立兼容服务已接入”的状态均按历史材料阅读，不得复制到 `.env*`、Docker Compose、CI 或新代码。

## 3. 当前传输与域名规则

每个独立 Web 部署只配置自己的 server-only `KOKORO_DOMAIN`，本地默认使用 `dev.kokoro.localhost`。浏览器侧不需要也不可信任自定义 `X-Domain`、`tenant_id`、`site_id`、`Forwarded` 或内部 namespace。

```http
# 仅由 Web/BFF 服务端向受信 owner 发送
Forwarded: host=<KOKORO_DOMAIN>
```

Web/BFF 必须删除浏览器可控的 `Host`、`Forwarded`、`X-Forwarded-*`、`X-Domain` 和旧 tenant/site header，再由服务端配置生成唯一的 RFC 7239 `Forwarded`。HTTP `Host` 只用于目标连接 authority，不用于选择业务租户或 Site。

## 4. 当前 Chat 浏览器兼容面

`/api/session/*` 是 Web 为保持现有 UI 兼容而保留的浏览器路径，不代表有一个 Session 服务或仓库。Web server route 将其适配到 BFF Chat 的 `/v1/sessions/*`：

| 浏览器路径 | 当前 BFF 路径 | 业务 owner |
|---|---|---|
| `/api/session/sessions` | `/v1/sessions` | `kokoro-bff` Chat 业务边界 |
| `/api/session/sessions/{id}/messages` | `/v1/sessions/{id}/messages` | `kokoro-bff` Chat 业务边界，内部调 Agent |
| `/api/session/sessions/{id}/events` | `/v1/sessions/{id}/events` | BFF Chat SSE 投影 |
| `/api/session/sessions/{id}/runs/{runId}/control` | `/v1/sessions/{id}/runs/{runId}/control` | BFF Chat + Agent control |

Direct Chat 与 Project Chat 共用同一套资源和事件 union，只由 scope/project reference 区分。草稿 handoff 是 Web 本地状态，不是后端消息；其完整规则见 [`chat-handoff-contract-v1.md`](./chat-handoff-contract-v1.md)。

## 5. 历史资料的迁移判断

阅读旧 Gateway 文档时按以下顺序核对：

1. 先看 [`business-bff-contract-v1.md`](./business-bff-contract-v1.md) 的 BFF `/v1/*` 路由、错误包络与 header 规则；
2. 再看 [`user-web-api-contract-v4.md`](./user-web-api-contract-v4.md) 的 Web `/api/*` 实际 route adapter；
3. Chat 承接与 project scope 看 [`chat-handoff-contract-v1.md`](./chat-handoff-contract-v1.md)；
4. 本地合成数据与验收目标看 [`mock-fixture-matrix-v1.md`](./mock-fixture-matrix-v1.md)，其中标为历史的 fixture 不代表 live API；
5. 若旧材料与上述当前契约冲突，以当前契约为准，并在变更时更新 Root contract，而不是恢复 Gateway/Session 依赖。
