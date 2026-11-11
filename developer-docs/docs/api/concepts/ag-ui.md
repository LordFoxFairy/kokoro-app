# AG-UI stream 与 replay

Kokoro public Agent progress 使用 AG-UI over Server-Sent Events。公开 stream 是 `kokoro-bff` 的 durable projection；内部 Agent fact、provider payload、Redis stream 或数据库行都不是 public event/cursor 的字段事实源。

## Frame 形状

每个应用 frame 有 SSE `id` 和一个 JSON `data`。当前 public cursor 由正则 `^agui_[0-9a-f]{32}$`约束，是分配给单个 frame 的 opaque 值；一个内部事实可能投影成多个 public frame，每个 frame 都有自己的 cursor。

AG-UI 的 `type` 应在 reducer 前校验。标准家族可包括 run、text message、tool call、activity、reasoning、subagent 和 `CUSTOM`；具体可观察事件以 owner contract 与实际 projection 为准。产品交互 custom event 名称是 `kokoro.interaction.state`，其 value 为完整交互状态快照，不是旧的等待审批事件或增量 patch；恢复时使用快照的精确暂停引用、修订及决定项。

## Replay 顺序

1. 读取并完整解析一个 frame。
2. 在同一 namespace、session 和应用状态范围内保存原始 SSE `id`。
3. 以稳定的 run、message、tool 和 delivery ID 幂等更新 UI。
4. 断线后向同一个 session 发送 `Last-Event-ID: <saved-id>`。

服务端从该 frame **之后**继续发送。不要解析、递增、合成 cursor，也不要把另一个 session 或 namespace 的值拿来试探。无效、未知或跨范围的值会进入 contract 声明的错误路径。

## Delivery 语义

客户端故障边界附近可能收到 replay frame；reducer 应能承受重复投影。SSE keep-alive comment 不属于应用事件，不推进 cursor。当前 beta contract 没有发布 cursor 过期、retention 或 GC 的可观察规则；不要把内部保留策略写成客户端保证。

## 浏览器边界

浏览器 UI 可以消费同源 adapter 投影的 AG-UI 状态，但 service credential 和受信 header 仍留在服务端。Vercel AI SDK 或其他 UI 库是渲染适配层，不应建立第二套网络 envelope。
