# Kokoro User Web 发布与联调手册

## 1. 固定边界

本地 checkout `kokoro` 对应 GitHub 独立仓库 `LordFoxFairy/kokoro-app`：一套源码、一条版本线、一个部署实例。仓库内部不再引入
运行时 Site registry、Site selector 或 Host → React/CSS 映射。其它产品使用自己的 Web 仓库，
通用能力通过 `kokoro-web-shared` 的 semver package 复用。

```text
Browser
  → kokoro same-origin BFF (/api/*)
  → backend services (User / Session / System / Hub / Billing)
  → backend resolves tenant, auth, permission and data scope
```

浏览器不发送或接收 `tenant_id`、`site_id`、内部 namespace、workload token 或 IAM JWT。登录态只
通过 httpOnly session cookie 留在 BFF。

## 2. 服务端环境

```dotenv
KOKORO_DOMAIN=dev.kokoro.localhost
KOKORO_WEB_SESSION_SECRET=BACKEND_SECRET
KOKORO_USER_BASE_URL=http://kokoro-user:4211
KOKORO_SESSION_BASE_URL=http://kokoro-session:3900
KOKORO_SYSTEM_BASE_URL=http://kokoro-system:4240
# 按需配置能力面：
KOKORO_HUB_BASE_URL=http://kokoro-hub:4251
KOKORO_BILLING_BASE_URL=http://kokoro-billing:4245
KOKORO_INTERNAL_SECRET_WEB_BFF=BACKEND_SECRET
```

所有 secret、内部服务 URL 和 workload token 只放部署平台变量/secret，不使用 `NEXT_PUBLIC_*`。
`KOKORO_DOMAIN` 是不带协议的规范 hostname；每个独立部署只配置一个值。

## 3. RFC 7239 `Forwarded` 联调验收

1. 让访问域名与 `KOKORO_DOMAIN` 保持一致；本地推荐 `dev.kokoro.localhost:3000`。
2. 访问 `/`，确认 308/307 进入 `/app`，没有第二套旧首页布局。
3. 登录或进入 preview，检查浏览器 Network 只出现同源 `/api/*`。
4. 检查 BFF 到 User、Session、System、Hub、Billing 的每个请求都有：

   ```http
   Forwarded: host=<KOKORO_DOMAIN>
   ```

5. 用浏览器尝试发送伪造 RFC 7239 `Forwarded`、Host 或 tenant/site 字段；BFF 必须使用服务端配置覆盖，
   不把它们转发为可信上下文。
6. 确认公开 JSON、URL、body、cookie、localStorage 和错误响应不出现内部隔离键。
7. 验证登录回调、Session SSE、直接聊天、项目聊天、Skills、Library、Scheduled、Agent、设置、
   文件下载、分享和 Billing 的 loading/empty/error/forbidden 状态。
8. 同一个邮箱在后端不同租户数据中的隔离由后端根据 RFC 7239 `Forwarded` 和会话完成，Web 不自行解析 tenant。

## 4. 本地回归

```bash
cp .env.local.example .env.local
# 本地值保持一致：KOKORO_DOMAIN=dev.kokoro.localhost
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

未连接后端时，`/app` 使用合成 preview fixture；preview 不代表真实业务数据，也不伪造后端响应。
Docker Compose 使用 `cp .env.example .env`；生产容器可用 `--env-file .env.prod`，但 Next.js
文件加载的标准生产名称是 `.env.production`。需要 Cloudflare 预览时再运行 `pnpm run cf:build`。

## 5. 发布前检查

```bash
# Docker 路径
pnpm check
docker build -t kokoro-app:local .
docker run --rm -p 3000:3000 --env-file .env.prod kokoro-app:local

# Cloudflare 路径
pnpm check
pnpm run cf:build
pnpm run cf:preview
```

两条路径选择其一，不因 Docker tag 自动触发 Cloudflare 发布。发布时把 `KOKORO_DOMAIN` 和服务端
secrets 作为运行时变量注入，域名不写入镜像 tag、前端 bundle 或 React state。

## 6. 生产 smoke

```bash
KOKORO_WEB_URL=https://app.example.com pnpm smoke:first-site
```

本地 smoke 可让连接地址走 IPv4，同时用 `KOKORO_WEB_HOST` 保留规范的本地域名：

```bash
KOKORO_WEB_URL=http://127.0.0.1:3000 \
KOKORO_WEB_HOST=dev.kokoro.localhost:3000 \
KOKORO_DOMAIN=dev.kokoro.localhost \
pnpm smoke:first-site
```

Smoke 应覆盖 `/` → `/app`、runtime manifest、匿名/认证态、Session BFF，以及浏览器响应不暴露
内部身份字段。发布后记录版本 tag、容器 digest 或 Cloudflare deployment version，回滚使用上一
个完整版本，不修改正在运行的镜像。
