# 项目

Project 是组织 instruction、task、resource、skill 和 scheduled work 的产品资源。项目只有经过显式授权才向其他成员开放。project ID、reference、name 和 slug 都是 opaque 或 contract 字段；客户端不要根据展示字段重建 ID，也不要把内部数据库键写入请求。协作访问使用当前 canonical project ID，不用当前调用者的同名 slug 猜测归属。

## Public surface

当前 v1 contract 提供项目的列出、创建、读取、instruction 更新、instruction revision 与 task 查询、resource 上传、skill 开关、project-scoped scheduled task 创建，以及当前访问和成员授权管理。准确路径、请求字段、响应字段和 permission 以[生成的 Projects reference](/api/reference/v1/generated/projects)为唯一字段事实源。

幂等要求按各 operation 的 canonical metadata 处理。同一个 key 只用于相同 method、canonical path、作用域和请求语义的重试；新项目或新修改要产生新的逻辑 key。

## 当前访问与授权

Project owner 隐式拥有管理资格，只向当前同 tenant 的有效成员显式授予 viewer 或 editor。viewer 读取获准项目内容；editor 另可修改获准内容、创建项目会话和任务。授权管理与项目删除仍由 owner 执行，个人置顶只改变调用者自己的偏好。

先读取当前 access，再按其能力决定展示与操作；URL、旧列表、cursor 或缓存都不是权限证明。设置与撤销 grant 使用当前 access version 对应的 `If-Match` 和原 `Idempotency-Key`。版本冲突时重新读取权威状态；结果未知时只显式恢复原 method、目标、body、版本和 key，不自动换键重发。

grant 可以到期或撤销，内容读写仍需当前原生 Session 与同 tenant Product 资格。grant 绑定稳定用户 subject：离开团队期间访问被拒绝；同一 subject 重新合法加入后，原未撤销且未到期的 grant 可重新生效。需要终止该授权时应显式撤销，而不只依赖成员暂时离开。

## 共享会话与安全结果

只共享明确归属当前 canonical Project 的 Conversation 和获准结果。Conversation creator、Project owner、每次 Run 的实际 actor 与当前查看者不是同一个字段。editor 用自己的模型、连接与资金资格执行，不借 creator 身份控制他人 Run。

共享读取只提供安全正文、已确认最终答案、终态及正式交付结果；reasoning、原始工具输入输出、私人过程、个人知识与凭据不因 grant 一并公开。成员的私人 RunDisplay 与过程文件仍要求本人实际 actor 及当前 edit 资格。选中同项目已确认 FINAL 或 Artifact 作为新输入时，保留真实来源并在新提交时重新核验资格，不把来源改归调用者。

移动会话后的新读取按当前归属重新核验，不改写历史 Run actor、命令回执或已冻结输入。Project grant 与公开会话快照 Share 是不同能力；创建、撤销公开 Share 或管理会话仍按各自资源资格判定。

## Instruction revision

instruction 是共享项目行为，不是客户端本地状态。当前 artifact 将 revision 的公开字段规范为 `updated_at`（`date-time`）和 `actor_name`；其余字段、必填性和约束请直接读取生成 schema，不要在门户指南中自行复制或改名。

## 隔离

受信 namespace 决定可见范围。URL 中的 project ID 选择该上下文中的资源；body 字段和 query 参数不能把 command 转移到另一个 namespace。portal 只描述 BFF public projection，不复制 System、Capability、Storage 或其他 owner 的内部模型。
