<!-- 2026-10-22 continuation retirement correction -->
积分客户端每次续发 PUT 或核实 GET 前复验调用方 `getCurrent`；真实账户/用量/rail传入现 controller/current 与发起时已准入subject的marker一致性检查。只更新storage、无rerender/focus仍会抑制旧续发；marker丢失、不匹配或读取异常一律退休。marker只抑制，不授予session权限；非UI调用可不传callback，初次GET契约保持，无新store/轮询/锁。

## 当前账户积分初始化（2026-10-22）

现账户摘要仍只调用稳定 `BillingClient.summary`，由该客户端在可信 missing-account 后执行一次幂等初始化并重读；不挂载账本、不新建store、页面无开户入口/未开户提示/大骨架/可见加载文字。按原 subject/generation、撤准入和卸载即时退休，保现设置窗口已确认摘要及失败显式重试。其他设置草稿、资料保存、Skills/MCP和支付均不扩展；下方旧“本片不负责积分初始化”描述仅属当时范围。

## 账户页签切换（2026-10-20）

`account-read-snapshots.tsx` 仅在本次打开的设置窗口中保留已确认的资料与积分摘要，按 preview/准入/主体/代次清空；离开页签仍卸载编辑器和子弹窗，返回时后台重读，不闪空姓名或可见“正在加载”文案。缓存不作为写权限：资料重核前禁编辑/保存，最终 hook 阻止旧闭包；重核后的新姓名只更新未编辑状态，原草稿、CAS、未知写入与显式恢复保持。首次积分读取使用可访问占位，不虚构零余额或自动重发写入；本片不负责积分初始化、充值或扣减。

## MC-02A Chat模型消费（2026-10-20）

模型请求固定feature_key=chat，selector使用raw candidate.name，display_name只作展示；共享现composer-model helper。对话默认偏好仅从 `kokoro.web.chat-prefs.v2` 读取，旧key保留但不读/迁移/清除，不改写未知提交的冻结body/key或恢复状态机。

账户积分：`sections/account-credit-summary.tsx` 仅复用稳定 BillingClient 的 summary 读取及严格错误分类、十秒预算和 BigInt 格式化，不读取账本或执行开户/支付；只在已准入且主体与代际有效时加载，切身份、撤准入、卸载或进入登录方式内页即退休。展示真实可用/冻结积分、账户状态与未开户/失败/重试，未知不合成零或套餐，preview 原值不变。

帮助中心：`sections/help-section.tsx` 在当前语言的八篇静态指南标题与正文内搜索，四类数量从目录派生，筛选与单项展开只驻留当前页面。复用 Accordion 与原 onSelectSetting 跳转，不请求资料、发送客服消息或保存查询。原账户/分享正文整合入指南，能力范围常驻底部；离页重入清空筛选与展开。

设置局部视觉：通用通知行随译文自然增高，前三项紧凑排列、广告用具名独立分隔；快捷键语音不可用项列第二，四个真实操作保原顺序与录制/取消/重置行为，长文字及窄屏控件自然换行；姓名标签全行、输入与原显式保存桌面同排，反馈与冲突跨整行，窄屏堆叠，不改CAS。电话/钱包采用中性双图标说明卡，桌面64px、窄屏52px。电话使用“使用前须知”提示条分组三项原说明并保留双按钮；钱包继续整行，原未接通原因和紧凑取消放下方。两页保持自然滚动、关闭回焦及最终操作禁用。邮箱/开发者采用紧凑表单；API 密钥过期选择复用现 Radix Select。Mail/开发者页签、Data/Help 分区与账户控件只统一层次、间距和主题 token，保留业务状态、确认、分页与未接通说明。

账户内页由 SettingsPanel 单一 AccountDetail 枚举管理资料、登录方式与设备；Header 进入聚焦标题、返回回焦对应入口，离页或身份/准入/代际变化退休子页。正式登录方式的三种 provider 和通行密钥明确状态不可读取，连接/新增禁用。原 account-devices-dialog 模块改为同层区域，展示中性图标、当前会话卡与其他会话分组；当前标题在卡外，其他会话标题与列表同框，每卡保留一份未知设备说明及全部创建/到期日期，日期自然同行或换行，不重复分组标题。保留原加载/错误/分页/刷新/移除确认和未知结果栅栏，不修改 useAccountSessions 或 API。account-service-details-dialog 仅承载400px邮箱验证与删除确认：邮箱使用已确认的验证地址，输入与禁用发送同框；删除展示永久警示和当前单个 Kokoro 身份，不添加验证码或其他产品事实，最终删除禁用。preview 原流程与真实姓名、设备和退出保持。通用发送行为可浏览三种选项，当前仍为队列，另两项禁用。共享文件管理详情缺 reader 时明确不可读取。

服务创建前流程：现六个服务 section 保留唯一入口；phone-assignment-dialog、email-create-dialog、wallet-payment-dialog、developer-credential-dialogs 和 mail-configuration-dialogs 分别呈现用途说明或临时表单。最终分配、保存、创建和授权因服务缺失保持禁用，输入不提交或持久化；URL/邮箱只做浏览器格式反馈。关闭或切页卸载草稿，settings-panel-content 的 Mail/Email/Developer 仍按 preview/准入/subject/generation 设置草稿退休 key。Phone/Wallet 仅含无输入、无主体数据和无请求的静态说明，使用 preview/subject 身份 key；同主体会话复查不关闭说明，换主体、subject 变 null、preview 切换或离页仍卸载，不改变任何读写准入。

Mail 内页：授权发件人在同文件具名 inline editor 中编辑；仅当前编辑器持有焦点时捕获 Escape，取消清空回焦，切页/身份变化卸载并清理监听。邮箱设置与工作流分别使用440/480px临时表单，未知账户前缀和域名用中性文字说明，不拼接虚假地址。收件箱只保留表头、禁用刷新及不可读取说明。Developer 文档条与中央用途说明保留未接通事实，凭据表单局部400px，原6个到期值和最终禁用不变。

integration-settings-section 自持五应用整卡入口、同层内页 h1、返回与焦点，切页卸载后回到总览；integration-details-dialog 原文件承载具名内页内容和本地图标，Slack 展示预期用途，Zapier 的八项仅为明确未接通的静态工作流示例，连接和尝试保持禁用，无授权 URL 或请求。data-management-section 自持数据总览及三项同层管理内页的 h1、返回和焦点；data-management-details-dialog 中的具名内容展示授权应用、云浏览器数据和已购域名不可读取的状态，共享文件仍沿原 Dialog。登录保持为明确未知的禁用控件，域名购买保持禁用；原分享、归档 hook、确认与恢复不变，不添加资产 API、假数据或外部授权。邮箱资产创建表单局部480px，同框输入与未知域名说明不拼接虚假地址。收件箱刷新为同名正方形可访问图标按钮，导航全局未接通说明仅视觉隐藏并保留关联描述。

`sections/personalization-card.tsx` 同时呈现既有四字段的code point计数、超限尝试未采用提示与保存状态；反馈按身份代际退休，限制复用现schema，原blur/CAS不变。

个性化内部界面：`sections/personalization-card.tsx` 管理资料/知识页签、整卡导入入口与原资料能力，计数放在字段标题行；底部导入入口使用同一自然滚动内容内的 sticky footer 保持可见，末字段及错误反馈仍可滚到其上方。`sections/personalization-knowledge-panel.tsx` 呈现知识偏好不可读取的中性禁用状态、搜索和独立宽度草稿弹窗，保存按钮与弹窗共用唯一完整不可用说明；`sections/memory-import-dialog.tsx` 呈现复制提示词及粘贴内容的分步界面。两个临时表单关闭或身份代际变化后卸载，最终服务写入保持禁用；复制仍等待真实 clipboard 成功并退役迟到结果。`sections/data-management-section.tsx` 继续沿现分享/归档 hooks，只补管理用途说明与排列。

资产页面内部布局：邮箱/电话的说明与创建按钮在内容区居中；钱包分为支付方式行和账单区；开发者页签下保留说明、文档不可用提示和独立内容区。四页用各自本地根类及直属面板接通 Radix 内联 table 的确定高度，按实际剩余空间分配引导区，长内容自然撑开滚动，不用视口减固定值估算。样式只归 sections/settings-sections.module.css，不改变服务能力或网络边界。 Mail 设置改为四组配置行并保留收件箱；集成页用现有图标资源和应用用途卡片，窄屏单列。说明覆盖全部九种现有语言，应用卡片不表示已连接。

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

`shared-tasks-client.ts` 负责同源分享列表的有界读取，`use-shared-tasks.ts` 持有当前准入身份下的分页、停止分享确认和未知结果恢复。`sections/data-management-section.tsx` 同页展示已分享任务、已分享文件、已归档任务及三个管理入口；只有本人任务分享有正式 owner，其他能力显示不可用并禁用操作。停止分享调用既有 SessionClient，未知写结果须完整重读并明确继续；每次阻塞重读开始即撤销上次的继续资格，加载、失败或分页不完整均保持阻塞，只有本次完整成功后才能显式继续。离开页面或身份退役取消请求并清空旧记录。

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
- `chat-prefs.ts`：对话偏好本地 store（localStorage `kokoro.web.chat-prefs.v2`）。`readChatModel`/`readChatAgent`/`writeChatModel`/`writeChatAgent`；null=跟随空间缺省（不上 wire）。

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
## 窄屏设置导航（2026-10-23）

`SettingsNavigationRail` 在桌面使用纵向侧栏、窄屏使用完整横向滚动导航；不再按六个固定分区隐藏 Skills 等后续入口。更多菜单来自同一导航模型并排除当前分区，保留不可用项与键盘语义。根据实际布局方向清退旧轴滚动，选中项定位后不再向前回滚而挤出右侧边界。

参考：同日 Manus 技能设置 390×844，后续分区实际保留于横向滚动容器，更多菜单含账户等全部非当前分区。新增一个真实浏览器旅程覆盖 Skills 深链、更多→集成、320/390/767/768 缩放及键盘→开发者；只验证可见性/可达性，不锁 CSS 字符串或像素常量。隔离预览不代表正常业务数据/CRUD验收。

紧凑More的portal在触发器随响应式模式隐藏时关闭；菜单拥有的焦点回到当前tab，外部焦点不被夺取。验收包含菜单打开状态跨断点，而非只有静态尺寸。
