# API v1 参考

本节是由固定的 `kokoro-bff` public contract artifact 自动生成的字段级参考。它不是手写 DTO 清单：operation、参数、请求体、响应体、响应头、嵌套字段、组合 schema、约束和 contract metadata 都从 owner OpenAPI 重新生成。

## 阅读方式

1. 先看[介绍](/introduction)和[认证](/authentication)，理解版本和受信上下文。
2. 在下方 operation 索引按 tag 查找路径与 method。
3. 打开具体 tag 页，先查看 Owner、Visibility、Stability、Idempotency、Permission 和 Authentication，再阅读参数、字段和 response。
4. 对字段级问题只引用生成页和 pinned artifact；不要从手写指南推导不存在的字段。

生成页顶部显示 artifact version、owner、visibility、source commit 和 SHA-256；operation 与 schema 库存从当前固定合同计算，不在此手填旧数量。门户只展示由 `kokoro-bff` 拥有且标为 `public` 的 operation，`browser-private` 不发布。来源摘要绑定完整 owner artifact，不绑定过滤结果；合同 metadata 不代表每个 live implementation 已完成验收。

<!--@include: ./generated/index-fragment.md-->
