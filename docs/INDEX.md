# Kokoro User Web 文档索引

状态：当前权威阅读顺序，更新于 2026-09-03。

## 1. 当前治理文档

以下文档描述当前代码、已接受目标和可验证缺口；发生冲突时按此顺序阅读：

1. [`CURRENT.md`](CURRENT.md)：当前实现、目标差异和缺口。
2. [`TECHNICAL_DESIGN.md`](TECHNICAL_DESIGN.md)：owner、组件、依赖方向和失败边界。
3. [`API_CONTRACT.md`](API_CONTRACT.md)：browser-private HTTP/AG-UI 契约治理。
4. [`DATA_MODEL.md`](DATA_MODEL.md)：Web 无业务数据库 owner；browser storage 分类。
5. [`SECURITY.md`](SECURITY.md)：trust boundary、cookie、CSRF、secret 和已知风险。
6. [`RELIABILITY.md`](RELIABILITY.md)：timeout、retry、replay、degradation 与恢复。
7. [`ACCEPTANCE.md`](ACCEPTANCE.md)：可执行验收矩阵。
8. [`SLO.md`](SLO.md)：目标 SLI/SLO、错误预算和观测缺口。
9. [`RUNBOOK.md`](RUNBOOK.md)：诊断、处置和回滚。
10. [`ADR/0001-browser-private-bff-agui-boundary.md`](ADR/0001-browser-private-bff-agui-boundary.md)：
    Web/BFF/AG-UI 边界决策。
11. [`ADR/0002-repository-coupled-contract-provenance.md`](ADR/0002-repository-coupled-contract-provenance.md)：
    当前 contract source 与冻结 generated snapshot 的处理。

仓库级入口：[`../README.md`](../README.md)、[`../INDEX.md`](../INDEX.md)、
[`../contract/README.md`](../contract/README.md)。

## 2. 当前实现细节参考

以下资料仍可用于定位实现，但字段级事实必须回到 `src/contract/`、route、测试和上面的治理文档：

- [`CODEBASE_MAP.md`](CODEBASE_MAP.md)
- [`integration/user-web-api-contract-v4.md`](integration/user-web-api-contract-v4.md)
- [`integration/business-bff-contract-v1.md`](integration/business-bff-contract-v1.md)
- [`integration/chat-bff-contract-v1.md`](integration/chat-bff-contract-v1.md)
- [`integration/chat-handoff-contract-v1.md`](integration/chat-handoff-contract-v1.md)
- [`integration/forwarded-context-contract-v1.md`](integration/forwarded-context-contract-v1.md)
- [`deployment.md`](deployment.md)
- [`first-site-live-runbook.md`](first-site-live-runbook.md)

其中较早资料可能把 legacy `SessionEvent`、IAM 直连、旧 flat error 或 preview evidence 描述成
已闭环；遇到差异以 `CURRENT.md` 和实际源码为准。

## 3. 产品与 UI 参考

这些文档服务后续 UI 重构，不是本阶段的 API/生产证据：

- [`ui-foundation.md`](ui-foundation.md)
- [`ui-css-modules.md`](ui-css-modules.md)
- [`ui-acceptance-checklist.md`](ui-acceptance-checklist.md)
- [`desktop-design-audit-v2.md`](desktop-design-audit-v2.md)
- [`desktop-interaction-audit-v1.md`](desktop-interaction-audit-v1.md)
- [`manus-reference-audit-v2.md`](manus-reference-audit-v2.md)
- [`package-extraction-map.md`](package-extraction-map.md)
- [`site-repository-architecture-v2.md`](site-repository-architecture-v2.md)
- [`user-web-architecture-v2.md`](user-web-architecture-v2.md)

## 4. 历史与迁移资料

以下资料仅用于考古，不能重新成为运行、API 或发布依据：

- [`user-web-bff-contract-v3.md`](user-web-bff-contract-v3.md)
- [`user-web-rewrite-plan-v2.md`](user-web-rewrite-plan-v2.md)
- [`site-package-architecture-v1.md`](site-package-architecture-v1.md)
- [`manus-inspired-workbench-contract-v2.md`](manus-inspired-workbench-contract-v2.md)
- [`integration/kokoro-gateway-boundary-v1.md`](integration/kokoro-gateway-boundary-v1.md)
- [`integration/stage2-topology-documentation-cleanup-report-v1.md`](integration/stage2-topology-documentation-cleanup-report-v1.md)
- [`integration/closure-evidence-v1.md`](integration/closure-evidence-v1.md)：一次性历史验证记录，不能证明
  当前 commit 或生产环境。

## 5. 文档维护规则

- `CURRENT.md` 只写当前实现与可复现证据，不把目标写成事实。
- `API_CONTRACT.md` 解释协议策略，不复制完整 Zod/OpenAPI 字段。
- `contract/README.md` 记录 owner、visibility、version、generation、breaking、provenance。
- 只有 `kokoro-bff` 的 `public` Product API 可进入 Developer API；本仓 browser-private 契约不得发布。
- 运行时行为变化必须同 commit 更新 source、contract test、相关治理文档和 acceptance 条目。
