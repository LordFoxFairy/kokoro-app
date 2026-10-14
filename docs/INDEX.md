## SET29 侧栏账户余额可信读取（2026-10-15；D0，先tests-only）

Web基线2d31cd502db44b5b0ad74e52321cba755624896f，939 tracked clean；runtime_audit唯一writer本片4既有source+1既有rail测试，927最终保护/Root7；先仅测试准入，其余931字节保护。Root管设计/docs/Git/资源/正式激活/CUA，Skills/连接器业务排除。

AppFrame可信ProjectReadBoundary沿原rail props/shell进入account余额；同subject/generation退役隐藏及取消，marker不授准入。

## SET28 Web阅读轴滚动槽修补（2026-10-15；正式D0）

正式Web基线7e062cd5e69847bfb34181b6674cb998c4cc50f1，939 tracked clean。runtime_audit唯一writer仅app-frame-main.module.css；931保护/Root7。Root设计/docs/Git/资源/正常激活/CUA。既有精确E2E已多次真实RED，无新tests-only或新增镜像测试；全部tests/阈值/mock/skip/等待保持字节。

Web专属thread viewport统一隐藏滚动条槽以匹配Composer阅读轴；共享/mobile代码和滚动逻辑保持，现精确E2E阈值保护。

## SET27 个性化未接通入口（2026-10-15；正式D0）

Web基线91fb1aee87df9e6dc0acadcdda4db5375623a13a，939 tracked clean；runtime_audit现Web唯一writer，12具名路径/920保护/Root7。Root设计/文档/Git/资源/运行/CUA。独立候选审查无确定P1/P2；原SET26已接收，本轮只个人资料呈现，不混入余额/支付/阅读轴。

沿现PersonalizationCard/CSS呈现明确禁用知识/导入入口；无新hook/API/模块。唯一新增本地化说明，原四字段保存与恢复保护。Root7设计/index与writer12边界见CURRENT。

## SET26 用量与套餐可信读取（2026-10-15；正式D0，先tests-only）

正式Web基线a9183585ab403797f79b522aedb120de562a64e9、939 tracked clean。仅现Web Billing/Pricing/settings消费接缝，runtime_audit唯一writer，17具名路径/914保护/Root8；Root独占设计/docs/Git/资源/正常运行/CUA。候选独审无确定阻断P1/P2。Skills/连接器、owner契约/SQL/generated/依赖、checkout源码与全局QueryStore保护；无新源文件/模块/owner。

职责为现Billing/Pricing/settings读取边界及恢复；源码与测试17路径、Root8索引/设计，scope只局部可信生命周期，目录无全局query变更，单10s/显式retry/disabled交易。新locale仅一个key，其余当前资料保持。

## SET25 浏览器测试就绪边界窄准入（2026-10-15）

仅现tests/e2e/web-governance.spec.ts原65/107/267/405/470五个初始/app goto覆盖六例：networkidle改DOMContentLoaded后准确Chat input可见/启用/可编辑web断言。原229及其余goto保持。已有实际六desktop等待超时证据及只读独审无确定P1/P2；官方Playwright建议测试以web断言判断ready。原logout POST/issuer、reading轴/长markdown/stream/HITL所有业务oracle、mock、skip、timeout、route保持，R137观察器仍先于首次发送。不能以输入就绪冒称业务通过，也不宣定位具体网络请求根因。无Product源码/fixture/权限改动；沿runtime_audit同一writer，SET25扩为13writer/919保护/Root7，仅本项追加范围，其余原边界保持。最终正规E2E运行仍待验。

<!-- SET25：旧chat模型偏好可靠性，三设计/CURRENT具名门。 -->
<!-- SET24：账户退出失败/timeout与scope退役，三设计及CURRENT具名门。 -->
<!-- SET23：通用主题/语言持久化失败与明确重试见三设计/CURRENT；现Provider和AppearanceCard局部修补，无网络/owner变更。 -->
<!-- SET20：团队页可靠性与原文/身份边界见TECHNICAL_DESIGN、API_CONTRACT、DATA_MODEL具名前缀，Root真实HTTP与完整门事实见CURRENT/ACCEPTANCE。 -->
<!-- SET19：TECH/API/DATA/CURRENT文首记录正式BFF15.2姓名保存切片；源/生成冻结独审与实际测试结果分别记录，正常fresh16scope/CUA不由静态门替代。 -->
<!-- SET16：三设计与CURRENT文首为通用通知/声音候选；不新增owner契约或数据，实际模型完成投递仍待正规执行先决条件。 -->
<!-- SET-SHORTCUTS: 快捷键规则 src/lib/keyboard-shortcuts.ts；订阅 src/hooks/use-keyboard-shortcuts.ts；编辑 src/ui/settings/sections/shortcuts-card.tsx；回归 tests/lib/keyboard-shortcuts.test.ts 与 tests/ui/keyboard-shortcuts.test.tsx。 -->
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
