# Kokoro package 提取映射 v3

这张表固定当前独立产品 Web 仓库与未来 `kokoro-web-shared` 的 package 边界。一个 package
不单独建一个 Git 仓库；共享能力作为一个 workspace 仓库发布，产品 Web 通过版本包复用。

## 1. 命名基线

```text
产品 Web 本地 checkout：kokoro
产品 Web GitHub 仓库：LordFoxFairy/kokoro-app
产品 Web 根包：@kokoro/app（private，仅当前产品构建入口）
其它产品 Web：kokoro-<product-slug>
共享 package 仓库：kokoro-web-shared
共享包：@kokoro/web-core、@kokoro/i18n、@kokoro/web-data、@kokoro/web-ui、
        @kokoro/web-blocks、@kokoro/web-runtime、@kokoro/tsconfig
```

`kokoro` 仓库只发布 Kokoro 这一套页面布局、品牌、文案、SEO、素材和产品组合。它不维护
多产品 registry，不把域名映射成前端对象，也不使用构建时 `SITE_ID`。

## 2. 当前源码 → 目标归属

| 当前路径 | 当前责任 | 未来归属 | 提取规则 |
| --- | --- | --- | --- |
| `src/core/*` | reducer、状态、持久化、纯投影 | `@kokoro/web-core` | 移除产品 storage prefix、产品文案和 DOM 依赖 |
| `src/contract/*` | browser/BFF schema、错误和动作契约 | `@kokoro/web-data` 或 `web-core` | 只保留公开字段，禁止 server secret |
| `src/engine/*` | Session/SSE/HITL/reconnect | `@kokoro/web-data` | 通过 adapter 注入 API，不绑定产品路由 |
| `src/hub/*`、`src/team/*`、`src/billing/*` | 能力资源 client 和状态 | `@kokoro/web-data` | 只保留 browser-safe BFF client/schema |
| `src/system/runtime-manifest.ts` 的公开 projection | manifest 类型与投影 | `@kokoro/web-runtime` | 与服务端认证、域名解析和内部上下文分离 |
| `src/system/use-runtime-manifest.ts` | manifest 获取与缓存 adapter | `@kokoro/web-runtime` / `web-data` | URL、缓存和错误策略通过 adapter 注入 |
| `src/components/ui/*` | shadcn/Radix/Lucide primitives | `@kokoro/web-ui` | 不读取产品数据、域名或内部上下文 |
| `src/components/blocks/*` | Rail、Composer、Thread、ContextPanel 组合块 | `@kokoro/web-blocks` | 通过 props/slot/action adapter 组合 |
| `src/ui/*` | 当前产品领域组件和组合 | `kokoro` | 真正跨产品且无品牌依赖时再提取 |
| `src/features/*` | 当前仓库的产品页面、布局、文案、素材和 CSS Modules | `kokoro` | 这是现有物理目录，不是多产品运行时机制；产品特有代码永不自动抽出 |
| `src/app/*` | Next routes、同源 BFF、服务端装配 | `kokoro` | 每个产品仓库保留自己的部署与安全边界 |
| `src/i18n/messages.ts` 等 | 当前产品静态 UI 词典 | `kokoro` | 产品文案保留本仓库；真正通用格式化才进入 shared |
| `public/*` | Kokoro 品牌素材和静态资源 | `kokoro` | Logo、营销素材、SEO 资源不进入 shared |

## 3. 依赖硬规则

```text
web-core / i18n
  → web-data / web-runtime
  → web-ui
  → web-blocks
  → kokoro 产品页面装配
```

- `web-core`、`i18n`：无 React、Next、DOM、网络和产品文案；
- `web-data`：只提供 browser-safe client/schema/SSE adapter，不含数据库、workload token、
  内部服务地址或服务端请求上下文；
- `web-runtime`：只提供 manifest 类型、能力和主题的公开 projection；域名读取、身份、权限和
  后端隔离留在 BFF；
- `web-ui`：只提供 shadcn/Radix/Lucide 基础交互和 semantic token，不规定最终页面排列；
- `web-blocks`：只通过 props、slot、route/action adapter 组合，不 import 当前产品词典、
  产品 URL 或产品 localStorage；
- 产品仓库：拥有页面 IA、路由、CSS Modules、品牌/SEO/素材、产品 token 和页面组合方式。

## 4. BFF 请求约束

```dotenv
KOKORO_DOMAIN="dev.kokoro.localhost"
```

`KOKORO_DOMAIN` 是产品部署的规范域名。浏览器不读取它，不将它放入 URL、body、React props 或
localStorage。每个 BFF 上游请求统一附加：

```http
Forwarded: host=<KOKORO_DOMAIN>
```

BFF 必须覆盖浏览器传入的同名 header；浏览器不提交内部隔离键，后端依据服务端请求上下文完成
身份、权限和数据隔离。shared package 不解析域名，不保存内部隔离键，也不生成服务端凭据。

## 5. 什么时候提取

满足任一条件就开始提取对应 package，不提前创建空仓库：

1. 出现第二个真实产品 Web 消费方；
2. 同一能力已经出现第二份实现；
3. package 需要独立 semver、release 或 changelog；
4. package 需要独立维护团队或安全边界。

提取步骤：

1. 从当前产品代码中移除产品文案、产品路径、storage 前缀、域名读取和服务端依赖；
2. 在 `kokoro-web-shared` 的 pnpm workspace 建立 package 与编译入口；
3. 用 Changesets 生成版本和 changelog，发布到私有 registry；
4. 产品仓库将 `workspace:*` 换成固定 semver 并提交 lockfile；
5. 在产品仓库重新运行桌面截图、交互、lint、test、typecheck 和 build；
6. 通过后再让其它产品升级同一版本。

## 6. 不允许的做法

- 不为菜单、i18n、Skills、Library、通知、GitHub 导入分别建立 Git 仓库；
- 不把多个产品放进 `src/featuress` 后用 `SITE_ID` 构建选择；
- 不把域名、内部隔离键或权限结论交给浏览器；
- 不使用 Git submodule 或相对路径让产品仓库依赖另一个产品的源码；
- 不把 Kokoro 的页面布局、营销文案、SEO、Logo、素材和复杂 CSS 迁入 shared package；
- 不让 shared package 直接请求 IAM/System/Agent 的内部接口；所有网络访问经由产品 BFF。
