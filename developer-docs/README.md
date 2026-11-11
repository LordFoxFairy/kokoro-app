# Kokoro 产品与开发者文档门户

本目录从 Root 已合 `2e008595` 的门户迁入 App，继续作为独立包维护；保留原依赖图与校验链。App 根目录可运行 `pnpm docs:check`／`pnpm docs:build`／`pnpm docs:dev`。公开构建输入仅为本包的 `docs/`；App 的 `../docs/` 内部维护记录不进入公开产物或搜索索引。Root 不保留第二份公开文档源码，不增加旧路径回退。

`developer-docs/` 是 Kokoro 产品使用指南与 Developer API 的中文静态门户。产品指南源在按功能分层的 `docs/product/`，讲解已交付工作台的操作与明确限制；API源独立放在 `docs/api/`，沿既有生成链维护。它不是新的文档站点。它负责阅读入口、工作流说明、导航、示例、版本目录、生成和校验；`kokoro-bff` 负责发布 public API 的机器契约。门户不保存一份可编辑的 OpenAPI 副本，也不拥有跨仓 DTO、数据库结构或内部 provider payload。

## 事实源与阅读顺序

字段名、类型、必填性、约束、响应头和 operation 元数据的唯一字段事实源是目录中固定的 `kokoro-bff` public contract artifact。先读[介绍](/api/)，再按[快速开始](/api/quickstart)和[认证与服务上下文](/api/authentication)完成第一次调用；随后按需阅读[核心概念](/api/concepts/projects)、[工作流指南](/api/guides/create-run)和[API v1 参考](/api/reference/v1/)。

生成参考页时，脚本从 `catalog/contracts.yaml` 的 commit 与 SHA-256 绑定位置读取 owner artifact。手写页面只解释调用流程、当前边界和客户端策略，不复制字段表；若手写说明与生成参考冲突，以 owner contract 和生成页为准。

## 前置条件

- Node.js `22.22.x`
- Corepack，以及 `pnpm@11.25.0`
- 执行 Python 示例需 `python3` 3.10 或更新版本；cURL 示例需 `curl`
- `../../kokoro-bff` 的本地 checkout，或通过 `KOKORO_BFF_CHECKOUT` 指向该 checkout

本地 BFF checkout 只用于读取已固定的 artifact；它不是门户的第二个可编辑事实源。示例使用 loopback fixture 和明显虚假的环境值，不需要真实凭据。

## 命令

| 命令 | 用途 |
| --- | --- |
| `corepack pnpm install --frozen-lockfile` | 按锁文件安装精确依赖图。 |
| `corepack pnpm dev` | 生成参考输入并启动本地门户。 |
| `corepack pnpm build` | 生成参考输入并构建静态站点。 |
| `corepack pnpm lint` | 检查 JavaScript、TypeScript 和 Markdown 风格。 |
| `corepack pnpm typecheck` | 检查门户配置和 TypeScript 示例。 |
| `corepack pnpm test` | 运行 provenance、生成器、示例、架构和链接单元测试。 |
| `corepack pnpm provenance:check` | 校验 origin、canonical blob、工作树字节、版本和摘要。 |
| `corepack pnpm reference:generate` | 从固定 BFF OpenAPI 生成被忽略的参考页。 |
| `corepack pnpm reference:check` | 证明两次隔离生成的字节完全一致。 |
| `corepack pnpm examples:check` | 用本地 fixture 校验并运行所有公开示例。 |
| `corepack pnpm architecture:check` | 执行公开发布边界和来源白名单。 |
| `corepack pnpm links:check` | 检查构建后的内部路由、锚点和静态资源。 |
| `corepack pnpm preview` | 预览已经构建的静态站点。 |

完整的本地 CI 等价门禁是：

```bash
corepack pnpm run ci
```

它按顺序执行 lint、类型检查、单元测试、provenance、确定性参考生成、可执行示例、架构策略、生产构建和构建站点链接检查。`docs/api/reference/v1/generated/` 是构建输入并由 `.gitignore` 排除；不要手动编辑或提交其中的文件。

更多 owner、目录和扩展规则见[`INDEX.md`](./INDEX.md)。

## 产品指南与发布边界

维护入口为 `docs/product/index.md`，导航位于 `docs/.vitepress/config.mts`。页面以实际产品路径和已验范围为依据，不从竞品文档推导 Kokoro 已支持能力；现可复用的参考来源和核对日期写在相应指南页。内部验收收据、机器状态和凭据不进入公开内容。

账户帮助菜单链接 `/docs`；本包默认按独立静态门户构建，实际域名／子路径挂载需由部署配置验证。本次仅更新源码与本地构建，没有发布部署。

## 对外阅读结构

- `docs/product/`：快速开始，以及 `tasks/`、`files/`、`projects/`、`scheduled-tasks/`、`connections/` 五个功能子目录；限制集中在相应主题，不复制内部验收日志。
- `docs/api/`：介绍、快速开始、认证、`concepts/`、`guides/`、`platform/`、`reference/v1/`、变更与来源。
- App `../docs/` 和 Root `docs/`：内部工程规范、设计与任务资料，不参与本站构建或搜索。公开页不导入这些目录。

导航按 `/product/` 与 `/api/` 分区；本次没有旧URL上线证据，不建立旧目录alias。实际对外 `/docs` 挂载和发布仍需部署验证。
