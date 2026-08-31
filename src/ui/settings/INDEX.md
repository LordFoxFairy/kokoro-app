# ui/settings — 用户设置中心（模态）

## 职责
登录后的设置中心（WEB-FACE 面三），与管理后台严格分离。它是浮在工作区之上的 shadcn/Radix `Dialog`，不是整页路由——打开不导航离开、语境原地保留，关闭走背幕/Esc/右上关闭按钮。紧凑桌面使用横向 Tabs + 更多菜单，宽桌面使用两栏导航；内容区一次显一个 tab。开关态由 shell 持有并同步 Manus 风格 URL `#/account/settings/X`（兼容旧 `?settings=X` 深链）（刷新/深链/可分享）。皮肤守 --* token，亮暗双态。

## 公开件
- `SettingsModal`（`settings-modal.tsx`）：props `brandName?` / `brandMark?` / `brandLogoUrl?` / `initialTab`(SettingsTab) / `onClose` / `onTabChange?`。客户端组件；tab 内部自持（`initialTab` 定初值、变化即重置，`onTabChange` 上抛供 AppFrame 同步 URL）。**不自持匿名闸**——只在 AppFrame（信封有效）内渲染，会话态由上游保证。
- `SettingsTab` / `SETTINGS_TABS` / `normalizeSettingsTab`（`settings-modal.tsx`）：tab 键类型与 URL 值归一（shell/rail 复用）。
- `chat-prefs.ts`：对话偏好本地 store（localStorage `kokoro.web.chat-prefs`）。`readChatModel`/`readChatAgent`/`writeChatModel`/`writeChatAgent`；null=跟随空间缺省（不上 wire）。

## 协作者
上游：`@/components/blocks/app-frame/app-frame`（第一个 site 工作区入口，持模态开关态 + `#/account/settings/` URL 同步（兼容旧 query 深链））。下游：shadcn Dialog/Tabs/Avatar primitives、`@/ui/theme`（主题）、`@/i18n`（语言 + settings.* 文案）、`@/ui/shell/page-clients`（team/billing/data-management 客户端）、`@/billing/format`。
`chat-prefs` 被 `@/ui/shell/use-composer-selectors` 读作选择器初值（新对话首帧预填，会话级锁语义不变）。

## 陷阱
- 账户页从同源 `/api/settings/account` 读取 actor projection；email、登录方式和 Passkey 不从 session 信封猜测。预览态只使用 `.test` fixture，浏览器不接收可信 tenant 轴。
- 账户卡当前团队由 `currentNamespace()` + `listMyTeams()` 解析名；预览/无信封显“预览模式”。
- 技能/连接/数据管理/团队/账单/定价内容使用独立 `XxxContent`（`@/ui/skills`、`@/ui/mcp`、`@/ui/data-management`、`@/ui/team`、`@/ui/billing`），设置中心直接装配。`数据管理` 不复用 `@/ui/library`：成果库属于 Session/Artifact 业务面，数据管理属于账户设置 projection。
- 数据管理子视图使用 `#/account/settings/library/authorized-apps` 与 `#/account/settings/library/cloud-browser`；AppFrame 必须接受后缀深链，刷新不能关闭设置窗。
- `settings-sections.tsx`（账户/外观/对话/订阅卡）+ `settings-sections.module.css`（sections 卡片/行/segment/select 皮肤）；账户/外观/对话为 sections，订阅=`BillingContent`+`PricingContent`。模态内两栏布局在 `settings-modal.module.css`。
