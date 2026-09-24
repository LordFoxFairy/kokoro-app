# ui/team — 团队面板

## 职责
固定部署租户内的待处理邀请（accept/decline）与当前团队成员管理（邀请/改角色/移除）；不提供浏览器租户切换。

## 公开件
- `TeamPanel`（`team-panel.tsx`）：props `client: TeamClient` / `currentNamespace` / `onClose`。

## 协作者
- `@/team/client`（旧 Team 成员/邀请读取和管理；不含换签）、`@/team/permissions`（`canManageMembers` / `canAssignRoles`）。
- `@/lib/query`：invites/detail 两读走 `useResource`（键 `team/invites`、`team/detail/<ns>`）；变更后按各自键失活。

## 陷阱
- `currentNamespace` 目前仍由旧 Team context 读取，只用于详情展示；固定部署租户签发与迁移由 W1C consumer 后续卡处理，不得重新暴露选择控件或 mutation。
- 权限判定仅决定控件可见性，真正越权由后端拒绝；user principal 全留服务端。
- detail 按 namespace 分键；无信封/预览（null）时取数即抛，落 error 态。
