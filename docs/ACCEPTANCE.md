## R141 会话列表限定验收（2026-10-03；系统切片与工程门通过，待 Git）

| ID | 已执行行为 | 结果 |
| --- | --- | --- |
| R141-01 | 真实 Next+Chromium：会话列表 HTTP 200 body 未结束时，10 秒预算后显示列表内错误与人工 Retry；恢复后由新请求展示权威列表 | PASS |
| R141-02 | 真实 Next+Chromium：会话列表 503 不触发登录风暴，列表内 Retry 恢复权威列表 | PASS |

Root 严格 RED 进程 47705 为 2 fail；GREEN 进程 94936 两节点通过，完整 OIDC system file 进程 14725 为 45 pass / 0 skip（manifest 标识前缀 `5d01351f`、日志标识前缀 `46460d24`）。完整工程门进程 15328 已通过 contract 256、architecture 50、lint、typecheck并得到 2351 pass / 1 fail / 0 skip；唯一旧 fetch options 断言已迁移 AbortSignal，当时最终全门和 build 尚待 Root 复验。

Root 最新完整 `pnpm check` 进程 96991 自然 exit 0（127.231s）：contract 256、architecture 50、lint、typecheck、164 files / 2352 tests / 0 skip、build 全通过，包含 OIDC 45 与 IAM relay 68；manifest SHA-256 `448bdb142b2a24e7b9bb57652ac0509149d8368aa2c7f5222a7ec1c4b8718711`，日志 SHA-256 `61f7bec6e517538d6a705a2ae6eac6e4059e8d0bcd65c3d2cd1eb54efed47dde`。进程 92828 曾在既有 pending-refresh signout 节点出现 HTTP 500 / `next_runtime_error`；后续通过未定位其间歇根因，稳定性调查仍未关闭，不记为已修复。

该证据不覆盖 snapshot、分页、其它 GET、全部真实 owner 或当前用户 IAB；候选尚待 Root Git。

---

## R139 限定验收结果（2026-10-03；Root 工程与系统切片通过，待 Git）

| ID | 已执行行为 | 结果 |
| --- | --- | --- |
| R139-01 | 真实 Next+Chromium：session pending 达 10 秒进入显式 Retry，人工 Retry 使用新请求并恢复真实 UI | PASS |
| R139-02 | session 503 保持故障面，不按匿名跳登录；恢复后才续正常身份流程 | PASS |
| R139-03 | 真实 `200 authenticated:false` 是唯一自动登录分支 | PASS |
| R139-04 | 同 BrowserContext、同 subject 第二文档不清首标签页 Conversation index 与未发送 draft | PASS |

Root 冻结候选完整 `pnpm check` 自然 exit 0：contract 256、architecture 50、lint/typecheck、164 files / 2350 tests / 0 skip、build；OIDC 43 与 IAM relay 68 个系统节点在该门内通过。manifest SHA-256 `5cb35e18feb23049cc137e6a6d80f90380446c50020c8f39f8c7cb5dfd46225e`。候选仍待 Root Git，当前 live 副本未更新，用户 IAB 7 个窗口仍未关闭。

以上只证明 fixture 覆盖的 Product Session/UI 缓存边界；不证明真实全部 owner、模型/provider、Billing 或用户整链闭环。跨 actor draft、marker 并发、list/snapshot 截止恢复继续未验，不能据此改为完整发布通过。

---

# Kokoro User Web 验收矩阵

## Failed snapshot restore（实现候选）

| ID | 验收条件 | 当前状态 |
| --- | --- | --- |
| FSR-01 | messages尾项为failed assistant，且无active run/pending pause时，水合为通用failed、`runError=null` | 定点GREEN；resolved/cancelled/expired pause不阻挡 |
| FSR-02 | 尾部新user、后续completed/pending/streaming、空snapshot、active run或pending pause均不恢复历史failed | 定点GREEN |
| FSR-03 | messages/steps/files/deliveries/watermark保持原事实，不重放旧frame、不猜code/message或自动retry | 定点GREEN |
| FSR-04 | 既有通用错误卡可见，手动retry使用最后user；真实failure→reload→retry | 纯machine GREEN；Root真实组合待验 |

机器契约与SQL本片无变化；精确安全 failure 字段须由 Agent→BFF 后继契约单独验收。
Node22 hydration/machine 51/51、`pnpm check`（contract 109、architecture 37、全量 Vitest 1799、lint/typecheck/build）均通过；未运行浏览器或真实服务。

状态：2026-09-03。本文定义可执行验收，不把目标、preview 或历史报告写成当前生产证据。

状态标签：

- **已实现待本次验证**：源码中可定位，仍需在待交付 commit 运行命令。
- **部分实现**：已有一部分路径，但目标边界未闭合。
- **未实现/阻断发布**：当前缺口，文档不视为豁免。
- **本阶段完成条件**：只针对“文档与契约治理”阶段，不代表产品生产就绪。

## 1. 本阶段完成条件

| ID | 条件 | 验证 | 预期 |
| --- | --- | --- | --- |
| DOC-01 | 必需治理文档和 `docs/ADR/` 存在 | `pnpm test:architecture` | 全部存在、链接入口明确 |
| DOC-02 | README/INDEX 提供五分钟启动、owner 和验证入口 | architecture test + 人工审阅 | 不引用不存在的公开 API |
| DOC-03 | CURRENT 区分已实现、目标和缺口 | 人工对照 source | 不引用历史 PASS 冒充当前证据 |
| CTR-01 | contract README 包含 owner/visibility/version/generation/breaking/provenance | `pnpm test:architecture` | `browser-private` 且禁止 Developer API 发布 |
| CTR-02 | 不创建 Web public OpenAPI | `pnpm test:architecture` | `contract/openapi` 不存在 |
| CTR-03 | 现有 runtime contract 回归通过 | `pnpm contract` | exit 0 |
| ARC-01 | Web 无数据库/Redis owner | architecture test + dependency scan | 无 `database/`、ORM、PostgreSQL/Redis client |
| ARC-02 | 显式固定 `strict` 与 `useUnknownInCatchVariables` | `pnpm typecheck` + architecture test | exit 0；不启用需 runtime 修复的其它 strict 项 |
| SCOPE-01 | UI/CSS/React runtime 未修改 | `git diff --name-only <base>...HEAD` | 无对应路径变更 |
| VER-01 | 本仓全套低风险门禁执行 | lint/typecheck/test/build | 每项有当前 commit 的 exit code |
| VER-02 | Root 静态审计提取 `kokoro` 切片 | Root audit JSON | 文档缺失项清零；其余缺口如实报告 |
| SKSEL-DOC-01 | 五份当前文档对齐 BFF `571b51de` 与 OpenAPI SHA `f49023882315a4f46e46e95595a02eaa7bb85475d5f46d2b945bc0555edb0c90` | `git diff --check` + 人工核对 | 当前/目标、owner、删除项、下一文件集和未决 reader 一致；不声称代码已实施 |
| SKSEL-CTR-01 | Chat wire clean-slate 使用 `selected_skill_source_refs` | contract/unit | **已实现待 Root 验收**：始终数组；默认 `[]`；旧 `pinned_skills`、alias 与多余字段失败 |
| SKSEL-VAL-01 | exact refs 边界 | contract/unit | **已实现待 Root 验收**：no-trim、完整锚定 pattern、有序唯一、最多 16、单项 ≤197 字符、数组 compact UTF-8 JSON ≤4096 B |
| SKSEL-RET-01 | pending submission 冻结选择 | engine test | **已实现待 Root 验收**：同键未知响应重试保持原 content/ref 顺序；之后 UI 改选不改变在途请求 |
| SKSEL-ISO-01 | 旧 browser/preview 不污染正式请求 | architecture/UI/e2e | **已实现待 Root 验收**：旧 key 不读取/迁移；preview 名称不进入 engine；正式旧 store/wire 0 残留 |
| SKSEL-E2E-01 | 非空 Skill 真执行 | Root 隔离 Web→BFF→Agent→Platform/Storage | **未决**：Agent reader、安装/启用裁决完成后才可通过；本次文档门与空数组 Chat 不替代 |

## 2. 架构与契约验收

| ID | 场景 | 当前状态 | 发布标准 |
| --- | --- | --- | --- |
| ARC-10 | Browser 只调用同源 `/api/*` | 部分实现 | browser bundle 无 owner URL/credential；E2E 证明无直连 |
| ARC-11 | Web server 只调用 BFF | 部分实现 | 删除 IAM 直连和 owner-specific Web env |
| ARC-12 | Web `/api/*` 是 browser-private | 已实现待本次验证 | contract/catalog test 阻止 Developer API 收录 |
| CTR-10 | AG-UI 是唯一 Web↔BFF network event union | 部分实现 | 删除 `parseSessionEvent(raw)` network fallback；负测 legacy wire 被拒绝 |
| CTR-11 | `AgUiChatTransport` → `UIMessage` 仅内部适配 | 未实现/阻断发布 | 安装固定 AI SDK、实现 mapping、无第二 stream/cursor |
| CTR-12 | BFF durable cursor 驱动 replay | 部分实现 | snapshot/cursor/reconnect/expiry E2E 通过 |
| CTR-13 | HITL interrupt/resume 完整 | 部分实现 | 同 thread、全部 pending、幂等 identity 与错误恢复通过 |
| CTR-14 | JSON envelope/request id 统一 | 部分实现 | 所有 route 正/负向 contract test 通过 |
| CTR-15 | 冻结 generated snapshot 不冒充 canonical | 已实现待本次验证 | provenance 文档化；runtime 无 import；不发布 |

## 3. 安全验收

| ID | 场景 | 当前状态 | 发布标准 |
| --- | --- | --- | --- |
| SEC-01 | HttpOnly/Secure/SameSite session | 已实现待本次验证 | local/prod cookie tests；tamper/expiry/rotation/revoke |
| SEC-02 | Browser header 不能注入 tenant/site/Forwarded | 已实现待本次验证 | route integration test 覆盖 spoof 值 |
| SEC-03 | Cross-origin mutation 被拒绝 | 部分实现 | Origin 缺失策略、Fetch Metadata/CSRF 测试闭合 |
| SEC-04 | Server secret 不进 browser bundle/log | 部分实现 | bundle/secret/log scan 阻断 |
| SEC-05 | CSP/frame/referrer/permissions policy | 未实现/阻断发布 | browser header test 通过 |
| SEC-06 | 请求/响应大小和 timeout | 未实现/阻断发布 | slow/oversized/abort 集成测试通过 |
| SEC-07 | 供应链 | 未实现/阻断发布 | action SHA、image digest、scan、SBOM、provenance、signature |

## 4. 可靠性与用户路径验收

| ID | 场景 | 当前状态 | 发布标准 |
| --- | --- | --- | --- |
| REL-01 | BFF 不可达 | 部分实现 | 明确 error/request id；不回退 preview |
| REL-02 | SSE 中断与恢复 | 部分实现 | reconnecting 可见；从 cursor 续传；无重复 message/tool |
| REL-03 | Cursor 过期 | 未实现/阻断发布 | snapshot reconciliation 保留一致状态 |
| REL-04 | Mutation retry | 部分实现 | 相同 key/digest replay；冲突 409；不重复副作用 |
| REL-05 | 状态机完整 | 部分实现 | idle/submitting/queued/streaming/approval/resume/cancel/reconnect/terminal 全覆盖 |
| REL-06 | health/ready | 未实现/阻断发布 | 独立探针区分进程健康与依赖就绪 |
| REL-07 | graceful deploy | 未实现/阻断发布 | stream drain/abort/reconnect 与 candidate smoke |

## 5. Web 质量验收

本阶段不修改 UI，但最终发布仍需：

- Playwright 覆盖登录、Direct Chat、Project Chat、HITL、artifact、Scheduled、Skills、错误与恢复；
- desktop/mobile viewport 和键盘路径；
- axe 阻断严重可访问性问题；
- focus-visible、reduced-motion、loading/empty/error/disabled/optimistic/reconnecting/partial/success；
- 核心页面视觉回归和 bundle budget；
- 拆分超过 React/CSS 硬上限的文件并清理/登记 `!important`。

当前没有 `test:e2e` script，上述项目均不能标为通过。

## 6. 验证命令

在本仓：

```bash
pnpm contract
pnpm test:architecture
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

在 Root：

```bash
python3 scripts/verify-ten-repository-standard.py --format json
```

验收记录必须包含：branch、commit、命令、exit code、失败数、环境、时间和剩余 gap。`pnpm test`
包含 preview/unit 并不证明 live BFF 或生产环境通过。
