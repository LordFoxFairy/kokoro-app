# Kokoro User Web 验收矩阵

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
