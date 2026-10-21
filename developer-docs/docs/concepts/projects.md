# 项目

Project 是共享 instruction、task、resource、skill 和 scheduled work 的产品资源。project ID、reference、name 和 slug 都是 opaque 或 contract 字段；客户端不要根据展示字段重建 ID，也不要把内部数据库键写入请求。

## Public surface

当前 v1 contract 提供项目的列出、创建、读取、instruction 更新、instruction revision 与 task 查询、resource 上传、skill 开关以及 project-scoped scheduled task 创建。准确路径、请求字段、响应字段和 permission 以[生成的 Projects reference](/reference/v1/generated/projects)为唯一字段事实源。

项目创建和 mutation operation 的 canonical metadata 标为 `Idempotency-Key` `required`。同一个 key 只用于相同 method、canonical path、作用域和请求语义的重试；新项目或新修改要产生新的逻辑 key。

## Instruction revision

instruction 是共享项目行为，不是客户端本地状态。当前 artifact 将 revision 的公开字段规范为 `updated_at`（`date-time`）和 `actor_name`；其余字段、必填性和约束请直接读取生成 schema，不要在门户指南中自行复制或改名。

## 隔离

受信 namespace 决定可见范围。URL 中的 project ID 选择该上下文中的资源；body 字段和 query 参数不能把 command 转移到另一个 namespace。portal 只描述 BFF public projection，不复制 System、Capability、Storage 或其他 owner 的内部模型。
