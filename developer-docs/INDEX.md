# Web 公开文档门户地图

本门户位于 App 的 `developer-docs/`，使用既有 VitePress 构建、导航和本地搜索。不增加文档仓库，不把业务页面代码或内部工程文档当公开站点输入。

## 三类资料的归属

| 资料 | 源目录 | 读者／入口 |
| --- | --- | --- |
| 产品功能 | `docs/product/` | 普通用户；[快速开始](docs/product/index.md)，按任务、文件、项目、定时、连接与[设置](docs/product/settings/personalization.md)主题阅读 |
| API | `docs/api/` | 接入方；[API入口](docs/api/index.md)，包含认证、概念、调用指南、参考及变更 |
| 内部工程 | App 的 `../docs/` 与 Root `docs/` | 工程／维护人员；不进入公开构建和搜索 |

产品功能按有意义的主题拆分，默认两三层，不为单个按钮建立空目录。API和产品分别使用 `/api/`、`/product/` 的独立侧栏，不把HTTP调用说明塞进产品操作手册。

## 事实与生成

- BFF是公开API字段事实owner。`catalog/contracts.yaml` 固定完整commit／version／digest，不因页面目录变化而改合同。
- `docs/api/reference/v1/generated/` 是唯一正式生成目标；受管生成、两次确定性比较和发布检查保持，不提交生成物。
- 手写产品页说明操作与限制，API指南解释调用；字段表由正式合同生成，不维护可编辑OpenAPI副本。
- `examples/` 只使用无真实凭据的本地fixture；`scripts/` 与 `tests/` 维护来源、生成、发布边界及链接检查。
- 内部owner合同／SQL／ORM／DTO／凭据／私有收据不作为公开输入；未知metadata／header／不安全链接与输出越界继续拒绝。

## 验证与发布

Node版本和包管理器以 `package.json`／lockfile为准。运行 `corepack pnpm check`，覆盖格式／类型、文档测试、精确来源、确定性生成、例子、发布边界、静态构建和站内链接。

Web帮助入口为 `/docs`，实际托管路径需部署配置验证。本轮只整理文档与本地构建，不发布部署；没有证据表明旧目录URL已上线，不新增兼容页或第二份来源。
