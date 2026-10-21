# 介绍

Kokoro API v1 是由 `kokoro-bff` 拥有的 public Product API contract。它在一个版本化的 HTTP surface 中提供项目、session、异步 Agent run、定时任务、资源投影和其他产品能力。

门户由两部分组成：中文手写指南和从固定 artifact 生成的 reference。门户不拥有或复制 API schema；字段名、类型、必填性、约束、响应头和 operation metadata 的唯一字段事实源是 `catalog/contracts.yaml` 所 pin 的 BFF public contract。

## 当前 contract 状态

当前 artifact 版本为 `22.0.0`，业务路径前缀为 `/v1`。门户从源契约的 176 个 operation 中发布 170 个 `public` operation，排除 6 个 `browser-private` operation 及仅被它们引用的数据结构。稳定性按各 operation 的 metadata 展示，不统一推断。operation 出现在 contract 中只说明公开 wire shape，不自动证明每个 live adapter、持久化路径、上游依赖或 SLO 已经完成。

本门户已迁入 App 独立文档包；当前 Public22 是本地已固定且正常服务已配对的候选，并非已合入远程 main。API Key／Open App／trusted 入口尚未实现，见[认证与请求约定](/authentication)。生成参考不改变这些能力状态。

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

先读[快速开始](/quickstart)，再看[认证](/authentication)、[AG-UI 概念](/concepts/ag-ui)和[API v1 reference](/reference/v1/)。
