# kokoro-app 当前入口

状态：2026-09-01。本文只说明当前 Web 运行边界；历史方案和迁移考古仍保留在同目录文档中，
但不作为当前实现入口。

## 当前运行边界

- `kokoro-app` 是独立 User Web 仓库，浏览器只调用同源 `/api/*` route adapter。
- Chat 与业务请求统一走 BFF-only 链路：`/api/*` → `kokoro-bff /v1/*` → owner repos 或
  `kokoro-agent` 的内部契约。
- `/api/session/*` 只是保留给现有 SessionEngine 的兼容路径；`Session` 是 BFF Chat 资源概念，
  不是独立运行仓库入口。
- 当前 Web 不读取 `KOKORO_SESSION_BASE_URL`，不直连独立 Session、Gateway、Agent 或业务 owner，
  也不存在 Gateway direct fallback。业务和 Chat 的 Web 上游基址只使用
  `KOKORO_BFF_BASE_URL`。
- `KOKORO_DOMAIN` 只由服务端读取，并由 Web/BFF 按契约生成 `Forwarded`；浏览器提供的 Host、
  `Forwarded`、tenant/site 字段不构成可信路由上下文。

## 当前阅读入口

1. [`README.md`](../README.md)：仓库边界、本地运行和验证。
2. [`src/lib/server/INDEX.md`](../src/lib/server/INDEX.md)：Web server BFF 装配和上游边界。
3. [`integration/user-web-api-contract-v4.md`](integration/user-web-api-contract-v4.md)：同源
   `/api/*` 适配契约。
4. [`integration/business-bff-contract-v1.md`](integration/business-bff-contract-v1.md)：Web 到
   `kokoro-bff /v1/*` 的业务适配契约。
5. [`integration/chat-bff-contract-v1.md`](integration/chat-bff-contract-v1.md)：Chat 资源、SSE
   和 Agent 内部承接边界。

## 历史资料

- [`integration/kokoro-gateway-boundary-v1.md`](integration/kokoro-gateway-boundary-v1.md) 是 Gateway
  的历史边界/迁移资料，不是当前接入要求。
- 旧 Session、Gateway、Hub 直连或 fallback 方案只用于迁移审阅；新增实现必须从本入口和当前
  BFF 契约出发。
