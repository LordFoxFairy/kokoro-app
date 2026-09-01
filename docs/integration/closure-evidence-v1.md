# Kokoro User Web 闭环证据 v1

> 本文是当前 `kokoro-app` 与独立 `kokoro-gateway` 的收口索引，不替代各域的详细契约。
> Preview 的“闭环”表示本地合成 fixture 可完成完整交互；Live 仍取决于部署环境中的真实
> upstream、ACL、secret 和数据服务。

## 1. 子仓库边界

| 子仓库 | GitHub | 职责 | 依赖边界 |
| --- | --- | --- | --- |
| Web | `LordFoxFairy/kokoro-app` | 桌面 User Web、Composer、胶囊、Rail、页面状态和同源 BFF | 不引入 `src/site`、Gateway 源码或父仓库相对路径 |
| Gateway | `LordFoxFairy/kokoro-gateway` | 独立统一业务接入网关、bounded-context 路由、服务认证和流式透传 | 不包含 Web 页面、React 状态、fixture 或共享 workspace package |

Web 内的 `packages/i18n`、`packages/web-core`、`packages/tsconfig` 只是本仓库内部的
workspace package。未来需要跨 site 复用时发布为版本化 registry package；当前不以
`workspace:`、`file:`、git submodule 或源码复制跨子仓库共享。

## 2. 浏览器侧 canonical API

浏览器只访问 Web 的同源路径；域名和服务凭据只存在服务端环境。

| Surface | Web BFF | 当前 Gateway 对应面 |
| --- | --- | --- |
| Direct Chat / Project Chat | `/api/session/*` | `/sessions/*` |
| Agent connection setup | `/api/agents/connections/setup?platform=PLATFORM` | `/connections/*` |
| Skills、MCP、Projects、Scheduled、Settings、Mail | `/api/hub/*`、typed aliases | `/hub/*` |
| Scheduled typed BFF | `/api/scheduled-tasks*` | `/hub/scheduled-tasks*` |
| Library、文件、delivery、share | `/api/session/artifacts`、`files`、`deliveries`、`share` | `/artifacts/*`、`/sessions/*`、`/shared/*` |
| Runtime manifest | `/api/system/runtime-manifest` | `/system/*` |
| Billing compatibility reads | `/api/session/billing/*` | `/billing/*`，仍由 Session 负责 |

Chat 的 direct/project 承接不新增 Chat API：切换项目只改变 Session scope。未发送 draft
通过一次性的 project-scoped `sessionStorage` envelope 承接，既有项目与新建 preview 项目
均保持可编辑；首条消息才进入 `/messages`。

## 3. 上下文与安全边界

- 本地部署使用 `.env.local` 的 `KOKORO_DOMAIN=dev.kokoro.localhost`；测试使用
  `test.kokoro.localhost`；生产由平台注入真实部署 hostname。
- Web BFF 从服务端 `KOKORO_DOMAIN` 生成唯一 `Forwarded: host=<KOKORO_DOMAIN>`。
  浏览器不发送或选择 `X-Domain`、tenant/site、runtime JWT、internal secret 或 Gateway URL。
- `KOKORO_GATEWAY_BASE_URL` 是 server-only 统一入口；显式的 bounded-context base URL
  可用于分阶段迁移，浏览器路径保持不变。
- Gateway 的 principal header 按路由 allowlist 控制：Hub/Connections 使用 namespace/user，
  User `/bff` 使用 `x-user-id`，System 使用 actor；Session、Chat、Billing、Payment 等面
  不接收 principal header。

## 4. 当前验证证据

### Web

在 `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro`：

```text
pnpm lint                         PASS
pnpm test                         PASS — 109 files / 1099 tests
pnpm typecheck                    PASS
pnpm build                        PASS
pnpm -r lint/test/typecheck       PASS — workspace packages included
docker build ... kokoro-app       PASS
```

真实桌面浏览器验收：

- `1280×800` 的 Chat、Project、Agent、Skills、Plugins、Scheduled、Library 均无横向溢出和
  page/console error。
- `768px` fine-pointer desktop 会隐藏 Rail presentation，但保留可见导航触发器；回到
  `800px` 恢复宽桌面收起态，不污染 `sidebar_state`。
- Chat 草稿已验证可承接到已有项目和 `preview-project`；项目 picker 关闭后
  `body` 的 `pointer-events` 恢复为 `auto`。
- `786×674` 的排程编辑器 body 使用 `overflow:auto`，dialog 保持在 viewport 内。

### Gateway

在 `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-gateway`：

```text
npm run check                    PASS — typecheck/build + 14 tests
docker build ... kokoro-gateway  PASS
/healthz                         200
/readyz                          200 when Session upstream is configured
```

已覆盖 Chat body/SSE/Last-Event-ID/control、artifact headers、billing compatibility、
route-specific principal、identity encoding、upstream status/body 透传以及 timeout/network
failure mapping。

## 5. 发布前仍需注入的运行时条件

Preview 证据不代替真实联调。切换 Live 前必须为 Web 与 Gateway 注入同一部署域名上下文、
Web session secret、Gateway shared secret、各 upstream 地址/ACL 和服务间 secret，并完成
真实 Session SSE、HITL、artifact、Hub/Agent capability、Cloudflare/TLS 与回滚验收。

详细契约：

- [`user-web-api-contract-v4.md`](./user-web-api-contract-v4.md)
- [`chat-handoff-contract-v1.md`](./chat-handoff-contract-v1.md)
- [`kokoro-gateway-boundary-v1.md`](./kokoro-gateway-boundary-v1.md)
- [`forwarded-context-contract-v1.md`](./forwarded-context-contract-v1.md)
- [`kokoro-subrepo-boundary-v1.md`](./kokoro-subrepo-boundary-v1.md)
- [`kokoro-gateway business boundary v1`](https://github.com/LordFoxFairy/kokoro-gateway/blob/main/docs/business-gateway-contract-v1.md)

## 6. 最近一轮闭环补丁（2026-09-01）

- Project 分享只复制稳定的 `/app/project/{project_ref}` 地址，主动移除当前 conversation query/hash；剪贴板 API 不可用时走浏览器 fallback，失败会保留可重试状态。
- Scheduled editor 通过浏览器 Back/Forward 关闭后会清空旧的 `editingTaskId` 和 prompt，重新打开不会复活上一次编辑对象。
- 宽桌面收起 Rail 的首个控件保持为 Search，第二个控件为展开入口；点击 Search 先恢复 Rail 再聚焦搜索框，收起/展开过程不把图标移动到旧宽度中央。
- Settings、Connector Catalog、Billing 等受控 Dialog 的关闭焦点使用 `preventScroll`，避免焦点回收把页面滚动位置拉回顶部。
- Chat 首发承接已用真实桌面输入验证：提交后 URL 获得 `conversation`，draft 清空，消息和 Preview assistant turn 进入同一 AppFrame；Gateway 仍只承接服务端 `/sessions/*`，不在 Web 内复制 Chat 页面或状态。
