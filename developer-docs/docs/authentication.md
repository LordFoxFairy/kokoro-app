# 认证与请求约定

Kokoro API v1 由受信任的后端或 Web 同源服务端 adapter 调用。浏览器代码不持有服务凭据，也不直接连接内部 BFF。唯一字段事实源是已固定 owner artifact 的 securitySchemes 和各 operation.security；健康／就绪按其 `security: []` 匿名读取，不据此放开业务接口。

当前默认认证是 service envelope 加 IAM 用户会话 Bearer：

| Header | 含义与来源 |
| --- | --- |
| `x-kokoro-service` | 已配置的受信服务调用方，不是浏览器自报身份。 |
| `x-kokoro-internal-secret` | 该服务的独立凭据，仅服务端读取。 |
| `Authorization` | `Bearer` 携带当前 IAM 用户会话，BFF 在线准入并取得固定 tenant 与 actor。 |

旧的 namespace／principal 自报上下文头不再是身份来源；请求 body、URL、Host、X-Domain 和 X-Forwarded 字段也不建立主体或租户权限。资源 ID、分享链接及 opaque cursor 只定位对象，不替代授权；返回前仍可能重新检查当前资格。

## 当前支持范围

公开 `skill.list` 当前实现 Product 人类会话准入；Manus 的 API Key、普通 OAuth Open App 与 trusted client 三种入口仍待正式 IAM 配对。不要把现有服务凭据冒作个人 API Key，也不以文档示例宣称这些身份已完成。

## 安全与调用约定

凭据、Cookie、API Key、用户完整内容和签名下载地址不写入文档、URL或普通日志。示例只用明显虚假的环境值，并在本地 loopback fixture 执行，不建立真实用户身份或执行模型／工具。

方法、参数位置、必填性、权限、幂等、错误与响应头按对应[API参考](/reference/v1/)处理。不同 operation 的 envelope 与请求ID表示并不相同，不套用统一包装；详见[响应与错误](/platform/responses-errors)和[请求ID](/platform/request-ids)。
