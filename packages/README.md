# Shared package boundary

当前 `packages/` 是 `kokoro` 的可提取 package bootstrap 层。它让第一个产品
可以在一个可复现的 pnpm workspace 内开发，同时提前锁定未来跨产品复用的 API 边界。

## 最终仓库边界

当第二个产品开始消费同一能力，或者某个 package 需要独立版本发布时，把这里的通用包
整体迁移到兄弟子仓库：

```text
Kokoro/
├── kokoro/       # 第一个产品：页面、布局、品牌、组合方式
└── kokoro-web-shared/        # 一个共享 package 子仓库，不是每个 package 一个仓库
    ├── packages/web-core
    ├── packages/i18n
    ├── packages/web-data
    ├── packages/web-ui
    ├── packages/web-blocks
    ├── packages/web-runtime
    └── packages/tsconfig      # 开发工具包
```

共享仓库只发布 package；产品仓库只消费版本化 package。不要用 Git submodule，也不要让
不同产品通过相对路径引用彼此源码。共享仓库内部使用 pnpm workspace，跨仓库通过私有
registry、semver 和 lockfile 交付。

## 当前包的职责

| package | 允许拥有 | 禁止拥有 |
| --- | --- | --- |
| `@kokoro/web-core` | 纯 TS 类型、资源/动作状态、跨产品协议 | React、CSS、Next、网络、产品文案 |
| `@kokoro/i18n` | 无 DOM 的语言协商、插值和 fallback 引擎 | 某个产品的词典、页面文案 |
| `@kokoro/web-data` | BFF client、schema、SSE/query adapter、错误映射 | 数据库连接、IAM 私有 token、页面布局 |
| `@kokoro/web-ui` | shadcn/Radix/Lucide primitive 和无业务交互 | Tenant 事实、业务请求、唯一页面排列 |
| `@kokoro/web-blocks` | Rail、Composer、Thread、ContextPanel 等可组合块 | 强制所有产品使用同一页面布局 |
| `@kokoro/web-runtime` | System manifest 的类型、投影、能力/主题协议 | 菜单事实、租户解析、动态执行代码 |
| `@kokoro/tsconfig` | 共享 TypeScript 基线 | 运行时代码 |

菜单、i18n 资源、主题 token 和 feature flag 的**事实数据**由 System/BFF 提供；package
只提供类型、投影和交互能力。Skills、Library、通知等业务也先进入 `web-data` 的契约和
对应的可组合 block，不为每个新需求创建一个 package 仓库。

## 依赖方向

```text
web-core / i18n ───────→ web-data / web-runtime
      │                         │
      └──────────────→ web-ui    │
                             ╲   │  (通过 props / adapter 注入)
                              → web-blocks
                                     ↓
                    kokoro/src/features + src/ui
```

`web-data` 不依赖 React/CSS，`web-ui` 不依赖业务数据；`web-blocks` 只接受数据和动作
adapter，不直接持有产品的 BFF 地址或 tenant 事实。产品代码只能向下消费 shared package；
shared package 不能反向 import `src/features`、Kokoro 词典、Kokoro 素材或 Next route。

## Chat contract extraction boundary

未来若把 Chat 能力提取到 `@kokoro/web-data`，可共享的内容只有浏览器安全的
Session request/response types、Zod schema、SSE event names、Last-Event-ID adapter、HITL
decision types 和错误码常量。Direct Chat 与项目 Chat 继续共用同源 `/api/session/*` contract；
项目 `project_ref` 只是 opaque ownership reference，不是 tenant、site、namespace 或共享 package
中的运行时身份值。

当前 `kokoro-app` 的 Chat 与业务 API 都是 BFF-only：通过同源 `/api/*` route adapter 进入独立
`kokoro-bff`；浏览器端的 `sessionBaseUrl()` 只返回 `/api/session` 兼容前缀，不读取任何独立服务
基址，也不直连 Session、Hub、Agent 或 Gateway。`Session` 仅是当前 BFF Chat 资源命名；独立
`kokoro-session` 与 `kokoro-gateway` 仅保留在历史/迁移资料中，不是 workspace、运行或 fallback
入口。shared package 不得携带
BFF URL、runtime token、internal secret、数据库/队列实现，也不得把 Preview fixture 描述成
Live backend。

## 当前阶段规则

- 目前包仍以 `private` workspace package 形式放在本仓库，优先保证第一个产品的测试、截图
  和构建可复现。
- `@kokoro/web-core` 当前只有本仓库一个实际消费方；`@kokoro/i18n` 和 `@kokoro/tsconfig`
  曾在已归档的旧 Web workspace 中存在第二个消费方/重复实现，因此它们是未来最先应提取和去重的包。
- 当前保留 `@kokoro/i18n` 这个稳定包名，不为增加 `web-` 前缀制造无收益的重命名；产品与旧
  workspace 完成切换后再统一由 shared repo 发布。
- 一旦新增第二个产品消费同一包，先把 package 迁入 `kokoro-web-shared`，再把产品的
  `workspace:*` 依赖替换为 registry 版本并提交 lockfile。
- 迁移前必须保证 package 不依赖产品路径，并为每个公共入口提供 typecheck、unit test、
  changelog 和 semver 变更记录。
- 产品自己的布局、品牌文案、SEO、Logo、素材和 token preset 始终留在
  `kokoro/src/features`，不因为“方便复用”而抽进 shared package。
