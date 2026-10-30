## 2026-10-22 精确模型选价绑定（本地已验）

已固定BFF a77276b／Public23完整原件并同步七生成器和在线Docs；费率必填精确模型修订ID＋摘要，生产同源桥及原身份／预算／恢复规则不变。完整App门4749 PASS／0SKIP、preview108零重试和Docs检查通过，四MCP WIP原字节保留。正常后台与Agent真实结算仍待，详见 [docs/CURRENT.md](docs/CURRENT.md)；以下仅历史。

## AGENT-1／CREDIT-1 计价管理同源接线（2026-10-22，本地候选）

固定BFF4d8a028／Public22.5／186操作；三具名计价管理通路沿原Product Session，复用 `admin-billing-proxy.ts`，原充值16KiB不变，新计价1MiB／同绝对预算。七public生成器与App在线Docs同步；完整工程、108项preview回归及Docs45测试／链接检查已验，正常后台／Agent结算仍待，详见 [docs/CURRENT.md](docs/CURRENT.md)。原MCP WIP未夹带；以下版本段保留历史，不覆盖本节。

## CREDIT-1 管理员积分同源通路（2026-10-22，本地候选）

唯一canonical固定BFF `c48a9bca07a2bb48fb5db46272ff71aab90e14ce`／Public22.4.0／183，SHA256 `f6b8f3bd250c144a2d648af94c9fd5fe068db33991a4289b849a077eef009f32`；七个既有public窄生成器正规重出／check，独立connector错误profile未改。新test-only精确逆回原22.3全文和182项顺序，再进入未改旧父hash证明，不是运行兼容。

`admin-credit-proxy.ts`仅为当前租户成员GET与非现金充值POST接原Product会话；不扩identity/billing前缀，不解析／换算资金DTO，不自报tenant/actor，不自动重试或修改原body/key/时间。复用原有限传输，16KiB请求、1MiB响应、body→session→ACK EOF同10秒绝对预算；取消／迟到／未知返回未确认，不造成功。源码位置与内部边界见 `src/lib/server/INDEX.md` 和三面设计。

主方停写完整七门均exit0：contract302、architecture50、250文件4721测试PASS／0SKIP，默认Turbopack build和post-types通过；独立preview桌面／移动108 E2E PASS，零重试，官方typegen恢复后1143非文档输入SHA256无漂移。新11项真实loopback薄桥与原Admin／模型24项、两个契约用例共37 PASS。独审无确定P0–P2；Product session在loopback中为显式夹具，不冒正常资金／登录旅程。旧固定pin断言与新test-only数组strict类型失败保留，按新正式pin／准确测试类型修正，未放宽门禁。

App在线Docs固定同源契约，177公开操作／369schema、原6私有操作不发布；新增积分与非现金充值指南。完整Docs check通过（44测试、五例、确定性生成／架构／构建，54HTML／17654内部链接），构建仍有原大chunk警告。未将normal运行、模型／工具或实际扣分算作本片完成；正常后台→App→BFF→Billing旅程紧接验证，真钱支付不做。原四MCP视觉WIP已独立保存，本片不包含它们。

## MODEL-1 Admin上游发现同源桥候选（2026-10-22）

现 `src/app/api/admin/[...path]/route.ts` 仅新增精确 provider UUID 的 `upstream-models` GET，沿Product Session/配置Domain/BFF管理权限与原request-id/no-store；拒query、body framing（含CL0）、Content-Type及命令头。准入至完整响应EOF共10秒/1MiB，取消不晚发请求，无Key、模型执行、自动发布或新持久事实。真实loopback薄adapter新增15项及原Admin9项均通过；正常浏览器/完整owner链由主方后续配对，不以此称UI已验收。

Public22.3.0/182固定BFF `e461d5178c6bf92558d7cd7dd288cb29cb008525`，canonical SHA256 `727159cea88e9f70ca3d1127306e8a6a6bcaa568398de8b0d8fec1cce6b3fae3`；唯一snapshot与既有7个public窄生成器正规更新，独立connector错误profile不变。下方记录按当时版本保留。

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
