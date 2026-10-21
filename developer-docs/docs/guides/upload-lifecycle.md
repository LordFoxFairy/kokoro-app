# 上传项目资源

当前 v1 operation 接收 multipart `files`，并要求 idempotency key：

<<< ../../examples/curl/upload-resource.sh{bash}

## 当前可观察行为

成功响应是 generic `{ "data": { "ok": true }, "meta": { "request_id": "..." } }` envelope。它只确认 BFF 接纳了请求。

本页这个项目资源入口的 `22.0.0` 响应仍未返回 resource ID、upload session 或扫描／处理状态；不要把其他技能、包或资料库接口的生命周期套到这个 receipt。因此：

- 在产品流程确认结果前保留源文件和 request ID；
- 不从 `ok: true` 推断病毒扫描、异步处理或 promotion 已完成；
- 不轮询内部 Storage endpoint，也不从 URL 或 path 猜 object key；
- 只使用 public Library projection 实际返回的 item。

若未来要描述完整 resource lifecycle，必须先由 BFF owner 增加 additive 或 versioned public contract，再同时更新生成 reference、示例和本页。
