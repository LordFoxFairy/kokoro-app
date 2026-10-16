## SET29 侧栏账户余额可信读取（2026-10-15；D0，先tests-only）

Web基线2d31cd502db44b5b0ad74e52321cba755624896f，939 tracked clean；runtime_audit唯一writer本片4既有source+1既有rail测试，927最终保护/Root7；先仅测试准入，其余931字节保护。Root管设计/docs/Git/资源/正式激活/CUA，Skills/连接器业务排除。

AppFrame可信ProjectReadBoundary沿原rail props/shell进入account余额；同subject/generation退役隐藏及取消，marker不授准入。

# ui/rail — 侧栏

## 职责
会话清单（服务端水合、分页、待批徽标、重命名/删除、搜索）+ 品牌头 + 各面板入口 + 折叠/移动抽屉 + 拖拽改宽。

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
