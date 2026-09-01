# Kokoro User Web 闭环证据 v1

> 本文是当前 `kokoro-app`、独立 `kokoro-bff` 与 `kokoro-agent` 的收口索引，不替代各域的详细契约。
> Preview 的“闭环”表示本地合成 fixture 可完成完整交互；Live 仍取决于部署环境中的真实
> upstream、ACL、secret 和数据服务。

## 1. 子仓库边界

| 子仓库 | GitHub | 职责 | 依赖边界 |
| --- | --- | --- | --- |
| Web | `LordFoxFairy/kokoro-app` | 桌面 User Web、Composer、胶囊、Rail、页面状态和同源 BFF | 不引入 `src/site`、其他仓库源码或父仓库相对路径 |
| BFF | `LordFoxFairy/kokoro-bff` | 独立业务投影、聚合、幂等、Mock/Live upstream 和业务 API 契约 | 不包含 Web 页面、Chat/SSE 事实、Agent Redis 或共享 workspace package |
| Agent | `LordFoxFairy/kokoro-agent` | Redis run worker、执行身份和能力调用 | 当前无 HTTP ingress，不承接浏览器或 BFF 路由 |

Web 内的 `packages/i18n`、`packages/web-core`、`packages/tsconfig` 只是本仓库内部的
workspace package。未来需要跨 site 复用时发布为版本化 registry package；当前不以
`workspace:`、`file:`、git submodule 或源码复制跨子仓库共享。

## 2. 浏览器侧 canonical API

浏览器只访问 Web 的同源路径；域名和服务凭据只存在服务端环境。

| Surface | Web 同源路径 | BFF 业务路径 |
| --- | --- | --- |
| Direct Chat / Project Chat | `/api/session/*` | 不经过业务 BFF，直连 Session |
| Agent connection setup | `/api/agents/connections/setup?platform=PLATFORM` | `/v1/agents/connections/setup` |
| Skills、MCP、Projects、Settings、Mail | `/api/hub/*`、typed aliases | `/v1/skills`、`/v1/mcp`、`/v1/projects` 等 |
| Scheduled typed BFF | `/api/scheduled-tasks*` | `/v1/scheduled-tasks*` |
| Library | `/api/session/artifacts` | 当前仍由 Session 负责；业务资料投影为 `/v1/library` |
| Runtime manifest | `/api/system/runtime-manifest` | 直连 System，不经过业务 BFF |
| Billing plans/checkout | `/api/billing/*` | `/v1/billing/*` |

Chat 的 direct/project 承接不新增 Chat API：切换项目只改变 Session scope。未发送 draft
通过一次性的 project-scoped `sessionStorage` envelope 承接，既有项目与新建 preview 项目
均保持可编辑；首条消息才进入 `/messages`。

## 3. 上下文与安全边界

- 本地部署使用 `.env.local` 的 `KOKORO_DOMAIN=dev.kokoro.localhost`；测试使用
  `test.kokoro.localhost`；生产由平台注入真实部署 hostname。
- Web BFF 从服务端 `KOKORO_DOMAIN` 生成唯一 `Forwarded: host=<KOKORO_DOMAIN>`。
  浏览器不发送或选择 `X-Domain`、tenant/site、runtime JWT、internal secret 或 BFF URL。
- `KOKORO_BFF_BASE_URL` 是 server-only 业务入口；`KOKORO_SESSION_BASE_URL`、User、System
  等仍是各自明确的服务地址，没有 Gateway 隐式 fallback。
- BFF 的 principal header 按契约接收 namespace/user；Session、Chat、System 等事实面仍由各自
  子仓库负责，不把业务规则复制到 Web。

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

### BFF

在 `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-bff`：

```text
npm run check                    PASS — typecheck/build + 5 contract tests
docker build ... kokoro-bff      PASS
/healthz                         200
/readyz                          200 in mock mode
```

已覆盖业务 envelope、项目创建幂等、Agent setup projection、Scheduled mutation、live upstream
的 `Forwarded` 和服务身份；Chat body/SSE/Last-Event-ID/control 仍在 Session 子仓库验证。

## 5. 发布前仍需注入的运行时条件

Preview 证据不代替真实联调。切换 Live 前必须为 Web 与 BFF 注入同一部署域名上下文、
Web session secret、BFF shared secret、各业务 upstream 地址/ACL 和服务间 secret，并完成
真实 Session SSE、HITL、artifact、Hub/Agent capability、Cloudflare/TLS 与回滚验收。

详细契约：

- [`user-web-api-contract-v4.md`](./user-web-api-contract-v4.md)
- [`business-bff-contract-v1.md`](./business-bff-contract-v1.md)
- [`chat-handoff-contract-v1.md`](./chat-handoff-contract-v1.md)
- [`forwarded-context-contract-v1.md`](./forwarded-context-contract-v1.md)
- [`kokoro-subrepo-boundary-v1.md`](./kokoro-subrepo-boundary-v1.md)

## 6. 最近一轮闭环补丁（2026-09-01）

- Project 分享只复制稳定的 `/app/project/{project_ref}` 地址，主动移除当前 conversation query/hash；剪贴板 API 不可用时走浏览器 fallback，失败会保留可重试状态。
- Scheduled editor 通过浏览器 Back/Forward 关闭后会清空旧的 `editingTaskId` 和 prompt，重新打开不会复活上一次编辑对象。
- 宽桌面收起 Rail 的首个控件保持为 Search，第二个控件为展开入口；点击 Search 先恢复 Rail 再聚焦搜索框，收起/展开过程不把图标移动到旧宽度中央。
- Settings、Connector Catalog、Billing 等受控 Dialog 的关闭焦点使用 `preventScroll`，避免焦点回收把页面滚动位置拉回顶部。
- Chat 首发承接已用真实桌面输入验证：提交后 URL 获得 `conversation`，draft 清空，消息和 Preview assistant turn 进入同一 AppFrame；Session 仍只承接服务端 Chat/SSE 事实，不在 Web 内复制 Chat 页面或状态。
