# 介绍

Kokoro API v1 是由 `kokoro-bff` 拥有的 public Product API contract。它在一个版本化的 HTTP surface 中提供项目、session、异步 Agent run、定时任务、资源投影和其他产品能力。

门户由两部分组成：中文手写指南和从固定 artifact 生成的 reference。门户不拥有或复制 API schema；字段名、类型、必填性、约束、响应头和 operation metadata 的唯一字段事实源是 `catalog/contracts.yaml` 所 pin 的 BFF public contract。

## 当前 contract 状态

当前版本、完整来源、公开 operation 数量与稳定性以 catalog 和生成参考首页为准，不在手写页维护第二份数字。业务路径前缀为 `/v1`；门户只发布正式标记为 `public` 的 operation，排除 `browser-private` 操作及其独占引用。接口出现在合同中只说明公开 wire shape，不代表每个运行环境、上游依赖或 SLO 已经完成验收。

本门户位于 App 独立文档包，参考已固定的 BFF Public22.4 正式契约；原始 commit 与 SHA-256 见[来源说明](/api/provenance)。公开 `skill.list` 的 User API Key／OAuth Open App／trusted 资格由固定 operation 的身份与权限说明限定，不套用到其他业务接口，见[认证与请求约定](/api/authentication)。生成参考不改变这些能力状态。

## 异步请求模型

Agent 工作遵循以下可观察流程：

1. 使用 `Idempotency-Key` 提交 session message 或其他标记为 `required` 的 mutation。
2. 接收 `202 Accepted` 或 operation reference 中声明的成功状态和稳定标识符。
3. 通过 session 的 `text/event-stream` endpoint 跟随 AG-UI 进度。
4. 完整接收每个 SSE frame 后保存原始 `id`，断线时原样放入 `Last-Event-ID`。
5. 将 `RUN_FINISHED` 或 `RUN_ERROR` 作为 AG-UI run 的终态信号；传输断开本身不是业务结果。

JSON 成功和错误常见 `data`/`meta` 或 `error`/`meta` envelope；技能列表使用 `{ok, request_id, data}` 或 `{ok, request_id, error}`。`/readyz` 在依赖未就绪时的 `503` 是 contract 明确的 `HealthResponse` 例外；请以生成 reference 的 response schema 为准。

## Owner 边界

门户只发布 canonical metadata 同时满足 `x-kokoro-owner: kokoro-bff` 和 `x-kokoro-visibility: public` 的 operation。internal-owner API、数据库 schema、provider payload 和 generated internal DTO 不属于 public reference 的输入。

先读[快速开始](/api/quickstart)，再看[认证](/api/authentication)、[AG-UI 概念](/api/concepts/ag-ui)和[API v1 reference](/api/reference/v1/)。
