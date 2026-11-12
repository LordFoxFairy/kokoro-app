# UTC 与 RFC 3339 时间

声明为 `date-time` 的 API instant 使用带时区的 RFC 3339 UTC 字符串，通常保留毫秒：

```text
2026-09-04T12:34:56.123Z
```

按 timezone-aware instant 解析，排序时保留原始 instant，只在展示层转换。schema 要求 `date-time` 时，不要存成无时区本地时间，也不要替换为 Unix 秒。若某个 public field 的 generated schema 明确是 integer、普通 string 或其他形状，则保留该字段的原始 wire shape；不要从字段名猜测它是 RFC 3339 时间。

Scheduled task 额外携带本地 `time` 和 IANA `timezone`。两者保存重复规则的意图，`next_run_at` 保存下一次具体的 UTC occurrence；不要把 IANA 名称压成固定 offset。

当前 artifact 的 Project instruction revision 使用 `updated_at`（`date-time`）和 `actor_name`；字段级定义仍以对应 generated schema 为准，不要在客户端自行改名或把时间转成 Unix 秒。AG-UI frame 内的协议字段也以 stream schema 和示例为准，不要把其数值字段强行转换成另一种格式。
