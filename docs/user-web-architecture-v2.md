# Kokoro User Web 前端架构 v3

状态：当前桌面 Web 实施基线（2026-08-31）。本仓库是一个独立产品 Web，不在浏览器模型中
引入 Site/tenant 概念；仓库、构建产物、部署和产品布局天然一一对应。仓库拆分与共享 package
规则见 [`site-repository-architecture-v2.md`](./site-repository-architecture-v2.md)。

## 1. 设计目标

- 桌面优先，体验接近 Codex/Manus：左侧工作区导航，中间任务/会话工作区，按需打开右侧上下文面板。
- 首页、直接聊天、项目内聊天、Skills、Library、Scheduled、Agent、设置和各种 overlay 使用
  同一套可预测的布局约束，不再由多个旧样式系统互相覆盖。
- shadcn/ui 是视觉和交互底座；Radix 管理焦点、portal、键盘、Escape、返回焦点和可访问性。
- 产品仓库拥有自己的页面 IA、文案、SEO、素材和 CSS Modules；跨产品只复用无品牌依赖的
  package，不复用另一产品的页面源码。
- 浏览器只调用同源 BFF。域名、身份、授权、数据隔离和服务间上下文留在服务端。

## 2. 产品工作区模型

### 2.1 顶层导航

```text
直接聊天
项目 / 专案
Agent
Skills
Scheduled
Library
设置
```

直接聊天和项目内聊天是两种不同的资源关系：

- 直接聊天创建独立会话，不自动挂靠项目；
- 项目页默认展示项目会话入口，项目可以拥有多个会话和项目资源；
- 从侧边栏点击项目、会话、Agent 或功能入口时，使用客户端路由更新 URL，不整页刷新；
- 切换资源只替换工作区状态，Rail、Composer、右侧 Context Panel 保持稳定，避免闪屏。

### 2.2 AppFrame 分区

```text
┌──────────────────────────────────────────────────────────────┐
│ Rail │ Header / project or conversation context              │
│      ├───────────────────────────────┬──────────────────────┤
│      │ Main workspace                 │ Context panel        │
│      │ empty / thread / feature       │ optional, resizable  │
│      └───────────────────────────────┴──────────────────────┘
│      │ Composer / status / footer                            │
└──────────────────────────────────────────────────────────────┘
```

- Rail 使用 shadcn `SidebarProvider`、`Sidebar` 和 `SidebarMenu`，桌面支持 expanded/icon 两态。
- Rail 收缩不能改变主区的最小宽度；拖拽 Resizable handle 时只改变目标 panel，不能出现双线、
  负宽度或主区跳动。
- 中间工作区使用 `minmax(0, 1fr)`，所有文本和代码块允许断行/横向滚动，不把固定宽度传递到
  viewport。
- Context panel 使用 shadcn `ResizablePanelGroup`；弹出查看使用 Dialog/Sheet，不复制一套
  自定义 modal CSS。
- Composer 固定在当前工作区底部的稳定槽位；草稿、焦点、选择的工具和胶囊状态不因路由切换丢失。

## 3. 组件分层

```text
src/components/ui/     shadcn primitives：Button/Input/Dialog/Sidebar/...
src/components/blocks/ 跨领域组合块：Rail/Composer/Thread/ContextPanel
src/ui/                 产品领域组件：skills/library/settings/scheduled/...
src/features/           feature controller 与 use-case
src/data/               BFF clients、query/cache、request id、错误映射
src/contract/           browser/BFF schema、action 和 error contract
src/core/               reducer、projection、persistence、纯状态
src/engine/             session、SSE、HITL、reconnect
src/app/                Next routes、同源 BFF 和服务端装配
```

### 3.1 组件粒度

- `components/ui` 只包含可替换的 shadcn/Radix/Lucide 基础交互，不知道产品文案、会话、权限或
  后端服务。
- `components/blocks` 只接受 typed props、slots 和 action adapters，不直接 fetch，不决定某个
  产品的页面排列。
- `ui` 组件只拥有一个清晰的交互表面，例如 `ComposerToolbar`、`ConversationThread`、
  `SkillCreateDialog`、`ScheduledTaskEditorDialog`、`LibraryDetailDialog`。
- `features` 连接 controller/use-case 与视图；视图不拼接后端 URL，不直接处理 SSE 事件。
- `core` 不依赖 React、Next、DOM、网络或 CSS；SSE 事件统一进入 reducer，并使用 generation guard
  防止迟到事件污染当前会话。
- 所有异步数据统一使用 `ResourceState<T>`：`idle | loading | ready | empty | error |
  forbidden | unavailable`。
- 所有写操作统一使用 `ActionState`：`idle | submitting | success | error`，保留
  `request_id` 与 `command_id` 用于日志关联和命令重放。

## 4. shadcn/ui 交互底座

### 4.1 必备 primitives

```text
Button, Input, Textarea, Field, Label
Card, Empty, Alert, Skeleton, Badge, Separator
Sidebar, SidebarProvider, SidebarInset, SidebarMenu, SidebarMenuButton
Dialog, AlertDialog, Sheet, Popover, Tooltip
DropdownMenu, ContextMenu, Command
Tabs, Toggle, ToggleGroup, Select
ScrollArea, ResizablePanelGroup, ResizablePanel, ResizableHandle
```

规则：

- Button 只选择标准 variant：`default / secondary / outline / ghost / destructive / link`。
- Sidebar 收缩态使用 `collapsible="icon"` 和 Tooltip；移动端 Sheet 保持独立，不反向污染桌面布局。
- Dialog/Sheet/Popover 使用 portal 和 Radix focus 管理；页面 CSS 只负责尺寸、间距和 token。
- Tabs、ToggleGroup、Select、Command 使用 primitive 自带键盘和选中状态。
- Resizable 只允许一个状态源管理宽度，禁止 grid、拖拽器和浮层各自维护一份宽度。

### 4.2 视觉 token

产品页面只使用语义变量：

```text
--background       --foreground       --card
--popover          --primary          --primary-foreground
--secondary        --muted            --muted-foreground
--accent           --border           --input
--ring             --destructive      --radius
```

运行时主题来自受 schema 约束的公开 manifest projection；BFF 裁剪非法字段。浏览器不接受
任意 CSS property、style string、script 或 HTML。Logo、字体和素材使用受信 asset reference，
加载失败时保留稳定 fallback。

## 5. 页面与交互契约

### 5.1 首页与 Composer

- 空态保持安静的全屏工作画布，标题、Composer、场景入口和底部说明按照稳定栅格排列。
- Composer 的工具栏、连接器、环境胶囊、语音、发送按钮保持 32px 控件基线；胶囊可关闭、状态
  可回退、路由切换不改变其槽位。
- 发送后 URL 通过客户端路由进入会话状态；不做整页导航，不让旧组件树与新组件树同时挂载。
- 录音使用内联 Mic 状态：`idle → listening → transcribing → idle/error`，不新增不符合产品
  交互的弹窗。

### 5.2 会话与项目

- 直接会话和项目会话使用不同的资源 URL 与标题上下文。
- 会话流状态由 engine/reducer 管理：`connecting → streaming → awaiting → completed/failed`。
- 重新连接、切换会话、取消、审批、下载和迟到 SSE 都必须有 generation guard。
- 项目资源列表、会话列表和消息区域使用稳定骨架尺寸；loading/empty/error 不导致主布局跳变。

### 5.3 Skills、Library、Scheduled、Agent

每个功能按“列表 → 空态 → 创建/编辑 → 详情 → 错误/权限”完成，不用静态卡片冒充完成：

- Skills：官方目录、我的 Skills、创建菜单、Git 导入 preview/confirm、导入错误、取消和重试；
- Library：成果列表、过滤/搜索、详情 overlay、回到来源会话；
- Scheduled：列表/日历、创建/编辑、启停、删除、下一次运行时间的本地化展示；
- Agent：目录、详情、能力说明、启用入口和不可用状态。

所有创建/编辑操作都使用独立 controller 和 ActionState，成功状态使用 inline status/toast，
不遮挡主工作区；异步错误保留 request id 和可重试动作。

### 5.4 设置和 overlay

- 设置通过同一 AppFrame 的 route state 打开，URL 可恢复当前设置页，但不触发整页刷新。
- 大内容使用可滚动 Dialog body，header/footer 保持可见；小屏桌面窗口使用最大高度和
  `ScrollArea`，禁止内容被 footer 吃掉。
- overlay 关闭时清理对应 URL state、恢复触发按钮焦点、停止未完成请求并清理临时状态。
- tooltip、popover、dropdown、dialog 不同时抢焦点；点击侧边栏只发生一次状态提交，避免闪动。

## 6. BFF 与运行时请求

### 6.1 域名配置

```dotenv
KOKORO_DOMAIN="dev.kokoro.localhost"
```

一个产品部署只配置一个规范域名。域名不是前端 selector，也不进入 React props、URL、body、
localStorage 或公开缓存。

### 6.2 RFC 7239 `Forwarded` 注入

```text
Browser → same-origin /api/* → BFF
BFF 读取 KOKORO_DOMAIN
BFF → IAM/System/User/Session/Hub/Billing
      Forwarded: host=<KOKORO_DOMAIN>
```

BFF 对每个上游请求统一覆盖并生成 RFC 7239 `Forwarded`，包括普通 JSON、SSE、下载、写操作和重试。浏览器
传入的同名 header 一律忽略。后端在验证 BFF 服务身份后，根据此代理上下文处理域名绑定、身份、权限和数据隔离；前端不接触内部
隔离键，也不自行做隔离判断。

### 6.3 前端公开数据

浏览器只接收：

- 当前用户可见的产品/菜单/语言/主题/feature projection；
- 会话、文件、成果、Skills、Library、Scheduled 和 Agent 的业务数据；
- 稳定的错误码、request id、分页/游标和 ActionState 所需字段。

浏览器永远不接收 workload token、内部 JWT、数据库/Redis key、内部 URL、服务间 header 或
后端隔离标识。

## 7. 状态与缓存

### 会话状态

```text
SessionResource
├── list: cursor/page state
├── activeSessionId
├── snapshot: messages/files/deliveries/todos
├── stream: connecting/streaming/awaiting/completed/failed
├── draft: per-session local draft
└── optimistic mutations: rename/delete/share
```

UI-only 状态可以持久化：Rail collapsed、设置 tab、process disclosure、Composer mode 和
Context panel width。身份、权限结论、服务端事实、凭据和内部隔离信息不得持久化到浏览器。

缓存由 BFF 和 data adapter 统一管理：query key 至少区分产品部署、用户会话、资源、locale、
surface 和版本；浏览器不拼接内部隔离键。

## 8. 错误、加载与可用性

| 状态 | UI 行为 |
| --- | --- |
| loading | Skeleton 占据稳定尺寸 |
| empty | Empty + 明确下一步动作 |
| unauthenticated | 清理本地 session，进入登录 |
| forbidden | 通用无权限，不枚举资源 |
| unavailable | 服务不可用 + request id + 有界重试 |
| conflict | 资源已变化，刷新后重试 |
| success | inline status/toast，不遮挡主工作区 |
| offline/reconnect | 保留草稿，展示连接状态，不假装提交成功 |

## 9. 验收门槛

### 桌面视觉与交互

- 同一 CSS token、间距、字体、圆角、阴影和 control size 贯穿所有页面；
- 1440/1280/960/768 桌面宽度无横向溢出；
- Rail expanded/icon、Resizable、Dialog、Sheet、Popover、Command 有键盘回归；
- 首页、直接会话、项目会话、设置、Skills、Library、Scheduled、Agent 都有截图对比；
- 路由切换无整页白屏、重复树、位置跳动或内容闪现。

### 工程与安全

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

- 每个 BFF 上游请求都带服务端生成的 RFC 7239 `Forwarded`；
- browser source/network/localStorage 不出现内部隔离键、workload token 或 IAM JWT；
- 域名配置错误、后端不可用、manifest 校验失败和权限错误均有可恢复状态；
- 当前基线只验证桌面 Web，手机端不属于本轮范围。
