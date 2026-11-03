# ScheduledTask 日历、RSS 与运行记录

本feature拥有既有排程UI、本地视图与同源client；BFF持权威definition/poll/run事实。Public29原件与生成入口固定在contract及三设计文首，不复制owner契约或SQL。

- `model/scheduled-task.ts` / `contract/scheduled.ts`区分calendar与rss，当前读与immutable ACK分开；`api/scheduled-task-client.ts`只发完整正式trigger，原unknown key/body/取消/准入边界保持。
- `ui/scheduled-task-automation-workflow.tsx`复用原editor fields/submission，RSS条件/URL校验独立；未支持审批/Agent/云电脑配置保disabled，普通管理/日历不把RSS当calendar next run。
- `api/scheduled-task-runs-client.ts`、`ui/use-scheduled-task-runs.ts`与run updates只读当前scope的真实页，失效/取消/换actor退休；opaque cursor/terminal事实不从UI猜。非live preview不读取真实运行记录或feed。
- `ui/preview-task-store.ts`保持原preview key/锁与失败恢复；旧无类型calendar只在本地读时经guard兼容，不改owner wire或读时写storage。

`tests/scheduled/`、既有surface/editor及运行记录RTL、runs同源proxy和contract覆盖读取/创建/编辑/刷新/取消/未知恢复与作用域；正常IAM/浏览器/owner链另由Root记录，不以替身或preview称全链路完成。
