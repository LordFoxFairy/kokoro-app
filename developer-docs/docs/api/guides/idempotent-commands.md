# 构建幂等 command

为每个逻辑 mutation 创建不可预测且稳定的 key，并在本地 command 结果确定前保存它。哪些 operation 必须带 key 不由本页推测，而由生成 reference 的 `x-kokoro-idempotency` metadata 决定。

## Retry contract

- 相同 key + 相同 namespace + 相同 method + 相同 canonical path + 相同请求语义：服务端可以 replay 原结果；
- 相同作用域的 key 配上不同语义：进入 `idempotency_conflict`；
- 第一次请求仍在处理：可能进入 `idempotency_in_progress`；
- transport failure 或可重试的 server failure：用原 key 和未改变的 command 重试。

不要把 timestamp、attempt counter 或随机字段塞进重试 body；它们会改变请求语义。不同逻辑 command 永远使用不同 key，不要用不同 key 并行掩盖不确定响应。

## 当前 beta 说明

owner 实现的 fingerprint 覆盖范围仍需以当前 BFF contract/实现证据为准。调用方应把整个 method、URL、query、选定 header 和 body 保持稳定，不依赖未发布的内部归一化细节。
