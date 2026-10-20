## 设置页内部流程

`TECHNICAL_DESIGN.md` 说明页面、草稿、焦点与恢复状态的归属；`API_CONTRACT.md` 说明现有契约和未接通能力；`DATA_MODEL.md` 说明局部草稿及业务事实边界。当前验证与已知缺口见 `CURRENT.md`，创建前表单可打开不代表资产分配、授权或支付已经可用。

个性化知识与记忆导入内页的当前边界见 TECHNICAL_DESIGN/API_CONTRACT/DATA_MODEL 顶部；真实业务完成与验证结果以 CURRENT 为准。浏览弹窗不等同知识存储或记忆解析已接通。

SET53：TECHNICAL_DESIGN/API_CONTRACT/DATA_MODEL 顶部定义六个资产及服务设置页面的放置、可导航范围及未接通动作边界；CURRENT 记录实际验证。无新 API、持久化或依赖，不把页面可打开当作资产服务已经可用。

<!-- SET47 archive consumer: 2026-10-15 -->
SET47当前设计入口：TECHNICAL_DESIGN、API_CONTRACT、DATA_MODEL顶部记录已消费BFF53f222e/public15.4.0（150操作）的候选、回执先后顺序、provenance退休与测试边界；CURRENT只记录实际已跑结果。完整门/E2E及正常新run由Root续接。

## SET43 已移除会话的账户资料读取（2026-10-15；D0，先真实HTTP负控）

测试夹具补充：GET不执行的Auth.js agent factory因server-only导入需空stub；身份准入与requestWithDomain仍是真实HTTP。前两轮仅collection失败，不算行为RED。

现product-identity.ts负责准入分类，独立product-identity.error.ts负责内部类型，现account-profile.ts负责状态映射；新account-profile-admission.integration.test.ts验证真实HTTP边界。

## SET42 任务发送行窄屏排版（2026-10-15；D0）

任务发送窄屏堆叠归现sections/settings-sections.module.css；真实无重叠回归追加既有web-governance.spec.ts，无新模块。

<!-- SET41 V2 D0: V2还使用现settings-modal.module.css约束General内Radix table固定布局；shared ScrollArea保持。 -->

## SET41 主题选项窄屏可达性（2026-10-15；D0）

现settings-sections.module.css负责主题选项换行；现web-governance.spec.ts追加真实内容viewport内可达性回归，无新模块/契约。

## SET40 具体设置项搜索（2026-10-15；D0，先tests-only）

基线Web f82c891965f80eed9ff0c022d3f77b39bdbad42e，939 tracked clean。Computer Use实际Manus：昵称→个性化+昵称、点child切页并保query/结果焦点；通知→通用+浏览器通知；仅菜单名命中只parent；无匹配未找到结果、当前内容不变。现仅菜单过滤且强留selected，窄屏隐藏search，存在明确功能缺口。

现Navigation/Modal/CSS提供静态设置项搜索，仅导航既有页；无API/wire/schema/owner授权/持久化变化，Skills/连接器业务保护。

## SET39 英日文实际设置缺译（2026-10-15；D0）

仅现有en/ja补实际调用MessageKey值；无API/wire/schema变化，全旧值、全tests及其它源保护。

## SET38 六种语言的实际设置缺译（2026-10-15；D0）

基线Web 76a42c2e574eda12b86d97eaaf30d1bad3380068，939 tracked clean。runtime_audit唯一writer仅现ko/es/fr/de/pt/ru六locale，926文件保护/Root7；所有tests和产品逻辑字节不变。

仅现六locale补既有MessageKey native值，无API/wire/schema/owner/依赖变化，原value/全部tests与其它产品源保护。

## SET37 登录刷新早期失败诊断（2026-10-15；D0）

基线Web 01780925f62f5cdf2552567d8f97d0c0ee85abc5。runtime_audit仅改现OIDC实际Next测试；932文件保护，Root6文档。产品源码、原race/count/oracle/timeout/fixture/cleanup均不变。

仅测试观察增强，无API/wire/存储schema/owner变化；所有产品源码和原业务断言保护，已有诊断输出净化不变。

## SET36 复制当前任务链接（2026-10-15；D0，先tests-only）

基线Web 97a6d9694cf9e52d54c50d516fac7cde2889bcf1，939 tracked clean；runtime_audit唯一writer，最终13现source/4现test/914保护/Root8。先仅四现test可追加，927其余字节保护。Root方案/docs/独审/原source RED/Git/资源与正常激活。

现keyboard shortcut/Card/AppFrame+九locale及现四测试，复制当前真实task leaf，不公开分享；原测试完整保留，先RED后source，原三快捷键与权限边界保护。

## SET35 十四个实际设置日文提示（2026-10-15；D0，仅现locale）

基线Web 3f97368ef38c9cea4c88d53ad29e61b83a8716eb，939 tracked clean；runtime_audit唯一writer仅现src/i18n/ja.ts，931保护/Root7。Root设计/docs/独审/Git/资源与实际回归；全部tests与其它locale/产品逻辑字节保护。

src/i18n/ja.ts仅新增十四个现设置调用key的日文；原values/其它locale/全tests保护，覆盖率是含英文回退的key集指标。

## SET34 到期日期测试按实际时区验日末（2026-10-15；D0，仅现测试）

基线Web fd627496a6f860c7ed3e1afef51c65fbc3bcca57，939 tracked clean；runtime_audit唯一writer仅现tests/ui/kokoro-scheduled-surface.test.tsx，932保护/Root6。Root设计/docs/独审/Git/实际复核；全product source与其它全部测试字节保护。

现scheduled UI test中一项时区预期修正；其它测试及全部product source保护，不冒称jsdom已测窄屏geometry。

## SET33 两条原生withdraw测试的就绪前置（2026-10-15；D0，仅现测试）

基线Web d7f5d5d41ce4740de219480ccd6d7bf7d9166d40，939 tracked clean；runtime_audit唯一writer仅现native测试，931保护/Root7。Root资源/Git/docs/独审/正常运行；全部product source及原计数/安全assert/timeout/mock/cleanup仍保护。

仅两初始native withdraw测试开启cold/reload请求到达前置；所有产品源码、其余调用和原断言保护。

## SET32 原生登录请求顺序诊断（2026-10-15；D0，仅现测试）

基线Web 52b535789b93ebac740db7aa8e5296c82b6622b6，939 tracked clean；runtime_audit唯一writer仅tests/system/oidc-rp-next-http.integration.test.ts，931保护/Root7。Root设计/docs/独审/资源/Git与正常实例。现runtime修补已接收，终态20focused/3987PASS7旧FAIL/Playwright20PASS4原SKIP；不能据此认定R175/R177旧native多请求根因。

现native HTTP集成测试仅新增可关闭的请求顺序诊断；原helper、断言和product source逐字保护。

## SET31 runtime请求退休（2026-10-15；D0，先tests-only）

基线Web dc26502bfa47ba0c22422623118b455d46644be0，939 tracked clean；runtime_audit唯一writer，1既有hook/1既有test/930最终保护/Root7，先仅tests其余931保护。Root设计/docs/独审/资源/Git/正常激活/CUA。AppGate及原生R175/R177全部源码/oracle保护；不扩大trusted admission接口，不把hook负控冒称原生多请求根因。

现runtime hook owned dispatch/commit退休与局部scope呈现，AppGate接口和原生观察计数保护；原9测试仅追加负控。

## SET30 未接通菜单与账户操作说明（2026-10-15；正式D0）

基线Web 0ab7bfaedf7425332049f5f867bcec79fccd285c，939 tracked clean；runtime_audit唯一writer，12既有source/920保护/Root7。所有tests原字节保护；Root设计、docs、独审、资源、Git、正常激活/CUA。实际Manus菜单已有对应本地入口，七个placeholder及三账户按钮仍按能力不可用，不引入owner/contract/API/deps或新source。

现导航/Account说明复用既有组件，两个locale key仅追加；不可用仍禁用，原业务读取/写入和tests保持。

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
