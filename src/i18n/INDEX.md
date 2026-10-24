## SET40 具体设置项搜索（2026-10-15；D0，先tests-only）

基线Web f82c891965f80eed9ff0c022d3f77b39bdbad42e，939 tracked clean。Computer Use实际Manus：昵称→个性化+昵称、点child切页并保query/结果焦点；通知→通用+浏览器通知；仅菜单名命中只parent；无匹配未找到结果、当前内容不变。现仅菜单过滤且强留selected，窄屏隐藏search，存在明确功能缺口。

现Navigation/Modal/CSS提供静态设置项搜索，仅导航既有页；无API/wire/schema/owner授权/持久化变化，Skills/连接器业务保护。

## SET39 英日文实际设置缺译（2026-10-15；D0）

仅现有en/ja补实际调用MessageKey值；无API/wire/schema变化，全旧值、全tests及其它源保护。

## SET38 六种语言的实际设置缺译（2026-10-15；D0）

基线Web 76a42c2e574eda12b86d97eaaf30d1bad3380068，939 tracked clean。runtime_audit唯一writer仅现ko/es/fr/de/pt/ru六locale，926文件保护/Root7；所有tests和产品逻辑字节不变。

仅现六locale补既有MessageKey native值，无API/wire/schema/owner/依赖变化，原value/全部tests与其它产品源保护。

## SET36 复制当前任务链接（2026-10-15；D0，先tests-only）

基线Web 97a6d9694cf9e52d54c50d516fac7cde2889bcf1，939 tracked clean；runtime_audit唯一writer，最终13现source/4现test/914保护/Root8。先仅四现test可追加，927其余字节保护。Root方案/docs/独审/原source RED/Git/资源与正常激活。

现keyboard shortcut/Card/AppFrame+九locale及现四测试，复制当前真实task leaf，不公开分享；原测试完整保留，先RED后source，原三快捷键与权限边界保护。

## SET35 十四个实际设置日文提示（2026-10-15；D0，仅现locale）

基线Web 3f97368ef38c9cea4c88d53ad29e61b83a8716eb，939 tracked clean；runtime_audit唯一writer仅现src/i18n/ja.ts，931保护/Root7。Root设计/docs/独审/Git/资源与实际回归；全部tests与其它locale/产品逻辑字节保护。

src/i18n/ja.ts仅新增十四个现设置调用key的日文；原values/其它locale/全tests保护，覆盖率是含英文回退的key集指标。

## SET30 未接通菜单与账户操作说明（2026-10-15；正式D0）

基线Web 0ab7bfaedf7425332049f5f867bcec79fccd285c，939 tracked clean；runtime_audit唯一writer，12既有source/920保护/Root7。所有tests原字节保护；Root设计、docs、独审、资源、Git、正常激活/CUA。实际Manus菜单已有对应本地入口，七个placeholder及三账户按钮仍按能力不可用，不引入owner/contract/API/deps或新source。

现导航/Account说明复用既有组件，两个locale key仅追加；不可用仍禁用，原业务读取/写入和tests保持。

## SET27 个性化未接通入口（2026-10-15；正式D0）

Web基线91fb1aee87df9e6dc0acadcdda4db5375623a13a，939 tracked clean；runtime_audit现Web唯一writer，12具名路径/920保护/Root7。Root设计/文档/Git/资源/运行/CUA。独立候选审查无确定P1/P2；原SET26已接收，本轮只个人资料呈现，不混入余额/支付/阅读轴。

沿现PersonalizationCard/CSS呈现明确禁用知识/导入入口；无新hook/API/模块。唯一新增本地化说明，原四字段保存与恢复保护。Root7设计/index与writer12边界见CURRENT。

## SET26 用量与套餐可信读取（2026-10-15；正式D0，先tests-only）

正式Web基线a9183585ab403797f79b522aedb120de562a64e9、939 tracked clean。仅现Web Billing/Pricing/settings消费接缝，runtime_audit唯一writer，17具名路径/914保护/Root8；Root独占设计/docs/Git/资源/正常运行/CUA。候选独审无确定阻断P1/P2。Skills/连接器、owner契约/SQL/generated/依赖、checkout源码与全局QueryStore保护；无新源文件/模块/owner。

职责为现Billing/Pricing/settings读取边界及恢复；源码与测试17路径、Root8索引/设计，scope只局部可信生命周期，目录无全局query变更，单10s/显式retry/disabled交易。新locale仅一个key，其余当前资料保持。

## SET25 浏览器测试就绪边界窄准入（2026-10-15）

仅现tests/e2e/web-governance.spec.ts原65/107/267/405/470五个初始/app goto覆盖六例：networkidle改DOMContentLoaded后准确Chat input可见/启用/可编辑web断言。原229及其余goto保持。已有实际六desktop等待超时证据及只读独审无确定P1/P2；官方Playwright建议测试以web断言判断ready。原logout POST/issuer、reading轴/长markdown/stream/HITL所有业务oracle、mock、skip、timeout、route保持，R137观察器仍先于首次发送。不能以输入就绪冒称业务通过，也不宣定位具体网络请求根因。无Product源码/fixture/权限改动；沿runtime_audit同一writer，SET25扩为13writer/919保护/Root7，仅本项追加范围，其余原边界保持。最终正规E2E运行仍待验。

<!-- SET25：九locale只追加模型未保存与目录loading/error/empty/retry五key。 -->
<!-- SET24：九locale仅追加退出无法确认的一键，原键保留；无新语言或协商变更。 -->
<!-- SET23：LocaleProvider的当前选择与持久化失败分别建模；对应设置行明确未保存/可重试，不改旧key、协商或IAM表单lang保护。 -->
# src/i18n — Web 界面静态 i18n

## 职责
Web UI 的多语言:**中文(zh)是唯一源字典**,其余语言是增量覆盖,未译键在解析层回退中文源(绝不裸露 key、绝不半中半英崩溃)。9 种上线语言:zh/en/ja/ko/es/fr/de/pt/ru。

## 公开件 / 数据流
- `messages.ts` — **源真相**:`zh = {...} as const`(全量键),`MessageKey = keyof typeof zh`;`Locale` 联合、`LOCALES`、`DEFAULT_LOCALE="zh"`、`LOCALE_STORAGE_KEY`、`LOCALE_NAMES`(母语显示名)。
- `<locale>.ts` — 各语言 `Partial<Record<MessageKey, string>>` 增量覆盖。
- `overlays.ts` — `OVERLAYS: Record<Locale, Partial<...>>` 数据驱动查表(解析层据此按 locale 取词)。
- `resolve.ts` — 纯解析层(无 DOM/React):`negotiateLocale`(存储偏好 > 浏览器语言前缀 > 默认 zh)+ `resolveMessage`(OVERLAYS[locale] → zh → key 三层 fallback + `{var}` 插值)。
- `context.tsx` — React 绑定:`LocaleProvider`(SSR/水合首帧用默认、挂载后协商,避免注水不一致)、`useLocale`、`useT`。读取 locale 偏好被浏览器拒绝时仍走既有 runtime/browser 协商；写入被拒绝时保留本次内存选择，不让偏好存储异常中止水合。

## 新增一种语言(全流程)
1. `messages.ts`:`Locale` 与 `LOCALES` 加语言码 + `LOCALE_NAMES` 加母语名。
2. 创建 `<code>.ts`，维护该语言对 `messages.ts` 的增量覆盖。
3. `overlays.ts` 挂上该 overlay。
**解析层零改动**;语言切换器(`@/ui/settings/settings-sections` AppearanceCard)从 `LOCALES` 动态列出,零改动。

## 陷阱
- 新文案只在 `zh` 加一行 key；各语言按发布流程补齐并人工校对。en 是手维基线，其余语言可保留人工精修。
- 硬编码护栏 `tests/i18n/no-hardcoded-ui.test.ts` **只查中文字符**——英文硬编码不触发。已修的盲区:mode 的 `Fast`/`Thinking` 曾英文硬编码(`ui/composer/mode-options.ts`),现走 `mode.labelFast`/`mode.labelThinking` 键。新增英文硬编码仍可能漏网,评审留意。
- overlay 完整性由 `tests/i18n/resolve.test.ts` 守:每 overlay 的 key ⊆ zh 源、各语言覆盖率 ≥95%、`LOCALE_NAMES` 覆盖全 `LOCALES`。
- locale storage 不是认证或服务端事实；不要把其异常恢复扩展为 Product Session、认证索引或业务数据的 fallback。

Agent 待核对终态使用 fail.modelSettlementPending，九语言仅描述停止、内容保留与结算待核对，不推断扣款／释放。
