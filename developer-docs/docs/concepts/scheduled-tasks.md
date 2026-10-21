# 定时任务

Scheduled task 是描述重复或一次性工作的 BFF 产品资源。public model 支持 daily／weekly／monthly／once；星期集合、月日期集合或一次性本地日期按对应 frequency 的 schema 提交，不套用旧单日锚点。其余字段以[生成参考](/reference/v1/generated/scheduled)为准。

## 时间模型

`time` 与 `timezone` 保存用户想要的本地调度意图；`next_run_at` 可为 null，只有当前 active scheduling 的值是下一次 UTC occurrence。区分当前 `scheduling_state`、不可变 mutation ACK 与 Agent 执行结果；依赖失败不伪造旧的 next 值。不要把 IANA timezone 替换为固定 UTC offset，因为夏令时会改变实际 occurrence。

## Commands

创建、更新、删除和 retry operation 的 canonical metadata 标为 `Idempotency-Key` `required`。project-scoped create 从 URL path 取得 project identity，body 不应尝试覆盖它。

public BFF scheduled resource 与内部 Scheduler 的 lease、occurrence、retry、dispatch protocol 是不同边界。门户不发布后者的数据库结构或内部 message。
