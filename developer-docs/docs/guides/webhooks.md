# Webhooks（当前边界）

Webhook 当前不属于 Kokoro public v1 contract。canonical OpenAPI 没有 outbound webhook object，也没有 registration、delivery 或 signature-verification operation；该能力当前未发布。

不要针对内部 owner callback 编写 receiver，不要复制私有 signing header，也不要猜测 signature algorithm。未来只有在 owner contract 明确 registration、event envelope、delivery identity、replay、timestamp tolerance、key rotation 和 verification 字段后，门户才会生成对应 reference 和指南。

当前 Agent progress 使用[AG-UI event stream](/concepts/ag-ui)。它是客户端主动建立的 SSE projection，不是 webhook，也不提供 webhook 的 delivery retry 语义。
