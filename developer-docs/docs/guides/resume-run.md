# 恢复等待中的 run

读取正式 `CUSTOM kokoro.interaction.state` 的完整 `ChatInteractionState`，只在 `phase=waiting` 时展示待处理集合。它是整体替换，不是增量；界面不根据HTTP202删除pending，仍等待权威新状态。

用户确认所有required决定后，按精确 `pause_ref` 与 `pause_revision` 构造 `run.resume`：请求为 `pause_ref`、`expected_pause_revision` 及对应 `decisions[].item_id`；不猜内部tool引用，不使用退役的tool_id或旧awaiting_approval事件。字段、decision分支与约束见[API参考](/reference/v1/generated/chat)。

下例只在无真实凭据的loopback fixture中演示一个明确tool_approval；实际应用应先收集用户决定，其他interaction不自动审批：

<<< ../../examples/typescript/run-lifecycle.ts{ts}

结果未知保留原key、body及精确pause；改变决定是新command，先读取当前权威状态，防止旧pause回执误消解新的pending。以最后完整frame的opaque cursor恢复读取，不自行生成sequence。
