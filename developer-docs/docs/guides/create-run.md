# 创建 run

向已有 session context 提交一条 message。path 中的 session ID 和 receipt 中的 run ID 都是 opaque 值。

<<< ../../examples/curl/create-run.sh{bash}

## 处理 receipt

对当前 public contract，成功响应是 `202 Accepted`，并在 `data` 中提供 `run_id`、`user_message_id`、`assistant_message_id`，在 `meta` 中提供 `request_id`。在打开事件流前保存这些值。

为这一条逻辑提交创建一个幂等 key。响应超时不代表请求没有被接纳：用原 key、相同 method/path/query/body 和相同 header 语义重试，以便服务端 replay 原 receipt，而不是启动重复工作。

## 下一步

接着阅读[断线后 replay](./replay-after-disconnect)。如果 public projection 显示等待交互，再按[恢复 run](./resume-run)提交完整 decision set。

## 选择本次 MCP 连接

消息请求可包含 `selected_mcp_connection_ids`，值为正式连接列表返回的精确 Connection ID，
不是服务器显示名、Provider 名称或旧的诊断字段 `mcp_servers`。最多 16 个、顺序唯一；
省略或空数组均不增加连接。此字段只表达本条消息的工具选择意图，执行时仍由 owner 核验当前身份和资格。
未知提交应保持同一个幂等键和原始列表重试，不把后来修改的选择写进原请求。
