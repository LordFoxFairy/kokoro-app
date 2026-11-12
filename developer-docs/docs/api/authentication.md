# 认证与请求约定

## 选择正确的接入方式

| 场景 | 客户端发送什么 | 服务端职责 |
| --- | --- | --- |
| 外部 `GET /v1/skill.list` | `Authorization: Bearer TOKEN`；User API Key 或已登记 Open App 令牌 | 公开 Web 入口注入受信服务身份，BFF／IAM核验当前读取资格 |
| 浏览器工作台 | 同源请求携带原生登录 Cookie；写请求遵循 Origin 约束 | Web adapter 注入服务凭据；BFF 准入取得当前 tenant／actor |
| 第一方 Web → BFF | 原始登录 Cookie、固定 Web Origin，以及受信服务 envelope | 不把用户身份改成 body 参数，不把这一接线开放给外部调用方 |

外部调用方只访问公开 Web，不直连内部 BFF，不持有 `x-kokoro-service` 或 `x-kokoro-internal-secret`。API Key 不替代工作台登录；Cookie 也不是 `skill.list` 的兜底身份。

### 第一方参考与机器契约

固定 Public28.37 artifact 的普通产品接口声明受信 adapter envelope、原生 Session Cookie 与精确 Web Origin。plain 和 Secure Cookie 表示部署配置的互斥模式，不是同时接受两种名称的运行时 fallback。生成页追溯 owner 原件；浏览器仅访问同源入口，不持有内部服务凭据，也不将用户 Session 转为 Bearer。匿名公共分享、提供方 webhook、service-only operation 与独立 `skill.list` Bearer 接入分别遵循自身声明，不能套用普通工作台认证。

任务、分页、上传和恢复示例是受信第一方服务端参考，在本地 fixture 中使用以下配置；不是给外部客户端索取内部凭据的步骤：

| 配置／Header | 第一方含义 |
| --- | --- |
| `KOKORO_API_BASE_URL` | 受信环境的 BFF 地址；外部快速开始中则是公开 Web 地址，两者不混用 |
| `KOKORO_INTERNAL_SECRET` → `x-kokoro-internal-secret` | 仅服务端读取的独立服务凭据；不复用外部快速开始中的 API Key |
| `x-kokoro-service: web-bff` | 已配置的第一方调用者 |
| `KOKORO_SESSION_COOKIE` → `Cookie` | 正式原生登录取得、issuer allowlist 接受的 Session Cookie（例如 `kokoro-issuer.session_token`），不是整串浏览器 Cookie；不转为用户 Bearer |
| `KOKORO_WEB_ORIGIN` → `Origin` | 固定 Web origin，不使用任意客户端自报值建立信任 |

BFF 到内部 owner 使用服务身份与受信 actor 上下文，不逐跳转发浏览器 Cookie／用户 Bearer 或重复 OAuth；账户会话等原生认证生命周期按其专门契约处理。

旧的 namespace／principal 自报上下文头不再是身份来源；请求 body、URL、Host、X-Domain 和 X-Forwarded 字段也不建立主体或租户权限。资源 ID、分享链接及 opaque cursor 只定位对象，不替代授权；返回前仍可能重新检查当前资格。

## 当前支持范围

固定 `skill.list` 契约声明在既有 service envelope 内使用 IAM User API Key 或已登记 OAuth Open App 身份。普通 App 仅读自身精确绑定并拒绝 `project_id`；User API Key 读取本人及已授权项目安装，trusted App 额外包含自身绑定。trust 与项目资格由 IAM/BFF 核验，不由客户端参数推断；网站 RPC 仍使用 Product Session。服务凭据不替代个人 API Key，读取资格也不授予模型或工具执行权。这里描述固定契约，不以生成页或示例证明正常部署、应用注册和完整业务旅程均已完成。

管理 operation 即使标为 `public`，仍受其管理员权限约束。提供方上游候选 GET 只允许当前平台管理员显式读取已存提供方；不接收 Key 或地址，不自动发布、推测价格或执行模型。非现金充值还要求重新核验当前租户收款成员；`subject_id`是收款人而非操作者声明，tenant和管理员身份仍由会话产生。不要用User API Key或普通OAuth App身份调用此管理操作。公开发布分类不是匿名或普通用户授权。

## 提供方专用回调

外部聊天连接的回调不是普通用户 API 调用，按对应 operation 的验证方式处理：

| Header | 适用回调与验证 |
| --- | --- |
| `X-Telegram-Bot-Api-Secret-Token` | Telegram webhook 的已配置提供方秘密；不是用户登录 Bearer。 |
| `X-Line-Signature` | LINE webhook 原始请求字节的 Base64 HMAC-SHA256 签名，以已配置 channel secret 验证。 |

Slack 的完成流程使用其专属回调／状态绑定和交换语义，以对应生成参考为准；不套用 Telegram 或 LINE 的请求头。客户端不得把提供方回调验证替换成自报 user/tenant 或一个普通 API Key。凭据配置与真实供应商账号验收是两件事，本页不声称三渠道生产已接通。

## 安全与调用约定

凭据、Cookie、API Key、用户完整内容和签名下载地址不写入文档、URL或普通日志。示例只用明显虚假的环境值，并在本地 loopback fixture 执行，不建立真实用户身份或执行模型／工具。

方法、参数位置、必填性、权限、幂等、错误与响应头按对应[API参考](/api/reference/v1/)处理。不同 operation 的 envelope 与请求ID表示并不相同，不套用统一包装；详见[响应与错误](/api/platform/responses-errors)和[请求ID](/api/platform/request-ids)。
