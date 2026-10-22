# Cursor 分页

发布分页的 list operation 会返回 opaque `next_cursor`。下一页把它原样放回 query 的 `cursor`，并保持其余 filter 不变。分页字段、默认值和约束以生成 reference 为准。

<<< ../../examples/python/cursor-pagination.py{py}

## 规则

- 遵守 operation reference 声明的 `limit`；session list 当前接受 `1` 到 `100`，默认值以字段 schema 为准。
- `next_cursor` 为 `null` 或缺省时到达末页。
- 不解码 cursor、不转成 offset，也不跨 filter set 使用。
- 服务拒绝过期或无效 cursor 时，从第一页重新开始，而不是猜测修复 token。
- 将 pagination cursor 与 AG-UI replay cursor 分开保存；两者不是同一种 token，不能互换。
