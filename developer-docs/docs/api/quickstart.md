# 快速开始：读取技能

从应用的公开 Web 地址读取当前身份有资格访问的技能。此入口支持 IAM User API Key 或已登记 OAuth Open App 的访问令牌；不要求浏览器登录，也不需要内部服务凭据。

## 1. 准备地址和凭据

- `HOST`：已配置的公开 Web 域名，不是内部 BFF 地址。
- `TOKEN`：你已有的 IAM User API Key 或已登记 Open App 的访问令牌。

本页不提供自助发放凭据的接口，也不把这一入口的令牌支持扩展为通用 Task API。

```bash
export KOKORO_API_BASE_URL="https://HOST"
export KOKORO_API_TOKEN="TOKEN"
```

## 2. 发起请求

<<< ../../examples/curl/list-skills.sh{bash}

只发送 Bearer 和 Accept；不发送 Cookie、内部服务身份或 secret，也不需要幂等键。首次调用不加 `project_id`：普通 Open App 只读取自身绑定，项目资格另有约束。

## 3. 处理结果

成功响应使用 `{ok, request_id, data}`，不是任务接口的 `data/meta` 包装。字段和筛选参数见[技能读取](/api/guides/skills)及[技能参考](/api/reference/v1/generated/skills#list-skills)。

若失败，检查 HTTP 状态、错误码和 `X-Request-Id`，不要将令牌或完整响应内容贴入日志。[认证约定](/api/authentication)说明两类接入的边界，[响应与错误](/api/platform/responses-errors)说明各自的响应结构。

## 接下来

- 使用工作台：阅读[任务与对话](/product/tasks/)。
- 维护第一方服务端适配器：阅读[创建 run](/api/guides/create-run)、[断线后恢复](/api/guides/replay-after-disconnect)及[API 参考](/api/reference/v1/)。这些不是上述令牌可直接调用的通用外部 Task API。

示例在本地无凭据 HTTP fixture 上执行，只证明请求示例与契约形状；不代表真实部署、应用注册或上游服务验收。
