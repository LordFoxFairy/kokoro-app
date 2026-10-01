# Kokoro Web contract governance

## WEB-BFF-PUBLIC3 当前 consumer pin（2026-10-01；已验证源码基线）

当前源码已删除旧public 2.0 pin；唯一public来源是`kokoro-bff` owner commit
`293dfe7638e5dea0df2bee6dfdd8483b53fc9df6` 的 OpenAPI `3.0.0`，原字节 SHA-256
`acd92ed2fa3e84032e824e1462d67a007c4a94a7e79b7bda8fd5a66f9d51cd3b`。该原字节固定到
`src/generated/bff-public-openapi.yaml`。Team generator锁固定digest，failure inspector锁version与ChatMessage/failure语义；commit
provenance由Root核对该commit的committed blob与snapshot原字节相等。不得手改snapshot/generated或维护第二pin。

当前唯一snapshot已复制owner committed原字节；failure artifact由generator再生为两角色且保留12tuple，Team15再生文件与旧基线
逐字节相等。Root fresh `pnpm check` exit0（contract219/architecture50/tests2055/lint/typecheck/build），完整preview Playwright14通过/4项目跳过；这些源码与preview证据不代表真实组合或3310已激活。

public 3.0.0 的 `ChatMessage.role` 只有 `user | assistant`。Web现runtime本来就是两角色；消费迁移删除旧system来源断言，不加
兼容、过滤、alias或fallback。所有公开path/operation、failure 12 tuple与AG-UI映射保持不变。Agent 4 / BFF public 3.1 retry
尚未发布，本片没有terminal retry mutation。Web仍无SQL事实owner，contract更新不触碰schema或运行数据。

实施继续复用 `scripts/generate-bff-{agent-failure,team-client}.mjs`、唯一snapshot/failure artifact及七个public contract test；
Team 15派生文件只能由generator再生并证明逐字节不变。下方2026-09-03的“尚无活跃generator”描述是历史基线，已由本节
现状取代；旧failure3/public2说明同样只属于历史来源。

状态：2026-09-03 当前 browser-private contract 说明。

## Owner

`kokoro` 只拥有浏览器同源 `/api/*` adapter、Web request/response projection 和 AG-UI 的 Web 侧
narrowing/适配。BFF Product API、durable AG-UI ledger、Conversation/Message/Project 等业务事实由
`kokoro-bff` 拥有；Run/HITL/执行事件由 `kokoro-agent` 拥有。

## Visibility

本目录和 `src/contract/` 描述的 Web surface 一律是 **`browser-private`**。它不进入 Developer API，
不承诺第三方兼容性，也不是 BFF `public` OpenAPI 的副本。只有 `kokoro-bff` owner 标为 `public` 的
artifact 可发布到 Developer API 门户。

## Version

- Web browser-private contract 与仓库 commit/package 一起版本化；当前 package 为 `@kokoro/app@0.1.0`。
- Web 到 BFF 的上游路径使用显式 `/v1`；该 API 的版本与 breaking policy 由 BFF owner 管理。
- `src/generated/proto/http/slice-a-web-v1.yaml` 自报 `1.0.0`，但它是冻结历史 snapshot，不代表当前
  browser-private runtime contract 已具备独立可发布版本。

## Active contract sources

| 路径 | 角色 |
| --- | --- |
| `src/contract/project-resource.ts` | Pinned BFF project resource upload/list response consumer validation |
| `src/contract/project-create.ts` | Pinned BFF ProjectResponse consumer validation for browser-private creation |
| `src/contract/agui-events.ts` | `@ag-ui/core` 校验后的 Kokoro metadata narrowing 与内部投影 |
| `src/contract/{chat,control,artifacts,catalog,billing,scheduled}.ts` | JSON Zod schema |
| `src/contract/paths.ts` | 同源 browser path helper |
| `src/contract/http.ts` | compatibility barrel；不定义另一套 schema |
| `src/app/api/**/route.ts` | 实际 path/method/header/projection 行为 |
| `contract/api-contract.test.ts`、`tests/contract/` | 可执行 contract regression |

`src/contract/session-events.ts` 目前仍被 live client 当 legacy wire 解析，同时作为 reducer shape；目标是
删除 network 双读后仅保留内部投影（并改为不暗示网络 owner 的名称）。

## Generation

当前活跃 Zod contract 为手写并由 TypeScript/Vitest 校验；本仓没有活跃的
`contract/openapi/`、`contract/proto/`、generator 或 generated-drift 命令。修改流程是：

1. 修改 owner contract 或固定 BFF artifact 引用；
2. 修改本仓 Zod/AG-UI boundary 与 route/client projection；
3. 更新 focused contract test、`docs/API_CONTRACT.md` 和相关 acceptance；
4. 运行 `pnpm contract`、`pnpm test:architecture`、`pnpm typecheck` 和完整测试。

不得引用不存在的 generator，不得手改 generated snapshot 来伪造再生结果。

## Breaking policy

- browser-private 变更由 Web/BFF 协调发布，不提供第三方兼容窗口。
- V1 clean-build 直接删除旧 wire、fallback、双读和 compatibility alias，不长期并存。
- BFF public breaking check 在 `kokoro-bff` owner 仓执行；Web 只消费固定版本/digest。
- AG-UI 标准事件优先；Kokoro `CUSTOM` 事件需要有命名空间和 contract test。

## Provenance

当前 runtime contract provenance 是本仓 Git commit、`src/contract/*.ts`、route 与测试。历史生成物位于
`src/generated/proto/`，其 `provenance.json` 记录：

- source Root commit：`afd367db387e11172150e64b8c5278918c47cd24`；
- source Root tree：`c161b67ad7853f9a8dba46b480943629b75a9393`；
- generator SHA-256：`c3ccc8124c83697c901eadaa1643de1d8753c390253fe274658c30360512bd46`；
- manifest SHA-256：`c395b2bdf2d7898b36279a7a2ed84174b9f5b59af6453f6100221cc39af93522`。

对应 source/generator 文件不在当前 checkout，且 runtime 没有 import 这些 generated types。因此它们
仅是冻结审计材料，不能作为当前 canonical、可再生或 public contract。

完整策略见 [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md) 和
[`../docs/ADR/0002-repository-coupled-contract-provenance.md`](../docs/ADR/0002-repository-coupled-contract-provenance.md)。
