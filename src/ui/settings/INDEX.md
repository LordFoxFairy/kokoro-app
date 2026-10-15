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
- `SettingsModal`（`settings-modal.tsx`）：props `brandName?` / `brandMark?` / `brandLogoUrl?` / `initialTab`(SettingsTab) / `onClose` / `onTabChange?`。客户端组件；tab 内部自持（`initialTab` 定初值、变化即重置，`onTabChange` 上抛供 AppFrame 同步 URL）。**不自持匿名闸**——只在 AppFrame（信封有效）内渲染，会话态由上游保证。
- `SettingsTab` / `SETTINGS_TABS` / `normalizeSettingsTab`（`settings-modal.tsx`）：tab 键类型与 URL 值归一（shell/rail 复用）。
- `chat-prefs.ts`：对话偏好本地 store（localStorage `kokoro.web.chat-prefs`）。`readChatModel`/`readChatAgent`/`writeChatModel`/`writeChatAgent`；null=跟随空间缺省（不上 wire）。

## 协作者
上游：`@/components/blocks/app-frame/app-frame`（第一个 site 工作区入口，持模态开关态 + `#/account/settings/` URL 同步（兼容旧 query 深链））。下游：shadcn Dialog/Tabs/Avatar primitives、`@/ui/theme`（主题）、`@/i18n`（语言 + settings.* 文案）、`@/ui/shell/page-clients`（team/billing 客户端）、`@/billing/format`。
`chat-prefs` 被 `@/ui/shell/use-composer-selectors` 读作选择器初值（新对话首帧预填，会话级锁语义不变）。

## 陷阱
- 当前 BFF v1 没有个人资料 projection；账户卡在 live 保留信息架构但不渲染未接线的读写动作，预览态只使用 `.test` fixture，浏览器不接收可信 tenant 轴。
- 团队 tab 只使用固定部署租户的 BFF Team Product 客户端；侧栏品牌不由 IAM namespace 覆盖。
- 技能/连接/团队/账单/定价内容使用独立 `XxxContent`（`@/ui/skills`、`@/ui/mcp`、`@/ui/team`、`@/ui/billing`），设置中心直接装配。成果库属于独立的 Session/Artifact 业务面，不再作为账户设置入口重复装配。
- `sections/` 按账户、外观、个性化、设备、部署、整合、对话偏好与快捷键分组件；共享 sections 视觉样式位于 `sections/settings-sections.module.css`。订阅使用 `BillingContent` + `PricingContent`；模态两栏壳层位于 `settings-modal.module.css`。
