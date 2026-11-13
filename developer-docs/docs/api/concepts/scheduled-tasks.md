# 定时任务

Scheduled task 是描述重复或一次性工作的 BFF 产品资源。public model 支持 daily／weekly／monthly／once；星期集合、月日期集合或一次性本地日期按对应 frequency 的 schema 提交，不套用旧单日锚点。其余字段以[生成参考](/api/reference/v1/generated/scheduled)为准。

## 时间模型

`time` 与 `timezone` 保存用户想要的本地调度意图；`next_run_at` 可为 null，只有当前 active scheduling 的值是下一次 UTC occurrence。区分当前 `scheduling_state`、不可变 mutation ACK 与 Agent 执行结果；依赖失败不伪造旧的 next 值。不要把 IANA timezone 替换为固定 UTC offset，因为夏令时会改变实际 occurrence。

## Commands

创建、更新、删除和 retry operation 的 canonical metadata 标为 `Idempotency-Key` `required`。project-scoped create 从 URL path 取得 project identity，body 不应尝试覆盖它。

更新与 retry 还要求先读取当前详情，使用当前 revision 对应的 `If-Match`。命令返回的历史 ACK 不替代当前详情；发生冲突时鲜读后再明确决定新操作，结果未知时保留原 key、body 和条件版本恢复原命令，不自动重发。

## 项目协作与执行主体

项目 viewer 读取获准计划及结果，editor 可编辑获准定义；定义的创建者与当前执行主体分别保存。跨成员修改影响执行的配置时，任务先暂停并清除原执行主体，随后由当前操作者显式启用，使用其自己的执行资格。原执行主体本人明确保存可沿现委托；任何新定义版本都隔离尚未发送的旧版本，不把已接纳或结果未知的执行换成另一个人。

已开始的 Run 保留原 actor 与输入；暂停、删除或修改定义不等于撤销已发生的执行。停止已有 Run 仍走其本人控制资格，不由项目角色代替。

public BFF scheduled resource 与内部 Scheduler 的 lease、occurrence、retry、dispatch protocol 是不同边界。门户不发布后者的数据库结构或内部 message。
