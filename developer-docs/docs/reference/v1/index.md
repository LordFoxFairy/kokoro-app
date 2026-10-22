# API v1 参考

本节是由固定的 `kokoro-bff` public contract artifact 自动生成的字段级参考。它不是手写 DTO 清单：operation、参数、请求体、响应体、响应头、嵌套字段、组合 schema、约束和 contract metadata 都从 owner OpenAPI 重新生成。

## 阅读方式

1. 先看[介绍](/introduction)和[认证](/authentication)，理解版本和受信上下文。
2. 在下方 operation 索引按 tag 查找路径与 method。
3. 打开具体 tag 页，先查看 Owner、Visibility、Stability、Idempotency、Permission 和 Authentication，再阅读参数、字段和 response。
4. 对字段级问题只引用生成页和 pinned artifact；不要从手写指南推导不存在的字段。

生成页顶部会显示 artifact version、owner、visibility、source commit 和 SHA-256。当前固定 `22.3.0` 源契约的 182 个 operation 中，门户只展示 176 个由 `kokoro-bff` 拥有并标为 `public` 的 operation；6 个 `browser-private` operation 不发布。来源摘要仍绑定完整 owner artifact，不绑定门户过滤结果。这描述 contract metadata，不等同于每个 live implementation 的完成度。

<!--@include: ./generated/index-fragment.md-->
