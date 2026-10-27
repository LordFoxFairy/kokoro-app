## SET29 侧栏账户余额可信读取（2026-10-15；D0，先tests-only）

Web基线2d31cd502db44b5b0ad74e52321cba755624896f，939 tracked clean；runtime_audit唯一writer本片4既有source+1既有rail测试，927最终保护/Root7；先仅测试准入，其余931字节保护。Root管设计/docs/Git/资源/正式激活/CUA，Skills/连接器业务排除。

AppFrame可信ProjectReadBoundary沿原rail props/shell进入account余额；同subject/generation退役隐藏及取消，marker不授准入。

# ui/rail — 侧栏

## 职责
会话清单（服务端水合、分页、待批徽标、重命名/删除、搜索）+ 品牌头 + 各面板入口 + 折叠/移动抽屉 + 拖拽改宽。

首文档通过 `src/lib/sidebar-preference.ts` 解析既有 `sidebar_state`，App layout 将明确的布尔偏好传到 AppGate / AppFrame，等待会话探针的静态壳与正式侧栏共用 300px / 52px 尺寸。非法或缺失值使用当前页面默认；手机不预留侧栏。此 cookie 仅影响展示，不建立身份或准入。客户端仍可协调首文档之后改变的偏好；同页导航不重复恢复旧 cookie。

## 公开件
- `WorkspaceRail`（`src/components/blocks/workspace-rail/workspace-rail.tsx`）：唯一侧栏组件；清单/回调/入口全由 props 注入。
- `useSessionList`：服务端清单水合 + 复合游标翻页累加。
- `useRailResize`：拖拽改宽（含 shell 容器几何 ref）。
- `rail-search.ts`：清单本地过滤。

## 协作者
上游：`@/ui/shell`（`useConversationList` controller 供数据/回调）。取数经 `@/ui/shell/page-clients` 的 list client。

## 陷阱
- 清单真源是 session `GET /sessions`（换浏览器见同列表）；localStorage 不再作清单真源。
- Owner wire 的 `next_cursor` 必填且末页为 `null`；`useSessionList` 只在 view 边界将其显式映射为无 continuation。
- `useSessionList` 是分页 accumulator 惯用法，不走 `@/lib/query`（无限滚动累加自持游标）。
- 同主体 Product 会话重核验保持读取边界和既有列表，不触发业务重读。真正退休后的未准入表示等待读取，不表示请求失败：项目和会话侧栏共用现有无文字占位，旧身份行及游标立即退休，重新准入后读取，实际列表错误保留反馈和重试。

窗口变化只约束当前有效rail宽度，保留用户偏好供放宽后恢复；Canvas共同适配归AppFrame layout，不能把其临时reserve锁进被动宽度。

## 项目行操作

`workspace-rail-project-menu` 将真实右键、Shift+F10／菜单键及 ellipsis 投影到同一目标的五个动作：本人固定状态、编辑名称、查看原 overview、仅收起该项目任务、删除确认。Instructions 保留现 header/settings 入口；固定状态由正式 BFF Project pin 契约读取，未确认时不冒固定或未固定，无本地持久化。菜单使用已锁 Radix ContextMenu 的薄包装及原 Dropdown；导航／身份变化关闭，键盘拖拽与会话菜单独立。

## Project pin consumer

本人项目pin来自AppFrame全局`useProjectPins`，Pinned区只投影已读且当前owner可见项目，按owner时间/id顺序；分页未耗尽不推断其他项目未固定。Project真实右键／ellipsis共享固定或取消固定第五项；未知仅精确GET核验，pending禁同project重入。菜单编辑/查看用FolderPen/Eye与16px图标，View普通同tab点击先关移动Sheet再dispatch导航，modified link语义保留。
