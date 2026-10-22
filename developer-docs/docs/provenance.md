# Contract provenance（契约来源）

`catalog/contracts.yaml` 是门户的版本目录。当前条目记录：

- owner `kokoro-bff` 与 `public` visibility；
- contract version `22.3.0`；
- source repository 和 canonical path；
- 固定的完整 Git commit；
- 对 canonical 文件字节计算的 SHA-256；
- deterministic reference generation command；
- public/internal publication classification。

`pnpm provenance:check` 会检查配置的 repository origin，重新计算工作树摘要，重新读取固定 commit 的 immutable Git blob，校验 `info.version`，并拒绝 canonical source 的未提交变化。BFF 其他文件有 dirty 状态时，输出会把 `contract_source=clean` 与 `repository_worktree=dirty` 分开，不把无关变更冒充成 contract drift。

源文件的 commit 与摘要绑定完整 canonical 字节，不把过滤结果冒作 owner 发布物。校验原始 provenance 后，共享的只读投影按显式 visibility 选择 public operation，并递归保留它们引用的 components 和 security schemes；未知 visibility 或缺失引用会失败。投影只存在于生成过程，不另存可编辑 OpenAPI。

`pnpm reference:check` 在两个隔离临时目录中生成 reference，比较逐文件摘要，再把受管的 ignored build input 写入 `docs/reference/v1/generated/`。示例、架构检查和参考生成使用同一公开投影。生成器会在公开输入和最终生成文本上执行发布策略，拒绝 secret、危险链接、未知 public header 和内部 owner checkout 路径。

每个生成 tag 页和 manifest 都显示版本、owner、visibility、source commit 与 digest。它们是 provenance 的可读投影；机器校验仍以 catalog、Git blob 和校验命令为准。

::: tip 变更顺序
先由 BFF owner 提交 contract，再更新本页所引用的 catalog entry，执行 provenance、reference、examples、architecture、build 和 links 门禁。不要手改 generated reference，也不要把 root 或其他子仓的工作树变更纳入门户提交。
:::
