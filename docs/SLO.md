# Kokoro User Web SLO

状态：目标定义，尚无生产实测基线，2026-09-03。

## 1. 适用范围

本 SLO 覆盖用户访问 Kokoro Web、同源 browser-private adapter 和 Web 对 BFF 的正确投影。BFF/owner
另有各自 SLO；用户旅程 SLI 仍需把依赖失败计入端到端结果，不能通过排除上游错误制造虚假可用性。

当前仓库没有统一 telemetry、生产流量窗口或 burn-rate 告警。下列值是首个可观测 production release
的**目标**，不是当前实测结果。

## 2. SLI 定义

| SLI | 好事件 | 总事件 | 备注 |
| --- | --- | --- | --- |
| Web navigation availability | 受支持浏览器中页面返回并完成 shell hydration，无致命错误 | 有效页面导航 | 排除明确 bot/无效 path，不排除依赖失败造成的用户失败 |
| Same-origin API availability | route 在 deadline 内返回契约化非 5xx 结果 | 有效 `/api/*` 请求 | 预期 4xx 计为正确结果；schema drift 502 计坏事件 |
| Chat command acceptance | command 获得匹配 request id 的成功/异步 receipt | 有效、已认证 command | duplicate replay 必须仍只有一次副作用 |
| AG-UI continuity | stream 正常终止或断线后在目标时间内从 cursor 恢复且无缺口/重复可见副作用 | 活跃 Chat stream | legacy fallback 不计成功路径 |
| Session correctness | 没有跨 tenant 数据、token 泄漏或错误用户投影 | 所有 session/API 结果 | 任一安全隔离事件直接触发事故，不用 error budget 抵消 |

## 3. 初始目标

以 28 天滚动窗口计算：

| SLO | 目标 | Error budget |
| --- | ---: | ---: |
| Web navigation availability | 99.90% | 0.10% |
| Same-origin API availability | 99.90% | 0.10% |
| Chat command acceptance | 99.50% | 0.50% |
| AG-UI continuity | 99.50% | 0.50% |
| Cross-tenant/token disclosure | 0 事件 | 0；触发即事故 |

Latency 在 telemetry 与流量分类完成前先作为 SLI 观测，不声明已达标。首个 production baseline 至少采集
两个完整周后，再按设备/地区/route 分层设定 navigation、API 和 first-token p50/p95/p99 目标。

## 4. 统计规则

- 使用服务端 request id/trace id 与 browser navigation/stream correlation，不以客户端单点日志作为全量分母。
- Preview、synthetic fixture 和本地开发不进入 production SLO；可作为独立 canary SLI。
- 计划维护窗口是否排除必须在事件前登记；未登记中断计入 SLO。
- BFF/owner 依赖导致用户失败仍计入用户旅程 SLI，同时按 dependency tag 分解 owner。
- 单一用户重试不会把一次失败洗成成功；command 以幂等 identity 关联。
- 安全隔离、数据泄漏、错误支付或重复副作用不使用普通 availability error budget 豁免。

## 5. Error budget policy

| 消耗 | 行动 |
| --- | --- |
| < 50% | 正常交付；持续跟踪 top errors |
| 50%–75% | 限制高风险变更，要求 owner 修复计划和加强 canary |
| 75%–100% | 停止非可靠性发布；优先恢复、回归与容量工作 |
| > 100% | 发布冻结；事故复盘、恢复验证和重新批准后解除 |

安全 P0、跨 tenant 或 credential 暴露不等待预算阈值，立即进入事故流程。

## 6. 告警目标

在 metrics 落地后配置多窗口 burn-rate：

- 5 分钟/1 小时快速燃烧：page，关联最近 release 和 dependency；
- 30 分钟/6 小时慢速燃烧：创建高优先级 incident；
- AG-UI reconnect storm、cursor gap、contract parse failure 单独告警；
- 401/403 按部署/版本监测异常突增，但日志不记录 token；
- 5xx、timeout、oversized rejection 按 route/BFF owner/request result 分层；
- CSP violation、secret scan、image vulnerability 与健康探针失败进入安全/发布告警。

具体阈值要由观测平台表达并进入 CI/config review；当前没有该配置，仍是缺口。

## 7. 最小遥测字段

服务端结构化记录至少包含：

```text
service, operation, request_id, trace_id, route_template, result,
http_status, duration_ms, deployment, version, dependency
```

AG-UI 额外记录脱敏的 thread/run/event type、cursor/reconnect result，不记录 message、tool 参数、token、
cookie、secret、原始 artifact 或完整 provider payload。

## 8. 当前证据状态

| 项目 | 状态 |
| --- | --- |
| SLI instrumentation | 未实现 |
| Dashboard | 未实现 |
| Burn-rate alert | 未实现 |
| Production observation window | 不存在 |
| Local unit/contract/build | 每次交付需重新运行；不代替 SLO |
| Synthetic/live BFF canary | 未进入 CI/发布门禁 |

诊断与处置见 [`RUNBOOK.md`](RUNBOOK.md)，发布标准见 [`ACCEPTANCE.md`](ACCEPTANCE.md)。
