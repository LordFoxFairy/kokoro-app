# Kokoro 子仓库发布边界审计 v1

审计日期：2026-08-31
审计角色：Release-Audit
审计范围：`/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro` 独立 Git 仓库根目录
审计约束：只检查本仓库；不修改源代码；不提交 Git commit。

## 1. 结论

**边界结论：通过。** 当前目录具备独立的 pnpm workspace、锁文件、生产 Dockerfile、环境模板、部署文档和 GitHub Actions；安装、lint、test、typecheck、Next.js build、OpenNext Cloudflare build、Docker build 以及容器根路径启动检查均通过。

**依赖边界结论：通过。** `package.json` 的 `workspace:*` 依赖只指向本仓库内的 `packages/i18n`、`packages/web-core` 和 `packages/tsconfig`。`pnpm-lock.yaml` 中对应的 `link:packages/...` 是同一仓库内的 workspace link；未发现指向父仓库、兄弟仓库、`apps/user`、`kokoro-web` 或仓库外相对路径的 `workspace:`、`file:`、`link:` 依赖。`pnpm-workspace.yaml` 只声明 `.` 与 `packages/*`。

**发布结论：可发布。** GitHub `main` CI 负责常规质量门禁；`vMAJOR.MINOR.PATCH` tag 触发 GHCR 镜像发布；Cloudflare workflow 保持手动触发，避免一次 tag 同时部署两个生产平台。生产发布前须由平台注入真实的服务端变量和 secrets；模板中的值仅供示例。

## 2. 审计对象与结构证据

| 对象 | 审计结果 |
| --- | --- |
| `package.json` | 根包名 `@kokoro/app`，`private: true`，声明 `pnpm@11.2.2` 与 Node `>=22 <23`；包含 `lint`、`test`、`typecheck`、`build`、`cf:build`、`cf:deploy`、`check`。 |
| `pnpm-lock.yaml` | `lockfileVersion: '9.0'`；存在根 importer 与三个本地 workspace importer；依赖版本有完整解析记录。 |
| `pnpm-workspace.yaml` | 仅包含 `.`、`packages/*`；native build allowlist 为 `esbuild`、`sharp`、`unrs-resolver`、`workerd`。 |
| `Dockerfile` | 以本仓库根目录为 build context；只复制本仓库 manifest、lockfile、workspace package 与源码；产出 Next standalone runtime；容器以非 root 用户 `kokoro` 运行并监听 `0.0.0.0:3000`。 |
| `.dockerignore` | 排除 `node_modules`、构建产物、`.git`、env 文件、测试、文档和临时目录；保留 `.env.example` 模板。 |
| `.github/workflows/ci.yml` | `main` push、pull request、手动触发；Node 22 + pnpm 11.2.2；执行 frozen install、lint、test、typecheck、build。 |
| `.github/workflows/release-image.yml` | semver tag `v*.*.*` 或手动触发；先执行完整 verify，再用 Docker Buildx 推送 GHCR，并生成 provenance attestation。 |
| `.github/workflows/cloudflare.yml` | 仅手动触发；先执行完整 verify + `cf:build`，通过后在 `cloudflare` environment 使用 Cloudflare secrets 部署。 |
| `.env.example` 与其他 env example | 区分 local、test、Docker/运维和 Next production 文件名；服务地址、域名、会话密钥和内部凭据保持服务端边界。 |
| `docs/deployment.md` | 记录 GHCR、Cloudflare、Compose、版本 tag、回滚、环境变量、`Forwarded` 边界和发布门禁。 |

## 3. 独立依赖边界

### 3.1 当前允许的本仓库 workspace 包

根包使用：

```text
@kokoro/i18n      workspace:* -> packages/i18n
@kokoro/web-core  workspace:* -> packages/web-core
@kokoro/tsconfig  workspace:* -> packages/tsconfig
```

这三个目录随本仓库 checkout 一起存在，Dockerfile 也在 install 阶段复制它们的 `package.json`，因此 clean checkout 不需要访问父仓库或兄弟仓库源码。当前 `packages/` 是产品仓库内的 bootstrap workspace；若未来迁移到 `kokoro-web-shared`，应先发布 registry semver 包，再将产品依赖和 lockfile 一并切换；外部本地路径不得进入发布构建。

### 3.2 已检查的外部路径风险

- 未发现 `../`、绝对本机路径、`file:` 或指向父仓库/兄弟仓库的 `link:` 依赖。
- 未发现 `apps/user`、旧 `kokoro-web` monorepo 路径被构建命令或 workspace 配置实际引用；Dockerfile 中的旧 monorepo 名称只出现在边界说明注释中。
- Docker build context 是 `.`，GitHub release workflow 也是 `context: .`、`file: ./Dockerfile`，不会隐式使用父仓库目录。
- `eslint` 与 `vitest` 的 `.gitwarp`、`tmp`、构建产物排除项是本仓库内的忽略规则，不是外部 workspace/path 依赖。

## 4. 本地验证记录

执行目录均为本仓库根目录；本地工具版本为 Node `v22.22.2`、pnpm `11.2.2`。

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| install | `pnpm install --frozen-lockfile --reporter append-only` | **PASS**；`Already up to date`，退出码 0。 |
| lint | `pnpm lint` | **PASS**；退出码 0。 |
| test | `pnpm test` | **PASS**；104 个 test files、1001 个 tests 全部通过。jsdom 输出了若干 `Not implemented: navigation to another Document` 提示，但未导致失败。 |
| typecheck | `pnpm typecheck` | **PASS**；退出码 0。 |
| Next build | `pnpm build` | **PASS**；Next.js 16.2.6 生产构建完成，静态页与动态 API route 均生成。 |
| Cloudflare build | `pnpm run cf:build` | **PASS**；OpenNext Cloudflare worker 输出到 `.open-next/worker.js`。 |
| Docker build | `docker build --progress=plain --tag kokoro-app-release-audit:local .` | **PASS**；三阶段镜像构建完成。首次尝试因 Docker daemon 未启动而未开始，启动 Docker Desktop 后重跑通过。 |
| 容器启动 | `docker run -d --rm --name kokoro-release-audit -p 18080:3000 --env-file .env.example kokoro-app-release-audit:local` + `curl --fail http://127.0.0.1:18080/` | **PASS**；容器报告 `Ready`，根路径返回成功响应；检查后已停止并清理容器。 |

### 4.1 当前工作树说明

审计开始时已存在两个源代码文件的未提交修改：

```text
 M src/features/app/kokoro-welcome.module.css
 M src/ui/composer/composer.module.css
```

本次审计未修改、未还原这两个文件；所有本地门禁是在该既有工作树状态上执行。审计未发现需要改动的源代码问题。

## 5. 独立构建命令

### 5.1 常规 CI 等价命令

```bash
cd /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro
corepack enable
corepack prepare pnpm@11.2.2 --activate
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

或使用等价聚合门禁：

```bash
pnpm check
```

`pnpm check` 的顺序是 lint → typecheck → test → build；GitHub CI 当前将四项拆成独立 step。

### 5.2 Docker 构建与运行

构建上下文须是本仓库根目录；命令从本仓库根目录执行：

```bash
cd /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro
docker build --tag ghcr.io/lordfoxfairy/kokoro-app:VERSION .
cp .env.prod.example .env.prod
docker run --rm -p 3000:3000 --env-file .env.prod ghcr.io/lordfoxfairy/kokoro-app:VERSION
```

Compose 验收路径：

```bash
cp .env.example .env
docker compose -f docker-compose.example.yml up -d --build
docker compose -f docker-compose.example.yml ps
docker compose -f docker-compose.example.yml down
```

容器运行时由 Dockerfile 设置 `NODE_ENV=production`、`HOSTNAME=0.0.0.0`、`PORT=3000`；业务上游地址和凭据通过运行时 env 注入，不烘焙进镜像。

### 5.3 Cloudflare 路径

```bash
pnpm install --frozen-lockfile
pnpm run cf:build
pnpm run cf:preview
pnpm run cf:deploy
```

Cloudflare workflow 的 deploy job 需要 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID` secrets；Worker Variables/Secrets 还需配置运行时业务变量。`cf:preview` 和 `cf:deploy` 都会先执行 OpenNext build。

## 6. 环境变量边界

### 6.1 运行时服务端变量

| 变量 | 边界与发布要求 |
| --- | --- |
| `KOKORO_DOMAIN` | 每个部署的唯一规范 hostname；不带协议。由服务端用于生成上游 `Forwarded: host=<KOKORO_DOMAIN>`，不作为浏览器 selector，不进入 URL、body、localStorage 或公开响应。生产必填。 |
| `KOKORO_WEB_SESSION_SECRET` | httpOnly 会话信封密钥；支持逗号分隔的轮换窗口。只放平台 secret/variable，生产必填。 |
| `KOKORO_BFF_BASE_URL` | Web → 独立 `kokoro-bff` 的 server-only 业务入口；承接 Chat 模块及 Projects、Skills、Scheduled、Agent setup、Library、Billing 等业务投影。 |
| `KOKORO_IAM_BASE_URL` | Web 当前仅用于服务端认证 adapter；业务 API 不从 Web 直连 IAM，BFF 按自己的 owner contract 对接身份服务。 |
| `KOKORO_INTERNAL_SECRET_WEB_BFF` | Web → BFF 服务认证凭据；生产必填。`Forwarded` 仅作路由上下文，服务认证仍使用该凭据。 |
| `KOKORO_SESSION_BASE_URL` | **历史变量**；当前 Chat/SSE 统一进入 `KOKORO_BFF_BASE_URL` 的 `/v1/sessions/*`，不作为 fallback。 |
| `KOKORO_SYSTEM_BASE_URL`、`KOKORO_SYSTEM_WORKLOAD_TOKEN` | **BFF/owner 部署变量**；不属于新的 Web 业务配置。 |
| `KOKORO_HUB_BASE_URL`、`KOKORO_AGENT_BASE_URL` | **历史 Web 直连变量**；当前 BFF 负责 Agent setup 与 Capability adapter，Web 不读取。 |
| `KOKORO_GATEWAY_BASE_URL` | **历史变量**；Gateway 已归档，当前 Web/BFF 不读取。 |
| `KOKORO_PAYMENT_BASE_URL`、`KOKORO_BILLING_BASE_URL` | Billing 及支付 upstream 由 `kokoro-bff`/`kokoro-billing` 自己管理；Web 不直连。 |
| `KOKORO_PAYMENT_MOCK_WEBHOOK_SECRET` | 仅本地/测试 mock pay 使用；生产 env example 明确不支持。 |

### 6.2 本地、测试和容器控制变量

- `.env.local.example`：本地 `pnpm dev`；可使用 `NEXT_PUBLIC_SESSION_PREVIEW=1` 的确定性 preview，不连接真实后端。
- `.env.test.example`：测试 fixture；测试可继续通过 Vitest 注入隔离值。
- `.env.prod.example`：Docker/运维显式 `--env-file`；`.env.prod` 不是 Next.js 自动加载文件名。
- `.env.production.example`：Next.js 标准生产文件名；优先使用平台运行时注入，真实副本不纳入提交。
- `NEXT_PUBLIC_SESSION_PREVIEW` 只允许 local/test preview；production 路径不启用 preview client。
- `NODE_ENV=production`、`HOSTNAME=0.0.0.0`、`PORT=3000` 由生产容器设置；Compose 的 `KOKORO_PORT` 只控制宿主机映射端口，`KOKORO_IMAGE_TAG` 只控制本地镜像名。
- `KOKORO_WEB_URL`、`KOKORO_WEB_HOST`、`KOKORO_SMOKE_LOCALE`、`KOKORO_SESSION_COOKIE`、`KOKORO_SESSION_PROBE_PATH` 只属于可选 `smoke:first-site` 验收脚本，不是 install、test、typecheck、build 或容器启动的基础依赖。
- `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID` 仅供 Cloudflare workflow 的 deploy step 使用，不写入镜像或前端变量。

## 7. GitHub CI 与发布流程

### 7.1 常规变更

1. Pull request 或 push 到 `main` 触发 `.github/workflows/ci.yml`。
2. GitHub runner 使用 Node 22、pnpm 11.2.2，从当前独立仓库 checkout 并执行 frozen install。
3. 依次完成 lint、test、typecheck、生产 build；任一失败均阻断合并。
4. `main` 不自动发布生产。

### 7.2 GHCR 生产镜像

```bash
git tag vMAJOR.MINOR.PATCH
git push origin vMAJOR.MINOR.PATCH
```

`.github/workflows/release-image.yml` 的流程为：

1. semver tag 触发 release workflow。
2. `verify` job 执行 install、lint、test、typecheck、build。
3. `publish` job 使用本仓库根目录作为 Docker context，登录 GHCR，构建并推送 `ghcr.io/${{ github.repository }}`。
4. 生成版本 tag、major.minor tag 和正式 tag 的 `latest`，并使用 `actions/attest-build-provenance@v2` 写入 provenance。
5. 部署平台使用不可变版本或 digest，注入 `KOKORO_DOMAIN` 与服务端 secrets；回滚通过重新部署上一个完整版本完成，不依赖可变 `latest`。

手动 workflow 只用于明确的临时输入 tag；正式生产版本使用 `vMAJOR.MINOR.PATCH`。

### 7.3 Cloudflare Workers

1. 手动运行 `.github/workflows/cloudflare.yml`。
2. `verify` job 执行 install、lint、test、typecheck、build、`cf:build`。
3. `deploy` job 依赖 verify 成功，在 `cloudflare` environment 中使用 Cloudflare API secrets 执行 `pnpm run cf:deploy`。
4. 生产 Worker Variables/Secrets 注入第 6 节的服务端变量；业务 secret 保持在仓库、Dockerfile 和 `NEXT_PUBLIC_*` 变量之外。

## 8. 审计后行动项

- **无源代码修复项。** 当前四项常规门禁、OpenNext build 和 Docker build/启动检查均通过。
- **发布前配置项。** GHCR workflow 需要仓库允许 `GITHUB_TOKEN` 写入 packages，并保留 `packages: write`、`attestations: write`、`id-token: write` 权限；Cloudflare 路径需要配置 workflow secrets 与 Worker Variables/Secrets。
- **发布前验收项。** 使用真实生产变量启动镜像后，继续执行登录、会话 SSE、Skills、Library、Scheduled、Agent、设置、错误态和 BFF `Forwarded` header 验收；这些是运行环境/上游服务验收，不是本仓库独立安装边界的失败项。
- **Git 状态。** 本次没有创建 commit；审计文件是本次唯一新增文件，既有两个 CSS 修改保持原样。
