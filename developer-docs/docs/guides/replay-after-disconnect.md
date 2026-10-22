# 断线后 replay

在确认对应 UI 状态之前，保存最后一个**完整收到**的 SSE `id`。重连相同 session 时原样发送：

```http
Last-Event-ID: agui_0123456789abcdef0123456789abcdef
```

完整生命周期示例：

<<< ../../examples/typescript/run-lifecycle.ts{ts}

## 恢复清单

- 将 cursor 与受信 namespace、session ID 和本地应用状态绑定。
- 不解析 `agui_*`，不把它替换成 `metadata.kokoro.seq` 或 offset。
- 使用稳定的 run、message、tool、delivery ID 重建状态。
- 忽略 SSE comment，不因 keep-alive 推进 cursor。
- 只在 terminal event 或明确用户动作时停止；socket 掉线不是完成信号。

如果服务返回 contract 声明的 `invalid_event_cursor`，只丢弃被拒绝的值并刷新当前授权 session snapshot；不要探测其他作用域的 cursor。
