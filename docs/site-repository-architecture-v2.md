# 独立 Web 仓库与共享 package 方案 v3

状态：当前实施基线（2026-08-31）。文件名保留历史路径，正文采用新的独立 Web 模型：
一个仓库就是一个产品 Web 部署，不在前端引入 Site/tenant 对象，也不通过域名选择 React/CSS。

## 1. 最终结论

```text
kokoro-web-shared/                 # 唯一共享 package 仓库
  packages/web-core
  packages/web-data
  packages/web-ui                  # shadcn/Radix/Lucide 基础交互
  packages/web-blocks              # 可组合工作区块
  packages/web-runtime             # 公开运行时配置投影
  packages/i18n

kokoro/                            # 当前产品 Web 的本地 checkout（GitHub: LordFoxFairy/kokoro-app）
  src/app/                         # Next routes 与同源 BFF
  src/components/                 # 本产品装配所需的 UI/blocks
  src/ui/                          # 产品领域组件
  src/core/                        # 纯状态与投影
  src/engine/                      # session/SSE/HITL/reconnect
  public/                          # 本产品素材
```

命名规则：

```text
当前产品 Web GitHub 仓库：LordFoxFairy/kokoro-app
其它独立产品 Web 仓库：kokoro-<product-slug>
当前根 package：@kokoro/app
共享 package 仓库：kokoro-web-shared
```

`kokoro` 是当前产品的独立发布单元。其它产品拥有自己的仓库、页面信息架构、CSS Modules、
品牌素材、版本、部署、回滚和域名；它们只通过 `kokoro-web-shared` 的版本 package 复用通用
能力。不存在多产品 bundle、`src/featuress` registry、运行时 Site selector 或构建时 `SITE_ID`。

## 2. Web 不承载 Site 概念

这里的边界要固定下来：

- 一个独立 Web 仓库天然就是一个产品，不需要在 React 中再声明“当前 Site”。
- 产品名、页面布局、文案、SEO、素材和 CSS token 属于各自仓库的产品实现。
- 域名只是部署配置；前端不把域名转换成 Site 对象，也不把它写入 URL、body、localStorage 或
  公开状态。
- 同一个产品部署的请求上下文由 BFF 和后端处理；Web 不解析、选择或缓存内部隔离键。
- 后端负责身份、权限、数据隔离以及跨域名绑定；前端只接收完成授权后的业务投影。

这样可以让某个产品整体替换布局而不污染其它产品，也不会因新增菜单、Skills、Library、通知
或 i18n 需求再拆一个前端仓库。

## 3. 仓库与 package 的职责

### 3.1 当前产品仓库 `kokoro`

负责：

- Manus/Codex 风格的桌面工作区布局、Composer、会话、Rail、Context Panel 和设置体验；
- 本产品的页面 IA、营销文案、复杂 SEO、Logo、素材和品牌 token；
- Session/SSE/HITL/Library/Skills/MCP 等页面的业务组合和本地化产品文案；
- 同源 BFF、路由、服务端鉴权装配和部署配置。

产品仓库可以拥有和其它产品完全不同的页面编排。通用 package 提供能力和组件，不强制最终
布局。

### 3.2 共享仓库 `kokoro-web-shared`

只建一个共享 Git 仓库，内部用 pnpm workspace 管理多个可版本化 package：

| 能力 | package | 边界 |
| --- | --- | --- |
| reducer、状态机、持久化协议 | `@kokoro/web-core` | 无 React、Next、DOM、网络和产品文案 |
| BFF client、schema、SSE/HITL adapter | `@kokoro/web-data` | 只面向 browser-safe `/api/*` |
| shadcn/Radix/Lucide primitives | `@kokoro/web-ui` | 统一 focus、overlay、键盘和视觉 token |
| Rail、Composer、Thread、Context Panel blocks | `@kokoro/web-blocks` | props/slot/action adapter，不决定页面 IA |
| manifest 的公开类型与投影 | `@kokoro/web-runtime` | 不包含内部身份或隔离信息 |
| 通用静态词典与格式化 | `@kokoro/i18n` | 不放产品营销文案和 SEO 内容 |
| 共用 TypeScript 配置 | `@kokoro/tsconfig` | 仅开发工具配置 |

共享 package 不按菜单、Skills、GitHub 导入、Library 或通知分别建 Git 仓库。新增横向业务时，
先判断它是产品页面组合还是无品牌依赖的通用能力：前者留在产品仓库，后者扩充已有 shared
package，并同步 BFF/API contract。

### 3.3 当前过渡

当前仓库的 `packages/` 是可复现的 bootstrap workspace，不是多个子仓库，也不是要求现在
创建一堆空 package。出现第二个真实消费方或需要独立 semver 发布时，再整体迁移到
`kokoro-web-shared`，由 Changesets/semver 管理版本并提交 lockfile。

不使用 Git submodule，也不使用相对路径依赖另一个产品仓库的源码。

## 4. 域名与 BFF 请求契约

### 4.1 唯一运行时配置

```dotenv
KOKORO_DOMAIN="dev.kokoro.localhost"
```

`KOKORO_DOMAIN` 是当前部署的规范域名，使用不带协议的 hostname。生产环境填该部署真实
公开域名；域名变更时更新环境变量和后端绑定，不修改 React/CSS，不重新选择产品代码。
本地 `*.localhost` 解析到 loopback，无需修改 hosts。

### 4.2 每个上游请求统一注入 RFC 7239 `Forwarded`

```text
Browser
  → same-origin /api/*
  → User Web BFF 读取 KOKORO_DOMAIN
  → IAM / System / User / Session / Hub / Billing
       Forwarded: host=<KOKORO_DOMAIN>
  → 后端根据域名完成请求上下文、认证授权和数据隔离
  → BFF 返回 browser-safe projection
```

约束：

1. RFC 7239 `Forwarded` 是 BFF 到上游的标准代理上下文 header，不是 React prop，不是 URL 参数，不是 body 字段，
   也不是单独的认证凭据；后端须先确认 BFF 服务身份。
2. BFF 对所有上游请求统一添加，包含成功、错误、重试、SSE、下载和 mutation；重试请求保留
   同一个 request id，并重新附加同一个 RFC 7239 `Forwarded`。
3. BFF 必须覆盖或丢弃浏览器传入的同名 header，不能信任客户端伪造的域名。
4. 浏览器请求、公开响应、URL、body、localStorage 和缓存键不出现 Site、tenant 或内部隔离键。
5. 域名到内部上下文的解析、邮箱相同用户的隔离、权限判断和数据过滤全部由后端完成；Web
   只处理公开结果及 loading/empty/error/forbidden 状态。

## 5. 前后端职责

### Web 前端与 BFF

- React 只调用同源 `/api/*`，不直连内部服务、数据库、Redis 或 RPC。
- BFF 读取 `KOKORO_DOMAIN`，对所有上游请求注入 RFC 7239 `Forwarded`，并注入服务端 workload credential。
- BFF 负责认证 cookie、request id、幂等、错误映射、SSE 转发、缓存隔离和响应裁剪。
- BFF 不把内部 header、token、数据库错误、内部 URL 或隔离键透传给浏览器。
- 前端 schema 只用于体验层校验，后端仍是权限和业务事实源。

### IAM

IAM 负责身份、认证、opaque session、组织成员、角色和实时授权，并依据 RFC 7239 `Forwarded` 参与后端
请求上下文处理。IAM 不负责页面布局、CSS token、i18n 文案事实、营销内容、Session 消息或
Skills 资源。

### System

System 负责菜单、i18n、主题 token、产品入口、feature flag 和 runtime manifest。它向 BFF
提供受 schema 约束的公开投影；Web 不把这些配置转译成另一个产品选择器，也不加载任意 CSS、
HTML 或脚本。

### Session / Hub / 其它服务

- Session/Agent：会话快照、消息、SSE、工具调用、审批、文件、成果和任务状态；
- Hub：Skills、MCP、连接、上传、导入和版本状态；
- Library：成果聚合与会话来源跳转；
- Billing：余额、用量、套餐和订单；
- Team：组织/成员操作，最终授权仍由 IAM 判定。

新增后端能力时先扩 BFF contract、schema、错误码和 feature registry。普通业务需求扩充
现有产品仓库或 shared package，不新建一个产品 Web 仓库；只有独立部署、生命周期、团队或
安全边界确实成立时才新增仓库。

## 6. 当前仓库验收基线

### 结构

- 根 package 为 `@kokoro/app`，容器和部署镜像名称为 `kokoro-app`。
- 没有多产品 registry、构建时产品选择器或 `SITE_ID`。
- 产品页面、CSS Modules、SEO、素材和品牌 token 只在当前产品仓库维护。
- 通用组件来自 shadcn/Radix/Lucide；overlay 交互交给标准 primitive。

### 请求安全

- 每个 BFF 上游请求都带由环境变量生成的 RFC 7239 `Forwarded`。
- 浏览器侧不出现 Site、tenant、内部隔离键、workload token 或 IAM JWT。
- 域名不来自 body、URL 或 localStorage；客户端提供的 RFC 7239 `Forwarded` 不具备覆盖权限。
- 域名解析失败、认证失败、后端不可用和 manifest 校验失败均返回稳定错误态，不提交真实任务。

### 工程

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

四项均通过后才进入发布；桌面截图和真实交互回归是 UI 发布门禁。当前轮次只验证桌面 Web，
手机端不属于本轮改造范围。

## 7. 发布边界

- `main` 只执行 CI；`vMAJOR.MINOR.PATCH` tag 发布当前仓库的不可变版本镜像。
- Cloudflare Workers 可以直接连接当前 GitHub 仓库构建；Docker 和 Cloudflare 是两条互斥的
  发布路径，按环境选择其一。
- 发布平台注入 `KOKORO_DOMAIN` 和服务端 secrets；镜像 tag、构建参数和前端 bundle 不携带
  内部隔离信息。
- 共享 package 先在 `kokoro-web-shared` 发布 semver，再由每个产品仓库单独升级和验收。
- 详细命令、secrets 与回滚流程见 [`deployment.md`](./deployment.md)。
