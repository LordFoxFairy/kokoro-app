<!-- SET16：Appearance沿既有readBoundary配置subject隔离浏览器通知/声音，setItem成功才确认；营销两行disabledfalse，无owner订阅，不改Skills/连接器。 -->
# ui/settings — 用户设置中心（模态）

## 职责
登录后的设置中心（WEB-FACE 面三），与管理后台严格分离。它是浮在工作区之上的 shadcn/Radix `Dialog`，不是整页路由——打开不导航离开、语境原地保留，关闭走背幕/Esc/右上关闭按钮。紧凑桌面使用横向 Tabs + 更多菜单，宽桌面使用两栏导航；内容区一次显一个 tab。开关态由 shell 持有并同步 Manus 风格 URL `#/account/settings/X`（兼容旧 `?settings=X` 深链）（刷新/深链/可分享）。皮肤守 --* token，亮暗双态。

## 公开件
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
