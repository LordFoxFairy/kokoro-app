## 裸首页选择（2026-10-26）

page-clients只在冷建direct engine且URL为裸/app时初始化本地空稿选择：复用localDraft＋未提交lifecycle＋无recovery的精确ID，否则保留旧索引项新建本地稿；无索引保原pending槽。缓存不补写conversation URL，只有显式选择或已接受Send发布实际ID。不调用取消/创建业务命令，不删除旧journal，失败不授发送资格。

CHAT-1当前：`use-active-archive-state`区分原请求未确认与owner历史归档状态；正向snapshot/ACK/列表/receipt之前不因乐观正文查归档。`use-conversation-list`只为当前原意图提供显式未确认导航行，不作为已落库清单。

## CHAT-1 同标签未决意图（2026-10-24，候选）

`browser-submission-recovery.ts`按已验证subject、scope、conv持有有界sessionStorage记录，复用原请求builder/严格schema；ACK/明确放弃原key退休，晚ACK不删后继。page-clients的主体资格只由原Product Session成功准入授予，marker仅核变化；普通dispose保留，身份切换清前缀。读异常不是空记录；不存owner线程/凭据，不建立跨tab锁或自动POST。

## 项目与全局 New（2026-10-24）

全局 New 从项目返回 direct `/app`：当前准入/subject marker 校验后，短暂 retain 目标 direct engine 并先 RESET 后 mounted 导航，finally 释放；不重置离开的项目。项目行快捷入口仍是项目根地址；项目 Skill handoff 保留自身作用域。空项目会话与概览共用项目工作区，不以 viewport 替换成默认欢迎页；真实消息由原 thread 渲染。实际证据与未完成项见 [CURRENT](../../../docs/CURRENT.md)。

## 主链读取状态（2026-10-21）

- 模型目录按当前 engine/preview 生命周期读取完整 chat 分页；失败保留同身份已知内容并允许重试，切换身份/engine 退休旧请求与选择。普通新会话首发前显示业务模型选择器；业务 label 上 wire，别名仅展示。
- 空任务只有当前 engine 本地创建证明、无内容、无列表项且无 owner 回执时为 draft，不读取归档状态；首次内容或 owner 证据出现后恢复正式读取。历史 404 不推断为草稿，刷新后的证明缺失仍待正式恢复语义验收。

## MC-02A Chat模型消费（2026-10-20）

模型请求固定feature_key=chat，selector使用raw candidate.name，display_name只作展示；共享现composer-model helper。对话默认偏好仅从 `kokoro.web.chat-prefs.v2` 读取，旧key保留但不读/迁移/清除，不改写未知提交的冻结body/key或恢复状态机。

<!-- SET47 archive consumer: 2026-10-15 -->
SET47：use-session-archive只持AppFrame当前身份/engine/scope的命令资格、unknown与独立archiveRevision；use-active-archive-state只持当前active的owner证据与有界重读，不作全局真源。useConversationList以ACK先后顺序保护旧读，post-ACK state/list可覆盖旧回执；不delete/reconcile engine。page-clients在真实身份切换/logout退休全部live engine本地创建证明。

## SET29 侧栏账户余额可信读取（2026-10-15；D0，先tests-only）

Web基线2d31cd502db44b5b0ad74e52321cba755624896f，939 tracked clean；runtime_audit唯一writer本片4既有source+1既有rail测试，927最终保护/Root7；先仅测试准入，其余931字节保护。Root管设计/docs/Git/资源/正式激活/CUA，Skills/连接器业务排除。

AppFrame可信ProjectReadBoundary沿原rail props/shell进入account余额；同subject/generation退役隐藏及取消，marker不授准入。

## SET28 Web阅读轴滚动槽修补（2026-10-15；正式D0）

正式Web基线7e062cd5e69847bfb34181b6674cb998c4cc50f1，939 tracked clean。runtime_audit唯一writer仅app-frame-main.module.css；931保护/Root7。Root设计/docs/Git/资源/正常激活/CUA。既有精确E2E已多次真实RED，无新tests-only或新增镜像测试；全部tests/阈值/mock/skip/等待保持字节。

Web专属thread viewport统一隐藏滚动条槽以匹配Composer阅读轴；共享/mobile代码和滚动逻辑保持，现精确E2E阈值保护。

<!-- SET16：use-task-notifications.ts 从已准入subject/generation订阅typed信号，hidden/blur时投递；切会话关闭owned提示/声音，身份及scope退役取消订阅；use-awaiting-notify.ts仅徽标/title。 -->
# ui/shell — 页面装配层

`bindBrowserMessagePartsReadRecheck` 仅承接 AppGate 的原 Product 准入端口；live engine 在 parts 首次读取前捕获精确 subject/data generation。列表、写命令、preview 不接该恢复，不由本地 marker 授权；同一页401恢复不重启 Message reader 的10秒预算或改变 scope/cursor。

- 挂载内导航：独立目录页面不解释/写入 conversation URL，不接管聊天恢复、错误或 Todo 状态；目录组件 key 不随后台 activeId 改变。返回 Direct/Project 仍按原会话深链恢复。
- History 和延迟 URL 写入必须匹配当前 engine 的精确 scope pathname；跨 Direct/Project 的旧闭包不打开、清空或取消会话。新路由的 scope 自己恢复，未知地址不回落为 Direct。
- 侧栏桌面密度按实测使用 14px 正文、13px 分组、36px 行；触屏 44px 命中区仅由显式 drawer 标记控制。“更多”按参考保留 Computer Use/Skills/个性化；Computer Use 未开放时明确禁用，不伪造可用能力。已启用的 scheduled 进入一级“自动化”（保持原正式路径和 mounted 导航），不再在更多重复；缺失/关闭时仍明确不可用。其他 manifest 独有入口保持原访问。

- 项目整行仅披露自身任务，装饰 folder/chevron 不单独命中；右侧快捷 Link 进入 project.href 根工作区（不创建会话或改名），rename 只走项目选项菜单。无 scoped reader 的受控嵌入仍保持展开语义并明确不可用，不借 Direct 数据；Space/方向键/ESC 保排序，Enter 展开。项目空清单仅成功空读时显示“暂无任务”。首次进入活动项目只初始化一次展开意图，离开项目路由不收起；用户主动收起后再次进入不强制展开。桌面初次读的 loading/成功空态均占同一 36px 行，Project 缩进同为 36px；保留 loading/empty/error 语义，不先画假空态，也不靠高度动画掩盖回缩。

- Direct 与首次展开/访问的 Project 各自由 AppFrame 内 keyed reader host 常驻持有，侧栏/主区共用同一 controller；折叠和路由切换只换视图与 engine 附着，不重建分页/命令队列。shell-local registry 仅发布稳定 controller 引用，身份/generation/admission 立即隔离旧投影；未注册明确 loading，不再创建 Independent reader 或跨身份全局缓存。Move revision 对各 scope 单调，只失效本次 source/target；运行结束刷新只比较同生命周期、已就绪且非水合中的 engine 状态，离开页面不冒充结束。

## 职责
持有页面级引擎单例，订阅快照，把纯投影接线到各 UI 域。本层只做插槽接线；域内状态一律下沉到 controller。

## 公开件
- `AppFrame`（`src/components/blocks/app-frame/app-frame.tsx`）：User Web 唯一工作区入口。props `engine?`（测试注入缝）/ `brandName?` / `brandMark?` / `brandLogoUrl?`。AppGate 统一消费 runtime manifest，确保第一个 site 的主题和品牌跨登录、工作台、设置一致。
- `page-clients.ts`：页面级单例客户端/引擎（`browserEngine` / `browserListClient` / `browserHubClient` / `browserBillingClient` / `browserPricingClient` / `browserTeamClient`）。仅浏览器构造，SSR 为 null；live 还须当前文档可信 subject 与 marker 一致，未准入返回 null。AppFrame 仅在无 lease 时借现 Move 通知唤醒重核，通知本身不授权。
- `AUTH_INDEX_SUBJECT_KEY` / `readBrowserAuthIndexSubject` / `admitBrowserAuthSessionIndexes`：唯一 UI subject marker key 同时供跨标签事件过滤和可信探针前后身份比较；同 subject 新文档保留索引，不同 subject 只清 `kokoro.web.conversations.` 前缀后更新 marker。marker 仅撤销旧读取，不是认证或授权证明。
- 域 controller hooks（各自持查询/store/回调）：`useComposerSelectors` / `useDraft` / `useConversationList` / `useConversationReaders` / `useAwaitingNotify` / `useCanvasWorkspace`。Skill source 选择只在 engine 会话内存中，不使用 browser store。

## 协作者
上游：`@/engine`（引擎/快照）。下游：composer/thread/rail/canvas/hitl 各域组件、四大面板、`@/lib/query`、各外部 store。

## 陷阱
- shell 是插槽接线：新增域状态放对应 controller hook，不要塞回 shell。
- page-clients 是浏览器单例：SSR/未水合返回 null/惰性，取数 effect 依赖其稳定引用。
- 鉴权由 httpOnly 信封 cookie 同源携带，前端不持 token。
- 管理面板（技能/连接/作品/团队/账单/定价）统一到设置中心模态（`@/ui/settings` `SettingsModal`，浮在工作区之上）；`AppFrame` 持模态开关态 `settingsTab` 并同步 Manus 风格 URL `#/account/settings/X`（兼容旧 `?settings=X` 深链）（`window.location`+`history.replaceState`，**不用 `useSearchParams`**——免 Suspense 边界/不动测试 mock）。rail 各入口 + 错误恢复卡（余额/套餐）改调 `openSettings(tab)`，不再提供旧整页设置路由。
- `useComposerSelectors` 的模型/agent 初值取 `@/ui/settings/chat-prefs` 缺省偏好——新对话首帧预填，开跑后 modeLocked 锁定，会话级锁语义不变。

- scope 切换只在本页暂留未获 create receipt 的原 engine（包括 unknown），不新建持久化 store、不自动重发；回到原 scope 继续原 key/body。回执落定且无页面 owner 即释放，身份失效强制退休无 owner 的缓存；已确认运行保持原先离页释放行为。

`useComposerConnections`仅持当前主体/准入代际/engine的Connection列表及metadata读缓存（四并发、显式分页、重复游标/身份错配拒绝）；selection真态在engine，打开菜单背景重读，同scope失败保已知列表。主体退休取消/忽略迟到，不持久化或授权；自有读取不挤入Settings coordinator。

CHAT-1：page-clients将draftLifecycle按既有主体准入和scope装配；独立draft-retired键沿原conversation前缀清理，无正文/secret/TTL。保原ID和Skill试用引用，不在索引覆盖时恢复已退休来源。
