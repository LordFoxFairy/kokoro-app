# kokoro

Kokoro 是一个独立的桌面 Web 产品仓库。它发布一套确定的产品页面、布局、品牌素材和交互，
不是多个产品共用的运行时壳，也不通过 `SITE_ID`、域名分支或多站 registry 选择 React/CSS。
通用 Web 能力由独立的 `kokoro-web-shared` package 仓库维护，当前仓库只通过版本包或本地
bootstrap 使用它们。

## 仓库边界

- `kokoro/`：当前产品 Web 的页面、布局、CSS Modules、品牌、SEO、素材、session HTTP/SSE、
  HITL、Canvas、Library、Skills 和 UI 组装；独立构建、发布、部署、回滚。
- `kokoro-<product-slug>/`：其它产品各自的独立 Web 仓库。它们可以复用 shared package，
  但拥有自己的页面信息架构和发布生命周期，不放进本仓库的多产品目录。
- `kokoro-web-shared/`：唯一的共享 package 仓库，内部用一个 pnpm workspace 管理
  `@kokoro/web-core`、`@kokoro/web-data`、`@kokoro/web-ui`、`@kokoro/web-blocks`、
  `@kokoro/web-runtime`、`@kokoro/i18n` 和 `@kokoro/tsconfig`。不按菜单、Skills、i18n 等
  业务能力分别建 Git 仓库。
- `kokoro-system`：菜单、i18n、主题、产品入口和 feature manifest 的后端事实源；Web 只消费
  经过 BFF 校验的公开投影。
- `kokoro-iam`：身份、认证、权限和服务端隔离上下文；它不承载页面布局、CSS token、营销文案
  或 Skills 业务资源。
- User Web 不直连 IAM/System/Agent、数据库、Redis 或内部 RPC；Admin Web 不属于本仓库。

## GitHub 身份

当前本地子仓库已经绑定到正式 GitHub remote：
`https://github.com/LordFoxFairy/kokoro-app.git`。GitHub 仓库名为 `kokoro-app`，本地产品子仓库目录仍为 `kokoro`。
首次在一台新工作机绑定时使用：

```bash
git remote add origin https://github.com/LordFoxFairy/kokoro-app.git
git push -u origin main
```

当前子仓库的 GitHub 发布身份是 `LordFoxFairy/kokoro-app`，不使用父仓库
`LordFoxFairy/Kokoro` 的 workflow 或构建上下文；父仓库只保留总仓文档和其它子仓边界。

## 请求上下文：只在 BFF 处理部署域名

浏览器只请求同源 `/api/*`。前端的 React state、URL、请求 body、localStorage 和公开响应中
不出现 Site、tenant 或内部隔离键。

```text
Browser
  → same-origin User Web BFF (/api/*)
  → BFF 读取 KOKORO_DOMAIN
  → 每一个上游请求附加 Forwarded: host=<KOKORO_DOMAIN>
  → IAM / System / User / Session / Hub 等后端
  → 后端自行完成身份、权限和数据隔离
```

`KOKORO_DOMAIN` 是部署配置，不是前端选择器。BFF 必须覆盖浏览器传入的同名 header，不能
信任客户端提供的 `Forwarded`。本地值为 `dev.kokoro.localhost`，生产值为该部署的规范域名；
域名变化只改环境变量和后端域名绑定，不改 React/CSS，也不把域名写进 URL 或 body。

## 前后端契约

- 当前仓库边界：[`docs/site-repository-architecture-v2.md`](docs/site-repository-architecture-v2.md)
- Web 前端架构：[`docs/user-web-architecture-v2.md`](docs/user-web-architecture-v2.md)
- package 提取映射：[`docs/package-extraction-map.md`](docs/package-extraction-map.md)
- IAM Web Contract v2：`kokoro-iam/docs/integration/backend-web-contract-v2.md`
- System Web Contract v1：`kokoro-system/docs/backend-web-contract-v1.md`
- 首个产品真实联调手册：`docs/first-site-live-runbook.md`

标准转发上下文的后端信任边界和解析规则见
[`docs/integration/forwarded-context-contract-v1.md`](docs/integration/forwarded-context-contract-v1.md)。

BFF 对所有上游请求统一处理 RFC 7239 `Forwarded`、认证、request id、幂等、错误映射和缓存隔离。
浏览器只看到业务需要的公开数据，不接触 workload token、IAM JWT、内部 header 或后端隔离键。

## UI 基座

```text
src/components/ui/   shadcn/ui primitives
src/components/blocks/ 跨页面组合块
src/ui/              产品领域组件
src/core/            纯状态 reducer / projection / persistence
src/engine/          session / SSE / HITL / reconnect
src/app/             Next.js routes and same-origin BFF
```

基础组件只消费语义 CSS variables，不读取后端隔离信息。Dialog、Sheet、Popover、Dropdown、
Tabs、Tooltip、ScrollArea 和 Resizable 一律使用 shadcn/Radix primitive；产品页面只负责组合和
品牌差异。

## 本地运行

```bash
cp .env.local.example .env.local
pnpm install
pnpm dev
```

建议通过 `http://dev.kokoro.localhost:3000` 访问本地桌面 Web；`*.localhost` 解析到 loopback，
无需修改 hosts。`KOKORO_DOMAIN` 使用不带协议的规范域名，并与访问域名保持一致。

环境文件职责固定为：`.env.local` 是 Next 开发覆盖，`.env.test` 是测试 fixture，`.env.production`
是 Next 的生产文件名；`.env.prod` 只作为 Docker/运维文件名，必须通过 `--env-file` 显式传入。
模板分别见 [`.env.local.example`](.env.local.example)、[`.env.test.example`](.env.test.example)、
[`.env.production.example`](.env.production.example) 和 [`.env.prod.example`](.env.prod.example)。

第一个产品工作区位于 `/app`。本地模板默认启用确定性预览；启用真实认证但后端不可用时显示
配置不可用态并禁用真实提交，不把 fixture 冒充后端数据。

## 验证

```bash
pnpm check
```

CI 在 `main` push、Pull Request 和手动触发时执行桌面 Web 门禁：`lint → test → typecheck → build`。
正式 `vMAJOR.MINOR.PATCH` tag 会复用门禁并发布 GHCR 镜像；不打 tag 不发布生产镜像。

## 部署

部署选择、GHCR 回滚、Cloudflare Workers 直连 GitHub、所需 secrets 和 RFC 7239 `Forwarded` 检查清单见
[`docs/deployment.md`](docs/deployment.md)。Cloudflare workflow 默认手动触发，不会因 Docker tag
自动触发第二套生产发布。

### Docker 快速启动

```bash
docker build -t kokoro-app:local .
docker run --rm -p 3000:3000 --env-file .env kokoro-app:local
docker compose -f docker-compose.example.yml up -d --build
```

容器只接收运行时环境变量；内部服务地址和凭据不会写入前端 bundle。镜像本身不包含域名、
品牌切换器或隔离键，部署时由 `KOKORO_DOMAIN` 和 BFF 的 RFC 7239 `Forwarded` 出站策略决定请求上下文。
