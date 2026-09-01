# Kokoro Web 部署标准

状态：当前实施基线（2026-08-31）。GitHub 仓库 `LordFoxFairy/kokoro-app`（本地 checkout 目录为 `kokoro`）是一个独立产品 Web 发布单元：一套源码、
一个构建产物、一个版本线和一套部署配置。其它产品使用自己的 `kokoro-<product-slug>` 仓库，
不合并到同一个 Web bundle。

## 1. 环境文件与运行时配置

### 1.0 GitHub 仓库绑定

当前本地 `kokoro` 子仓库对应 GitHub 独立仓库
`LordFoxFairy/kokoro-app`，remote 为 `https://github.com/LordFoxFairy/kokoro-app.git`。
首次在一台新工作机绑定时使用：

```bash
git remote add origin https://github.com/LordFoxFairy/kokoro-app.git
git push -u origin main
```

GitHub Actions 的 `${{ github.repository }}`、GHCR 镜像名和 Cloudflare Builds 均以这个
独立仓库为准，不使用父仓库 `LordFoxFairy/Kokoro` 的 workflow 或构建上下文。

名称映射固定如下；本地 checkout 目录名 `kokoro` 不是发布身份，Cloudflare Worker 名称也不等于仓库或镜像名：

| 范围 | canonical name | 说明 |
| --- | --- | --- |
| GitHub 仓库 | `kokoro-app` | `LordFoxFairy/kokoro-app` |
| 根 package | `@kokoro/app` | package manifest 的实际名称，产品/仓库 slug 仍为 `kokoro-app` |
| Docker 镜像 | `kokoro-app` | `ghcr.io/lordfoxfairy/kokoro-app:<VERSION>` |
| Cloudflare Worker | `kokoro` | 由 `wrangler.jsonc` 的 `name` 固定；这是部署资源名，不是仓库名 |

一个 `kokoro` 仓库就是一个产品部署。环境文件只改变部署参数，不改变 React、CSS、路由或
构建选择。Next.js 只自动识别以下命名：

| 文件 | 作用 | 是否入 Git |
| --- | --- | --- |
| `.env.example` | Compose/生产变量总模板 | 是 |
| `.env.local` | 本地 `next dev`，优先于其它本地值 | 否 |
| `.env.test` | 测试 fixture（`NODE_ENV=test`） | 否 |
| `.env.production` | Next.js 生产文件名 | 否，优先用平台运行时注入 |
| `.env.prod` | Docker/运维约定名，不是 Next.js 自动加载名 | 否 |

环境选择固定如下；不要把 `KOKORO_DOMAIN` 做成浏览器或构建期 selector：

| 环境 | 入口 | `KOKORO_DOMAIN` 示例 | Preview/Mock | `NODE_ENV` |
| --- | --- | --- | --- | --- |
| local | `.env.local` | `dev.kokoro.localhost` | `NEXT_PUBLIC_SESSION_PREVIEW=1` 可用 | `development` |
| test | `.env.test` | `test.kokoro.localhost` | `NEXT_PUBLIC_SESSION_PREVIEW=1` 可用；测试可注入隔离值 | `test` |
| prod | `.env.prod` 显式传给 Docker，或 `.env.production`/平台运行时 | `app.example.com` 等部署绑定 hostname | 不使用；`production` 路径不启用 Preview Client | `production` |

`alpha.fixture.test`、`beta.fixture.test` 是 integration fixture 使用的合成 deployment binding，不是第三套环境，
也不从浏览器传入。Mock/Preview fixture 只属于 local/test 运行面；生产发布只切换到真实 BFF Client，不能在网络错误时
回退到静态 fixture。`LordFoxFairy/kokoro-app` 是独立 GitHub Web 仓库和独立发布单元，根 package 为 `@kokoro/app`；fixture
不另建仓库，也不因菜单或业务能力拆分仓库。

本地预览直接执行：

```bash
cp .env.local.example .env.local
pnpm dev
# http://dev.kokoro.localhost:3000
```

### 1.0.1 启动性能与缓存边界

本地刷新不经过 CDN。`pnpm dev` 的首次路由编译、React hydration、Preview 会话历史恢复和
浏览器主线程工作都发生在本机；遇到“正在加载工作区”时，先在浏览器 Network/Performance
面板确认是编译、请求还是主线程阻塞，再处理对应层，不用 CDN 掩盖本地启动问题。

当前 Web 启动链路的约束如下：

| 层 | 本地行为 | 生产行为 |
| --- | --- | --- |
| Next dev 编译 | `pnpm dev`，首次访问/刷新可能触发按路由编译 | 不存在；使用已构建的生产产物 |
| Preview 历史 | 首屏不在 `AppFrame` 构造阶段同步解析完整 localStorage 事件历史；首次传输操作时单次恢复 | 生产不启用 Preview Client |
| Session list | 相同客户端和 scope 的并发首页请求共享一个 in-flight promise | 仍由 Web/BFF/Session 动态提供，前端只做内存去重 |
| 用户/项目/会话 API | 不做 CDN 缓存 | 保持动态、私有；按契约使用 `private`/`no-store` 或 ETag 重验证 |
| `/_next/static/*` | 由 Next dev server 管理，不配置生产缓存 | CDN 可缓存，使用不可变哈希资源的长 TTL |

生产 CDN 只配置静态构建资源：

```http
Cache-Control: public, max-age=31536000, immutable
```

HTML、登录态、Chat/SSE、Workspace、Project、Skills、Library、Scheduled、Billing 和
Runtime Manifest 不使用公共 CDN 缓存。Runtime Manifest 如需服务端短缓存，必须按部署域名、
locale 和受信身份隔离，并保留 ETag/权限校验；这不等于把用户工作区响应放进公共缓存。

本地与生产基线命令：

```bash
pnpm dev                 # 本地开发与交互调试
pnpm build && pnpm start # 生产构建行为对比
pnpm check               # 发布前完整门禁
```

`.env.prod` 可以给 Docker 显式使用：

```bash
cp .env.prod.example .env.prod
docker run --rm -p 3000:3000 --env-file .env.prod ghcr.io/lordfoxfairy/kokoro-app:1.0.0
```

如果由 Next.js 文件加载生产变量，文件名使用 `.env.production`；Cloudflare 则使用 Worker
Variables/Secrets。不要把真实 secret 提交到任何 env 文件。

每个部署只配置自己的规范域名：

```dotenv
KOKORO_DOMAIN="dev.kokoro.localhost"
```

- 值是不带协议的 hostname；local 使用 `dev.kokoro.localhost`，test 使用 `test.kokoro.localhost`，生产替换为部署绑定的公开域名；
- 域名变化只更新环境变量和后端绑定，不改变 React、CSS、路由或构建选择；
- 浏览器不读取该变量，也不把它写入 URL、body、React state、localStorage 或公开响应；
- BFF 对每个后端上游（System、User、Hub、Billing、Agent 等）统一生成标准 RFC 7239 header：

```http
Forwarded: host=<KOKORO_DOMAIN>
```

BFF 不把浏览器请求的 `Host` 当作产品上下文；出站 transport 删除调用方传入的 `Host`、`X-Domain`、`Forwarded`、
`X-Forwarded-Host` 和旧的 tenant/site header，再由上游 URL 生成连接所需的 HTTP `Host`，并写入由服务端
`KOKORO_DOMAIN` 生成的唯一 `Forwarded`。因此 HTTP `Host` 只表示上游目标 authority，`Forwarded` 才是经服务认证
和来源 allowlist 保护后供后端解析的部署上下文。后端只信任来自 Web BFF 的服务身份
和受信网络路径中的该 header，并依据它完成域名 allowlist、身份、授权、请求上下文和数据隔离。
Web 不保存或传递内部隔离键。

Composer 语音输入保持同一边界：使用浏览器 `SpeechRecognition`/`webkitSpeechRecognition` 或本地合成 preview 文本，
原始音频不进入 Kokoro BFF、IAM 或 System；当前仓库没有独立的语音上传、转写或音频存储 endpoint。用户显式发送后，
转写文本沿用已有会话消息契约；不为语音增加新的后端接口。

其它服务端变量见仓库根目录 [`.env.example`](../.env.example)。生产和 Cloudflare runtime
至少需要 `KOKORO_INTERNAL_SECRET_WEB_BFF`；System workload token 的实际变量名是
`KOKORO_SYSTEM_WORKLOAD_TOKEN`。两者都只放部署平台 secret/variable，绝不使用 `NEXT_PUBLIC_*`。

### 1.1 Web、业务 BFF 与 Chat 的切换

Chat 不在 Web 内部复制一套业务接口。浏览器始终访问同源 `/api/session/*`，由 Web 服务端适配到
`kokoro-bff/v1/*`；Projects、Skills、Scheduled、Agent setup、Library 和 Billing 业务面也走独立
`LordFoxFairy/kokoro-bff`：

```dotenv
# kokoro-app（仅服务端）
KOKORO_BFF_BASE_URL="http://kokoro-bff:4300"
KOKORO_IAM_BASE_URL="http://kokoro-iam:4211"
KOKORO_INTERNAL_SECRET_WEB_BFF="<web-bff-secret>"

# kokoro-bff（独立服务）
KOKORO_DOMAIN="dev.kokoro.localhost"
KOKORO_BFF_MODE="mock" # live 部署时改为 live
KOKORO_BFF_SHARED_SECRET="<web-bff-secret>"
KOKORO_INTERNAL_SECRET_BFF="<bff-upstream-secret>"
```

本地第一阶段将 `KOKORO_BFF_MODE` 保持为 `mock`，Web 仍只通过 server route 调用 BFF；浏览器
不访问 4300 端口，也不持有 BFF secret。生产切换到 `live` 后，为每个业务子仓库配置独立的
`KOKORO_*_BASE_URL`，缺失的上游返回明确 503，不静默回退 Mock。

这三个仓库之间没有 workspace、`file:` 依赖、`src/site` 复制或 submodule。Web 负责 HttpOnly
session envelope、Origin 检查和同源入口；BFF 负责业务投影、Chat 编排、幂等和 upstream 适配；
Agent 负责执行、Run 状态、HITL 和 Redis worker，不被 Web 或 BFF 直接访问其存储。
当前拓扑不使用 `kokoro-gateway`，旧 Gateway 只保留为历史独立仓库，不是运行、CI 或部署前置条件。

阶段 1 的运行时存储只使用 PostgreSQL 与 Redis：PostgreSQL 保存会话、消息、Run、控制、HITL、
outbox 及业务事实，Redis 负责事件流、队列、租约、唤醒和短期缓存。Web 不直接连接任一存储，
BFF 通过业务端口对接，Agent 通过自己的 PostgreSQL/Redis 适配器对接；不新增 MySQL、MongoDB
依赖，也不把 Redis 当作 PostgreSQL 的持久化替代品。

## 2. 发布选择

### 方案 A：GitHub tag → GHCR Docker 镜像（默认）

适合自有服务器、Kubernetes 或现有 Docker 平台：

```text
push v1.0.0 tag
  → .github/workflows/release-image.yml
  → pnpm lint / test / typecheck / build
  → Docker Buildx 构建 Dockerfile
  → ghcr.io/lordfoxfairy/kokoro-app:1.0.0
  → 由部署平台注入 KOKORO_DOMAIN 与服务端 secrets
```

GitHub Packages 需要允许 workflow 使用 `GITHUB_TOKEN` 写入。镜像名由
`${{ github.repository }}` 派生，版本 tag 不携带域名或内部隔离信息。GitHub 官方的 Docker
发布流程也采用 Actions、Registry 登录、metadata 和 Build/Push 组合，见
[Publishing Docker images · GitHub Docs](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images?learn=continuous_deployment)。

发布正式版本：

```bash
git tag v1.0.0
git push origin v1.0.0
```

手动运行 release workflow 只用于显式的临时 tag；正式生产版本使用 semver tag。发布前在目标
环境准备：

```dotenv
KOKORO_DOMAIN="app.example.com"
KOKORO_WEB_SESSION_SECRET="<secret>"
KOKORO_BFF_BASE_URL="http://kokoro-bff:4300"
KOKORO_IAM_BASE_URL="http://kokoro-iam:4211"
KOKORO_INTERNAL_SECRET_WEB_BFF="<secret>"
# 按 System 服务策略启用；变量名必须保持为 KOKORO_SYSTEM_WORKLOAD_TOKEN。
KOKORO_SYSTEM_WORKLOAD_TOKEN="<secret>"
```

上线检查：

1. 访问规范域名，确认 `/` 和 `/app` 都由当前产品路由处理；
2. 检查 BFF 到每个上游的请求都有唯一、正确的 RFC 7239 `Forwarded`，例如
   `Forwarded: host=app.example.com`；
3. 确认浏览器 Network、URL、body、localStorage 不出现内部隔离键和服务端 secret；
4. 验证登录、会话 SSE、Skills、Library、Scheduled、Agent、设置和错误态；
5. 保存同一桌面视口的发布截图并记录镜像 digest。

### 方案 B：Cloudflare Workers Builds 直接连接 GitHub

此路径不经过 Docker。Cloudflare Workers Builds 直接连接 GitHub 仓库 `LordFoxFairy/kokoro-app`：

```text
Build command:
  pnpm install --frozen-lockfile && pnpm run cf:build

Deploy command:
  pnpm exec opennextjs-cloudflare deploy
```

OpenNext 提供将 Next.js 应用适配 Cloudflare 的构建和部署流程，见
[OpenNext Cloudflare Get Started](https://opennext.js.org/cloudflare/get-started)。Cloudflare
的 Next.js 部署说明见 [Next.js · Cloudflare Workers docs](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)。

Cloudflare Build variables/secrets 配置：

```text
KOKORO_DOMAIN
KOKORO_WEB_SESSION_SECRET
KOKORO_BFF_BASE_URL                   # independent server-only business entry
KOKORO_IAM_BASE_URL                  # explicit auth service
KOKORO_SYSTEM_BASE_URL                # explicit manifest service
KOKORO_INTERNAL_SECRET_WEB_BFF        # production-required BFF credential
KOKORO_SYSTEM_WORKLOAD_TOKEN           # exact System workload-token name; if enabled by System policy
```

`CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 只供手动触发的
`.github/workflows/cloudflare.yml` 使用；业务运行时变量仍配置在 Cloudflare Worker
Variables/Secrets 中。这个 workflow 默认不会因 Docker tag 自动触发，避免一次提交同时变更两套
生产环境。它是生产 deploy workflow，不是任意 ref 的通用发布入口：在 GitHub 的
`workflow_dispatch` 页面必须选择已存在的严格 `vMAJOR.MINOR.PATCH` tag，workflow 会在安装依赖前
拒绝 branch、非 tag ref 和带 prerelease/build 元数据的 tag。手动预览使用本地或 Cloudflare
preview 命令 `pnpm run cf:preview`，不调用该 deploy workflow。

Cloudflare 发布验收必须包含 `pnpm run cf:preview`、BFF JSON、SSE、登录回调、RFC 7239 `Forwarded` 注入
和桌面截图；OpenNext 适配层变更不改变产品仓库和 shared package 边界。

### 方案 C：自有平台拉取 GHCR

Kubernetes、Compose 或其它容器平台使用不可变版本：

```bash
docker pull ghcr.io/lordfoxfairy/kokoro-app:1.0.0
```

平台只负责运行当前产品镜像并注入 `KOKORO_DOMAIN`。域名不是镜像 tag，也不是前端 selector；
BFF 的 RFC 7239 `Forwarded` 出站策略保持不变。

## 3. Docker Compose 本地/验收环境

```bash
cp .env.example .env
# 将 .env 中的 KOKORO_DOMAIN 与实际访问域名保持一致
docker compose -f docker-compose.example.yml up -d --build
```

本地可用 `http://dev.kokoro.localhost:3000` 访问。`*.localhost` 解析到 loopback，无需 hosts
文件。Compose 健康检查只验证 Web 进程可响应；真实后端可用性由对应 BFF 页面状态和 API 验收
完成。

## 4. 版本、回滚与共享 package

- `main` 只执行 CI，不自动发布生产；
- 生产发布只接受 `vMAJOR.MINOR.PATCH`，部署优先使用完整版本和 image digest；
- 回滚就是重新部署上一个完整版本，不依赖可变的 `latest`；
- 每个产品仓库独立运行 lint、test、typecheck、build、桌面截图和交互验收；
- shared package 先在 `kokoro-web-shared` 发布 semver，再由产品仓库升级 lockfile；
- 共享 package 的升级不自动改变产品页面布局，升级需在当前仓库重新完成视觉回归。

## 5. Cloudflare 适配文件

- `open-next.config.ts`：OpenNext Cloudflare 配置；
- `wrangler.jsonc`：Worker 名称、兼容日期、`nodejs_compat` 和静态资源目录；
- `cloudflare-env.d.ts`：由 `pnpm run cf:typegen` 生成，不承载 secret；
- `.open-next/`：构建产物，不提交 Git。

## 6. 发布前门禁

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
pnpm run cf:build   # 选择 Cloudflare 路径时
```

顺序执行 `typecheck` 与 `build`。所有门禁、桌面截图、真实交互和 RFC 7239 `Forwarded` 出站检查通过后，
才允许部署该版本。
