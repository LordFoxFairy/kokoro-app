SET53：sections 下 mail-settings-section、email-assets-section、phone-assets-section、wallet-settings-section、integration-settings-section、developer-settings-section 各自负责一个页面，局部页签不持久化。导航/搜索/header/dispatcher 增加六个可访问页面；具体服务动作无契约则禁用并给可见说明，无资产伪数据。电脑继续禁用，Skills/MCP 不改。

SET53 compact More：现 settings-compact-more-menu 将 portal 归入所属 settings-modal 的焦点范围，保证窄屏键盘可选择；沿用单一菜单和原关闭逻辑。

SET49：主线Panel/navigation拆分保持；既有Data、Help、账户/设备、Team和个性化以readBoundary接入dispatcher。Brand维护唯一搜索/清除与结果viewport，navigation维护静态标签索引，rail维护主线compact More与选择可见性；归档回调通过Panel传递。永久subject缓存不替代正式代际/CAS读取。

<!-- SET47 archive consumer: 2026-10-15 -->
SET47：archived-tasks-client使用正式四操作窄generated client并在原始响应进入SDK前严格校验；use-archived-tasks持当前subject/generation的分页、restore和unknown/review fence。DataManagementSection展示真实空/加载/错误/不可用与恢复确认；恢复ACK由SettingsModal→AppFrame回调通知所有mounted scope重读，unknown须权威GETnull及显式继续。预览无archive IO。

## SET42 任务发送行窄屏排版（2026-10-15；D0）

任务发送label/hint与禁用queue选择框在窄屏纵向排列，desktop保持同行；只改现sections CSS，现E2E验证文字/选择框无重叠及内容viewport边界。

<!-- SET41 V2 D0: SET41 V2仅General现panel内Radix table-layout:fixed，不改变共享ScrollArea；现General语言select不超过容器。主题原回归与旧tests保持。 -->

## SET41 主题选项窄屏可达性（2026-10-15；D0）

主题固定尺寸选项由现sections/settings-sections.module.css按可用内容宽换行；保持现radio键盘及provider持久化。回归在原tests/e2e/web-governance.spec.ts尾部，判断实际内容viewport内按钮及文字，不能只检查modal未横溢。

## SET40 具体设置项搜索（2026-10-15；D0，先tests-only）

基线Web f82c891965f80eed9ff0c022d3f77b39bdbad42e，939 tracked clean。Computer Use实际Manus：昵称→个性化+昵称、点child切页并保query/结果焦点；通知→通用+浏览器通知；仅菜单名命中只parent；无匹配未找到结果、当前内容不变。现仅菜单过滤且强留selected，窄屏隐藏search，存在明确功能缺口。

现Navigation/Modal/CSS提供静态设置项搜索，仅导航既有页；无API/wire/schema/owner授权/持久化变化，Skills/连接器业务保护。

## SET36 复制当前任务链接（2026-10-15；D0，先tests-only）

基线Web 97a6d9694cf9e52d54c50d516fac7cde2889bcf1，939 tracked clean；runtime_audit唯一writer，最终13现source/4现test/914保护/Root8。先仅四现test可追加，927其余字节保护。Root方案/docs/独审/原source RED/Git/资源与正常激活。

现keyboard shortcut/Card/AppFrame+九locale及现四测试，复制当前真实task leaf，不公开分享；原测试完整保留，先RED后source，原三快捷键与权限边界保护。

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

<!-- SET25：现chat-prefs准确保存结果，现卡目录10s caller/epoch，不加General模型入口。 -->
<!-- SET24：现AccountCard持有单10s退出生命周期、失败显式重试与身份退役；正式auth client保持。 -->
<!-- SET23：AppearanceCard对应主题/语言行显示Provider各自保存失败及明确重试；Modal关闭重开不清Provider失败。 -->
<!-- SET21/22：Data 与 Help 属于现设置模态，不新建页面框架。 -->
## SET21/22 数据管理与帮助

`shared-tasks-client.ts` 负责同源分享列表的有界读取，`use-shared-tasks.ts` 持有当前准入身份下的分页、停止分享确认和未知结果恢复。`sections/data-management-section.tsx` 同页展示已分享任务、已分享文件、已归档任务及三个管理入口；只有本人任务分享有正式 owner，其他能力显示不可用并禁用操作。停止分享调用既有 SessionClient，未知写结果须完整重读并明确继续；离开页面或身份退役取消请求并清空旧记录。

`sections/help-section.tsx` 提供本产品已实现功能说明，使用现 `selectTab` 回调前往账户和数据管理设置。没有客服或反馈投递时不显示虚假提交成功。Skills 和连接器不属于本片修改范围。

<!-- SET16：Appearance沿既有readBoundary配置subject隔离浏览器通知/声音，setItem成功才确认；营销两行disabledfalse，无owner订阅，不改Skills/连接器。 -->
# ui/settings — 用户设置中心（模态）

## Skills / MCP 当前样式边界
两页共用 `settings-modal.module.css` 的窗口与滚动容器。Settings 不采用通用手机/平板断点：实测 Manus 在 `1436×900` 仍使用约 `768px` 的紧凑横栏 sheet，只有 `≥96rem` 才切为左侧 `221px` rail 的宽屏工作台。紧凑 sheet 保留账户区、搜索、完整文字分类；横栏主路径固定为账户、用量与计费、通用、快捷键、个性化、连接器、技能，Mail/电脑/邮箱等次级项归“更多”。`600×900` 下主栏必须不裁字且不遮住技能；`1600×900` 下才允许双栏连接器工作台。

嵌入 Settings 的连接器列表遵循 shell 模式而非页面 viewport：紧凑 sheet 固定单列，宽屏工作台双列。标题区仅对 Skills/MCP 使用相应顶部间距；表面颜色由站点皮肤的 `--settings-*` token 提供，不改全站白色画布。订阅计划在应用外层管理，不进入 Settings rail。

## 职责
登录后的设置中心（WEB-FACE 面三），与管理后台严格分离。它是浮在工作区之上的 shadcn/Radix `Dialog`，不是整页路由——打开不导航离开、语境原地保留，关闭走背幕/Esc/右上关闭按钮。紧凑桌面使用横向 Tabs + 更多菜单，宽桌面使用两栏导航；内容区一次显一个 tab。开关态由 shell 持有并同步 Manus 风格 URL `#/account/settings/X`（兼容旧 `?settings=X` 深链）（刷新/深链/可分享）。皮肤守 --* token，亮暗双态。

- `settings-modal.tsx` 只负责 Dialog 生命周期、焦点返还、顶层 tab 选择与稳定 client 注入；不持有账户子页、技能 pin 或连接器弹窗状态。
- `settings-navigation.tsx` 是组合根；`settings-navigation-model.ts` 是唯一分类数据源，`settings-navigation-brand.tsx` 只负责品牌/搜索，`settings-navigation-rail.tsx` 只负责选择可见性与溢出菜单。窄屏主分类行可横向滚动，内容滚动保留在右侧 `ScrollArea`，不会由卡片外壳接管。
- `settings-panel.tsx` 拥有 tab panel/viewport 与账户“登录方式”子页的共享标题状态；`settings-panel-content.tsx` 仅按 capability 分派。
- `sections/` 的账户、外观、个性化、快捷键、技能与连接器均是独立组件。技能的 preview pin 与连接器创建 Dialog 各自归所属 section，不向上泄漏到模态壳层。

## 公开件
- `account-sessions-client.ts` / `use-account-sessions.ts` / `sections/account-devices-dialog.tsx`：账户行的独立登录会话管理，分别负责严格有界同源 I/O、subject/admitted generation 内存状态和当前/其他会话及移除确认。未知写结果设独立写栅栏，只有成功首屏读取清除；分页不能恢复写资格，关闭或身份退役取消迟到结果。
- `SettingsModal`（`settings-modal.tsx`）：props `brandName?` / `brandMark?` / `brandLogoUrl?` / `initialTab`(SettingsTab) / `onClose` / `onTabChange?`。客户端组件；tab 内部自持（`initialTab` 定初值、变化即重置，`onTabChange` 上抛供 AppFrame 同步 URL）。**不自持匿名闸**——只在 AppFrame（信封有效）内渲染，会话态由上游保证。
- `SettingsTab` / `SETTINGS_TABS` / `normalizeSettingsTab`（`settings-modal.tsx`）：tab 键类型与 URL 值归一（shell/rail 复用）。
- `chat-prefs.ts`：对话偏好本地 store（localStorage `kokoro.web.chat-prefs`）。`readChatModel`/`readChatAgent`/`writeChatModel`/`writeChatAgent`；null=跟随空间缺省（不上 wire）。

## 协作者
上游：`@/components/blocks/app-frame/app-frame`（第一个 site 工作区入口，持模态开关态 + `#/account/settings/` URL 同步（兼容旧 query 深链））。下游：shadcn Dialog/Tabs/Avatar primitives、`@/ui/theme`（主题）、`@/i18n`（语言 + settings.* 文案）、`@/ui/shell/page-clients`（team/billing 客户端）、`@/billing/format`。
`chat-prefs` 被 `@/ui/shell/use-composer-selectors` 读作选择器初值（新对话首帧预填，会话级锁语义不变）。

## 陷阱
- SET-05：`use-personalization.ts` 只管理四字段草稿、last ACK 与串行失焦保存。复用 shell 的 `readBoundary`，失去准入/身份代际变化或卸载会取消并退役请求；不自行探测 session。首次 GET 未成功前禁编辑；冲突或未知写结果须重读并明确选择采用服务器或在新 revision 保存草稿，不能自动重放。服务器资料不写 live localStorage。`personalization-schema.ts` 校验safe integer/null iff0；`personalization-client.ts` 只接受精确expected+1且四字段匹配的ACK；`personalization-error.ts` 维护请求错误类型。`personalization-request.ts` 的10s总deadline覆盖fetch/body，超时仅取消本次request，不取消编辑session，64KiB响应上限与迟到body清理只属于本协议。四字段上限按Unicode码点计数，hook拒绝超限而不使用UTF-16原生maxLength；五条恢复文案在八个非中文上线语言均有独立翻译。
- 当前 BFF v1 没有个人资料 projection；账户卡在 live 保留信息架构但不渲染未接线的读写动作，预览态只使用 `.test` fixture，浏览器不接收可信 tenant 轴。
- 团队 tab 只使用固定部署租户的 BFF Team Product 客户端；侧栏品牌不由 IAM namespace 覆盖。
- 技能/连接/团队/账单/定价内容使用独立 `XxxContent`（`@/ui/skills`、`@/ui/mcp`、`@/ui/team`、`@/ui/billing`），设置中心直接装配。成果库属于独立的 Session/Artifact 业务面，不再作为账户设置入口重复装配。
- `sections/` 按账户、外观、个性化、设备、部署、整合、对话偏好与快捷键分组件；共享 sections 视觉样式位于 `sections/settings-sections.module.css`。订阅使用 `BillingContent` + `PricingContent`；模态两栏壳层位于 `settings-modal.module.css`。

- SET-07：账户只读资料经 `/api/account/profile` 安全投影既有 BFF `/v1/me` + `/iam/oauth2/userinfo`。`lib/server/account-profile.ts` 复用唯一 RP 配置与 Product session，5s总期限/16KiB、在线准入与最终同session复验；共用 `lib/account-profile.schema.ts` 白名单 wire。settings 的 `account-profile-client.ts`/`use-account-profile.ts` 绑定既有 admitted subject/generation、取消迟到并允许失败重读。live 姓名受控只读，邮箱写/登录方式/删除仍不可用；真实用户ID复制处理失败及身份退役，preview独立。

## SET45 侧栏预设

`src/lib/keyboard-shortcuts.ts`的sidebar新配置/显式重置采用当前参考页的primary+period；现存B或其它自定义绑定不自动重写。既有编辑、订阅和真实Sidebar dispatch保持，相关回归仍在原两个keyboard-shortcuts测试中。

## SET46 用量分类（2026-10-15；D0）

SettingsPanelContent仍只装配既有BillingContent；设置内任务/网站与游戏/电脑/电话分类由现ui/billing的embedded布局负责，不把余额读取或分类状态复制进设置壳。后三类保持禁用和可见说明。

SET46验收范围：既有契约/架构/lint/type/build及38项浏览器回归通过；完整4052PASS/8FAIL，新增登录503/采集超时未归因。原字节候选登录夹具未就绪，不与基线六例通过等价；私有串行诊断六例通过不替代完整门。仅可回退本地候选，正常认证CUA另验。
SET54：现 settings-compact-more-menu 独占 More 的指针/键盘激活、enabled 项焦点及关闭回焦，延续所属 Dialog portal，不建第二菜单、不改业务导航 owner。
