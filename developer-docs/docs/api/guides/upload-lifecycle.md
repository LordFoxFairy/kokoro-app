# 上传项目资源

本页是[受信第一方服务端参考](/api/authentication)，不是外部 API Key 上传入口。当前 operation 每次接收一个 multipart `files` 文件，并要求 `Idempotency-Key`：

<<< ../../../examples/curl/upload-resource.sh{bash}

## 保存成功 receipt

成功响应为 `data.resources`，其中唯一一项提供 `upload_id`、`asset_id`、`filename`、`mime_type`、十进制字符串 `size_bytes`、`content_sha256` 和 `scan_state: "clean"`；`meta.request_id` 用于关联请求。完整字段约束见[项目参考](/api/reference/v1/generated/projects#upload-project-resources)。这不是旧的 `data.ok` 接纳响应。

保存服务端返回的精确 Asset 标识与内容摘要；文件名不是对象路径或权限凭据。资料库／项目页面通过正式资源投影读取，不轮询内部 Storage，也不从 URL 猜 object key。

## 超时与失败

- 响应未知时保留源文件、原幂等键与原请求内容，用相同逻辑提交重试；不要重新生成键上传副本。
- 扫描或处理未完成、失败时不伪造 `clean` receipt，不把待处理文件当成可用输入。
- 只有收到成功资源元数据后，再把该资源作为后续任务选择；执行时仍会检查资源当前状态与读取资格。
