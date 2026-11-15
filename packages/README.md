# Shared package boundary

本仓只保留 `@kokoro/tsconfig` 的私有 workspace。i18n 引擎唯一源码 owner 是
`libs/kokoro-web-shared/packages/i18n`，App 通过 GitHub Packages 精确消费
`@lordfoxfairy/i18n@0.1.0`，manifest 与正规 lock 固定版本和 integrity。
本地 i18n 七文件副本已删除；不保留 workspace/file/link/alias fallback。
词典、overlays 与 React 绑定仍归 App，公开 resolver 行为不变。

## 当前仓库边界与后续交付

Root 当前组合如下；各产品只通过 package 公共入口消费，不互相导入产品源码：

```text
Kokoro/
├── apps/kokoro-app/packages/ # App 仅本地消费 tsconfig
├── apps/kokoro-mori/         # file: bridge 消费下方独立共享包
└── libs/kokoro-web-shared/
    └── packages/{web-core,i18n,tsconfig}
```

Root 通过 gitlink 组合独立子仓，不等于产品通过 submodule 嵌入共享源码。
其它产品现有消费不在本轮修改范围；App i18n 已使用 GitHub registry/semver/lock，
不再把 App 的副本和共享源码当两个 writer。`@kokoro/tsconfig` 的本地消费与严格编译检查保持。

## 包职责与提取规划

本仓实际包为 `i18n`、`tsconfig`；`web-core` 仅保留在独立共享仓，下表其余包及后续依赖图是提取规划，
不代表仓内已存在，不因规划创建空包或迁移现业务契约。

| package | 允许拥有 | 禁止拥有 |
| --- | --- | --- |
| `@kokoro/web-core` | 纯 TS 类型、资源/动作状态、跨产品协议 | React、CSS、Next、网络、产品文案 |
| `@lordfoxfairy/i18n` | 无 DOM 的语言协商、插值和 fallback 引擎 | 某个产品的词典、页面文案 |
| `@kokoro/web-data` | BFF client、schema、SSE/query adapter、错误映射 | 数据库连接、IAM 私有 token、页面布局 |
| `@kokoro/web-ui` | shadcn/Radix/Lucide primitive 和无业务交互 | Tenant 事实、业务请求、唯一页面排列 |
| `@kokoro/web-blocks` | Rail、Composer、Thread、ContextPanel 等可组合块 | 强制所有产品使用同一页面布局 |
| `@kokoro/web-runtime` | System manifest 的类型、投影、能力/主题协议 | 菜单事实、租户解析、动态执行代码 |
| `@kokoro/tsconfig` | 共享 TypeScript 基线 | 运行时代码 |

菜单、i18n 资源、主题 token 和 feature flag 的**事实数据**由 System/BFF 提供；package
只提供类型、投影和交互能力。未来确有跨产品复用需求时，再评估 `web-data` 和
对应的可组合 block；不为每个新需求创建一个 package 仓库。

## 依赖方向

```text
web-core / i18n ───────→ web-data / web-runtime
      │                         │
      └──────────────→ web-ui    │
                             ╲   │  (通过 props / adapter 注入)
                              → web-blocks
                                     ↓
                 kokoro-app/src/features + src/ui
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

- App i18n 只消费 GitHub 发布的精确版本；shared 源码、制品和 App lock 的实际验证见 CURRENT。
- GitHub npm 包 scope 跟随现账号，包名为 `@lordfoxfairy/i18n`，不建立组织或兼容别名。
- 本地临时使用现 GitHub 登录；Actions 使用自动 `GITHUB_TOKEN` 和 package Read 授权，
  不新增长期读取 secret。Docker 仅在 frozen install 挂载 BuildKit 认证秘密。
- shared 公开 API 与产品词典分离，升级以 semver、固定 commit 和 integrity 追溯；已发版本不覆盖。
- 产品自己的布局、品牌文案、SEO、Logo、素材和 token preset 始终留在
  `kokoro-app/src/features`，不因为“方便复用”而抽进 shared package。
