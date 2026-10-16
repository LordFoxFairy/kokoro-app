# ui/shell — 页面装配层

- 挂载内导航：独立目录页面不解释/写入 conversation URL，不接管聊天恢复、错误或 Todo 状态；目录组件 key 不随后台 activeId 改变。返回 Direct/Project 仍按原会话深链恢复。
- History 和延迟 URL 写入必须匹配当前 engine 的精确 scope pathname；跨 Direct/Project 的旧闭包不打开、清空或取消会话。新路由的 scope 自己恢复，未知地址不回落为 Direct。
- 侧栏桌面密度按实测使用 14px 正文、13px 分组、36px 行；触屏 44px 命中区仅由显式 drawer 标记控制。“更多”保留 Skills/个性化和独立附加入口，Computer Use 未开放时明确禁用，不伪造可用能力。

- 项目整行仅披露自身任务，装饰 folder/chevron 不单独命中；右侧快捷 Link 进入 project.href 根工作区（不创建会话或改名），rename 只走项目选项菜单。无 scoped reader 的受控嵌入仍保持展开语义并明确不可用，不借 Direct 数据；Space/方向键/ESC 保排序，Enter 展开。项目空清单仅成功空读时显示“暂无任务”。

- Direct 与首次展开/访问的 Project 各自由 AppFrame 内 keyed reader host 常驻持有，侧栏/主区共用同一 controller；折叠和路由切换只换视图与 engine 附着，不重建分页/命令队列。shell-local registry 仅发布稳定 controller 引用，身份/generation/admission 立即隔离旧投影；未注册明确 loading，不再创建 Independent reader 或跨身份全局缓存。Move revision 对各 scope 单调，只失效本次 source/target；运行结束刷新只比较同生命周期、已就绪且非水合中的 engine 状态，离开页面不冒充结束。

## 职责
持有页面级引擎单例，订阅快照，把纯投影接线到各 UI 域。本层只做插槽接线；域内状态一律下沉到 controller。

## 公开件
- `AppFrame`（`src/components/blocks/app-frame/app-frame.tsx`）：User Web 唯一工作区入口。props `engine?`（测试注入缝）/ `brandName?` / `brandMark?` / `brandLogoUrl?`。AppGate 统一消费 runtime manifest，确保第一个 site 的主题和品牌跨登录、工作台、设置一致。
- `page-clients.ts`：页面级单例客户端/引擎（`browserEngine` / `browserListClient` / `browserHubClient` / `browserBillingClient` / `browserPricingClient` / `browserTeamClient`）。仅浏览器构造，SSR 为 null。
- `readBrowserAuthIndexSubject` / `admitBrowserAuthSessionIndexes`：以独立 UI subject marker 比较可信探针前后身份；同 subject 新文档保留索引，不同 subject 只清 `kokoro.web.conversations.` 前缀后更新 marker。marker 不是认证或授权证明。
- 域 controller hooks（各自持查询/store/回调）：`useComposerSelectors` / `useDraft` / `useConversationList` / `useConversationReaders` / `useAwaitingNotify` / `useCanvasWorkspace`。Skill source 选择只在 engine 会话内存中，不使用 browser store。

## 协作者
上游：`@/engine`（引擎/快照）。下游：composer/thread/rail/canvas/hitl 各域组件、四大面板、`@/lib/query`、各外部 store。

## 陷阱
- shell 是插槽接线：新增域状态放对应 controller hook，不要塞回 shell。
- page-clients 是浏览器单例：SSR/未水合返回 null/惰性，取数 effect 依赖其稳定引用。
- 鉴权由 httpOnly 信封 cookie 同源携带，前端不持 token。
- 管理面板（技能/连接/作品/团队/账单/定价）统一到设置中心模态（`@/ui/settings` `SettingsModal`，浮在工作区之上）；`AppFrame` 持模态开关态 `settingsTab` 并同步 Manus 风格 URL `#/account/settings/X`（兼容旧 `?settings=X` 深链）（`window.location`+`history.replaceState`，**不用 `useSearchParams`**——免 Suspense 边界/不动测试 mock）。rail 各入口 + 错误恢复卡（余额/套餐）改调 `openSettings(tab)`，不再提供旧整页设置路由。
- `useComposerSelectors` 的模型/agent 初值取 `@/ui/settings/chat-prefs` 缺省偏好——新对话首帧预填，开跑后 modeLocked 锁定，会话级锁语义不变。
