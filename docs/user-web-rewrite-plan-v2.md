> **历史草案（已被当前基线取代）**：本文件中的 `SiteDefinition`、多 Site 构建选择和
> `SITE_ID` 不得作为实现依据。当前规则是一个产品一个独立仓库 `kokoro`；通用 package
> 迁移到独立的 `kokoro-web-shared` 后以 semver 消费。请以
> [`docs/site-repository-architecture-v2.md`](site-repository-architecture-v2.md)、
> [`docs/user-web-architecture-v2.md`](user-web-architecture-v2.md) 和
> [`docs/deployment.md`](deployment.md) 为准。

# Kokoro User Web 重写执行方案 v2

状态：已归档，仅供历史参考；当前 `kokoro` 子仓库已按后续 User Web 基线实现。

本文件不再作为实施计划。文中的多 Site / `SiteDefinition` / 旧目录结构均已废止；当前
实现只允许在本仓库内闭环，发布仓库为 `LordFoxFairy/kokoro-app`，通用 package 的迁移
以 `docs/site-repository-architecture-v2.md` 的现行规则为准。

## 0. 重要决策

本次不是继续修补当前页面，而是一次 UI 基座重写：

- 删除旧 SessionShell 页面布局、旧 rail/main/canvas 组合和旧 CSS Modules 皮肤。
- 只保留 backend clients、contract schemas、core reducers/projections、SSE engine、纯工具函数和测试 fixtures。
- 新 UI 从 shadcn primitives 组合，不建立旧布局的兼容层。
- 先完成架构基座和契约 mock，再迁移 feature；每一阶段都可以运行，但不允许新旧布局并存。

## 1. 目标目录

```text
src/
├── app/
│   ├── (public)/login/page.tsx
│   ├── (public)/shared/[id]/page.tsx
│   ├── (workspace)/app/page.tsx
│   └── api/                         same-origin BFF
├── components/
│   ├── ui/                          shadcn primitives
│   └── blocks/
│       ├── app-frame/
│       ├── workspace-rail/
│       ├── workspace-header/
│       ├── conversation-timeline/
│       ├── composer/
│       ├── context-panel/
│       └── overlay-stack/
├── features/
│   ├── runtime-config/
│   ├── conversations/
│   ├── workspace/
│   ├── settings/
│   ├── billing/
│   ├── library/
│   ├── skills/
│   └── team/
├── core/
│   ├── session/
│   ├── runtime-manifest/
│   ├── resource-state/
│   └── persistence/
├── data/
│   ├── bff/
│   ├── query/
│   └── error-mapping/
└── theme/
    ├── token-schema.ts
    ├── manifest-projector.ts
    └── theme-provider.tsx

packages/
├── web-core/                      跨 site 纯 TS 契约与状态
├── web-data/                      跨 site BFF/SSE/query 适配器
├── web-ui/                        shadcn primitives 与语义 token
├── web-blocks/                    可组合但不强制布局的 blocks
└── web-runtime/                   SiteDefinition 与 manifest 投影

sites/
└── kokoro/                        第一个 Codex-like site 的定制 surface
```

## 2. 阶段与交付物

### Phase 0：冻结设计与契约

交付：

- `docs/user-web-architecture-v2.md`
- route/surface registry
- manifest schema
- resource/action state schema
- first-site fixture contract
- backend contract gap list

停止条件：后端 agent 能根据 schema 明确知道需要哪些 manifest、session、billing、hub projection；前端不再自行猜字段。

### Phase 1：shadcn UI foundation

交付：

- `SidebarProvider/SidebarInset/Sheet`
- `CommandDialog`
- `ResizablePanelGroup`
- `Dialog/AlertDialog/Popover/DropdownMenu/Tooltip`
- `Card/Empty/Alert/Skeleton`
- semantic tokens、dark mode、focus/keyboard baseline
- Story/fixture page：展示所有 primitive 和状态

规则：这一阶段不接真实业务 API；先完成视觉和交互契约。

### Phase 2：Site surface 与 AppFrame

交付：

- 通用包只提供 block contract；当前独立 Site 仓库的 `src/features` 决定 Desktop 的 Rail + MainWorkspace + optional ContextPanel 排列
- Mobile：Rail Sheet + ContextPanel Sheet
- collapsed/expanded/keyboard/mobile behavior
- command menu
- workspace/user menu
- routeKey → registered feature projection

验收：Kokoro 空状态截图与 Codex-like 参考图对齐，首屏是空白工作画布 + 底部 Composer；另建一个不同布局 fixture，证明通用包没有把所有 site 锁成同一套页面。

当前已接入 `src/features/app/kokoro-command-menu.tsx`：使用 shadcn `CommandDialog`，统一承载新对话、作品、技能、连接和外观设置入口，并支持 `⌘/Ctrl+K`、Escape、键盘上下选择和移动端无溢出。

### Phase 3：Conversation/Composer

交付：

- session list、cursor loading、search、rename、delete
- timeline、markdown、process disclosure、tool rows
- Composer draft persistence、mode/model/agent/skill selector
- send/stop/steer/retry/reconnect/HITL
- task status bar

验收：normal、streaming、reconnecting、failed、awaiting approval、cancelled 六种状态都有 fixture 和浏览器回归。

### Phase 4：ContextPanel/Library/Share

交付：

- file/delivery/tool/task context panel
- desktop resizable third column
- mobile overlay and full screen
- download/preview/error
- library aggregate and source-session jump
- share create/copy/revoke/read-only page

验收：ContextPanel 不修改主区滚动语义；关闭后可重开；分享失败不伪造成功。

### Phase 5：Settings/Capability/Billing/Team

交付：

- settings command entry + Dialog
- account/appearance/chat/credits/subscription/skills/mcp/library/team
- System navigation and feature flag projection
- IAM capability/permission projection
- billing error/empty/loading states
- team switch and tenant context refresh

验收：切换租户/团队后 manifest、导航、会话和权限状态不会串租户。

### Phase 6：Public surfaces and skins

交付：

- login / magic-link
- shared read-only page
- marketing shell
- first-site manifest skin
- 9 locale coverage
- asset/logo fallback

验收：public surface 不加载 workspace session；不同 host 只改变 manifest 皮肤，不复制前端代码。

### Phase 7：删除旧实现

删除：

- 旧 SessionShell layout
- 旧 session-rail/main/canvas CSS 组合
- legacy token/alias/mapping
- duplicate button/modal/dropdown implementations
- 旧 mock naming and implicit preview fallback

保留：

- backend clients/contracts
- core reducer/projection
- tests rewritten against new blocks
- explicit `/app` preview transport and `/preview/marketing` marketing fixture

## 3. 后端配合清单

### IAM agent

必须提供/确认：

- Host → tenant binding BFF contract
- session/auth/logout/refresh contract
- current actor + organization + capability projection
- team switch response 中的 context version
- permission error mapping
- command idempotency/replay/version conflict
- tenant A/B 同邮箱隔离验收

IAM 不新增：menu、theme、i18n、site UI skin 表。

### System agent

必须提供/确认：

- Runtime Manifest schema version
- navigation entry schema：`routeKey/labelKey/iconKey/capabilityKey/order/visibility`
- semantic theme token schema
- locale namespace/version/digest
- feature flag/rollout projection
- asset reference and fallback rules
- `surface_id` precedence and cache identity

System 不新增：用户身份、Session、Payment、Credit、Hub 事实表。

### Session/Agent agent

必须提供/确认：

- snapshot/event schema
- message/run/tool/HITL state machine
- file/delivery/task projection
- reconnect/last-event-id behavior
- command replay/version conflict/error envelope
- BFF SSE backpressure and close semantics

### Billing/Hub/Team agents

统一要求：

- BFF-only Web contract
- stable resource/action state mapping
- `request_id/command_id`
- loading/empty/error/permission fixtures
- 不把 service-private model 暴露给浏览器

## 4. 前后端契约形状

### Runtime manifest

```ts
type RuntimeManifest = {
  product: { id: string; version: string }
  surface: { id: string; releaseId?: string }
  navigation: NavigationEntry[]
  locale: { code: string; namespaces: string[]; digest: string }
  theme: ThemeTokens
  features: FeatureEntry[]
  assets: AssetReference[]
  configVersion: string
  digest: string
}
```

浏览器响应中不包含 tenant identity；BFF 在服务端保存 context。

### Navigation

```ts
type NavigationEntry = {
  routeKey: string
  labelKey: string
  iconKey: string
  capabilityKey?: string
  order: number
  visibility: "visible" | "hidden" | "disabled"
}
```

前端只允许 `routeKey` 命中本地 registry。System 不可以直接返回 URL、组件名或 HTML。

### Resource/action state

```ts
type ResourceState<T> =
  | { kind: "idle" | "loading" }
  | { kind: "ready"; data: T }
  | { kind: "empty" }
  | { kind: "error"; code: string; requestId?: string; retryable: boolean }
  | { kind: "forbidden" }
  | { kind: "unavailable"; requestId?: string }
```

```ts
type ActionState<T = unknown> =
  | { kind: "idle" }
  | { kind: "submitting"; commandId: string }
  | { kind: "success"; data?: T; replayed?: boolean }
  | { kind: "error"; code: string; requestId?: string; retryable: boolean }
```

## 5. CSS/组件重写规则

1. 先由 shadcn primitive 决定交互和 variant，再写布局。
2. CSS Module 只写 grid/flex/尺寸/文本截断/响应式和 manifest skin 插槽。
3. 不在 CSS Module 重写 `hover/focus/disabled/portal/overlay/keyboard`。
4. 不使用 `rgba/hex` 作为 feature 私有颜色；只能使用 semantic token。
5. 不使用 `linear-gradient/radial-gradient/box-shadow` 模拟产品身份；需要 elevation 时使用 shadcn surface/标准 shadow。
6. 所有 icon-only button 必须有 aria-label；所有菜单必须支持 Escape、方向键和 focus return。
7. 所有 responsive breakpoint 由 `useIsMobile` 与 CSS 同一常量导出，禁止各模块自定义断点。
8. 新功能不得直接编辑旧 SessionShell；必须进入新 block/feature 层。

## 6. 验收矩阵

| Surface | Desktop | Mobile | Dark | i18n | Error/Empty | Keyboard |
|---|---:|---:|---:|---:|---:|---:|
| AppFrame/Rail | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Empty workspace | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Conversation/Composer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ContextPanel | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Settings | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Login | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Billing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Shared page | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

断点：390、768、960、1440；每个 surface 至少一张稳定截图、一条用户路径和一条错误路径。

## 7. 当前动作

1. 已把 `AppFrame` 提升为 User Web 的唯一工作区入口，路由通过 `components/blocks/app-frame` 接入。
2. 旧 `SessionShell`、`SessionRail` 文件及其 CSS 已删除；AppFrame 的页面级 CSS 已迁移到 `components/blocks/app-frame/app-frame.module.css`，后续新 UI 只在 blocks/features 下演进。
3. `WorkspaceRail`、`WorkspaceHeader` 和 `ContextPanel` 作为跨领域装配块；`ConversationThread` 与 `Composer` 作为领域组件由 AppFrame 直接组装。功能域内部不得重新引入旧 shell/rail 布局文件或无行为转发壳。
4. 每一批迁移后执行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 和 Playwright 视觉回归。
