# Manus 工作台参考审计 v2

日期：2026-08-25  
范围：已登录 Manus Web 的桌面项目页；Kokoro 手机端继续冻结。

## 1. 本次实际观察

Manus 当前打开的是一个项目工作区，而不是单纯聊天首页。可见结构是：

```text
左侧 icon rail
├── 工作台 / 编辑 / 对话 / 项目 / 定时 / 资料库
├── 设置、通知、账户
└── rail 负责切换，不承载长文案

项目主区
├── 项目标题、创建者、更新时间、分享
├── 指令（项目级长期上下文）
├── 连接器（项目级工具）
├── 文件和资源（上传、网络搜索）
├── 技能（复用工作流）
├── 网站（版本/分析/更新）
├── 定时任务
└── 任务列表与新建任务 Composer
```

关键交互不是“把所有能力放进一个菜单”，而是把**长期项目上下文**放在任务 Composer 旁边；任务本身仍保持私密，分享是显式动作。空项目使用空态和明确的“新增”入口，不用一堆装饰性卡片填满页面。

### 1.1 本轮已登录页面的补充观察

本轮直接检查了已登录的 Manus 项目页。它的“顺滑”并不来自特殊的 CSS，而来自三个稳定边界：

1. **项目上下文和任务执行分层**：指令、连接器、文件、技能、网站、定时任务是项目上下文；任务 Composer 始终是最主要的动作，不被上下文卡片抢走焦点。
2. **空态是信息架构的一部分**：项目没有任务时显示明确的“新建一个任务以开始”，而不是合成一个空任务塞进最近列表。
3. **状态通过服务端契约表达**：任务列表使用 cursor 分页，响应有 `request_id`，错误使用稳定的 `code/message`，任务状态明确区分 `running`、`waiting`、`stopped`、`error`。这比让 Web 根据按钮颜色猜状态更可靠。

Kokoro 的项目能力同样必须作为 `workspace context` 的 typed projection 由 System manifest 控制；不要把项目、任务、技能和连接器都变成 User Web 自己维护的一套平行配置。当前首站已区分直接会话与专案工作区：直接会话保持聊天优先；专案将长期上下文放在任务 Composer 旁。

## 2. 对 Kokoro 的结论

当前 Kokoro 的欢迎页、Composer、Settings、Skills/MCP 和 Canvas 已经具备同一套 shadcn/Radix 交互基座；下一步应补齐的是信息架构的分层，而不是继续微调旧布局：

```text
Site shell（站点皮肤）
└── Workspace shell（通用）
    ├── Direct chat / New chat（Kokoro 首站定制快捷入口）
    ├── Project workspace（按能力开关渲染项目上下文）
    ├── Session timeline（Session 契约）
    └── Context panel（文件、成果、工具、步骤）
```

第一站的 `KokoroProjectWorkspace` 只渲染已投影的项目模块；未启用能力不显示可提交入口。项目 identity、任务 Composer、项目范围任务列表和右栏上下文是同一工作区骨架，具体模块仍由 runtime manifest 的 capability gate 决定。

## 3. 视觉与交互决策

### 保留

- shadcn `Sidebar`/`SidebarMenu`、`Dialog`、`Sheet`、`Command`、`Card`、`Empty`、`Alert`、`ScrollArea`、`Resizable` 作为唯一交互底座。
- Codex/Manus 都验证过的“左侧导航 + 主工作区 + 按需上下文”的三段式节奏。
- Composer 作为任务入口，发送、停止、模式/模型选择保持在一个稳定的容器中。
- 首站空态若由站点顶栏承接模型选择，Composer 不重复渲染第二个模型入口；首条消息后回到共享 Composer 的锁定模型展示，始终只有一个当前操作源。
- 任务隐私、显式分享、异步运行状态、错误和重试均为一等状态。

### 不复制

- 不复制 Manus 私有源码、CSS、图标、文案、接口或页面 DOM。
- 不把 Manus 项目页的右侧栏硬塞到**直接会话**欢迎页；专案工作区只有在对应 capability 已投影时才显示相应模块。
- 不以卡片数量模拟功能完整度；空态、加载态、权限态必须真实反映服务能力。

## 4. 本阶段验收

- 桌面 1280×720、1440×900：rail、主区、Composer 无重叠或横向滚动。
- 首站六个快捷任务固定为三列两行等宽轨道；禁止 flex-wrap 在桌面宽度变化时产生孤立的第六个按钮。
- Settings、Command、Canvas、Share 关闭后焦点回到原触发器；Esc 不留下隐藏控件焦点。
- 只有当前 tab/面板进入读屏顺序；隐藏内容 `aria-hidden` 或由 primitive 正确卸载。
- 项目/任务/连接器/技能等未来入口只接受 manifest 的 typed capability，不接受任意 URL 或任意 CSS。
- User Web 浏览器响应不暴露 `tenant_id`、`site_id`、workload token 或 IAM token。

## 5. 本轮落地结论

- 直接会话 `/app` 保持 Kokoro 自己的站点皮肤，并采用“品牌/状态 → 主标题 → Composer → 推荐动作”的聊天节奏。
- 专案 `/app/project/{project_ref}` 是独立项目工作区：项目身份 → Composer → 专案范围任务列表，右栏展示指令、连接器、文件/资源、技能、网站和定时任务等已启用上下文。任务创建后进入同一 `project_ref` 范围的真实 ConversationThread。
- Canvas、Settings、Command 等浮层只用 shadcn/Radix primitive；CSS Modules 只拥有布局、密度和站点 token。
- 桌面 Canvas 关闭动画期间仍会保留 DOM 以完成焦点回收，但 host 同时设置 `aria-hidden` 与 `inert`，避免隐藏面板继续进入读屏或键盘顺序。
- 手机端仍冻结。本轮没有修改 mobile layout 或 mobile CSS。

## 6. 外部契约参考（2026-08-25）

本审计只借鉴公开 API 的边界习惯，不复制实现：Manus v2 将任务、项目、文件、技能和
Webhook 分成独立资源，并统一成功/错误 envelope；任务列表使用 cursor 分页，任务运行
用 `running`、`waiting`、`stopped`、`error` 表达异步生命周期。对应结论已落到
后端实现以 `user-web-bff-contract-v3.md` 为准；旧
`manus-inspired-workbench-contract-v2.md` 只保留审计时的设计背景。

- [Manus API v2 Introduction](https://open.manus.im/docs/v2/introduction)
- [Manus task.list](https://open.manus.im/docs/v2/task.list)
- [Manus Task Lifecycle](https://open.manus.im/docs/v2/task-lifecycle)
- [Manus Webhook Security](https://open.manus.im/docs/v2/webhooks-security)

## 7. 已登录工作台与本地首站的实机对照（2026-08-26）

本轮在已登录的 Manus 工作区和本地 `/app` 桌面首屏分别做了 DOM、截图和键盘
路径核对。结论不是“把 Manus 页面照搬过来”，而是确认两者共享的交互节奏：

| 观察点 | Manus 项目工作台 | Kokoro 第一站当前实现 |
| --- | --- | --- |
| 左侧导航 | 全局 icon rail + 项目/任务 rail 两层结构 | shadcn Sidebar 中直达“对话”入口、专案入口与按范围筛选的列表；手机路径不改 |
| 任务入口 | 项目标题后立即出现 Composer | `KokoroProjectWorkspace` 在项目身份后放置共享 Composer，首条消息绑定 `project_ref` |
| 长期上下文 | 从任务 Composer 旁进入，不与任务输入争夺焦点 | 专案右栏按 typed capability 渲染；直接会话欢迎页不出现项目卡片 |
| 空态 | 项目身份、Composer、任务空态和上下文组成工作区 | `/app` 使用 `KokoroDirectChatWelcome`；`/app/project/{ref}` 使用 `KokoroProjectWorkspace` |
| 运行状态 | 任务状态独立于视觉卡片 | Session snapshot + SSE 状态机，不根据按钮颜色猜状态 |

本地实机验证结果：

- 模型菜单打开后 `menuitemradio` 有正确 checked 状态，Escape 回到模型触发按钮。
- 快捷任务会填充 Composer，并把焦点交给“对话输入”。
- Command Menu 的结果列表为本地化 `listbox[aria-label="命令结果"]`，Escape 回到 Composer。
- 控制台无 error/warning 记录。
- 验证结束后已恢复浏览器默认视口并关闭临时本地标签页；手机端没有修改。

本轮桌面皮肤收口（2026-08-26）：

- 主工作区使用 shadcn `card` 语义表面，侧栏使用同一 token 的低对比度混合色，形成
  Manus 类似的“导航较静、工作区较亮”层次；没有新增第二套颜色变量。
- Composer 的桌面 wrapper 与主画布保持同一表面，消除浮动输入框背后的矩形色带；输入框
  仅保留一层语义边框和轻量 `shadow-sm`。
- 上述调整只位于 `min-width: 961px` CSS Modules 分支，手机端布局与样式冻结不动。
- 桌面 Web 在同一 shadcn Sidebar 中组织直接会话、项目和会话/任务列表。直接会话与专案范围互斥；专案空态使用项目工作区而非聊天欢迎页，避免上下文卡片挤压直接会话的 Composer。
- 当前 1280×720 项目基线：项目身份从主区 `x=320` 起，Composer 为 `x=318..898`，右侧上下文从 `x=942` 起；这些轨道与参考截图对齐。
- 本轮实机证据：`output/playwright/final-1379.png`、`final-1920.png`、`final-784.png`。
