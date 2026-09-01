# User Web 桌面交互审计 v1

日期：2026-08-25  
范围：`kokoro` 桌面 Web；手机端不在本轮改造范围。

## 1. 交互底座规则

| 交互类别 | 唯一底座 | 约束 |
| --- | --- | --- |
| 侧栏/导航 | shadcn `Sidebar` / `SidebarMenu` | 收起只改变密度，不改变路由；图标态必须有 Tooltip |
| 菜单/单选 | Radix `DropdownMenu` / `RadioGroup` | Esc 回到触发器；当前值使用 `checked`，不由颜色推断 |
| 命令入口 | shadcn `Command` + `Dialog` | 输入框自动聚焦；结果分组有本地化 aria-label；未知 capability 不可执行 |
| 设置/详情 | `Dialog` / `Sheet` / `AlertDialog` | 标题必有；关闭后焦点回到实际 opener；删除/撤销必须二次确认 |
| 表单 | `Field` / `FieldGroup` / shadcn controls | 错误同时写入 Field `data-invalid` 和控件 `aria-invalid` |
| 反馈 | `Alert` / `Empty` / `Skeleton` / `Spinner` | 加载、空态、失败、重试不可互相伪装 |
| 聊天线程 | `MessageScroller` / `Message` / `Bubble` | 滚动、贴底、回到最新由 primitive 负责；不手写第二套锚定逻辑 |

## 2. 桌面工作台控件矩阵

| 控件 | 默认状态 | 打开/执行状态 | 关闭/失败收口 | 验收证据 |
| --- | --- | --- | --- | --- |
| 搜索会话 | 展开 rail 中的图标按钮 | 输入框自动聚焦、过滤已载入会话 | Esc/X 清空查询并回到搜索按钮；折叠态先通过品牌入口展开 | `workspace-rail` tests + 1280/1440 实机 |
| 收起/展开 rail | `52px` / 展开态两种密度 | 只切换 Sidebar 状态 | 主区无横向滚动，焦点留在新 trigger | `app-frame.smoke` + 961/1280/1440 |
| 新对话 | 清空当前编辑态 | 创建本地会话并聚焦 Composer | 不伪造服务端任务记录 | `workspace-rail` / `app-frame` |
| 会话行 | 当前行 `aria-pressed` | 点击切换并 snapshot 水合 | 删除由 AlertDialog 确认；重命名失败回滚 | rail tests |
| 会话地址状态 | 当前会话可恢复 | 选择/新建无刷新更新 `?conversation=<opaque session_id>`；深链和前进后退恢复会话 | 设置 URL 的前进后退不误清空会话 | `app-frame.smoke` + 1280/1440/1920 实机 |
| 模型/agent/模式菜单 | 显示当前值 | RadioItem checked，长文案不越界 | Esc 回到原 trigger；首条消息后锁定 | Composer tests + 实机 |
| Composer 编辑 | inline Composer | 输入区随主区宽度稳定布局 | 提交后回到同一 Composer textarea | Composer tests |
| 发送/停止 | 空草稿禁用发送 | streaming 显示停止；HITL 显示取消等待 | 终态恢复发送，错误保留重试 | Composer + engine tests |
| 快捷场景 | Manus 风格建议列表 | 只填充草稿，不直接创建任务 | 关闭后不占位；焦点回到 Composer | welcome tests + 768/1440 |
| 分享 | 当前会话的 Popover | 创建只读 opaque share URL | 撤销用确认；关闭回到同一个分享按钮 | share tests + 实机 |
| Canvas | 默认收起 | 成果点击打开第三栏；支持预览/文件/全屏 | 关闭回成果 opener；分隔条始终单线 | context/canvas tests + `!delivery` |
| Settings | 默认关闭 | 九个 Tab 在同一 Dialog 内切换 | 关闭回到实际入口；不叠加第二个 overlay | settings tests + 实机 |
| HITL | 不显示审批按钮 | `waiting` 以独立 checkpoint 卡明示问题、风险、选项和动作 | 批准/拒绝/回复后收口为已完成工具；控制失败可重试；桌面按钮保持单一动作层级 | hitl tests + `!hitl` |
| 失败态 | 不占用 Composer | Alert 展示稳定错误文案，详情折叠 | 展开后仍无横溢出；重试不重复用户消息 | failure tests + `!fail:internal_error` |

## 3. 多站点边界

- 通用 shell 只消费 `RuntimeNavigationItem`、公开 runtime manifest 和 typed capability。
- 站点皮肤拥有品牌、文案、快捷场景和 token；不复制 Sidebar、Composer、Dialog 等基础交互。
- 分享页也从公开 runtime manifest 读取品牌与安全 Logo 投影，不写死第一站品牌。
- 浏览器永远不接收 `tenant_id`、`site_id`、IAM token 或 workload token；Host → IAM/System → BFF 只存在服务端。

## 4. 本轮验证

```text
1280×720  desktop  no overflow
1440×900  desktop  no overflow
961×720   desktop boundary 3×2 scenario grid, no overflow
82 test files / 678 tests
lint ✓ / typecheck ✓ / production build ✓
```

手机端仍冻结，除非获得单独授权。

## 5. 现场复测补充（2026-08-25）

本地桌面 `/app` 实机路径发现一个自动化测试未覆盖的时序问题：分享 Popover 使用受控
`open` 关闭时，内容会在同一 React commit 中卸载，单帧焦点回收可能晚于 Radix 的默认
关闭回调，导致焦点短暂落到 `body`。已在
`src/ui/share/share-button.tsx` 将分享触发器回收改为两帧 handoff，并校验节点仍连接、未
禁用且可见；实机复测结果为点击“完成”后焦点回到当前实例的分享按钮，多实例不会串焦点。

本次复测还覆盖：模型菜单 Escape、快捷任务填充、放大编辑、Command Menu Escape、
Settings 九个 Tab、会话删除取消、Canvas 成果打开/关闭、任务发送终态和侧栏键盘调宽。
手机端和 Admin Web 未进入本次修改范围。

## 6. 直接会话与项目工作区基线（2026-08-27）

桌面 User Web 有两条一级工作流，不能互相降级或混用数据：

- `/app` 是直接会话：标题、共享 Composer 和紧凑快捷动作使用居中阅读轨道；快捷动作只填充草稿，不直接创建任务。
- `/app/project/{project_ref}` 是专案工作区：项目身份、共享 Composer、专案范围任务列表与项目上下文右栏共同组成页面骨架。
- 项目 Composer 的首条消息必须带 `project_ref`。任务创建后进入同一项目范围的 ConversationThread；侧栏“任务”列表不得泄漏直接会话。
- 指令、连接器、文件/资源、技能、网站与定时任务只按 typed capability projection 显示；能力未注入时不渲染假按钮。
- 1280×720 项目截图基线位于 `output/playwright/project-workspace-reference-geometry.png`；活动专案任务基线位于 `output/playwright/project-task-chat-runtime.png`。

## 7. User Web 范围收口（2026-08-26）

- `/app` 是 User Web 的正式工作台路由；本地未认证时由 `/app` 直接进入 preview transport，
  `/app`，不得再作为产品页面或导航目标。
- 本阶段只验收桌面 Web。不得为了响应式评分继续新增或调整手机端布局；桌面主区使用
  流式宽度，不能再用固定 `56rem` 模拟小样本。
- 项目上下文中的连接器、技能、文件/资源入口优先打开已有 Settings Web 面板；只有能力
  未注入时才回退为 Composer 草稿，不渲染无效的“假功能按钮”。

## 8. Desktop rail repair（2026-08-30）

本次只收口 User Web 桌面 shell 的 `Sidebar`、`AppFrame`、`WorkspaceRail` 与 rail resize；手机端
继续由 `useIsMobile` + Sheet 拥有，不共享桌面收起规则，也不在本次修改中调整其他 surface。

### 几何契约

- 展开轨道使用 `300px`；收起轨道使用 `52px CSS px`。参考图为 2× 像素采集，因此对应约 `104px`
  物理像素；轨道宽度不再把物理像素误当作 CSS 宽度。
- 收起态的品牌、主导航、direct chat、project/task 均落在同一 `52px` track 内，图标按钮为 `36px`
  目标、图标为 `18px`；项目区以单条顶部分隔线与 direct chat 区分。
- 底部工具区使用 `32px` 控件和 `4px` 间距，顺序固定为设备、通知、账户；账户头像为 `28px`
  圆形并锚定在 rail 底部。展开态保留品牌、文案、direct 会话列表和项目任务列表的宽轨道信息。

### 收起、resize 与导航

- fine-pointer 且 `<= 768px` 自动进入窄桌面模式，隐藏 rail、gap、container 和 seam；`>= 769px` 保持完整桌面轨道，超过阈值恢复宽桌面偏好。
  手机边界仍只由 `useIsMobile` 的 coarse-pointer 条件决定，不将手机 Sheet 误判为桌面 rail。
- shadcn Sidebar container/inner/inset 不绘制边框；唯一可见 rail seam 是 `data-seam="rail"` 的
  `1px` resizer，位置始终按 `--rail-seam-width - 1px` 跟随同一条轨道。拖拽仍使用 rail 的 DPR
  对齐、最小/最大宽度和 Canvas reserve 约束。
- 点击 direct chat、project overview 或 project task 只更新路由/active marker，复用同一 shell；
  桌面 `closeNavigation` 不关闭 rail，真实链接使用 `aria-current="page"`，避免点击后导航壳闪动或
  重复挂载。

### 证据与回归

基线截图继续使用 `output/playwright/current-v136-rail-expanded.png`、
`output/playwright/current-v136-rail-collapsed.png`、
`output/playwright/current-project-1280.png` 和
`output/playwright/current-project-collapsed-1280.png`；本轮新增 rail 专项截图与 DOM 几何快照时，
应记录 viewport、Sidebar gap/container、`data-seam="rail"` 数量，以及 direct/project/task/utility
锚点的 `getBoundingClientRect()`。相关回归入口为：

```text
tests/ui/app-frame-rail.test.tsx
tests/ui/rail-resize.test.tsx
tests/ui/workspace-rail.test.tsx
tests/ui/sidebar-primitive.test.tsx
```

本轮 1280×720 Playwright 复测结果：收起态 `gap=52px`、container `width=52px`、seam
`x=51px,width=1px`，direct/project/task 目标均为 `36px`；底部设备/通知/账户目标均为
`32px`，纵向间距为 `4px`，且 `data-seam="rail"` 数量为 `1`。展开后 gap/container 为
`300px`，seam 为 `x=299px,width=1px`，Sidebar container/inner 左右 border 计算值均为 `0px`。
导航进入 `/app` 后仍为同一 shell/单 Sidebar container，direct chat 保留
`data-navigation-section="direct-chat"` 与 `aria-current="page"`。

截图证据：

- `output/playwright/rail-repair-1280-collapsed.png`
- `output/playwright/rail-repair-1280-expanded.png`
- `output/playwright/rail-repair-1280-direct-chat.png`
