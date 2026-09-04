# ADR-0001：Browser-private BFF 与 AG-UI 单协议边界

- 状态：Accepted
- 日期：2026-09-03
- 决策 owner：`kokoro` Web（browser adapter）与 `kokoro-bff`（Product API/AG-UI ledger）

## 背景

Web 曾同时保留 Session/Gateway/Hub 命名、owner 直连和自有 `SessionEvent` SSE。这样会让浏览器
路径、内部服务协议和 UI reducer shape 互相冒充权威来源，也会产生双 cursor、双重恢复和
Developer API 误发布风险。Root 架构已经把 BFF 定为 Browser 到业务 owner 的唯一服务入口，并把
AG-UI 定为 Web 与 BFF 的 Agent 网络事件协议。

## 决策

1. `kokoro` 的 `/api/*` 全部归类为 `browser-private`，仅供当前 Web 使用。
2. Browser 的业务调用方向固定为 `Browser -> Web same-origin adapter -> kokoro-bff`。
3. 只有 `kokoro-bff` 的 `public` Product API 进入 Developer API；Web contract 不发布。
4. Web↔BFF 的 Agent event stream 只使用 AG-UI 和 BFF durable cursor。
5. `SessionEvent` 只可作为迁移期间的 Web 内部 reducer projection，不可继续作为 network wire。
6. 仓内 `AgUiChatTransport` 将 AG-UI 映射到 Vercel AI SDK `UIMessage`/parts；AI SDK 不建立第二套
   HTTP/SSE、cursor、receipt 或 durable ledger。
7. 迁移完成时直接删除 legacy parse/fallback，不长期双读。

## 影响

- 正面：协议 owner、replay、HITL 和 UI 状态边界唯一；Developer API 不泄漏内部 Web surface。
- 代价：Web 与 BFF 需协调发布；旧 fixture 和 reducer adapter 需要一次性迁移。
- 非目标：本 ADR 不定义 BFF 内部 owner API，也不要求 Web 复制 BFF OpenAPI。

## 当前迁移状态

- 已有 `@ag-ui/core` 与 AG-UI narrowing parser。
- live SSE client 仍双读 legacy `SessionEvent` 和 AG-UI。
- `AgUiChatTransport`、`ai`、`@ai-sdk/react` 与完整 `UIMessage` mapping 尚未落地。
- 认证仍有 IAM 直连路径。

上述缺口记录在 [`../CURRENT.md`](../CURRENT.md)，Accepted 表示决策生效，不表示实现已完成。
