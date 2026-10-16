# ui/team — 固定租户团队设置

`TeamContent` 嵌入设置中心；`TeamPanel` 是独立 Dialog 包装。两者只接收 `TeamClient`，不接收 namespace，也不提供浏览器租户切换或邀请收件箱。

数据从 BFF public Team API 经同源 `/api/team/*` 获取：成员、角色目录、管理邀请。普通成员没有 `invitation:read` 时不请求邀请列表；控件可见性按角色目录计算，IAM 仍是最终授权者。写操作使用 `member_id` / `invitation_id`，成功后重新读取对应分页，不自动重试写操作。退出和移除需要二次确认。

SET13角色目录按固定public15完整八域严格校验，包括既有platform/skill权限；角色替换的权限超集提示同时计算这些域，未知字段/动作和空数组拒绝。这里只读取团队权限目录，不实现或修改技能、连接器功能。创建新团队、套餐与租户切换没有本视图契约。

本组件仅管理局部状态，不使用跨会话全局 Team 缓存；Product Session 边界由同源 adapter 验证。
