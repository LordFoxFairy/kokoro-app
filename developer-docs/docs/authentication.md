# 认证与请求约定

Kokoro API v1 由受信任的后端或 Web 同源服务端 adapter 调用。浏览器代码不持有服务凭据，也不直接连接内部 BFF。唯一字段事实源是已固定 owner artifact 的 securitySchemes 和各 operation.security；健康／就绪按其 `security: []` 匿名读取，不据此放开业务接口。

对外 App 的 `GET /v1/skill.list` 仅携带 User API Key 或已登记 OAuth App 的 Bearer；下表的 service envelope 由同源服务端 adapter 注入，外部调用方不持有或发送内部服务凭据。此入口不依赖浏览器 Product Session，也不把这种身份支持推及其他 operation。

内部 BFF 默认认证是 service envelope 加 IAM 用户会话 Bearer：

| Header | 含义与来源 |
| --- | --- |
| `x-kokoro-service` | 已配置的受信服务调用方，不是浏览器自报身份。 |
| `x-kokoro-internal-secret` | 该服务的独立凭据，仅服务端读取。 |
| `Authorization` | `Bearer` 携带当前 IAM 用户会话，BFF 在线准入并取得固定 tenant 与 actor。 |

旧的 namespace／principal 自报上下文头不再是身份来源；请求 body、URL、Host、X-Domain 和 X-Forwarded 字段也不建立主体或租户权限。资源 ID、分享链接及 opaque cursor 只定位对象，不替代授权；返回前仍可能重新检查当前资格。

## 当前支持范围

固定 `skill.list` 契约声明在既有 service envelope 内使用 IAM User API Key 或已登记 OAuth Open App 身份。普通 App 仅读自身精确绑定并拒绝 `project_id`；User API Key 读取本人及已授权项目安装，trusted App 额外包含自身绑定。trust 与项目资格由 IAM/BFF 核验，不由客户端参数推断；网站 RPC 仍使用 Product Session。服务凭据不替代个人 API Key，读取资格也不授予模型或工具执行权。这里描述固定契约，不以生成页或示例证明正常部署、应用注册和完整业务旅程均已完成。

管理 operation 即使标为 `public`，仍受其管理员权限约束。提供方上游候选 GET 只允许当前平台管理员显式读取已存提供方；不接收 Key 或地址，不自动发布、推测价格或执行模型。非现金充值还要求重新核验当前租户收款成员；`subject_id`是收款人而非操作者声明，tenant和管理员身份仍由会话产生。不要用User API Key或普通OAuth App身份调用此管理操作。公开发布分类不是匿名或普通用户授权。

## 安全与调用约定

凭据、Cookie、API Key、用户完整内容和签名下载地址不写入文档、URL或普通日志。示例只用明显虚假的环境值，并在本地 loopback fixture 执行，不建立真实用户身份或执行模型／工具。

方法、参数位置、必填性、权限、幂等、错误与响应头按对应[API参考](/reference/v1/)处理。不同 operation 的 envelope 与请求ID表示并不相同，不套用统一包装；详见[响应与错误](/platform/responses-errors)和[请求ID](/platform/request-ids)。
