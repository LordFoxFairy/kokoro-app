# Kokoro User Web 运行手册

状态：当前可执行诊断与目标恢复步骤，2026-09-03。

## 1. 准备信息

开始处置前记录：

- deployment/region、公开 hostname、开始时间和用户影响；
- Web commit、container image digest 或 Cloudflare deployment version；
- BFF 与相关 owner version；
- 一个脱敏 `x-request-id`/trace id；
- 受影响 route template、HTTP status、browser/version；
- 最近发布/配置/secret rotation。

不要复制 cookie、Authorization、refresh token、magic-link token、internal secret 或用户 message/tool payload。

## 2. 本地验证

```bash
cd /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro
git status --short --branch
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm contract
pnpm test:architecture
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

本仓当前没有专用 `/healthz`/`/readyz`。进程 smoke 只能临时检查页面和 session-state，不能冒充依赖
readiness：

```bash
pnpm start
curl -i http://127.0.0.1:3000/
curl -i http://127.0.0.1:3000/api/auth/session-state
```

preview 成功只证明本地 fixture；live 诊断必须关闭 preview 并连接已知版本 BFF。

## 3. 配置检查

只检查“是否配置”和目标 hostname，不输出 secret 值：

| 配置 | 预期 |
| --- | --- |
| `NODE_ENV` | production deployment 为 `production` |
| `KOKORO_DOMAIN` | 不带协议/路径的 canonical hostname |
| `KOKORO_WEB_SESSION_SECRET` | 已注入；轮换时当前 key 在首位 |
| `KOKORO_INTERNAL_SECRET_WEB_BFF` | production 必需 |
| `KOKORO_BFF_BASE_URL` | server-only BFF URL |
| `KOKORO_IAM_BASE_URL` | 当前实现仍需；终态删除并经 BFF |
| `NEXT_PUBLIC_SESSION_PREVIEW` | production 不启用 |

检查 browser bundle/Network：不应出现上述 secret、BFF/IAM internal URL、runtime JWT、tenant/site header。

## 4. 常见故障

### 4.1 页面不可用或 hydration 失败

1. 检查静态资源是否来自同一 release，是否有 404/chunk mismatch。
2. 检查 server log 中 route、request id、version 和 duration；不记录 payload。
3. 以同一 image/digest 执行 `pnpm build && pnpm start` 或 candidate smoke。
4. 若由静态 asset/CDN 混版导致，停止 rollout，清理错误 deployment mapping，回滚到完整旧版本。
5. 若仅 preview/localStorage 触发，使用新 profile 复现；清理数据前先确认不会掩盖 live 问题。

### 4.2 登录循环、401 或 session refresh 失败

1. 检查公开 hostname 与 `KOKORO_DOMAIN` 一致，HTTPS 下 cookie 带 Secure。
2. 检查 session/nonce cookie 的 Path、SameSite、expiry；不要读取或粘贴值。
3. 关联 Web request id 与 BFF/IAM 记录，区分 envelope invalid、access expired、refresh revoke 和 service auth。
4. 多 tab refresh race 不应立即踢出仍有效 access；确认是否发生重复 rotation。
5. 大面积故障优先回滚最近 auth/config 变更；credential 泄漏走第 7 节。

### 4.3 BFF unavailable、502 或 503

1. 区分 `*_not_configured`、`*_unreachable`、`*_bad_response` 和 BFF 业务错误。
2. 从 Web runtime 验证 BFF DNS/TCP/TLS 与目标 `/v1` route；不要让浏览器直连内部 URL。
3. 检查 Web→BFF service credential、`Forwarded` hostname 和 request id 是否存在。
4. 检查 BFF health/ready、其 owner dependency 和最近 contract/version。
5. 禁止切换 preview/legacy wire 伪造恢复；可以只读降级并明确显示 unavailable。

### 4.4 AG-UI parse failure 或 Chat 停止

1. 记录 request id、thread/run id 的脱敏引用、最后确认 cursor、event `type` 和 Web/BFF version。
2. 确认 response `Content-Type: text/event-stream`、`Cache-Control: no-store`，重连携带
   `Last-Event-ID`。
3. 在 contract fixture 中复现单个 frame；检查 `@ag-ui/core` 与 Kokoro metadata narrowing。
4. 若 BFF 发出 legacy `SessionEvent`，视为 contract breach；不要依赖当前 fallback 维持生产。
5. 若 cursor gap/expired，按 BFF contract 获取 snapshot 后 reconciliation，不从 0 盲目重放。
6. 修复后验证 text/tool/HITL/custom/terminal event、断线点和重复投递。

### 4.5 重复提交或状态不收敛

1. 以 `Idempotency-Key`、request digest、receipt id、run id 和 cursor 关联同一动作。
2. 检查 UI retry 是否复用原 key；检查网络层是否在无幂等保障下自动 POST。
3. 以 BFF durable receipt/AG-UI projection 为事实，不以 local optimistic message 裁决。
4. 同 key 不同 digest 应为 conflict；若产生重复副作用，升级为高优先级事故。

### 4.6 Browser storage 污染

1. 用干净 profile 判断问题是否来自 URL、cookie、localStorage 或服务端 snapshot。
2. 仅删除已确认的 UI/preview key，避免先清数据导致证据丢失。
3. production 不应依赖 `kokoro.preview.*`；发现后检查 build/runtime preview 配置。
4. 服务端事实错误不能通过清 localStorage 结案，必须在 owner 修复并 reconciliation。

## 5. 发布与回滚

发布前保存：commit、完整门禁输出、candidate digest、scan/SBOM/provenance、BFF/owner version、browser
smoke 和 rollback digest。当前流水线尚未全部生成这些证据，未满足时不得把 release 标为生产闭环。

回滚：

1. 停止继续 rollout；
2. 将流量切回上一个已验证不可变 image digest/Cloudflare deployment；
3. 保留当前故障版本、日志和 request id 供分析；
4. 验证 `/`、session-state、登录、BFF JSON、AG-UI reconnect、HITL 和关键页面；
5. 确认旧版本与当前 BFF contract 兼容；若不兼容，按 owner 发布顺序协调回滚；
6. 更新 incident timeline 和已恢复时间。

不使用 `latest` 作为回滚依据，不在生产现场手改 generated contract 或 browser bundle。

## 6. Secret rotation

### Web→BFF service secret

1. 先让 BFF 接受新旧两把 credential；
2. 更新 Web 使用新 credential；
3. 验证 request id、401/403 比例和所有 browser-private route；
4. 撤销旧 credential；
5. 检查日志/artifact 是否泄漏。

### Session envelope key

1. 将新 key 放 `KOKORO_WEB_SESSION_SECRET` 列表首位，旧 key 保留在后；
2. 新 cookie 由新 key密封，旧 cookie 在短轮换窗口仍可解；
3. 监测 anonymous/login/refresh error；
4. 窗口结束删除旧 key；
5. 泄漏场景同时在 IAM/BFF 吊销 session/refresh，不只轮换 Web key。

## 7. 安全事件

出现跨 tenant、token/secret、错误支付、未授权工具执行或 Developer API 误发布时：

1. 立即停止相关发布/入口，限制影响面；
2. 记录版本、时间、request id、受影响 owner 和脱敏证据；
3. 轮换/吊销 credential 与 session；
4. 检查 cache、CDN、日志、bundle、artifact 和 share 是否继续暴露；
5. 修复后执行隔离、授权、contract、浏览器与 owner reconciliation 验证；
6. 完成复盘、检测补强和 follow-up owner/期限。

安全事件不受普通 SLO error budget 豁免。

## 8. 恢复完成证据

恢复声明至少附：

- 受影响版本与恢复版本/digest；
- 当前时间重新执行的验证命令与 exit code；
- synthetic 与真实 BFF/owner smoke；
- request/trace correlation 和错误率回落窗口；
- 剩余风险、临时措施、owner 与到期时间。

没有这些证据时只能报告“服务表现已改善/仍在观察”，不能报告生产闭环。
