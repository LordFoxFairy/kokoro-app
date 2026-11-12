# Shared package boundary

当前 `packages/` 是 `kokoro-app` 的私有 workspace 层，实际包含 `i18n`、
`tsconfig`，App 的 manifest 与 lockfile 仍以 `workspace:*`／本仓 link 消费。
独立 `libs/kokoro-web-shared` 已存在，Mori 通过显式 `file:` package bridge 消费其中同名三包；
App 未使用的 `web-core` 副本及依赖已退役；共享仓 canonical 包保持，未迁移或发布。
App 在用 `i18n` 副本尚未切换，仍有双 writer，不能把局部删除当成完整迁移完成。

## 当前仓库边界与后续交付

Root 当前组合如下；各产品只通过 package 公共入口消费，不互相导入产品源码：

```text
Kokoro/
├── apps/kokoro-app/packages/ # App 当前消费的 i18n 与 tsconfig
├── apps/kokoro-mori/         # file: bridge 消费下方独立共享包
└── libs/kokoro-web-shared/
    └── packages/{web-core,i18n,tsconfig}
```

Root 通过 gitlink 组合独立子仓，不等于产品通过 submodule 嵌入共享源码。
独立共享仓库允许本地显式 `file:` package bridge；私有 registry、semver 与 lockfile 的版本化
发布仍是后续交付目标，不是当前已完成事实。App 切换与副本删除须先收敛唯一源码 owner，
逐个验证消费者，再停止双 writer；本轮只退役无消费者的本地 web-core，不切换在用 i18n 或发布包；App 六项额外严格编译检查保持。

## 包职责与提取规划

本仓实际包为 `i18n`、`tsconfig`；`web-core` 仅保留在独立共享仓，下表其余包及后续依赖图是提取规划，
不代表仓内已存在，不因规划创建空包或迁移现业务契约。

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

- App 保持当前 `private` workspace 消费；Mori 已消费独立共享仓库的三包，不再按单消费者
  或仅有已归档旧 workspace 判断。两份实现的 owner／交付收敛仍待完成。
- 保留 `@kokoro/i18n` 稳定包名，不为增加 `web-` 前缀制造无收益的重命名。
- 后续 App 切换须同步 manifest 与 lockfile，并验证公共入口后删除本仓副本；
  不以文档修改代替 package 迁移或 registry 发布。
- 迁移前必须保证 package 不依赖产品路径，并为每个公共入口提供 typecheck、unit test、
  changelog 和 semver 变更记录。
- 产品自己的布局、品牌文案、SEO、Logo、素材和 token preset 始终留在
  `kokoro-app/src/features`，不因为“方便复用”而抽进 shared package。
