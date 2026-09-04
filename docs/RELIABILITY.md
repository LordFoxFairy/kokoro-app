# Kokoro User Web 可靠性设计

状态：当前实现与目标基线，2026-09-03。

## 1. 可靠性边界

Web 的可靠性范围包括页面交付、同源 adapter、cookie/session 处理、BFF request/response projection、
AG-UI 消费与浏览器状态恢复。BFF/owner 自身可用性由对应仓负责，但 Web 必须正确设置 timeout、取消、
错误归一和降级，不得把上游失败显示成成功。

## 2. 当前能力

- Chat JSON 输入/输出经 Zod 解析，parse failure 进入类型化错误。
- SSE 使用 fetch stream，可在首连和重连发送 `Last-Event-ID`。
- network read 断开后使用最后确认 cursor 重连；关闭 handle 会 abort fetch 并清 timer。
- snapshot-first hydration 与 event folding 存在 focused unit tests。
- mutation 主要携带 `Idempotency-Key`；Chat command receipt 由 BFF/Agent owner 负责持久化。
- live client 与 preview client 显式选择；live 失败不应切换本地 fixture。
- 多个动态 route 使用 `force-dynamic`、`no-store` 与 request abort propagation。

## 3. 当前缺口

- server transport 没有 connect/read/overall timeout、响应 body 限制或并发/速率上限。
- Chat SSE 仍双读 legacy `SessionEvent` 与 AG-UI，可能掩盖 contract drift。
- engine 状态集合未完整显式表达 queued/resuming/cancelling/reconnecting/completed/failed。
- 部分 route 的 error envelope、request id、retry-after 和 cache policy 不一致。
- 没有专用 health/ready probe，也没有真实 BFF/browser smoke 的 CI gate。
- 没有生产 metrics/traces、SLI 实测或 burn-rate 告警。
- Docker candidate 未在 push 前完成 image scan + runtime smoke。

## 4. Timeout 与取消目标

每个 Web server client 必须分别定义并测试：

| 阶段 | 目标语义 |
| --- | --- |
| Connect timeout | DNS/TCP/TLS 连接不能无限等待；超时映射稳定 `upstream_unreachable` 类错误 |
| Read timeout | 普通 JSON/二进制读取设 idle/total 上限；SSE 使用 heartbeat/idle deadline 而非普通短 read timeout |
| Overall timeout | 非 streaming request 有总 deadline；由 route abort 与 server timeout 共同控制 |
| Body limit | browser request、upstream JSON、SSE frame 和二进制 projection 各有明确最大值 |
| Cancellation | browser disconnect、route abort 和 deploy shutdown 传播到 BFF；不遗留 reader/timer |

数值应由端到端测量和 BFF SLO 决定；在实现前不在本文伪造已生效数值。

## 5. Retry 与幂等

- GET/HEAD 可对连接失败和明确可重试状态执行 capped exponential backoff + jitter，但要受 overall deadline 限制。
- SSE 仅按同一 durable cursor 重连；不得换协议、重置为 0 或切 preview。
- mutation 只有在相同 `Idempotency-Key` 和稳定 request digest 下才可重试。
- `429/503` 仅在 contract 允许时遵守 `Retry-After`；无限 retry 禁止。
- schema/authorization/validation/conflict 等确定性 `4xx` 不自动重试。
- UI 的“重试”必须保持原 command identity，或明确创建一个新的用户动作，不能模糊二者。

## 6. AG-UI replay 与 reconciliation

1. 初次加载请求 snapshot，读取 BFF event watermark/cursor。
2. SSE 以 `Last-Event-ID` 从下一事件接续。
3. 一个上游事实若展开为多个 AG-UI frame，cursor 只在该事实可安全重放的边界前进。
4. event 重复投递由 event id/cursor 幂等折叠；乱序或缺口触发 snapshot reconciliation。
5. cursor 过期时明确获取新 snapshot，不能静默丢弃本地 optimistic 状态。
6. HITL resume 包含同 thread 的全部未决 interrupt 与幂等 identity。
7. terminal event 与 receipt/snapshot 不一致时以 BFF durable projection 对账并显示可恢复错误。

当前只有部分 `SessionEvent` reducer 语义和 AG-UI frame mapping；完整 UIMessage/reconciliation 仍待实现。

## 7. 缓存与离线

- 登录态页面、session、project、billing、runtime manifest、SSE 和个性化 JSON 不使用公共缓存。
- `/_next/static/*` 及内容寻址公开 artifact 可使用 immutable cache，并由 digest 防漂移。
- Service Worker/offline mutation queue 当前不存在；不得声称离线 command 已持久化。
- localStorage draft 是浏览器便利功能，不是 delivery guarantee。

## 8. 发布与恢复

发布门禁目标：

```text
frozen install
-> contract + architecture
-> lint + typecheck + unit/integration
-> Playwright + axe + visual + bundle budget
-> build candidate
-> dependency/source/secret/image scan
-> candidate health/ready + BFF JSON/AG-UI smoke
-> immutable digest publish + provenance/SBOM/signature
```

当前只具备其中的 lint/typecheck/test/build 和部分 contract test；其余为阻断缺口。回滚必须使用上一个
已验证不可变 image digest/Cloudflare deployment，不依赖可变 `latest`。

## 9. Degradation

| 故障 | 允许表现 | 禁止表现 |
| --- | --- | --- |
| BFF 未配置/不可达 | 明确 unavailable、request id、可重试动作 | 回退 mock 或伪造成功 |
| IAM/session 无效 | anonymous/login 或明确 401 | 暴露 token、跨 tenant 继续请求 |
| AG-UI contract drift | fail-loud、保留 cursor、提示刷新/联系支持 | 改读 legacy wire 或丢 frame |
| SSE 断流 | 显示 reconnecting 并按 cursor 重连 | 重复提交用户消息 |
| localStorage 不可用 | 当前 tab 内存态或明确提示 | 阻断 server truth、把旧值当新成功 |
| artifact fetch 失败 | 保留 metadata 与 retry | 把不完整文件标记完成 |

## 10. 证据

一次运行通过不等价于生产可靠性。每个 release 应保存 commit/image digest、完整门禁输出、BFF mock/live
版本、浏览器矩阵、故障注入结果和观测窗口。目标与当前实测分开记录，见 [`SLO.md`](SLO.md)。
