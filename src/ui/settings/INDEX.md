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

## 职责
登录后的设置中心（WEB-FACE 面三），与管理后台严格分离。它是浮在工作区之上的 shadcn/Radix `Dialog`，不是整页路由——打开不导航离开、语境原地保留，关闭走背幕/Esc/右上关闭按钮。紧凑桌面使用横向 Tabs + 更多菜单，宽桌面使用两栏导航；内容区一次显一个 tab。开关态由 shell 持有并同步 Manus 风格 URL `#/account/settings/X`（兼容旧 `?settings=X` 深链）（刷新/深链/可分享）。皮肤守 --* token，亮暗双态。

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
