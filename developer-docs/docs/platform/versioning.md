# 版本与弃用

当前 public contract version 以 catalog pin 与 generated manifest 为准，业务路径前缀为 `/v1`。owner、visibility 和 stability 逐项使用正式 metadata，不再手写一个易失同步的当前版本号。

## 兼容性说明

以下是门户提供的客户端兼容建议，不是对尚未写入 artifact 的 server behavior 的新增承诺：

- 只增加 optional response field、新 error code 或新 operation 时，可在同一 major path 中演进，但必须同时更新 owner contract、生成物、示例和测试；
- 删除 path/method、重命名 operationId、把 optional input 改为 required、收窄 response，或改变 permission/idempotency 语义时，应建立新的 API version；
- schema 校验后忽略未知 response field，不要对 error code 做穷举假设；
- 客户端记录自己使用的 contract version 和 source digest。

## 当前弃用事实

v1 contract 当前没有 `Sunset` header，也没有公开 deprecation schedule。它们属于**当前未发布**的能力；未来的弃用通知只有在 canonical owner contract 和[变更记录](/changelog)中出现后才是可引用事实。门户不根据愿景生成 endpoint 或 header。
