# ADR-0002：仓内 contract source 与冻结 generated snapshot

- 状态：Accepted
- 日期：2026-09-03
- 决策 owner：`kokoro`

## 背景

本仓同时存在手写 `src/contract/*.ts`、`contract/api-contract.test.ts` 和
`src/generated/proto/*`。后者的 provenance 指向旧 Root contract source commit，但对应
`contract/proto`、OpenAPI source 和 generator 不在当前仓。把这些生成物称为当前 canonical source
会造成不可复现构建；把 Web 同源 OpenAPI 发布为公共 API 又会违反 BFF 的 public owner 边界。

## 决策

1. 当前运行时 contract source 是 `src/contract/*.ts` 的 Zod/AG-UI schema、实际 route 和测试。
2. `src/generated/proto/*` 保留为冻结 consumer snapshot，仅用于来源审计；当前 runtime 不依赖它。
3. 不手改冻结 generated 文件，不声称它可从当前 checkout 再生。
4. 不在 Web 仓凭空创建 public OpenAPI；`/api/*` visibility 始终是 `browser-private`。
5. 若重新建立生成流程，必须由事实 owner 提供固定 artifact，或在本仓提交明确属于 Web 的
   browser-private source、generator、工具版本、digest、drift 和 breaking test。
6. `contract/README.md` 必须持续记录 owner、visibility、version、generation、breaking、provenance。

## 影响

- 构建不会暗中依赖已删除的 Root source。
- 冻结 snapshot 不能被当作最新字段事实或 Developer API 输入。
- 未来 contract generation 的引入必须是完整、可审查、可复现的变更，而非手工覆盖 generated 文件。

## 后续条件

协议迁移完成后，若冻结 snapshot 无任何审计或 consumer 用途，应在独立变更中删除；若仍需使用，先
恢复正确 owner artifact 和可运行 generator，再将其升级为受 CI 保护的只读生成物。
