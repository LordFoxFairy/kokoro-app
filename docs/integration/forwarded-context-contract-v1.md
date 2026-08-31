# Web BFF 标准转发上下文契约 v1

状态：2026-08-31，`kokoro` Web 当前实现基线。

## 1. 结论

浏览器 **不得发送** 自定义 `X-Domain`；它不是浏览器 API，也不是租户、站点或部署上下文。
即使请求带有 `X-Domain`，BFF 也必须忽略并删除它，不得把它转发给任何上游。域名只来自每个产品
部署的服务端环境变量 `KOKORO_DOMAIN`；该变量仅由服务端配置读取，不得从浏览器 query、body、
header、runtime manifest、localStorage 或 Cookie 选择或回传。BFF 使用 RFC 7239 标准
`Forwarded` 表达公开 authority：

```http
Forwarded: host=dev.kokoro.localhost
```

`Forwarded` 是代理上下文，不是浏览器可提交的租户 ID，也不是独立的认证机制。BFF 到上游的请求
必须带有独立的 service auth；后端还必须先校验 Web BFF 的服务身份和来源 allowlist（内部
secret/mTLS、网络 ACL 或等价机制），然后才可以使用其中的 `host` 做域名 allowlist、deployment
binding 和 tenant resolution。

## 2. Web BFF 行为

每个上游请求都通过统一 transport：

```text
Browser → same-origin /api/* → Kokoro Web BFF
                              ↓
                 service-authenticated upstream
                 Forwarded: host=<KOKORO_DOMAIN>
```

BFF 在写入自己的值前删除调用方提供的；这些值都不能成为产品上下文：

- `X-Domain`；
- `Host`（上游连接 authority 由目标 URL 自动生成，不是产品域名上下文）；
- `Forwarded`；
- `X-Forwarded-Host`、`X-Forwarded-Proto`、`X-Forwarded-For`；
- 历史 `x-kokoro-tenant-id`、`x-kokoro-site-id`。

BFF 在 service auth/allowlist 保护的上游连接上只写入单个 `Forwarded`，不追加浏览器值；其值
必须是服务端 `KOKORO_DOMAIN` 规范化后的 hostname。`for`、`proto` 暂不写入，因为当前契约只
需要部署公开 hostname，且不需要把客户端 IP 或协议复制到业务服务。

## 3. 后端处理要求

1. 只接受来自来源 allowlisted Web BFF 的请求，并先验证独立的 service auth；生产必须启用服务间
   认证和受信网络边界。
2. 只有通过第 1 项校验后，才解析 RFC 7239 `Forwarded` 的 `host` 参数，并进行 hostname 校验、
   域名 allowlist 和有效绑定检查。
3. `Forwarded` 与 opaque session、actor membership、权限检查一起决定请求 scope；不能把它当作
   单独的认证凭据。
4. `Host` 仍然是后端当前内部服务的连接 authority，不把它当成产品公开域名。
5. 响应不要回传内部 `tenant_id`、binding revision、service credential 或内部 header。
6. 同一个邮箱在不同 deployment domain 下必须由后端 membership/scope 保证数据隔离；Web 不
   解析或持久化 tenant ID。

## 4. 环境文件与域名

```dotenv
# .env.local
KOKORO_DOMAIN=dev.kokoro.localhost

# .env.test
KOKORO_DOMAIN=test.kokoro.localhost

# .env.production 或 Docker/Cloudflare runtime
KOKORO_DOMAIN=app.example.com
```

`KOKORO_DOMAIN` 不带协议和端口，只存在于服务端运行时配置。浏览器不得读取、设置或覆盖它；它
不应进入客户端 bundle、API request 或 response。Docker 可以显式使用 `.env.prod`，Next.js 自动
加载则使用 `.env.local`、`.env.test` 或 `.env.production`；参见 [`docs/deployment.md`](../deployment.md)。

## 5. 验收

- 浏览器 wire 请求不包含 `X-Domain`；若调用方伪造该 header，BFF 丢弃且不上游；
- 真实 upstream wire 的 `Forwarded` 只出现一次，值来自服务端 `KOKORO_DOMAIN`，并且该连接通过
  service auth 与来源 allowlist；
- 浏览器伪造 `Forwarded`、`X-Forwarded-*`、Host 或 tenant/site 字段不改变上游上下文；
- 上游 `Host` 仍匹配目标服务 URL，不被产品域名覆盖；
- JSON、SSE、下载、重试和 mutation 全部走同一规则；
- `/api/*` response、URL、body、localStorage 和 Cookie 不出现内部租户标识；
- 生产服务间认证缺失时 fail closed，不依靠 `Forwarded` 自身提供完整性。
