# 文件与 artifact

Kokoro 暴露几个相关但不可互换的 projection：

- session `files` 描述 workspace file 的 path、MIME 和字节数；
- session `deliveries` 描述产出物的 content hash、path、title、MIME、size、run ID 和创建时间；
- `GET /v1/library` 返回 storage-backed 的 library projection。

返回的 path 和 URL 都是 opaque service projection。不要从它们推导内部 object-store key、数据库表、Storage owner endpoint 或下载权限。

## Project resource intake

当前项目 resource operation 接收一个或多个 multipart `files`，并返回 generic success envelope；这个 receipt 不包含 resource ID、scan status 或 processing state。不要把其他上传接口的状态套到这里；[上传生命周期指南](/guides/upload-lifecycle)会把这个入口的边界写清楚。

`ok: true` 只代表 BFF 接纳了请求，不代表扫描、处理、晋级或持久化已经完成。字段和状态以生成 reference 为准。
