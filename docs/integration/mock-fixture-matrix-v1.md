# User Web Mock / Fixture Matrix v1

目标：后端未完成时，每个 User Web 功能仍可完整演示；后端接入时只切换 Client 实现，不改组件。
参考产品只用于观察交互和资源边界，Fixture 使用 Kokoro 自有字段、文案与不透明 ID。

## 1. 结构

```text
src/<domain>/
  schemas.ts          # Zod wire schema
  client.ts           # interface + HTTP implementation
src/dev/fixtures/
  <domain>.ts         # typed success/empty/error samples
src/dev/preview-clients.ts
  createPreview<Domain>Client()  # in-memory stateful implementation
```

规则：Preview Client 与 HTTP Client 实现同一 interface；mutation 必须真的改变内存 projection；
operation 使用可预测的 queued -> running -> completed 状态；ID、时间和随机值由 fixture factory 注入，
测试不得依赖线上数据。Fixture 不生成 `X-Domain`，也不把 `KOKORO_DOMAIN` 当作浏览器输入；服务端
transport fixture 才能注入 deployment domain 并生成标准 RFC 7239 `Forwarded`。上游断言还必须区分
HTTP `Host`（目标连接 authority）与 `Forwarded`（经 service auth/来源 allowlist 保护的产品上下文）。

### 1.1 环境、仓库与传输边界

- local 使用 `.env.local` 与 `KOKORO_DOMAIN=dev.kokoro.localhost`；test 使用 `.env.test` 与
  `KOKORO_DOMAIN=test.kokoro.localhost`。两者才允许启用 `NEXT_PUBLIC_SESSION_PREVIEW=1`；prod 使用
  `.env.prod`/`.env.production` 或平台运行时变量，`NODE_ENV=production` 时不启用 Preview Client。
- `alpha.fixture.test`、`beta.fixture.test` 是本矩阵内部的合成 deployment binding，用来驱动 tenant 隔离断言；
  它们不改变上述环境文件，也不是浏览器可以选择的域名。
- Fixture 与 `@kokoro/app` 页面代码同属 GitHub 独立仓库 `LordFoxFairy/kokoro-app`（本地 checkout 目录为 `kokoro`）；不创建独立 fixture 仓库，仓库名也不进入
  wire、DOM、日志或 snapshot。环境加载和发布规则以 [`../deployment.md`](../deployment.md) 为准。
- 浏览器按 HTTP 协议发送的 `Host` 不作为 tenant 输入；BFF/transport 删除调用方控制的出站 `Host`、旧转发头和
  `X-Domain`，再由上游 URL 产生连接 authority，并只注入 `Forwarded: host=<KOKORO_DOMAIN>`。

## 2. 覆盖矩阵

| Domain | list | detail | create | update | delete/revoke | async/error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Runtime / Account / Preferences | Y | Y | - | Y | Y | Y |
| Direct Task / Project Task / Events | Y | Y | Y | Y | Y | Y |
| Projects / resources / schedules | Y | Y | Y | Y | Y | Y |
| Global scheduled calendar | Y | Y | Y | Y | Y | Y |
| Models / Agents / Artifacts / Share | Y | Y | Y | - | Y | Y |
| Skills | Y | Y | Y | Y | Y | Y |
| Connector catalog / detail / installations | Y | Y | Y | Y | Y | Y |
| Custom API / secret entries / asset upload | Y | Y | Y | Y | Y | Y |
| Custom MCP / JSON import / URL MCP | Y | Y | Y | Y | Y | Y |
| Billing / plans / checkout / usage | Y | Y | Y | - | - | Y |
| Teams / invites / members | Y | Y | Y | Y | Y | Y |
| Data management | Y | Y | - | Y | Y | Y |
| Mail workflows / senders | Y | Y | Y | Y | Y | Y |
| Cloud computers | Y | Y | Y | - | Y | Y |
| Deployments / domains | Y | Y | Y | Y | Y | Y |
| Integrations | Y | Y | Y | Y | Y | Y |
| API keys / Webhooks | Y | Y | Y | Y | Y | Y |

`Y` 是目标验收状态，不表示当前仓库已经全部完成。当前完整：Task/Event、Models/Agents、Skills、
MCP、Billing、Team、Data Management、Runtime。优先补齐：Projects、Developer、Connectors、
Deployment、Computer、Mail、Integrations，然后把组件内裸 `fetch` 下沉到 typed client。

## 3. 每个 Domain 的固定场景

1. `success-populated`：至少 3 条，覆盖 active/paused/failed 等视觉状态。
2. `success-empty`：空列表与首个创建 CTA。
3. `loading`：延迟可控，不导致布局跳动。
4. `validation-error`：字段级错误可映射到 shadcn Field。
5. `unauthorized` / `forbidden`：不清空已有 projection，提供重新登录或返回动作。
6. `rate-limited`：包含 `retry_after_ms`。
7. `operation-running` / `operation-failed`：刷新后可恢复。
8. `mutation-conflict`：重复写或 stale revision 的可解释状态。

每个 list/detail fixture 还必须有 `cache-hit`、`etag-not-modified` 和 `cache-invalidated`。Fixture driver
记录请求，不把 `tenant_id` 暴露给 UI；tenant 场景通过测试 deployment domain、服务端 fixture context
和 BFF 生成的 `Forwarded` 选择。浏览器请求不得含 `X-Domain`、`tenant_id` 或 `site_id`。

## 4. Connector 固定 Wire Fixtures

所有示例必须先通过 `user-web-api-contract-v4.md` 对应的 Zod wire schema。测试数据只使用
`.test` 域名、不透明 fixture ID 和一次性占位 secret；snapshot 中禁止出现 secret/header value。

| Fixture key | Endpoint | HTTP | 关键断言 |
| --- | --- | ---: | --- |
| `connector.catalog.loading` | `GET /api/connectors/catalog` | delayed | 保留旧列表，局部 skeleton，不改变 tab 尺寸 |
| `connector.catalog.populated` | 同上 | 200 | app/custom_api/custom_mcp 状态和稳定 cursor |
| `connector.catalog.empty` | 同上 | 200 | `data: []`、`has_more: false`，显示空态而非错误 |
| `connector.catalog.filtered-empty` | 同上 | 200 | query 为空结果，可清除筛选 |
| `connector.catalog.error-retryable` | 同上 | 503 | 旧 projection 保留，retry 使用原 query/cursor |
| `connector.detail.available` | `GET /api/connectors/catalog/{id}` | 200 | actions 包含 authorize，installation 为 null |
| `connector.detail.connected` | 同上 | 200 | 安全 display account、scopes、revision |
| `connector.detail.not-found` | 同上 | 404 | 不区分不存在与跨 tenant |
| `connector.install.authorizing` | `POST .../authorize` | 202 | operation + allowlisted authorization URL |
| `connector.install.revoke-failed` | `DELETE .../installations/{id}` | 502 | 保留 connected 状态并允许重试 |

```ts
const connectorCatalogEmpty = {
  ok: true,
  request_id: "req_fixture_connector_empty",
  data: [],
  has_more: false,
  next_cursor: null,
} as const
```

## 5. Custom API、Secret 与 Upload Fixtures

| Fixture key | 操作 | 结果 |
| --- | --- | --- |
| `custom-api.create-success` | name + notes + 2 secrets | 返回 CustomApi，只有 secret 元数据 |
| `custom-api.create-validation` | 缺 name / 空 secret / 重复 secret name | 422 + `details.fields[]` |
| `custom-api.create-name-conflict` | tenant 内重复规范化名称 | 409 `connector.name_conflict` |
| `custom-api.update-success` | notes、icon、enabled、replace secret | revision 增长，值不回显 |
| `custom-api.update-stale` | 旧 revision | 409 `resource.version_conflict` + 最新安全 projection |
| `custom-api.delete-success` | 未被项目引用 | 删除后 list/detail cache 失效 |
| `custom-api.delete-in-use` | 被 project/task policy 引用 | 409 `operation.conflict` |
| `secret.list-empty` | 无 secret | 200 空页 |
| `secret.create-success` | name + fixture value | 只返回 id/name/time/in_use_by |
| `secret.delete-in-use` | 被 MCP 引用 | 409 `secret.in_use`，只给 count |
| `upload.validate-png` | PNG、<= 1 MiB、合法 sha256 | 短时 PUT receipt |
| `upload.validate-too-large` | > 1 MiB | 413 `upload.too_large` |
| `upload.validate-media-type` | SVG/GIF/伪装扩展名 | 415 `upload.media_type_unsupported` |
| `upload.complete-hash-mismatch` | hash 与对象不一致 | 422 `upload.rejected` |
| `upload.complete-expired` | receipt 超时 | 410 `upload.expired` |

Fixture logger 必须在记录 request 前将 `SecretWrite.value`、`HeaderWrite.value`、authorization header 和
预签 upload query 全部替换为 `[REDACTED]`。错误 fixture 的 `details` 也不得包含这些值。

## 6. MCP 创建与导入 Fixtures

| Fixture key | Endpoint | 结果 |
| --- | --- | --- |
| `mcp.form.success-enabled` | `POST /api/mcp/servers` | source=form、enabled=true、header_names only |
| `mcp.form.success-project-draft` | 同上 | enabled=false，供后续项目绑定 |
| `mcp.form.invalid-header` | 同上 | 保留 header 字段级错误，值不回显 |
| `mcp.form.endpoint-unreachable` | 同上 | 422 可修正错误 |
| `mcp.json.validate-success` | `/imports/json/validate` | normalized draft + warnings |
| `mcp.json.validate-invalid` | 同上 | 422 `connector.import_invalid` + 字段路径 |
| `mcp.json.validate-too-large` | 同上 | 413 `request.invalid` |
| `mcp.json.confirm-success` | `/imports/json/confirm` | source=json，创建一个 server |
| `mcp.json.confirm-expired` | 同上 | 410 `upload.expired` |
| `mcp.url.inspect-success` | `/imports/url/inspect` | source=url draft，不创建 server |
| `mcp.url.inspect-private-address` | 同上 | 422 `request.invalid`，不发起内部网络请求 |
| `mcp.url.inspect-redirect-private` | 同上 | 每跳重验并拒绝 |
| `mcp.url.inspect-timeout` | 同上 | 422 `connector.endpoint_unreachable`，retryable=true |
| `mcp.url.inspect-oauth` | name + HTTPS URL + OAuth ID/secret | draft 只返回 `oauth_configured: true`，不回显 secret |
| `mcp.url.inspect-oauth-redacted-error` | inspector 拒绝 OAuth 配置 | 日志与错误 details 均不含 client secret |
| `mcp.url.confirm-success` | `/imports/url/confirm` | source=url，创建一个 server |
| `mcp.server.update-stale` | `PATCH /api/mcp/servers/{id}` | 409 version conflict |
| `mcp.server.delete-success` | `DELETE /api/mcp/servers/{id}` | detail/list/composer cache 失效 |

JSON fixture 只保留合成配置，例如 `https://mcp-fixture.example.test/mcp`；不复制外部产品配置、真实
endpoint、Cookie、token、用户邮箱或第三方账户 ID。

## 7. Idempotency 与状态迁移

每个 POST/PATCH/DELETE 至少执行以下自动化序列：

1. 首次请求 `Idempotency-Key: fixture-key-001`，断言资源只创建或修改一次。
2. 相同 actor、tenant、route、key、规范化 body 重放，断言 status、body、resource ID、revision 与首次一致。
3. 相同 key、不同 body，断言 `409 idempotency.conflict`，原资源不变化。
4. 不同 tenant 使用相同 key，幂等记录互不复用；浏览器响应仍不出现 tenant ID。
5. 网络在提交后中断，客户端用同 key 重试，不能产生第二个 secret、asset、draft、installation 或 server。
6. stale revision 与 idempotency conflict 分开：前者为资源并发，后者为请求键被不同 payload 复用。

Preview Client 用注入的 clock、ID factory 和 idempotency store 实现上述行为，不使用 `Date.now()` 或
`crypto.randomUUID()` 作为测试断言来源。

## 8. Cache 与 Forwarded Deployment Binding Fixtures

| Fixture key | 场景 | 断言 |
| --- | --- | --- |
| `cache.catalog-hit` | 同一 `Forwarded` host binding/locale/query 重复 GET | 第二次命中私有 cache |
| `cache.catalog-304` | 携带匹配 `If-None-Match` | 304，无 response body |
| `cache.mutation-invalidates` | Custom API/MCP/installation mutation | catalog detail、list、composer projection 失效 |
| `cache.host-separated` | 两个 allowlisted `Forwarded` host binding 映射同 tenant | 品牌/RP cache 不串，业务 projection 可按策略独立 key |
| `tenant.host-normalized` | `Forwarded: host=` 大小写 + 尾点规范化 | 解析到同一 binding key；上游 HTTP `Host` 仍只负责连接 |
| `tenant.unknown-host` | 未绑定 `.test` `Forwarded` host | 503，不回退默认 tenant |
| `tenant.disabled-binding` | binding 已停用 | 503，负缓存不超过 5 秒 |
| `tenant.spoofed-header` | 浏览器传 `X-Domain`、`x-kokoro-tenant-id` 或 `x-kokoro-site-id` | BFF 全部丢弃，并只注入服务端配置的 `Forwarded` |
| `tenant.cross-resource` | tenant B 请求 tenant A connector ID | 与不存在统一 404 |
| `tenant.same-email-separated` | 两 tenant 的同邮箱 actor | installation、secret、draft 完全隔离 |
| `tenant.return-to-open-redirect` | 外域或 scheme-relative `return_to` | 422 `request.invalid` |

测试 deployment domain 固定使用 `alpha.fixture.test`、`beta.fixture.test`，由 BFF 生成对应
`Forwarded: host=...`；内部 fixture context 可以保存 tenant key 以驱动隔离断言，但客户端 wire、DOM、
日志和 snapshot 不得出现该 key。浏览器传入的 HTTP `Host`、`Forwarded`、`X-Forwarded-*` 和旧
tenant/site header 都不能改变结果。

## 9. 当前迁移顺序

1. 新建 `ProjectClient` 和 `DeveloperClient`，替换项目空态与 Developer 组件内 fetch。
2. 新建 `ConnectorClient`，统一普通连接器、MCP 与 integrations 的 catalog/installation 语义。
3. 新建 `ExecutionResourceClient`，承接 computer/deployment/domain operation。
4. 新建 `UserSettingsClient`，承接 account/preferences/personalization/mail。
5. 为 `/api/settings/[...path]` 与 `/api/hub/[...path]` 增加路径 allowlist 和 method matrix。

## 10. 独立排程日历 Fixtures

排程 fixture 只使用合成任务和 `.fixture.test` 资源，不复制参考产品的接口响应、账户或任务内容。

| Fixture key | Endpoint | 结果 |
| --- | --- | --- |
| `scheduled.calendar.empty` | `GET /api/scheduled-tasks?tab=calendar` | 空页，显示三条合成建议和建立 CTA |
| `scheduled.calendar.populated` | 同上 | daily/weekly、active/paused/failed 各至少一条 |
| `scheduled.calendar.loading` | 同上 | 保留页面 Header 与固定日历骨架，不改变内容轴 |
| `scheduled.calendar.retryable` | 同上 | 503 + 保留已有 projection + 原参数重试 |
| `scheduled.create.direct` | `POST /api/scheduled-tasks` | direct scope、下一次执行时间和 revision=1 |
| `scheduled.create.project` | `POST /api/projects/{project_id}/scheduled-tasks` | project scope，与全局日历读取同一 projection |
| `scheduled.create.validation` | 两条 POST | title/prompt/time/timezone 字段级 422 |
| `scheduled.update.pause` | `PATCH /api/scheduled-tasks/{id}` | active -> paused，revision 增长 |
| `scheduled.update.stale` | 同上 | 409 `resource.version_conflict`，返回最新安全 projection |
| `scheduled.delete.success` | `DELETE /api/scheduled-tasks/{id}` | 日历/list/project cache 同时失效 |
| `scheduled.cross-tenant` | detail/update/delete | 与不存在统一 404，wire 不出现 tenant key |

Preview clock 固定为 `2026-08-30T12:00:00Z`，timezone 使用 `America/New_York`，ID 使用
`scheduled_fixture_001` 等不透明值；测试通过注入 clock 推导 `next_run_at`，不读取运行机器当前时间。

## 11. Agent 连接 Fixtures

| Fixture key | 平台/结果 | 关键断言 |
| --- | --- | --- |
| `agent.setup.telegram` | Telegram 200 | QR 与 continue URL 携带同一 preview ticket，Dialog 几何不变 |
| `agent.setup.line` | LINE 200 | 切 tab 后 QR、链接和可见文案同步更新 |
| `agent.setup.slack` | Slack 200 | 授权说明与 Slack allowlisted URL，不复用 Telegram ticket |
| `agent.setup.loading` | delayed | 保留 `160×160px` QR 槽和 `400×446px` Dialog，不发生布局跳动 |
| `agent.setup.not-configured` | 501 | 不渲染假链接，允许关闭 Dialog |
| `agent.setup.retryable` | 503 | 不泄漏响应 details，重试签发新 ticket |
| `agent.setup.expired` | ticket 过期 | 继续入口失效并重新请求 setup，不在前端续签 |

固定 preview payload 只使用 `https://agents.fixture.test`：

```json
{
  "platform": "telegram",
  "status": "disconnected",
  "qr_value": "https://agents.fixture.test/connect?platform=telegram&ticket=preview",
  "continue_url": "https://agents.fixture.test/continue?platform=telegram&ticket=preview",
  "expires_at": "2026-08-30T06:30:00.000Z"
}
```

三个 fixture 均须通过前端 `agentConnectionSetupSchema`；DOM、日志和 snapshot 不得出现
`tenant_id`、真实 provider URL、Cookie、token、OAuth code/verifier 或用户身份字段。

## 12. Composer 语音输入 Fixtures

语音输入是浏览器本地能力，不上传原始音频；当前仓库没有独立的 Kokoro 语音上传、转写或音频存储
endpoint，也不为 fixture 虚构一个后端 endpoint。preview controller 使用固定 clock 和合成文本，覆盖
以下场景：

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.voice.preview-success` | 点击麦克风 | `listening -> transcribing -> idle`，文本追加到 draft |
| `composer.voice.preview-cancel` | listening 时再次点击 | 清理 timer，不追加文本，按钮回到 idle |
| `composer.voice.unsupported` | 无 SpeechRecognition | 原位进入 error，`aria-live` 回报，不打开浮层 |
| `composer.voice.permission-denied` | 浏览器拒绝权限 | 不保留 recorder，不泄漏错误 details，允许再次尝试 |
| `composer.voice.unmount` | 页面切换 | abort recognition 并清理 timer，不发生卸载后更新 |

preview 文本为本仓库合成数据；非 preview 时由浏览器 `SpeechRecognition` / `webkitSpeechRecognition`
产生转写文本。只有用户显式发送后才沿用既有会话消息契约。fixture、DOM、日志和截图不得保存音频、语音
生物特征、Cookie、token、邮箱或 `tenant_id`。

## 13. Desktop interaction fixtures

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.dismiss` | 点击胶囊 X | intent 清除、draft 保留、URL 不变、无 form submit |
| `rail.resize.single-writer` | 拖动 rail seam | rail/main/seam 同帧更新，无双线、无第二套 CSS width 写入 |
| `rail.collapse.transition` | 点击折叠/展开 | 200ms 几何过渡期间无内容闪动，seam 与 rail 同步 |
| `skills.create.mouse` | 点击 Create | shadcn DropdownMenu 展示 AI/upload/GitHub/official 四项 |
| `skills.create.keyboard` | Create 获得焦点后 Enter/Space | 菜单打开，焦点留在 menu，Esc 可返回 Create |
| `skills.upload.transition` | 选择 Upload a skill | 菜单关闭并切到 upload surface，不创建重复 Dialog |
| `navigation.agents` | 点击 Rail Agent | URL 为 `/app/agents`，不触发 new-chat handler |
| `navigation.scheduled` | 点击 Rail Scheduled | URL 为 `/app/scheduled?tab=calendar`，页面保留日历空态 |
| `settings.library-skills` | 点击资料库/技能 | 各自使用 settings tab 与独立内容，关闭后焦点回到入口 |

这些 fixtures 只使用本仓库的合成数据；截图固定为桌面视口，不覆盖手机端验收。

## 14. Desktop interaction regression fixtures

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.dismiss.v136` | 点击胶囊左侧 X | 只清理 creation intent，草稿和 URL 保留 |
| `rail.navigation.no-flicker.v136` | 点击 Agent / Scheduled / Library | 真实 route 或 settings tab 切换，内容轴不闪动、不产生双 seam |
| `skills.create.controlled-menu.v136` | 点击或键盘 Enter/Space 创建 | 四个 menuitem 可见，状态由单一 DropdownMenu controlled state 管理 |
| `skills.create.upload.v136` | 选择 Upload a skill | 菜单关闭、同一 panel 进入 upload surface，zip input 可用 |
| `skills.create.catalog.v136` | 选择 Add from official skills | 打开独立 catalog，官方/第三方筛选和添加状态保留 |
| `scheduled.create.deep-link.v136` | 点击建立排程任务 | 打开共享编辑 Dialog，URL 写入 `#scheduled-tasks/new`，关闭清理 hash |
| `agent.setup.dialog.v136` | 点击 Start now | 初始无 Dialog，点击后只打开一个连接设置 Dialog |

## 15. 资料库一级目录 Fixtures

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `library.direct.empty.v137` | 点击 Rail 资料库 | URL 为 `/app/library`，显示筛选、搜索、空态和新建任务，不打开 Settings Dialog |
| `library.direct.filter.v137` | 点击类型筛选 | 只显示当前类型 artifact，空结果仍保留同一目录几何 |
| `library.direct.search.v137` | 输入文件名 | 只过滤已加载 artifact 标题，不改变工具栏高度或内容轴 |
| `library.direct.view.v137` | 切换网格/清单 | 同一份 artifact projection 切换布局，不发额外 mutation |
| `library.direct.new-task.v137` | 点击新建任务 | 回到 `/app`，Composer 可聚焦，资料库不会残留在 DOM |
| `library.direct.live-error.v137` | live artifact API 失败 | 显示可重试错误；preview/dev 失败只回到合成空态，禁止静默伪装生产数据 |

Library direct fixture 只使用 `listArtifacts` 的合成记录；download 继续走鉴权 blob，source session 继续走
shell 的 conversation URL handoff。Settings `library` 仍单独覆盖 authorized-apps/cloud-browser 数据管理，
不与 direct artifact catalog 共用页面状态。

所有 v136 fixture 固定 `1280×720` 桌面视口，使用合成品牌、技能、Agent 和排程数据；不覆盖手机端，
不保存 Cookie、token、邮箱、原始语音或 `tenant_id`。

## 16. Desktop active navigation and skill creation fixtures

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `rail.active-route.v142` | 进入 Agent/外挂/排程/资料库/聊天 | 仅当前一级入口 `data-active=true`，其余入口不选中，页面轴不改变 |
| `skills.create.ai.v144` | Skills → Create → Create with AI | 关闭 Settings，创建新 direct session，`/app` Composer 预填 `/skill-creator` 提示 |
| `skills.create.ai.draft-key.v144` | 新 session ID 在同一帧分配 | 草稿写入新 session key，不写旧会话，不因异步 state 丢失 |
| `skills.create.upload.v144` | Skills → Create → Upload/GitHub | 保持在 Settings，进入既有 upload preview，不误触发 AI prompt |

以上均为本地 UI/路由 fixture，不新增后端接口；所有文本、session ID 和技能数据均为合成值。

## 17. Desktop notification center fixtures

通知中心是 Rail 底部工具入口的前端 Popover，不新增后端接口。Bell 与通讯偏好设置分离；未来接入通知
服务时，服务端只需返回当前经 service auth/allowlist 校验的 `Forwarded` host binding + actor scope 下的通知 projection，不能从浏览器接受
`tenant_id`、`site_id` 或资源范围字段。

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `notifications.open.v153` | 点击 Rail 铃铛 | 打开唯一通知 Popover，`400×600px`，URL 不变，不打开 Settings |
| `notifications.tabs.v153` | 点击全部/更新日志/消息 | 三个真实 Tabs 切换，内容在同一滚动区域内更新，不改变 Rail/main 几何 |
| `notifications.close.v153` | Escape、外部点击或再次点击 Bell | Popover 卸载，焦点回到 Bell，不写设置 hash |
| `notifications.scroll.v153` | 滚动通知内容 | 只有一个纵向滚动容器，面板保持 `max-height: calc(100vh - 32px)` |
| `notifications.synthetic.v153` | preview/dev 加载 | 只使用 Kokoro 合成标题、描述和中性预览块，不请求 Manus API/素材 |

固定桌面验收视口为 `1280×720`；通知 UI chrome 使用 `notifications.*` i18n key，fixture 正文可由合成
projection 提供。正式 API 若提供 unread/read mutation，必须沿用现有幂等、actor membership 和
service-authenticated `Forwarded` tenant resolution 规则，响应不得回显内部 tenant 标识。

## 18. Website creation capsule fixture

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.rest.v161` | 进入网站创作模式 | 胶囊固定为 `68×32px`，静止态显示网站代码窗口图标，文字与工具栏不发生位移 |
| `composer.creation-intent.dismiss.v161` | 悬停/聚焦胶囊后点击关闭槽位 | 同一 `16×16px` 槽位切换为 `X`，只清理 creation intent，不提交表单、不清理 draft、不改变 URL |

胶囊仍由前端状态控制，不新增后端接口；正式 API 不接收来自浏览器的 `tenant_id`、`site_id` 或内部资源范围。

## 19. Desktop interaction hardening fixtures

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `notifications.scroll.v162` | 打开全部通知并滚动内容 | Tabs root 约束剩余高度，活动内容区有实际 scroll range，通知内容不被 Popover 裁切 |
| `notifications.deduplicate.v162` | 打开全部通知 | 首屏 feature 标题只出现一次，历史连接器只作为后续时间线条目出现一次 |
| `scheduled.short-viewport.v162` | 在 `1280×560` 桌面打开编辑 Dialog | Dialog 高度不超过视口边界，body 滚动，footer 始终可达 |
| `scheduled.expiry-required.v162` | 勾选到期日期但不填日期 | 保存按钮 disabled；填入有效日期后才可提交 `expiresAt` |
| `library.favorites.v162` | 点击资料库收藏筛选 | 按钮暴露 `aria-pressed` 与 `data-state`，无收藏结果有明确空态，不是死控件 |
| `library.filters-scroll.v162` | 在窄桌面横向浏览资料类型 | 8 个筛选项都可访问，无静默隐藏、无额外页面滚动层 |
| `library.download-error.v162` | 下载失败 | 显示 `role=alert`，下载状态复位，可再次触发下载 |

## 20. Composer voice and capsule fixtures

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.voice.preview.v163` | 桌面空态点击麦克风 | 原位 `32×32px` 按钮进入 listening/transcribing，URL、Dialog 数量和工具栏几何不变 |
| `composer.voice.preview.transcript.v163` | preview 计时完成 | 合成文本追加到当前 draft，不覆盖已有输入，不提交表单 |
| `composer.voice.stop.v163` | listening/transcribing 时再次点击麦克风 | 清理 pending timer，不追加转写，按钮回到 idle |
| `composer.voice.unsupported.v163` | 浏览器没有 SpeechRecognition | 保留按钮，显示 `role=status` 的 unavailable 状态，不打开权限伪弹窗 |
| `composer.creation-intent.rest.v163` | 网站创作态未悬停 | 显示网站代码窗口图标；胶囊为 `68×32px` |
| `composer.creation-intent.hover-dismiss.v163` | 悬停/聚焦网站胶囊 | 同一图标槽切换 `X`，关闭只清理 intent，draft 与 URL 保留 |

以上 fixture 仅覆盖桌面 Web；preview 使用合成转写，不保存原始音频、不调用 Manus API。浏览器不发送
`X-Domain` 或可控的 tenant/site scope；服务端 transport fixture 才注入 `KOKORO_DOMAIN` 并生成受
service auth/allowlist 保护的 RFC 7239 `Forwarded`。

## 21. Current desktop Web baseline v167

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `rail.desktop-wide.v167` | 在 `1280×720` 或 `786×674` 打开 User Web | 展开 rail 为 `300px`，主画布使用剩余宽度，不因宽桌面误进入 compact |
| `rail.desktop-compact.v167` | 细指针视口 `<=768px` | rail track、gap、container 和 seam 隐藏；Header 保留唯一 navigation trigger，触发后打开同一完整 rail |
| `rail.navigation.stable-shell.v167` | 点击 Agent / Scheduled / Library / Skills | 复用同一 AppFrame，不卸载/重复挂载 rail，不关闭桌面导航，不出现整页闪动 |
| `rail.semantic-icons.v167` | 查看一级导航 | Agent=消息气泡、技能=拼图、外挂=四圆点、排程=时钟、资料库=书本，图标不随 locale 漂移 |
| `composer.creation-intent.dismiss.v167` | 悬停网站胶囊并点击 X | 胶囊从 DOM 移除，draft 与 URL 保留，Composer 其余控件几何不移动 |
| `composer.voice.inline.v167` | 桌面点击麦克风 | 原位 `32×32px` 状态切换；不打开 Dialog/Popover，不上传原始音频 |

固定回归截图：`output/playwright/local-v167-final-app-1280.png`、
`output/playwright/local-v167-final-capsule.png`、`output/playwright/local-v166-agents-wide-final.png`、
`output/playwright/local-v166-scheduled-wide-expanded.png`、
`output/playwright/local-v166-library-wide-expanded.png`。这些 fixture 只使用 Kokoro 合成数据，
不把内部 tenant/site scope 放入浏览器可控 payload。

## 22. Composer pixel-axis fixture v169

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.text-axis.v169` | `1280×720` 桌面空态进入网站创作 | 编辑器行保留左 `16px`、右 `8px` 文本槽，首字不贴 Composer 边框 |
| `composer.controls-gutter.v169` | 同一状态查看工具栏 | 加号 x=`419`、连接器 x=`459`、环境 x=`499`、发送 x=`1129`；所有控件高 `32px` |
| `composer.brand-width.v169` | 使用 Kokoro runtime 环境名 | 仅网站胶囊的 x 坐标允许随品牌字宽变化，右侧语音/发送锚点不漂移 |

该 fixture 只验收桌面 Web；没有新增移动端规则或后端字段。

## 23. Narrow desktop axis fixture v170

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.narrow-axis.v170` | `786×674` 桌面网站创作态 | Composer `454×120px`，文本/控件不被 AppFrame 重复 padding 推偏 |
| `composer.narrow-controls.v170` | 同一视口查看工具栏 | 加号=`x329`、连接器=`x369`、发送=`x725`，三者均 `32×32px` |
| `rail.breakpoint.boundary.v170` | 分别设置 `768px` 与 `769px` 细指针视口 | `768px` 为隐藏 rail + Header trigger；`769px` 回到宽桌面 `300px/52px` 状态；隐藏态无 seam、无横向溢出 |

本 fixture 仅覆盖桌面 Web，不改变手机端 Sheet 规则。

## 24. Desktop residual and nested-overlay regression v171

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `rail.no-residual.v171` | `1280×720` 收起 / `523×674` 细指针窄桌面 | 宽桌面收起为 `52px` 且无残留；窄桌面移除 rail track/gap/container，只保留 Header navigation trigger |
| `rail.tooltip-settle.v171` | hover Agent 后点击 Agent | hover 时 Tooltip 从 rail 右侧开始且不裁切；点击后 URL=`/app/agents`、Tooltip=`0`、main 轴不变 |
| `skills.github.nested-close.v171` | Settings → Skills → Create → GitHub → Preview → Import → Done | 只卸载 GitHub 子弹窗，Settings/Skills 外层保持打开，焦点不落到 document body |
| `composer.voice.dev-fixture.v171` | 本地开发桌面点击麦克风 | 无 Dialog/Popover；`listening → transcribing → idle`，合成文本追加到 draft；生产不使用该 fixture |

所有断言使用同一桌面 Web DOM 与合成数据；不覆盖手机端，不把 tenant/site scope 或内部资源标识写入浏览器 payload。

## 25. Desktop final pixel regression v172

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `rail.compact.zoom-resistant.v172` | fine-pointer 桌面 CSS 宽度 `<=768px` 或宽桌面显式收起 | 前者隐藏 rail track/gap/container 且无 seam，后者为 `52px` 图标轨道；coarse-pointer 手机仍走手机 surface |
| `composer.creation-intent.rest.v172` | 进入网站创作态但未悬停胶囊 | 网站代码图标可见、`X` 隐藏；胶囊=`68×32px` |
| `composer.creation-intent.hover-dismiss.v172` | hover/focus 胶囊后点击关闭 | 同一图标槽切换 `X`；intent 移除，draft、URL 和其他工具坐标保持不变 |

本节只覆盖桌面 Web，使用本地合成 fixture；不新增后端字段或移动端断点。

## 26. Skills GitHub import completion fixture v174

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.full-hit-area.v174` | 桌面网站胶囊点击图标或文字 | 单一 `button` 命中整个 `68×32px` 胶囊，显示 X 状态，清理 intent 但不提交、不改 draft/URL |
| `skills.create.menu-handoff.v174` | Settings → Skills → Create → Upload/GitHub/官方 | DropdownMenu 先关闭，再切换到唯一目标 surface；无残留 menu 或父 Dialog 误关闭 |
| `skills.github.preview.v174` | 输入规范化 GitHub URL → 检查仓库 | 仅产生 `GithubImportResult` 预览，按钮进入可等待状态；非法 host/path 在客户端拦截 |
| `skills.github.import.persist.v174` | 预览 → 导入技能 → 完成 | preview fixture 将 personal skill 写回池，失活 `hub/skills` 后列表显示新技能；同名再次导入替换而不重复 |
| `skills.github.bff.contract.v174` | 使用真实 HubClient | POST `/api/hub/self/skills/github/preview` 与 `/api/hub/self/skills/github/import` 使用 JSON `{repository}` 和 Zod envelope |

所有 v174 fixture 固定 `1280×720` 桌面视口，GitHub 仓库、技能描述和 namespace 均为合成值；
不访问 Manus API，不保存 Cookie/token/原始仓库凭据，不覆盖手机端。

## 27. Skills GitHub direct-submit fixture v175

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.dismiss.v175` | 点击网站胶囊任意位置 | 同一 `68×32px` shadcn Button 处理点击；intent 清除、draft/URL/其它控件不变，不触发表单提交 |
| `skills.github.dialog.geometry.v175` | Skills → Create → GitHub | 居中 `400px` 单层对话框；品牌流、标题、URL 输入和全宽导入按钮按固定垂直节奏排列；无预览卡片、无第二确认层 |
| `skills.github.direct-submit.v175` | 输入合法仓库 → 导入 | 只调用一次 `importGithub(canonicalRepository)`；按钮进入 importing，成功后显示完成态并刷新 `hub/skills` |
| `skills.github.invalid-input.v175` | 输入非 GitHub host/非法路径 → 失焦 | 显示内联错误；导入按钮保持 disabled；不会调用 preview/import client |
| `skills.github.cancel-stale.v175` | 导入请求未完成时关闭对话框 | 取消当前 attempt；迟到响应不显示成功态、不触发 `onImported`；再次打开输入为空 |

v175 的 `previewGithub` 仅是没有 `importGithub` 的旧注入客户端的内部 fallback，用户界面不显示预览步骤。
所有仓库、技能描述和 namespace 仍为本地合成值；不访问 Manus API，不保存 Cookie/token/原始仓库凭据，不覆盖手机端。

## 28. Skills GitHub geometry fixture v176

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `skills.github.dialog-rhythm.v176` | 桌面打开 GitHub 导入 | Dialog=`400×344px`；关闭按钮=`28×28px`；header/form/footer=`191/65/88px`；input=`352×36px`；submit=`352×40px` |
| `skills.github.placeholder.v176` | 空输入态 | placeholder=`https://github.com/username/repo`；URL label 与 input 是同级控件，label 点击可聚焦 input |

以上只验证桌面 Web 的真实 DOM/几何，不新增移动端规则。

## 29. Skills catalog and capsule visual regression fixture v183

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.full-dismiss.v183` | 桌面网站创作态点击胶囊文字/图标 | 单一 `68×32px` Button 可关闭；draft、URL、其它工具坐标不变，不提交表单 |
| `skills.settings.cards.geometry.v183` | Settings → 技能（`1280×720`） | 搜索=`200×32px`、y=`141`；范围行 y=`185`；卡第一行 y=`233`、卡=`371.5×135px`；描述 `12/16`；switch `22×14px` |
| `skills.catalog.geometry.v183` | 技能 → 浏览技能 | 目录 Dialog=`800×680px`、x=`240`、y=`20`；搜索 y=`80`；范围 y=`124`；卡第一行 y=`168`、卡=`370×135px` |
| `skills.catalog.third-party.v183` | 目录切换第三方 | 只显示 `third_party` 投影；添加成功后按钮 disabled 且名称只出现一次；关闭目录回到技能池 |
| `skills.github.preview-only.v183` | 注入仅 `previewGithub` 的 client | 规范化 URL 后显示只读预览文案；不调用 `onImported`，不声称已写入技能池 |
| `skills.github.import.persist.v183` | `Create → GitHub → 导入 → 完成` | 只调用一次 `importGithub(canonicalRepository)`；fixture 写回 personal skill，关闭后池中可见且同名不重复 |

截图：`output/playwright/skills-v183-manus-reference.png`、`output/playwright/skills-v183-local-wide.png`、
`output/playwright/capsule-v183-local-rest.png`、`output/playwright/capsule-v183-local-hover.png`、
`output/playwright/capsule-v183-local-dismissed.png`。本节仅覆盖桌面 Web，不覆盖手机端。

## 30. Skills upload modal and capsule interaction fixture v187

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.dismiss-focus.v187` | 桌面网站创作态点击胶囊 | 单一 `68×32px` Button 移除 intent；URL 与 draft 保留，输入框恢复焦点，不提交表单 |
| `skills.upload.modal-dropzone.v187` | Settings → 技能 → 创建 → 上传技能 | 外层 Settings/技能池保持挂载；打开独立 `400px` 上传 Dialog，含 dropzone、文件需求和帮助链接，不切换旧 inline tab |
| `skills.upload.archive-types.v187` | 上传 `.zip` 或 `.skill` | 两种归档扩展名都进入同一个 preview 状态；其他文件显示可恢复错误且不调用 preview client |
| `skills.upload.preview-confirm.v187` | 预检完成后选择候选并发布 | 只发布选中的 valid candidates；confirm pending 时锁定选择；完成态显示结果并刷新技能池 |
| `skills.upload.cancel-stale.v187` | 预检/发布中关闭上传 Dialog | 当前 attempt 失效；迟到响应不重开或更新已关闭的 surface；重新打开回到空 dropzone |
| `skills.github.single-submit.v187` | Create → 从 GitHub 导入 | DropdownMenu 先关闭；输入规范化后只调用一次 import client；成功/错误均停留在同一 Dialog |

以上 fixture 使用本地合成压缩包、GitHub URL 和技能候选；不访问 Manus API，不覆盖手机端。

## 31. Capsule visible dismiss and skill import recovery fixture v188

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.visible-dismiss.v188` | `1280×720` 桌面进入网站创作 | 胶囊为单一 shadcn Button，静止态显示 X；点击任意位置移除 intent，保留 draft/URL，不提交 |
| `composer.creation-intent.multiline-resize.v188` | 关闭胶囊前输入多行草稿 | 关闭后 textarea 重新按 `scrollHeight` 测量，内容、高度和焦点均保留 |
| `skills.github.abort.v188` | GitHub 导入中关闭 Dialog 或父 Settings | `AbortSignal.aborted=true`；迟到响应不显示完成态、不刷新技能池 |
| `skills.github.catalog-invalidate.v188` | GitHub/Upload 完成后再次打开目录 | pool 与 catalog 查询键均失活；目录安装状态不沿用旧缓存 |
| `skills.detail.surface.v188` | 点击技能名称 | 独立详情 Dialog 展示文件树/YAML/试用入口；试用关闭详情并执行 pin 回调 |
| `skills.upload.short-viewport.v188` | 矮桌面视口打开上传 Dialog | 内容区可内部滚动；dropzone、候选区和底部动作不会被固定最小高度裁掉 |

以上 fixture 均使用本地合成数据，固定为桌面 Web；不访问 Manus API，不覆盖手机端。

## 32. Capsule and Skills embedded-width regression fixture v189

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.single-button.v189` | 桌面网站创作态点击胶囊文字、图标或 X | 只有一个 `68×32px` shadcn Button；intent 移除，draft/URL/表单提交状态不变，焦点回到输入框 |
| `skills.settings.embedded-width.v189` | `1280×720` 打开 Settings → 技能 | 嵌入 body=`755px`，`width/max-width=100%`；浏览/创建按钮在 `x=984/1064`，页面 `scrollWidth=1280`，无横向裁切 |
| `skills.create.single-select.v189` | Skills 主池或目录点击创建菜单 | `DropdownMenu onSelect` 只触发一次；菜单先关闭，再打开对应上传/GitHub Dialog，父 Settings 保持挂载 |
| `skills.github.canonical-import.v189` | 输入合法 GitHub URL 并导入 | 请求只发送 `{repository}`；规范化为 `https://github.com/OWNER/REPO`，只调用一次 import，完成后池与目录缓存同时失活 |
| `skills.github.boundary-recovery.v189` | 输入非 GitHub host、端口、凭据、query/hash、额外路径或双斜线 | 客户端内联报错、提交 disabled，不触发网络；修改为合法地址可继续提交 |
| `skills.upload.archive-boundary.v189` | 选择 `.zip`、`.skill`、其他文件或空候选 | 两种合法扩展名进入 preview；其他文件/空候选有明确可恢复状态，不会发布无效候选 |
| `skills.detail.copy-cleanup.v189` | 打开详情、复制 YAML、关闭/卸载 | copied 状态在目标 skill 变化或关闭时复位，延时器清理，无迟到状态更新 |

所有断言固定桌面 Web `1280×720` 与合成 fixture；不覆盖手机端，不向浏览器暴露 tenant/site scope、凭据或 token。

## 33. Capsule visual state and scoped GitHub import fixture v190

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.context-icon.v190` | 桌面网站创作态静止显示 | 同一 `68×32px` shadcn Button 显示 `CodeWindowIcon`；槽位固定为 `16×16px`，相邻语音/发送坐标不变 |
| `composer.creation-intent.hover-x.v190` | 鼠标悬停或键盘聚焦网站胶囊 | 同一图标槽切换为 X；点击整颗胶囊、文字或 X 都清理 intent，draft/URL/表单提交状态保留 |
| `skills.github.personal-scope-replace.v190` | 导入与已有 third-party 同名的 `acme/copy-editor` | 只替换 `scope=personal` 的同名项，`scope=third_party` 项保留；池中两条投影不重复 personal 版本 |
| `skills.catalog.scope-key.v190` | Skills 目录合并 pool projection | 目录按 `scope/name` 合并 installed/enabled 状态，不使用裸 name 覆盖其他范围 |

GitHub fixture 继续使用合成仓库名和本地 preview client；不访问 Manus API、不发送
tenant/site 标识，不覆盖手机端。

## 35. Current desktop completion fixtures v192

本节是当前桌面 Web 行为的合成 fixture 记录，补在 v191 之后；历史 fixture 保持原样。

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.current.v192` | 网站空白 Composer 中进入、聚焦并关闭 Capsule | 单一 `68×32px` Button 在固定 `16×16px` 槽位内切换语义图标/X；`sessionStorage` 意图被清理，draft、URL、表单和光标保留，项目工作区不显示该 Capsule |
| `skills.github.import-completion.v192` | Skills Create → GitHub，提交 `OWNER/REPOSITORY` 或 canonical GitHub URL | 输入被规范化为 `https://github.com/owner/repo`；只调用一次 import，完成后 personal card 置顶、`role=status` 提示可关闭，缓存刷新不删除同名 official/third_party card |
| `skills.github.preview-only.v192` | 仅注入 `previewGithub` 的 local client | 界面明确显示只读预览；不调用 `onImported`，不把 preview 结果冒充已安装 Skill |
| `skills.detail.synthetic-projection.v192` | 点击 Skill 名称打开详情 | 由 `SkillCard` 生成标题、scope、文件树、YAML 和 prompt 卡片；复制状态可清理；不请求不存在的 detail/revision content endpoint |
| `skills.detail.try-handoff.v192` | Settings 内嵌详情点击 Try | 关闭 Settings，创建/切换直达会话，必要时 pin Skill，把合成的本地化 Try prompt 写入 Composer draft 并恢复焦点；不产生专用 `/try` 网络请求 |
| `skills.catalog.all-cursors.v192` | Official/third-party Catalog 返回多页 `next_cursor` | 同一个滚动 surface 连续加载至 `next_cursor=null`，按 `scope/name` 去重；重复 cursor 停止，超过 100 页转为可见错误，不静默丢页 |
| `rail.sessions.load-more.v192` | Direct 或 project rail 首页返回 `next_cursor` | 仅显示一个 Load more；追加请求携带当前 scope/cursor，按钮防并发；搜索只过滤已加载项，刷新从第一页重置 |
| `agent.connection.states.v192` | `/app/agents` 打开连接设置并切换 Telegram/LINE/Slack | loading 保留 QR 槽位且 Continue disabled；ready 显示 `qr_value` 和真实 `continue_url`；error 只显示 Retry，不生成假链接；关闭/Escape 恢复 Start 焦点 |
| `rail.route.compact.v192` | 桌面、`max-width:768px` fine pointer、折叠/展开及 Agent route | Agent `/app/agents` active projection 正确；窄桌面隐藏 rail track/gap/container，Header trigger 打开 `300px` 完整 rail；宽桌面仍为 `300px/52px`，无重复 direct chat 主入口，未知 route item disabled |

### v192 合成数据与后端待接字段

| 面 | 本地 fixture 提供的值 | 后端接入前仍待明确/接通的字段 |
| --- | --- | --- |
| GitHub import | local Hub client 返回固定 branch=`main`、`repository`、`skill.name/description`；content hash 使用 `preview:github:<encoded-repository>`，不访问真实 GitHub | 真实导入任务的权限/审计结果、完整 Skill 包内容、导入状态与生产 content hash；当前 UI 只消费 `GithubImportResult`，不把 token 放入 schema |
| Skill detail/Try | 从 `SkillCard` 确定性生成 `SKILL.md` 标签、文件树、YAML 与三条 prompt 卡片；Try prompt 为本地化 UI 文案 | 完整 `SKILL.md` 或 `content_ref`、`files[]` 树/大小/hash、`prompt_examples[]` 及可选的 Try/activation action/result projection；这些不是当前 `SkillCard` 字段 |
| Catalog pagination | 测试 client 注入 opaque cursor 的多页数组，preview client 可提供确定性 pool/catalog projection | 后端必须按 `scope + query + cursor` 稳定返回 `next_cursor`，并由可信 session/workspace 校验 scope；不能用浏览器传入的 scope 直接扩大可见范围 |
| Session rail pagination | 测试 client 注入 direct/project 分页 session 页；preview 内存列表可作为单页 fixture | 真实 session BFF 的稳定 opaque cursor、scope 绑定、失效 cursor 的错误 envelope 与权限过滤；`Load more` 不应跨 direct/project 或 workspace 复用 cursor |
| Agent setup | preview client 返回 `.fixture.test` 的 `qr_value/continue_url` 与固定 `expires_at`，覆盖 loading/ready/error/stale response | 生产 BFF route、真实连接 setup ticket/QR 生命周期、`expires_at` 刷新及平台连接状态；浏览器不接收 runtime identity、tenant internals 或长期凭据 |

以上 fixture 只验证桌面 User Web 的状态转换、可见结构和请求边界；合成值不代表生产数据，后端待接字段必须先在 API contract 中定型，再替换 preview client。

## 38. Library empty baseline and Skill detail action cluster v198

| Fixture | 验收标准 |
| --- | --- |
| `library.preview.empty-baseline.v198` | 默认 preview `listArtifacts` 返回空数组；首屏展示与 Manus 一致的空资料库；卡片交互仍可通过 `fixtureArtifacts` 显式注入测试 |
| `skills.detail.action-cluster.v198` | 详情 Dialog 顶部提供分享、更多、放大、关闭四个动作槽；父 Dialog 不新增第二层弹窗，动作槽与关闭按钮不重叠 |
| `skills.detail.fullscreen-reader.v198` | 放大动作在同一个 Dialog 内切换到 `100vw×100dvh`；正文 `768px` 阅读轨道、文件树和内容区不重叠；再次点击可收起并恢复原尺寸 |
| `skills.detail.download-share.v198` | 更多菜单下载合成 `SKILL.md`，分享动作复制当前详情 URL；两个动作不发送 tenant/site、凭据或第三方素材 |

资料库默认空态是路由视觉基线，显式 fixture 只用于组件交互覆盖；本节只覆盖桌面 Web，不访问 Manus API、不复制 Cookie/token/受保护素材，也不覆盖手机端。

## 34. Capsule pointer state and visible GitHub import completion fixture v191

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.pointer-state.v191` | 桌面网站创作态鼠标/触笔进入、离开、键盘聚焦胶囊 | 单一 `68×32px` shadcn Button；固定 `16×16px` 槽位在代码窗口图标与 X 间切换，不卡顿、不改变相邻控件坐标 |
| `first-site.website-axis.v191` | `1280×720` 打开网站创作首屏 | 本地标题=`y=181`、composer=`y=269`、胶囊=`y=344`，与 Manus 同视口实测坐标一致；普通聊天与手机 media query 不受影响 |
| `skills.github.import-visible.v191` | Create → GitHub → 合法仓库 → 完成 → Done | `onImported` 接收 `GithubImportResult`；列表将 personal 新技能提升到首项并显示可关闭 `role=status` 提示，刷新失败仍保留 stale list |
| `skills.github.scope-toggle.v191` | 同名 personal/third_party 技能分别启停 | UI 以 `scope/name` 区分；preview fixture 只修改指定 scope，live transport 将 scope 作为可选 query 参数发送 |
| `skills.revisions.scope.v191` | 展开同名技能版本历史 | revision 请求携带对应 scope；一个投影的历史加载不会覆盖另一投影 |

v191 继续只使用本地合成 GitHub 仓库与技能数据，不访问 Manus API，不保存 Cookie/token，scope 不是 tenant/site 标识，
不覆盖手机端。

## 36. Current capsule and Skills import fixtures v193

本节是本轮文档同步的合成 fixture 记录。它只约束 User Web 的 presentation、状态机和 client 边界；不表示真实 BFF
已经实现，BFF 接入时必须以 `user-web-api-contract-v4.md` 的 envelope、经 service auth/allowlist 校验的
`Forwarded` + session scope 与幂等规则为准。

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.capsule-close.v193` | 桌面网站创作态进入、hover/focus 胶囊并点击任意位置 | 单一 shadcn `Button`，尺寸 `68×32px`，固定 `16×16px` 图标槽；静止态显示网站图标，hover/focus 显示 X；清理 intent，保留 draft/URL/焦点，不提交表单 |
| `composer.environment.readonly-status.v193` | 桌面 Composer 展示固定环境投影 | 环境 selector 使用 `role="status"`，不作为可点击控件或额外 Tab stop；文本与图标不改变 Composer 工具行尺寸 |
| `skills.github.child-dialog.geometry.v193` | Settings/Catalog → Create → GitHub | 关闭来源菜单后只打开一个 `400×344px` child Dialog；父 Settings 保持挂载，焦点进入 repository input，不出现旧 preview card 或第二确认层 |
| `skills.github.canonical-owner-repo.v193` | 输入 `OWNER/REPOSITORY` 或合法 GitHub URL | 提交 client 只收到 `https://github.com/owner/repository`；`.git` 可移除；host/path/query/hash/userinfo/port 边界错误在本地阻止提交 |
| `skills.github.abort-error-focus.v193` | importing 时关闭/卸载、网络失败或 typed Hub 错误、再次打开 | 当前 attempt 被 AbortSignal/guard 失效；迟到结果不改写 UI；错误回到可修复 input；关闭/完成后焦点回到触发入口 |
| `skills.github.preview-only.v193` | client 仅提供 `previewGithub` | 显示 preview-only/只读预览；不调用 `onImported`，不刷新 pool，不出现“已安装”或 recent card 的误导状态 |
| `skills.github.import-recent-card.v193` | client 提供 `importGithub` 并成功返回 `GithubImportResult` | pool/catalog 查询键失活；preview client 写入 personal projection，recent card 置顶并显示可关闭 `role=status` notice；同名 official/third_party 保留 |
| `skills.detail.try-handoff.v193` | Skills detail 点击 Try（Settings 嵌入路径） | 关闭 Settings，启动/切换 direct chat，必要时 pin，写入本地化 Try prompt draft 并恢复 Composer 焦点；不调用专用 `/try` endpoint |
| `skills.catalog.cursor-complete.v193` | official/third_party Catalog 返回连续 opaque `next_cursor` | 同一滚动 surface 读取到 `next_cursor=null`，不使用 20 页截断；重复 cursor 停止，超过 100 页显示可重试错误；按 `scope/name` 去重 |

### v193 fixture 数据与待接字段

| 面 | 本地 fixture 提供 | 真实 BFF 仍需对接 |
| --- | --- | --- |
| GitHub import | 合成 `OWNER/REPOSITORY`、固定 `default_branch=main`、skill name/description、可预测 content hash；不访问 GitHub | 仓库可达性/权限、`SKILL.md` 校验、大小/文件数、冲突、配额、审计、content-hash 幂等、生产导入状态与真实 content hash |
| Preview-only | 仅返回只读预览结果并明确状态 | 不新增“preview API 已上线”的假设；若后端只支持 import，客户端不应把 preview fallback 传给生产 |
| Recent card/notice | 本地内存 pool 的 personal card、排序和 notice | 服务端持久化后的列表 projection、ETag/cache invalidation、失败后 stale projection 和权限过滤 |
| Skill detail/Try | `SkillCard` 派生的文件树、YAML、prompt fixture 与 direct-chat draft handoff | 完整 `SKILL.md`/files/prompt projection、内容权限、revision 与可选 activation action；当前没有伪造这些字段 |
| Catalog pagination | 多页 cursor、重复 cursor、100 页安全边界 | 绑定 `scope + query + cursor` 的稳定 opaque cursor、失效 cursor envelope、workspace 权限过滤；不能信任浏览器 scope 扩大可见范围 |

以上 fixture 固定为桌面 Web 与合成数据；不访问 Manus API，不保存 Cookie/token/原始仓库凭据，不覆盖手机端。文档中出现的 endpoint
是待对接的 Web BFF 契约，不是本地 fixture 已经拥有的后端实现。

## 37. Site 仓库与胶囊/GitHub 回归 fixture v196

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `site.repository.single-site.v196` | 在独立 `kokoro` 中运行桌面 Web | Site-owned 代码只从 `src/features` 装配；不存在多 Site registry、`SITE_ID` React 代码选择或 `src/featuress` 路径 |
| `composer.creation-intent.close-button.v196` | 网站创作态 hover/focus 胶囊并点击关闭 | `68×32px` 外壳尺寸不变；唯一 `24×24px` 关闭按钮不提交表单，draft/URL 保留，焦点回到 Composer |
| `skills.create.menu-geometry.v196` | Skills → 建立我的专属技能 | Radix menu `252×116px`，三行各 `36px`；品牌创建、上传、GitHub 文案和图标不互相错位 |
| `skills.github.import-flow.v196` | Create → 从 GitHub 导入 → `acme/standalone-skill` → 导入/完成 | Dialog `400×344px`；canonical repository、一次提交、loading status、完成提示和 personal recent card 均可见 |
| `skills.github.invalid-enter.v196` | GitHub 输入非 GitHub URL 后按 Enter | 不调用 import；字段保留，错误在字段下方显示，重新输入合法仓库后可提交 |
| `skills.github.close-abort.v196` | importing 中关闭 Dialog 或父 Settings | AbortSignal/attempt guard 使迟到响应失效；不更新已卸载 surface，重新打开为空表单并恢复触发器焦点 |

本节数据全部为本地合成 fixture；只覆盖桌面 Web，不访问 Manus API，不复制 Cookie/token/受保护素材，也不覆盖手机端。
## 39. Agent 与排程首屏 v199

| Fixture / surface | 本地预览数据 | 交互边界 | 视觉验证 |
| --- | --- | --- | --- |
| Agent launch action | Telegram、LINE、Slack 本地合成图标 | 点击仍打开连接 Dialog；渠道图标只表达可用入口，不承载第三方凭据 | `v199-local-agents.png` 对照 `v199-manus-agents.png` |
| Scheduled empty state | 空任务列表 | 建议项与创建按钮进入共享排程编辑器，标题由 route surface 自己承接 | `v199-local-scheduled.png` 对照 `v199-manus-scheduled.png` |
| Kokoro desktop skin | `--background: #ffffff`、`--sidebar` 独立 | 只改变 Site skin token，不改变移动端 surface | Agent、Scheduled、Skills、Library 同一桌面视口 |

## 40. Composer 录音与 package bootstrap v200（历史记录）

> v200 的“波形、计时器、完成动作”是早期参考观察，已被 v210 当前实现 fixture 覆盖；本仓库现行 preview
> 不渲染录音行，详细状态与时序以 v210 为准。

| Fixture / surface | 本地预览数据 | 交互边界 | 验收标准 |
| --- | --- | --- | --- |
| `composer.voice.inline-recording.v200` | 确定性波形、`0:00` 计时器、合成转写文本 | 点击麦克风进入同一个 Composer 的录音态；取消不改 draft，完成才追加转写；不打开 Dialog/Popover | Composer 保持 `120px` 外壳，录音行 `50px`，取消/完成各 `32px`；URL、网站胶囊和相邻槽位不跳动 |
| `composer.voice.live-recognition.v200` | 浏览器 `SpeechRecognition`/`webkitSpeechRecognition` 能力探测 | 原始音频只由浏览器处理；识别文本回到 draft；不向 BFF 发送音频或浏览器凭据 | 不支持/权限失败回到原位错误状态，迟到事件不改写已卸载 surface |
| `package.bootstrap.single-site.v200` | `@kokoro/web-core`、`@kokoro/i18n`、`@kokoro/tsconfig` workspace 包 | 首站使用 `workspace:*` 保证可复现；第二个 Site 或独立 release 时整体迁移 `kokoro-web-shared` | 不创建每个能力一个 Git 仓库；跨仓库改用 registry + semver + lockfile；Site-specific layout/SEO/assets 留在 `src/features` |

本节只覆盖桌面 Web 和合成数据；真实语音服务、BFF 和 shared registry 接入仍以 Web API contract 与仓库迁移方案为准。

## 41. BFF transport 与窄桌面 Web rail fixtures v201

本节是当前权威 fixture 口径。它把浏览器边界、服务端部署上下文和窄桌面导航拆成独立断言，避免
把旧 `Host`/`X-Domain`/tenant-site header 误写成产品 API：

### 41.1 RFC 7239 / service auth transport

| Fixture key | 输入 | 断言 |
| --- | --- | --- |
| `transport.browser-no-x-domain.v201` | 浏览器同源 `/api/*` 请求，尝试附加 `X-Domain` | 浏览器标准请求不生成该 header；BFF 对注入值忽略/删除，不向上游转发 |
| `transport.server-domain-only.v201` | 服务端 fixture 配置 `KOKORO_DOMAIN=alpha.fixture.test` | 客户端 query/body/header/runtime manifest/localStorage/Cookie 均无该配置值；BFF 只生成 `Forwarded: host=alpha.fixture.test` |
| `transport.forwarded-single.v201` | 浏览器伪造 `Forwarded`、`Host`、`X-Forwarded-*` 和旧 tenant/site header | 上游仅有一个由服务端配置生成的 RFC 7239 `Forwarded`；HTTP `Host` 仍是目标连接 authority，不参与产品上下文选择 |
| `transport.service-auth-required.v201` | 缺少 service auth，或来源不在 Web BFF allowlist | 后端在解析 `Forwarded` 前拒绝请求；不回退默认 tenant，不返回内部 binding/tenant 标识 |
| `transport.cross-binding-404.v201` | 同 actor 使用另一个 deployment domain 请求资源 | membership/binding 重新校验；跨 tenant/actor/不存在统一 `404 resource.not_found`，wire 不出现内部 key |

`KOKORO_DOMAIN` 只由服务端 transport fixture 注入；preview client 不得用浏览器字段模拟可信域名，
也不得把 `Forwarded` 当成单独认证。具体 header 删除与 service auth/allowlist 规则以
`forwarded-context-contract-v1.md` 和 `user-web-api-contract-v4.md` 为准。

### 41.2 窄桌面 Web rail / navigation

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `rail.narrow.hidden.v201` | fine-pointer CSS viewport `<=768px` | 仍是桌面 Web；rail、gap、container、固定 seam 从布局移除，主区不保留 `52px` 空白轨道，不切换手机 Sheet |
| `rail.narrow.trigger.v201` | 在隐藏态查看 Header | 恰好一个可聚焦 navigation trigger，`aria-expanded=false`；点击后显示同一完整 rail，`aria-expanded=true`，恢复 `300px` rail 与唯一 seam |
| `rail.narrow.registry.v201` | 在 hidden/reveal 两态点击一级入口 | Agent=`/app/agents`、MCP=`/app/plugins`、Scheduled=`/app/scheduled?tab=calendar`、Library=`/app/library`、Skills=`/app/skills`；两态目标一致 |
| `rail.narrow.active-route.v201` | 通过 trigger 进入任一一级入口，再回退/刷新 | active marker/`aria-current` 跟随 URL；未知 manifest item disabled；不会把 route click 变成 new-chat |
| `rail.narrow.direct-project.v201` | 从 `/app` 与 `/app/project/{project_id}` 隐藏/展开 rail | direct 与 project 会话 scope 不串；项目上下文仍可访问，rail 状态只影响 presentation，不修改 session/resource |
| `rail.narrow.no-api-context.v201` | collapse、hidden、reveal、route click、Settings open/close | 不发送 `X-Domain`、`KOKORO_DOMAIN`、tenant/site 字段或浏览器 `Forwarded`；不改变 API resource revision |

窄桌面 fixture 只验证 Web DOM、URL、active state、焦点和几何；不把隐藏 rail 当成缺少导航，也不以
手机端断点替代该契约。

## 42. Current replacement rules v202

本节覆盖并替代前文同名的旧 fixture 描述：

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `composer.creation-intent.visible-dismiss.v202` | 进入网站/应用创作态 | 胶囊按本地化标签自适应宽度并保持 `32px` 高；左侧固定 `16×16px` 槽位静止显示类型图标、悬停/聚焦显示 X；关闭按钮始终挂载、可聚焦且可直接命中，不提交表单；intent 清除但 draft、URL 和其他控件坐标保留 |
| `composer.voice.inline.v202` | 桌面点击麦克风 | 同一 `32×32px` 槽位在 `idle → listening → transcribing → idle` 间切换；不新增录音栏、Dialog 或 Popover，不改变 Composer 外壳几何；preview 仅追加合成文本，生产使用浏览器 SpeechRecognition |
| `rail.narrow.hidden.v202` | fine-pointer CSS viewport `≤768px` | Web rail、gap、container 和 seam 不参与布局；主区从 `x=0` 开始，不保留 `52px` 空白轨道；Header 或独立 surface shell 仅提供一个 navigation trigger |
| `transport.standard-forwarded.v202` | 任意浏览器同源 API 请求 | 不发送或信任 `X-Domain`、tenant/site header、浏览器 `Forwarded`；BFF 只从服务端 `KOKORO_DOMAIN` 生成单个 RFC 7239 `Forwarded`，并先通过独立 service auth/allowlist |

其中 Session 代理同时携带用户 runtime JWT 与 `web-bff` service auth；公共 Share 代理不读取用户信封、
不携带用户 Authorization，但仍携带 `web-bff` service auth。两者都通过统一 transport 注入
`Forwarded`，避免“匿名分享”被误解为“匿名上游连接”。

前文 `v172`、`v200` 中关于“hover 后才显示 X”或“展开录音行/完成录音”的表述均为历史记录，当前实现与验收以本节为准。

## 43. Footer/胶囊与水合回归 v209

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `rail.expanded-footer-anchor.v209` | 展开 rail，分别保持 `300px` 与拖动到 `438px` | 邀请卡为 `56px` 高；账户组左对齐；设备/通知动作跟随 rail 右边界；不出现账户信息随宽度居中的跳变 |
| `composer.creation-intent.direct-dismiss.v209` | 进入 `?qa=capsule-final`，未悬停时点击固定关闭槽位 | 关闭按钮直接命中；intent 清除、draft/URL/相邻控件不变；不存在 pointer-events 被 icon wrapper 吞掉 |
| `shell.hydration-cookie-url.v209` | 带 sidebar cookie、settings hash 或 conversation query 首次加载 | SSR 与首个 hydrated tree 相同；不触发 hydration rebuild 或开发态 Issues 浮层；浏览器状态在首帧布局提交前恢复 |

证据：`output/playwright/v217-footer-aligned-786.png`、`output/playwright/v218-rail-resize-aligned-440.png`、
`output/playwright/v220-capsule-visible.png`。以上均为桌面 Web 合成 fixture，不访问 Manus API，不覆盖手机端。

## 44. `useVoiceInput` 当前 preview/live fixture v210

本节是当前 User Web 的权威 fixture 矩阵，直接对应 `src/ui/composer/use-voice-input.ts`。它替代 v200 对可视录音行
的假设：语音状态始终复用 Composer 内联麦克风槽位，不产生第二个 surface。

| Fixture key | 触发 / 输入 | 本地合成行为 | DOM、布局与 transport 断言 |
| --- | --- | --- | --- |
| `composer.voice.preview.transition.v210` | `voicePreview=true`，点击 idle 麦克风 | `620ms listening → 220ms transcribing → idle`；完成后将 `composer.voicePreviewTranscript` 追加到 draft | 同一 `32×32px` 按钮；`aria-pressed` 只在前两态为 true；不新增 recorder、录音条、Dialog、Popover 或可见状态栏；不提交、不发请求 |
| `composer.voice.preview.append.v210` | 已有非空 draft 的 preview | 保留现有 draft，在 trim 后的两段文本之间插入单个空格；空 transcript 不改 draft | 不覆盖用户输入；网站胶囊、环境槽和发送槽位几何不变；fixture 只保存合成文本 |
| `composer.voice.preview.cancel.v210` | listening/transcribing 时再次点击同一麦克风 | 递增 attempt、清理 pending timer、回到 idle，不追加 preview 文本 | URL、Dialog 数量、Composer 外壳和相邻控件不变；没有迟到 timer 更新 |
| `composer.voice.live-recognition.v210` | `voicePreview=false` 且存在 `SpeechRecognition`/`webkitSpeechRecognition` | 原生识别实例为 single-shot、无 interim result；`onresult` 追加 transcript，`onend` 回 idle | 不创建 Kokoro recorder 或 BFF 请求；浏览器权限 UI 若出现属于浏览器，不属于应用 DOM；不上传音频/凭据 |
| `composer.voice.unsupported-or-error.v210` | API 缺失、`start()` 异常或浏览器 `onerror` | 原位进入 `error`，显示 `role=status[aria-live=polite]` 的 unavailable 文案，可重新尝试 | 麦克风尺寸、位置和 textarea 不变；不回显底层错误详情，不创建伪权限弹窗 |
| `composer.voice.cancel-and-unmount.v210` | cancel、surface 切换或组件卸载 | live 调用 `abort()`；preview 清理 timer；attempt guard 丢弃迟到 result/end/error | 卸载后不写 draft、不更新 UI；测试与日志不得保存原始音频、Cookie、token、邮箱或 tenant/site 字段 |

本地开发由 AppFrame 的 `voicePreview={preview || process.env.NODE_ENV !== "production"}` 选择确定性 preview；生产默认
使用浏览器原生识别。两条路径都不新增语音 API。只有用户显式提交已经写入 draft 的文本时，才进入既有
`POST /api/tasks/{task_id}/messages` 会话消息契约；没有 `audio`、音频 URL、设备权限或录音 blob 字段。

验证：`pnpm exec vitest run tests/ui/composer.test.tsx tests/ui/use-voice-input.test.tsx`（56/56）；本节只覆盖桌面 Web
与合成 fixture，不覆盖手机端，也不调用 Manus API。

## 45. Rail collapse transition v211

| Fixture key | 触发 | 断言 |
| --- | --- | --- |
| `rail.collapse.left-anchor.v211` | 在 `300px` 展开 rail 点击收起 | Sidebar 外层可保留 `200ms` 宽度过渡，但已切换为 `52px` 的 head/content/footer 子树必须以 `align-self:flex-start` 左侧锚定；导航按钮在过渡各采样帧均保持 `x=8px`，不经过 rail 中央 |
| `rail.expand.left-anchor.v211` | 在 `52px` 收起 rail 点击展开 | 展开过程不产生第二个图标列；按钮从紧凑轨道恢复到 `x=12px` 的完整 rail 内容宽度，最终状态与展开基线一致 |
| `rail.collapse.footer-anchor.v211` | 收起时观察账户、设备、通知组 | footer 不独立居中或闪动；账户/设备/通知仍落在单一 `52px` 轨道，seam 数量保持 1 |

真实桌面证据：`output/playwright/v222-rail-collapse-mid.png`、`output/playwright/v222-rail-expand-mid.png`。
本 fixture 只覆盖桌面 Web，不覆盖手机端。
