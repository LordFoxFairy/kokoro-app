## 2026-10-22 当前消费者候选

固定BFF `efe0ed8b3f791468608b61dd895208f0db709e50`／Public22.2.0／181项，canonical SHA256 `365d61aa5b3b4c01a178f077914e03b5fdbaeebc95fe740b9be46ca8fadc3205`。共享模型列表／首发选择、可信缺账户后的无感初始化、公开Skill list／个人删除与MCP重连沿既有组件和同源边界承接；没有第二套业务协议或假余额。完整本地门与108项preview浏览器回归已通过，正常owner整链与PR状态见 [`docs/CURRENT.md`](docs/CURRENT.md)，不把候选当正式生效。下方按当时版本保留历史。

## 2026-10-20 MC-02A Public21 模型消费者候选

当前BFF snapshot固定 `513b18e2942f94c5f2d4f48d9f9d3010b92db7e6` /Public21，业务模型严格接有效显示名、精确引用与nullable分页，选择使用raw稳定label key，不加provider前缀、不以别名替代身份。六public生成器正规配对，第七独立connector错误profile不换。当前验收与正常未激活边界见 `docs/CURRENT.md`；本片不改UI布局/聊天状态机，Key保存/领取和模型/工具/扣费未放行。下方历史版本按当时状态读取。

## MCP 可用性消费（2026-10-19）

严格消费owner五态，卡片/详情/选择器共用只读展示，不把active当作当前可用。原status/enabled、同源身份、CAS及原命令恢复不改。完整本仓门、4240测试及38原Playwright通过；正常运行与Manus像素级完整对照另验，见当前事实。

# Kokoro User Web

`kokoro`（发布仓库名 `kokoro-app`，package `@kokoro/app`）是 Kokoro 的正式 User Web。
它拥有页面、浏览器交互状态、Auth.js/OIDC Product Session 和同源 HTTP adapter；不拥有 Conversation、
Message、Project、Run、Billing、Capability 等服务端业务事实，也不拥有 PostgreSQL 或 Redis。

## 边界

```text
Browser
  -> kokoro same-origin /api/*                 browser-private
  -> kokoro-bff /v1/*                          public Product API / aggregation owner
  -> internal owner APIs, Agent and Scheduler  internal-owner
```

- 浏览器只访问当前站点的 `/api/*`，不持有服务地址、workload token、runtime JWT、tenant/site
  选择器或内部凭据。
- Web 以部署侧 `KOKORO_DOMAIN` 生成受信 `Forwarded` 上下文，并在线核验 Product Session 后
  向 BFF 传递单一 Bearer；旧 sealed cookie 不再参与认证。
- Web 的同源 API 是 `browser-private` surface，只服务当前 Web，不进入 Developer API 门户。
  对外 Product API 只由 `kokoro-bff` 的 `public` contract 发布。
- Web 与 BFF 的 Agent 对话事件网络协议只允许 AG-UI。`SessionEvent` 只能作为 Web 内部 reducer
  投影；Vercel AI SDK 的 `ChatTransport`/`UIMessage` 也只能是 Web 内部状态与渲染适配，不能形成
  第二条网络流或第二个 cursor 事实源。

当前实现仍处于协议收敛期：AG-UI parser 已存在，但 live SSE client 仍兼容读取旧
`SessionEvent`，且仓内尚未实现 `AgUiChatTransport`/`UIMessage` 适配。准确状态和缺口见
[`docs/CURRENT.md`](docs/CURRENT.md)。

## 代码地图

| 路径 | 职责 |
| --- | --- |
| `src/app/` | Next.js 页面与同源 `/api/*` route adapter |
| `src/lib/server/` | Product Session 在线 admission、受信上下文、上游 HTTP 与错误映射；旧 envelope 仅供待删除登录/Team 链 |
| `src/contract/` | 当前运行时 Zod contract 与路径 helper |
| `src/engine/`、`src/core/` | Chat 状态机、重连和纯 reducer 投影 |
| `src/features/`、`src/ui/`、`src/components/` | 产品 surface 与 UI；本阶段不修改 |
| `src/dev/` | local/test preview fixture；不属于 live 事实源 |
| `src/generated/proto/` | 冻结的历史 consumer snapshot；不是当前可再生 contract source |
| `contract/` | 契约治理说明和集中 contract 回归测试 |
| `tests/` | unit、route、contract、architecture 与 UI 测试 |

完整入口见 [`INDEX.md`](INDEX.md) 和 [`docs/INDEX.md`](docs/INDEX.md)。

## 五分钟启动

要求：Node.js 22、Corepack，以及仓库当前锁定的 `pnpm@11.2.2`。Root 规范要求迁移到
`pnpm@11.25.0`，该工具链升级尚未在本阶段执行，见 `docs/CURRENT.md`。

```bash
corepack enable
cp .env.local.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

默认访问 `http://dev.kokoro.localhost:3000`。`.env.local.example` 默认面向确定性 preview；
live 模式必须配置 Web session、IAM 登录入口、BFF 地址、内部服务凭据和部署域名。浏览器端代码
不得读取这些 server-only 值。

## 验证

```bash
pnpm contract
pnpm test:architecture
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` 会包含 contract 与 architecture 测试；独立命令用于快速定位治理失败。当前尚无
`test:e2e` script，Playwright/axe/视觉回归和真实 BFF 联调仍是发布缺口，不能由 unit test 或
preview fixture 替代。

## 部署

- Docker 与 Cloudflare 入口见 [`docs/deployment.md`](docs/deployment.md)。
- 生产配置与故障处置见 [`docs/RUNBOOK.md`](docs/RUNBOOK.md)。
- 发布验收矩阵见 [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)。
- 当前 Docker/CI 供应链与 health/ready 缺口记录在 [`docs/CURRENT.md`](docs/CURRENT.md)，历史报告
  不作为生产证据。
## 产品文档维护

公开文档与 API 参考位于独立包 [`developer-docs/`](developer-docs/README.md)，运行 `pnpm docs:dev`、`pnpm docs:build` 或 `pnpm docs:check`；内部工程说明仍在 [`docs/`](docs/INDEX.md)，不进入公开构建。门户迁移候选、Root 配对删除和未完成能力以 [`docs/CURRENT.md`](docs/CURRENT.md) 为准，不把文档生成成功等同业务验收。
