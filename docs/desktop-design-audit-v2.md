# Kokoro User Web Desktop Design Audit v3

> **几何基线 v201（2026-08-31）**：宽桌面展开 rail 的默认宽度为 `300px`，显式收起态为
> `52px` 图标轨道。fine-pointer 的窄桌面（CSS viewport `<=768px`）不保留 `48px/52px` 空白轨道，
> 而是隐藏 rail、gap、container 和 seam；Header 的单一 navigation trigger 打开同一份完整 rail。
> 窄桌面仍是 Web 工作台，不切换手机 Sheet；项目主轴/上下文轴继续按当前可用空间布局，不得因隐藏
> rail 把项目错误改成手机单栏。

日期：2026-08-27

范围：`kokoro` 的桌面 User Web `/app`。本次不审计 App 端、手机端、Admin Web，也不把 preview fixture 作为产品入口。

## 结论

可以做到 Manus 级别的工作台体验，但目标不是复制 Manus 的私有源码、DOM 或 CSS，而是复用其公开可见的产品结构：项目上下文是页面骨架，Composer 是唯一主操作，任务状态是持续可见的工作流反馈，面板展开不会改变整体定位。

当前实现已经收敛为一套基于 shadcn/Radix 的桌面 User Web 工作台。Kokoro 只提供品牌、文案、能力和业务数据；共享 shell 负责布局、间距、状态和交互，项目页的站点 CSS 只负责内容排列与语义 token。

## 本轮已落地

- 删除 3 个零引用的旧/未接入模块：`components/ui/breadcrumb.tsx`、`components/ui/marker.tsx` 和 `contract/event-names.ts`；`components/ui/bubble.tsx` 仍由聊天消息组件使用，因此保留。预览、认证兼容和移动专用代码也继续保留，因为它们仍有路由、契约或测试调用。
- 桌面结构收敛为共享 shell、项目头部、Composer、上下文模块和任务区；直接会话则是独立聊天空状态。
- Composer、Sidebar、Resizable、Dialog、Card、Empty、DropdownMenu 和 Tooltip 均使用 shadcn/Radix 基元，不再保留旧页面布局的兼容 class 或映射层。
- 任务从单色圆点升级为 engine phase 的 `queued/running/waiting/completed/failed` 投影，并显示可读状态文案。
- Kokoro 首站桌面默认使用 Manus 风格 rail；宽桌面可通过展开按钮、拖拽分隔条或键盘调整宽度，偏好由 shadcn Sidebar cookie 记录；窄桌面只临时隐藏 rail track，并由 Header trigger 进入同一导航。
- 项目能力按 runtime manifest 门禁渲染；未声明的能力不伪造可执行入口。
- 首次提交后的 welcome → thread 交接保持 Composer 语义、焦点和滚动边界稳定。
- 本次只处理 User Web 桌面 surface；Admin、App 和手机 surface 不在改造范围。
- 当前全量测试、lint、typecheck 和 build 均作为交付门槛执行。

最新截图：

- `.playwright-cli/page-2026-08-27T14-15-50-100Z.png`（项目窄桌面 800 × 674）
- `.playwright-cli/page-2026-08-27T14-16-01-803Z.png`（直接会话 1280 × 720）
- `.playwright-cli/page-2026-08-27T14-11-18-527Z.png`（项目宽桌面 1280 × 720）

### 直接会话首页同视口复核（2026-08-28）

使用同一已登录桌面浏览器固定 `1280 × 720`，分别截取 Manus 与 Kokoro 首页，避免旧截图
尺寸不一致造成误判。rail 均为 `52px`；Kokoro Composer 为 `(282, 289.8)`、
`768 × 120`，与参考视觉起点约 `2px`。快捷入口首项为 `y=429.8`，与参考约 `2px`。

本轮确认旧实现的主要差异不是 Composer，而是推荐 banner 使用 `12.8125rem` 大间距，
导致其比参考低约 `113px` 并被 720px 视口截断。间距改为 `5.75rem` 后，banner 几何为
`(396, 561.8)`、`540 × 98`，参考视觉起点约 `y=563`。旧 CSS 显示器占位同时替换为
站点自有的 `120 × 72` 游戏创作位图，并将九种语言的推荐内容统一为游戏创作主题。

归档证据：

- `output/playwright/home-reference-current/manus-home-1280x720.png`
- `output/playwright/home-reference-current/kokoro-home-before-1280x720.png`
- `output/playwright/home-reference-current/kokoro-home-after-spacing-1280x720.png`
- `output/playwright/home-reference-current/kokoro-home-banner-final-1280x720.png`

### 折叠 rail footer 封板（2026-08-28）

`1280 × 720` 同视口测量确认参考 rail 底部依次为设备、通知、账户。两个 utility hit target
分别是 `(10, 608)` 与 `(10, 644)`、尺寸 `32 × 32`；内部图标分别位于 `(17, 615)` 与
`(17, 651)`、尺寸 `18 × 18`；账户 trigger 为 `(10, 680)`、`32 × 32`，头像为
`(12, 682)`、`28 × 28`。

旧 CSS 最后一组覆盖把账户放在前面，并把设备/通知压成 `y=696` 的横排，720px 视口内只剩
一部分。现在组件使用稳定 utility wrapper，顺序和上述几何完全一致；折叠态隐藏零宽账户文字，
不再让 shadcn 的 `gap-2` 把头像向左挤出中心线。重复的四组 collapsed footer CSS 已合并为
唯一契约，避免后续级联重新反转顺序。

归档证据：

- `output/playwright/rail-reference-current/manus-rail-1280x720.png`
- `output/playwright/rail-reference-current/kokoro-rail-sealed-1280x720.png`

### Connector 目录同视口封板（2026-08-28）

本轮使用同一个浏览器标签在 Manus 与本地页面之间切换，固定 CSS viewport 为
`786 × 674`，避免浏览器缩放、侧栏占宽或不同窗口尺寸造成伪差异。Connector 目录的
外框、标题、搜索、tab、创建按钮、卡片网格和空状态逐项对照，不以代码结构或测试通过
替代视觉证据。

| 几何项 | Manus | Kokoro | 结论 |
| --- | --- | --- | --- |
| 目录外框 | `746.70 × 640`，视觉起点约 `(19.65, 17)` | `746.70 × 640`，起点 `(19.65, 17)` | 对齐 |
| 搜索壳 | `(43.66, 82.85)`，`698.70 × 36` | `(43.65, 83)`，`698.70 × 36` | 最大偏差 `0.15px` |
| tab 工具行 | `y=130.85`，`h=32` | `y=131`，`h=32` | 最大偏差 `0.15px` |
| 创建按钮 | `(678.35, 130.85)`，`64 × 32` | `(678.35, 131)`，`64 × 32` | 几何对齐 |
| Connector 卡片 | 双列、单卡 `343.34 × 76`、间距 `12` | 双列、单卡 `343.34 × 76`、间距 `12` | 对齐 |

视觉修正包括：目录打开后不再自动聚焦搜索框；未聚焦搜索壳不显示多余描边；创建按钮
使用与参考一致的 `1px` 内缩 outline；用户主动点击或键盘聚焦搜索时仍保留清晰焦点反馈。

归档证据：

- `output/playwright/connectors/manus-app-current-786x674.png`
- `output/playwright/connectors/kokoro-app-sealed-786x674.png`
- `output/playwright/connectors/manus-custom-api-786x674.png`
- `output/playwright/connectors/kokoro-custom-api-786x674.png`
- `output/playwright/connectors/manus-custom-mcp-786x674.png`
- `output/playwright/connectors/kokoro-custom-mcp-786x674.png`
- `output/playwright/connectors/manus-project-786x674.png`
- `output/playwright/connectors/kokoro-project-786x674.png`

本轮质量门禁：`pnpm lint`、`pnpm typecheck`、Connector/i18n 聚焦测试 `23/23` 通过。

### Skills 设置与浏览目录封板（2026-08-28）

Skills 不再沿用旧的两张大卡片和 scope badge 布局。设置页现在是独立的已新增技能目录：
搜索、四个 scope 筛选、双列定高卡片、三行摘要、更新时间和启停开关分别由稳定组件承担；
“浏览技能”打开第二层 Skills Catalog，“创建”使用四来源下拉菜单，上传预检流程继续复用现有
Hub 能力。

固定 `786 × 674` 的设置页几何：

| 几何项 | Manus | Kokoro | 结论 |
| --- | --- | --- | --- |
| 内容标题 | `(278, 67.70)`，`451 × 30` | 同内容轴与字号 | 对齐 |
| 技能搜索 | `(278, 138.70)`，`200 × 32` | `(278, 138.70)`，`200 × 32` | 对齐 |
| 全部筛选 | `(278, 182.70)`，`52 × 36` | `(278, 182.70)`，`52 × 36` | 对齐 |
| 首张技能卡 | `(278, 230.70)`，`219.5 × 135` | 同起点、同高度；双列间距 `12` | 对齐 |

Skills Catalog 使用自己的弹窗节奏，未错误复用 Connector 的 `64px/36px` 标题和搜索：

| 几何项 | Manus | Kokoro | 最大偏差 |
| --- | --- | --- | --- |
| 弹窗 | `(19.66, 16.85)`，`746.70 × 640.30` | `(19.65, 17)`，`746.70 × 640` | `0.30px` |
| 搜索 | `(43.66, 76.85)`，`698.70 × 32` | `(43.65, 77)`，`698.70 × 32` | `0.15px` |
| 创建按钮 | `(678.35, 120.85)`，`64 × 32` | `(678.35, 121)`，`64 × 32` | `0.15px` |
| 首张目录卡 | `(43.66, 164.85)`，`343.34 × 135` | `(43.65, 165)`，`343.34 × 135` | `0.15px` |

交互验证覆盖：目录搜索、官方/第三方切换、添加按钮到完成标记、关闭目录后主列表开关同步、
创建菜单四个来源和已启用/未启用状态。`SkillCard` 新增可选 `enabled`、`updated_at`，旧响应仍可
解析；正式值由 BFF 返回，preview fixture 才提供本地日期。契约已更新到
`docs/integration/user-web-api-contract-v4.md`，并明确浏览器不提交可信 `tenant_id`；域名上下文由
服务端 RFC 7239 `Forwarded` 承载。

归档证据：

- `output/playwright/skills/manus-stable-786x674.png`
- `output/playwright/skills/kokoro-final-786x674.png`
- `output/playwright/skills/manus-create-menu-786x674.png`
- `output/playwright/skills/kokoro-create-menu-786x674.png`
- `output/playwright/skills/manus-browse-stable-786x674.png`
- `output/playwright/skills/kokoro-browse-fixed-786x674.png`
- `output/playwright/skills/kokoro-narrow-desktop-751x674.png`

本轮质量门禁：`pnpm lint`、`pnpm typecheck`、Skills/Settings/i18n 聚焦测试 `40/40` 通过。

截图复核结果：宽桌面与 Manus 项目参考保持两栏几何关系；窄桌面上下文流进入同一内容轴；三种状态均无横向溢出，项目区可继续纵向滚动。

## 截图基线

当前版本截图：

| 视口 | 文件 | 观察 |
|---|---|---|
| 1280 × 720 | `tmp/design-audit/kokoro-1280x720.png` | 首屏底部任务区被视口截断，工作区处于高密度状态 |
| 1440 × 900 | `tmp/design-audit/kokoro-1440x900.png` | 内容能完整显示，但空白区域偏大，模块之间像独立卡片 |
| 1728 × 1117 | `tmp/design-audit/kokoro-1728x1117.png` | 主区继续横向拉伸，视觉重心变薄，项目内容缺少最大宽度策略 |

用户提供的 Manus/Kokoro 对比图作为参考基线：

- Manus 项目页：项目身份、Composer、指令、连接器、文件资源、技能和任务沿同一条上下文流组织。
- Kokoro 当前页：侧栏、顶部模型栏、项目头部、Composer、四个圆角卡片和任务区同时争夺层级。

## 区域差异

严重级别：P0 表示会让用户误判产品结构或交互状态；P1 表示明显影响 Manus 级体验；P2 表示细节 polish。

### P0：桌面入口仍保留旧首屏思想

旧版本曾在 `kokoro-welcome.module.css` 中同时保留 `.content/.heading/.scenarios` 与桌面 Workbench 规则，导致两套结构共同参与级联。

**修复：** 桌面 User Web 建立单一结构：`workspace-shell → project-header → composer → context-flow → task-feed`。直接会话和项目工作区由路由选择不同的站点内容组件，不共享旧首屏结构，也不靠兼容 CSS 覆盖。

### P1：侧栏与主区重复表达身份

侧栏已经显示 Kokoro、Personal workspace 和当前 Chats；主区再次显示 Kokoro、Personal workspace、Workspace status；顶部又显示 Kokoro 1.0。Manus 的项目页把产品身份、项目身份和模型/计划操作分成更明确的层级。

**修复：**

- rail 只承担导航和当前工作区切换；
- 顶部只承担产品/模型和全局动作；
- 项目头部只承担项目名称、创建者、更新时间；
- 移除主区里的 `Workspace status` 伪元信息，改成真实项目元数据或不展示。

### P1：Composer 的主操作权还不够强

当前 Composer 外形已经接近目标，但上下方都有大面积独立卡片，Composer 与上下文区域的关系被边框切碎。Manus 的 Composer 是项目工作流的核心，输入区更大，底部能力入口更紧凑，提交按钮状态更明确。

**修复：**

- Composer 保留一个稳定的最小高度和底部工具行；
- 输入、附件、连接器/能力、模式、提交状态归为一个 shadcn surface；
- 禁止在 Composer 外再创建包裹它的白色背景带；
- `idle/running/disabled/error` 都使用明确的 icon、label、aria 状态；
- 首次提交后保持同一 Composer 位置语义，只改变它从欢迎态到线程态的状态。

### P1：上下文模块像卡片列表，不像项目上下文流

当前 Instructions、Connectors、Files and resources、Skills 都是相互分离的大圆角白卡片，视觉上更像设置页。Manus 的这些模块是低噪声的项目上下文区，展开内容与标题行共享一个连续容器。

**修复：** 使用一个 `ContextFlow` 容器，内部模块采用稳定的分隔线、统一行高和 shadcn `Collapsible`；只在需要表达边界时使用卡片/背景，不给每一行叠加独立阴影。默认展开规则由 capability manifest 决定，未声明的能力不渲染。

### P1：任务区没有工作流状态模型

当前任务列表只有标题和一个相同颜色的圆点，无法表达 queued、running、waiting、completed、failed。Manus 的任务区是项目历史和当前工作状态的核心反馈。

**修复：** 前端先定义 `TaskProjection`，只投影 Session/SSE 已有状态，不猜状态：

```ts
type TaskStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"

type TaskProjection = {
  id: string
  title: string
  status: TaskStatus
  updatedAt: string
  artifactCount?: number
}
```

状态必须有文本或可访问名称，不能只靠颜色。failed 提供 retry，waiting 提供继续处理入口，completed 提供 artifact 摘要。

### P1：桌面宽度策略不够稳定

1280 下主区已经接近可用，但 1728 下内容线性铺开，导致输入区和上下文区显得过宽，视觉重心下降。Manus 使用随视口增长的工作区，但内容仍有可读性上限。

**修复：** shell 继续全宽，主区内部使用 `minmax(0, 1fr)` 与明确的 `--workspace-content-max`；Composer 可比正文宽，但不能无限拉伸；项目上下文采用同一内容线，避免每个模块单独决定宽度。

建议初始 token：

```css
--rail-width: 17.5rem;
--workspace-gutter: clamp(1.5rem, 3vw, 4rem);
--workspace-content-max: 70rem;
--composer-max: 70rem;
--context-max: 70rem;
```

### P2：动效与展开反馈仍需统一

当前部分组件使用 Radix 状态，部分使用 CSS 自定义动画，rail、Composer、Collapsible 的节奏未形成统一编排。展开/收起应该只影响内容区域，不改变标题行、按钮位置和 Composer 的水平定位。

**修复：** 统一使用现有 `--motion-*` 和 `--ease-standard`；Collapsible 只做高度/透明度过渡；线程交接只对主区内容做一次短 entrance；rail resize 时禁止所有跟随动画。所有动效覆盖 `prefers-reduced-motion`。

### P2：顶部操作的语义不清

当前右上角 Free plan、Upgrade、礼物图标与 Manus 项目页的分享、更多操作不同，且首屏顶部同时承载模型选择和计划信息。

**修复：** 先按能力拆分：模型选择属于 Composer/运行配置，项目级分享和更多操作属于项目头部；余额/套餐属于全局账户菜单。没有后端能力时不渲染伪造按钮。

## 交互验收问题

下一轮实现前必须回答并在测试中固定这些问题：

1. 项目指令点击 Edit 后，是打开真实 System 配置面板，还是只编辑当前会话的临时指令？保存失败时如何回显？
2. Tasks 的 `waiting` 是否对应 Session 的 HITL 状态？继续操作是否复用现有 control API？
3. Files and resources 的数据源是 artifact library、项目级 storage，还是两者的组合？删除/替换是否需要确认？
4. Connectors 和 Skills 是否由 capability manifest 决定显示，还是 User Web 首站固定显示？
5. 项目名称、创建者、更新时间由哪个后端契约提供？当前 `Personal workspace · Workspace status` 不能作为长期字段。
6. 侧栏是否需要保留 Teams、Balance 等全局入口，还是在第一个 site 皮肤中由站点 manifest 配置？
7. 线程页和欢迎页是否必须使用同一 Composer 组件实例，以避免交接时焦点和尺寸跳变？
8. 1280 × 720 的验收最低目标是“任务区可滚动完整查看”，还是“首屏必须看到任务标题”？需要在产品上定一个固定标准。

## 实施顺序

1. 删除桌面旧首屏结构和覆盖式 CSS，建立单一 `DesktopWorkbench` 结构。
2. 固定 shell、rail、topbar、content gutter 和 max-width token。
3. 重组 Composer 与 ContextFlow，统一 shadcn primitives 和状态。
4. 将 TaskProjection 接到 Session snapshot/SSE，补齐状态 UI。
5. 接入 System capability manifest，入口按能力渲染。
6. 用 Playwright 固定 1280 × 720、1440 × 900、1728 × 1117 的截图和交互回归。

## 外部参考

公开 Manus Projects 资料强调 Project 以共享的 instructions、knowledge 和 tools 组织任务上下文，而不是把每个能力变成孤立设置入口：[Manus Projects](https://www.manus.im/blog/manus-projects)。这与本审计中的 `ContextFlow` 和 `TaskProjection` 方向一致。

## v3 深度复核（2026-08-26）

### 本轮发现并修复

1. **P0：旧营销内容重新进入桌面文档流。** `desktopWeb` 现在只挂载 `KokoroDirectChatWelcome` 或 `KokoroProjectWorkspace`；旧场景结构不参与桌面 Web 文档流。
2. **P1：工作区模块缺少能力门禁。** `WorkspaceCapabilities` 已从 `AppFrame` 投影到 site-owned empty state。支持 `workspace.*` 和 `project.*` feature flag；显式关闭时整块模块不渲染，不展示会落空的 disabled 入口。
3. **P1：桌面样式来源不唯一。** `kokoro-welcome.module.css` 的桌面 media block 已删除，桌面 workbench 的布局、上下文流、任务状态和动画只由独立 CSS Module 管理。
4. **P1：live capability 的默认语义不安全。** 当 `featureFlags` 被 runtime manifest 明确传入时，未声明的工作区模块现在默认关闭；只有预览模式未传入 manifest 时才使用完整 fixture。这样不会把前端 mock 当成后端已提供的能力。
5. **P1：上下文流与 Manus 项目页的卡片语法不一致。** 原实现把所有模块包成一个大容器，层级过重且展开边界不清；现在改为同一内容线上的独立 shadcn-style cards，标题面、内容面和卡片间距稳定。
6. **P2：Composer 缺少已闭合资源入口。** 现在由 runtime resources/connectors capability 注入桌面“文件和资源”和“连接器”按钮，分别进入现有 Library/MCP 设置，不在手机端改变工具行。
7. **P2：Collapsible 展开高度瞬间跳变。** 现在使用 Radix `--radix-collapsible-content-height` 做高度、透明度和位移编排，并在 reduced-motion 下完全关闭动画。

### 截图复核

| 视口 | 截图 | 结果 |
| --- | --- | --- |
| 1280 × 720 | `tmp/design-audit/v3/kokoro-1280x720-fixed.png` | 无横向滚动；任务区按页面高度自然截断，可继续滚动 |
| 1440 × 900 | `tmp/design-audit/v3/kokoro-1440x900-fixed.png` | 旧欢迎标题消失；Composer、ContextFlow、Task feed 保持同一内容线 |
| 1728 × 1117 | `tmp/design-audit/v3/kokoro-1728x1117-fixed.png` | rail 与主区关系稳定；内容不因大屏再次引入旧营销区 |

本轮卡片层级复核：`tmp/design-audit/v5/kokoro-manus-aligned-1280x720.png`、
`tmp/design-audit/v5/kokoro-manus-aligned-1440x900.png`、
`tmp/design-audit/v5/kokoro-manus-aligned-1728x1117.png`。

Playwright 运行时检查：`document.documentElement.scrollWidth === clientWidth`；桌面旧内容不可见，workbench 可见。

### 交互回归

- 展开 rail：主区内容线随剩余宽度重排，分隔条仍为单一可见 seam，焦点留在 rail trigger。
- 首次发送：welcome workbench 替换为 thread surface，Composer 保持在底部并自动获得焦点；本轮 mode 锁定，最近会话同步出现。
- 线程态：标题、分享入口、消息时间线和 Composer 使用同一桌面 shell，不重新挂载旧 welcome 内容。

交互截图：`tmp/design-audit/v4/kokoro-expanded-1440x900.png`、`tmp/design-audit/v4/kokoro-thread-1440x900.png`、`tmp/design-audit/v5/kokoro-manus-aligned-1440x900.png`、`tmp/design-audit/v7/kokoro-composer-actions-1440x900.png`。
展开回归截图：`tmp/design-audit/v6/kokoro-expand-smooth-1440x900.png`。

### 仍需后端/产品确认的问题

1. `workspace.instructions` 的最终服务归属仍由后端架构决定；User Web 已在 v94 按 Project BFF
   契约完成 GET/PATCH 水合与保存，不再是组件本地临时状态。
2. `workspace.resources` 的数据源是否统一为 System artifact/library，还是同时包含 Storage 文件？前端不应在契约未定前显示删除、替换等动作。
3. `workspace.connectors` 是否只表示 Hub MCP，还是包含未来外部连接器目录？需要固定 capability key 和权限语义。
4. `workspace.tasks` 任务列表是否由 Project API 提供，还是继续由 Session conversation 投影？当前列表仍是会话投影，服务端任务状态接入后需要替换 adapter。
5. 本地未配置 System 时 `/api/system/runtime-manifest` 返回 503，真实认证页面进入配置不可用态；未认证 `/app` 使用显式 preview transport。不能把 fixture 当成真实 live 配置。

### 验证结果

```text
pnpm typecheck  passed
pnpm lint       passed
pnpm test       685 passed
```

## v4 窄桌面复核（2026-08-26）

### 用户截图与本地复现的差异

用户在 Codex 右侧分屏中打开 User Web 时，页面 CSS viewport 实际为约 `786px`，并不是之前审计使用的 1280/1440 桌面视口。旧实现把 `960px` 以下统一路由到移动壳；移动分支的 `workspace` 子项又没有 `flex: 1`，导致主面板按内容宽度收缩到约 `199px`，右侧出现大块空白，旧营销首屏内容重新进入可见文档流。

### 本轮修复

1. `AppFrame` 增加站点级 `desktopWeb` surface 契约；Kokoro User Web 在窄桌面窗口仍使用桌面 Workbench、icon rail 和 Resizable 主区，不改变其他站点的手机路径。
2. `SidebarProvider` 支持 `forceDesktop`，避免 shadcn Sidebar 在同一视口再次切换到移动 Sheet。
3. 桌面 Workbench CSS 不再被 `min-width: 961px` 包住；Kokoro 的桌面皮肤在受控 desktop surface 内始终使用同一套 CSS Module。
4. 桌面 surface 隐藏重复的移动头部；主区和上下文流使用同一内容线，旧桌面 CSS 不再加载。
5. 新增窄桌面回归测试，锁定 `800px` 视口仍渲染 Composer 和桌面 rail 分隔条。

### 截图复核

| 视口 | 截图 | 结果 |
| --- | --- | --- |
| 786 × 674 | `tmp/design-audit/v8/kokoro-narrow-desktop-786x674.png` | 主区不再收缩到 199px；移动头部不重复出现 |
| 1280 × 720 | `tmp/design-audit/v8/kokoro-desktop-1280x720.png` | icon rail、Composer、ContextFlow 维持同一布局 |
| 1440 × 900 | `tmp/design-audit/v8/kokoro-desktop-1440x900.png` | 内容最大宽度稳定，无横向溢出 |

### 仍需产品确认的问题

1. 786px 这类 Codex 分屏视口，首站默认应保持展开 rail，还是首次进入自动使用 icon rail；当前遵循已持久化的 Sidebar cookie。
2. `workspace.instructions` 保存仍是本地临时状态；System workspace-context 的 PATCH 契约落地后再替换 adapter。
3. 当前任务区仍由 Session conversation 投影；独立 Project/Task API 落地后需要接入真实状态时间线。

## v5 Canvas 分栏复核（2026-08-26）

### 根因

窄桌面窗口的 React 分支已经是 `desktopWeb`，但 Canvas 组件内部仍有两处独立的移动判断：

1. `ContextPanel` 只读取 `useIsMobile()`，没有继承站点的桌面 Web 契约，因此把 Canvas 渲染成 Sheet。
2. `canvas-panel.module.css` 的 `@media (max-width: 960px)` 仍把 `.panel` 设置为 `position: absolute`；即使 React 进入 Resizable 分栏，视觉上仍会覆盖整个工作区。

### 修复

- `desktopWeb` 作为显式 Canvas contract 从 `AppFrame` 传入 `ContextPanel`，窄窗口不再使用 Sheet。
- 窄桌面打开 Canvas 且展开 rail 会造成主区与 Canvas 最小宽度冲突时，桌面 Web 自动收起 rail 到 icon rail；Canvas 关闭后恢复原 rail 状态。
- Canvas 打开期间监听 shell 尺寸变化，宽度从宽变窄时同样执行约束；从窄变宽不擅自展开 rail，避免用户当前工作区发生突变。
- 为 `.desktopPanel` 增加窄视口 CSS 覆盖，保证非全屏 Canvas 保持 `position: static`；真正的全屏态仍由 `data-fullscreen` 使用 absolute 层。

## v6 全屏与 2K 自适应复核（2026-08-26）

### 验证范围

本次只验证 User Web 桌面 surface `/app`，没有进入 App、手机端或 Admin。页面使用真实浏览器在以下 CSS viewport 下复核：

| 视口 | 结果 | 重点观察 |
| --- | --- | --- |
| 786 × 674 | 通过 | 仍是桌面 Web；rail、主区和 Composer 没有切换到手机 Header/Sheet |
| 1280 × 720 | 通过 | rail 固定，主区内容线稳定，Composer 不横向溢出 |
| 1440 × 900 | 通过 | Composer 随剩余主区宽度收缩，内容没有突破 rail 或产生横向滚动 |
| 1920 × 1080 | 通过 | 内容线保持 70rem 上限，避免大屏无限拉伸 |
| 2560 × 1440 | 通过 | shell 仍全屏铺开，正文保留可读宽度，不产生横向/纵向页面溢出 |

### 关键布局契约

- `SidebarProvider` 是全屏 shell，使用 `height: 100dvh`、`min-height: 0` 和 `overflow: hidden`；大屏增加的是工作区余量，不会改变三列层级。
- rail 是固定左列，主区和 Canvas 通过 shadcn `ResizablePanelGroup` 管理剩余宽度；内容区域使用 `width: min(70rem, 100%)`，Composer、项目头部、上下文流共享同一内容线。
- `desktopWeb` 是站点 surface 契约，不由 viewport 猜测。窄桌面仍使用桌面 rail、紧凑 shadcn controls 和 Canvas 分栏；手机路径没有被修改。
- rail 与 Canvas 拖拽期间同步锁定过渡，并由单一 seam 绘制分隔线；避免浏览器缩放或边界钳制时出现双线、跟手延迟和相邻列错位。
- 共享 shadcn 的触控尺寸规则在 `desktopWeb` shell 内只恢复桌面紧凑高度；这不改变全局组件，也不污染手机端。

### 截图与控制台

真实浏览器截图保存在本次 Playwright 会话目录：

- `.playwright-cli/page-2026-08-26T11-47-33-733Z.png`（1280 × 720）
- `.playwright-cli/page-2026-08-26T11-48-08-879Z.png`（1920 × 1080）
- `.playwright-cli/page-2026-08-26T11-48-55-440Z.png`（2560 × 1440）
- `.playwright-cli/page-2026-08-26T11-49-23-948Z.png`（786 × 674）
- `.playwright-cli/page-2026-08-26T11-51-04-829Z.png`（1440 × 900）

在 1440 × 900 的最终页面检查中，`document.documentElement.scrollWidth === clientWidth`，控制台 Error 数为 `0`。浏览器缩放验证使用相同的桌面契约：布局尺寸以 CSS px、`minmax(0, 1fr)`、`min()` 和 `clamp()` 约束，不依赖固定 viewport 像素或移动分支切换。

### 工程验证

```text
pnpm lint       passed
pnpm typecheck  passed
pnpm test       82 files / 693 tests passed
pnpm build      passed
```

## v7 Manus 工作台重写（2026-08-26）

### 当前权威实现

桌面 User Web 已从旧首屏结构切换为单一 Manus 风格项目工作台。当前权威实现由共享 shell 和站点适配器组成：

- `src/components/blocks/app-frame/app-frame.tsx`：桌面 Web shell、Resizable 主区、Canvas、Settings 和会话状态装配。
- `src/components/blocks/app-frame/app-frame.module.css`：shell 几何、rail/Canvas 分隔条、桌面 Web token 和全屏约束。
- `src/features/app/kokoro-welcome.tsx`：直接会话空状态；桌面首屏只保留聊天 Composer 与场景快捷入口。
- `src/features/app/kokoro-project-workspace.tsx`：只负责项目工作区装配、任务列表和能力回调。
- `src/features/app/project-identity.tsx`：项目身份块，独立维护图标、标题和副标题基线。
- `src/features/app/project-task-empty.tsx`：任务空状态块，独立维护空状态图标和文案基线。
- `src/features/app/project-context-card.tsx`：文件资源、技能、网站、定时任务等上下文卡片的统一 shadcn 结构。
- `src/features/app/kokoro-project-workspace.module.css`：项目页唯一站点布局 CSS；宽屏使用右侧上下文栏，窄桌面 Web 进入单列上下文流。
- `src/components/blocks/workspace-rail/workspace-rail.tsx`：桌面 rail 的导航、项目入口、直接会话列表和账户操作。
- `src/components/ui/*`：所有交互基元来自 shadcn/Radix，站点 CSS 只负责布局和语义 token，不复制组件行为。

旧的 `src/components/blocks/desktop-app-rail/*` 已删除。它没有任何运行入口，且会与
`WorkspaceRail` 形成重复导航；当前桌面 Web 只保留一套 shadcn Sidebar/WorkspaceRail 组合。

### 视觉基线

| 视口 | 截图 | 结果 |
| --- | --- | --- |
| 786 × 674 | `.playwright-cli/page-2026-08-26T12-04-59-911Z.png` | 桌面 Web shell、rail、主内容线完整，旧手机 Header 未出现 |
| 1440 × 900 | `.playwright-cli/page-2026-08-26T12-02-08-716Z.png` | Manus 风格项目工作台，连续上下文列表，无旧首屏 |
| 2560 × 1440 | `.playwright-cli/page-2026-08-26T12-05-33-598Z.png` | shell 全屏铺开，正文保留可读宽度，无横向溢出 |

这一版的结构基线以 Manus 项目页的可见语义为准：左 rail 是工作导航，主区顶部是模型/全局动作，项目区依次为项目身份、启动任务 Composer、上下文模块和任务。浏览器宽度变化只改变内容流的组织方式，不切换到手机壳，也不加载旧页面布局。

### v8 窄桌面上下文流修复（2026-08-27）

实测发现 800px 左右的 Codex 分屏仍属于桌面 Web，但项目页若继续保留“主任务列 + 右侧上下文列”，在展开 rail 后会把主 Composer 压缩到不可用宽度。当前规则为：

- `>1100px`：项目任务列与上下文列并排，几何对齐 Manus 1280px 项目参考。
- `<=1100px`：项目上下文转入同一条 Web 文档流，顺序为项目身份、Composer、上下文模块、任务区。
- 窄桌面仍使用桌面 rail、桌面 Header 和桌面 Composer；不会切到手机 Sheet，也不会恢复旧首屏。
- 项目工作区本身承担纵向滚动，卡片禁止收缩到只有边框的高度；`scrollWidth` 必须等于视口宽度。

验证截图：`.playwright-cli/page-2026-08-27T14-10-42-809Z.png`（800 × 674）、`.playwright-cli/page-2026-08-27T14-11-18-527Z.png`（1280 × 720）。

### v9 组件边界与桌面清理（2026-08-27）

- `WorkspaceHeader` 的桌面 Web 内边距统一为 32px，与参考页的标题和右侧操作轴对齐；窄桌面仍由专用 Web 规则接管。
- 桌面 rail 隐藏快捷键提示文本，但保留全局快捷键行为，避免导航行出现参考页没有的额外密度。
- 项目页拆为 `ProjectIdentity`、`ProjectTaskEmpty` 和 `ProjectContextCard`，每个区域可单独截图、测量和回归。
- 这次清理删除了无行为差异的旧 `/mock` 路由；预览 transport、旧认证接口和测试 fixture 仍是有明确用途的边界，不按名称误删。
- Rail 底部只保留账户入口；已删除会改变 Rail 高度的旧任务通知卡、对应 CSS 和本地化文案，避免非参考 UI 挤压账户区。

### 真实浏览器复核

| 视口 | 状态 | 结果 |
| --- | --- | --- |
| 786 × 674 | `!delivery` 成果 Canvas 打开 | rail `48px`，主区 `418.3px`，Canvas `318.7px`，无 dialog/遮罩 |
| 786 × 674 | Canvas 关闭 | rail 恢复 `280px`，Canvas 卸载，主区恢复完整宽度 |
| 1200 × 742 | 空首页 | icon rail + 单一主工作区，无横向溢出 |

截图：`tmp/design-audit-v9-kokoro-narrow-canvas-786x674.png`、`tmp/standard-app-1200.png`。

### 验证结果

```text
pnpm lint       passed
pnpm typecheck  passed
pnpm test       689 passed
pnpm build      passed
```

## v6 启动状态复核（2026-08-26）

`/app` 的会话探针是异步的。此前首帧会在 probe 仍为 `checking` 时先发起 live runtime-manifest 请求，本地预览随后才确认，造成一次预期内但可见的 `503` 控制台错误；认证切换时也可能短暂绘制 preview 皮肤。

现在 `AppGate` 在明确确认 authenticated 前保持 preview transport；`useRuntimeManifest` 在 preview → live 期间把旧 preview source 投影为 loading，待租户 manifest 返回后才交给站点渲染。真实浏览器重新打开 `/app` 后控制台错误数为 `0`，且不改变 live 失败时的 503/fail-closed 语义。

同一轮还收口了 rail 的桌面契约：`WorkspaceRail` 的账户卡和窄视口 CSS 不再仅依据原始 viewport 判断手机，`desktopWeb` 下始终使用桌面下拉账户与桌面导航；触控尺寸规则只保留给真正的手机 Sheet。

## v10 窄 Web 导航收口（2026-08-28）

（历史记录；以下 `v10` 规则已被文末 `v201` 当前契约覆盖。）`673px` 左右的 User Web 浏览器分屏不再渲染隐藏的桌面 rail。当时记录为：

- `>960px` 使用固定 shadcn Sidebar、可调 Rail 和单一 resizer。
- `<=960px` 使用 shadcn Sheet 单列工作区；页头显示 `SidebarTrigger`，打开导航后由同一个 `openMobile` 状态驱动抽屉。
- 窄 Web 不渲染 Rail resizer，因此不会在主区留下垂直残留线；选择会话、项目或设置后收起导航。
- 这只改变 User Web 的浏览器响应式壳，不改变 Admin、App 或站点自有的手机页面。

真实浏览器截图：`output/playwright/narrow-web-sheet.png`、`output/playwright/narrow-web-sheet-open.png`、`output/playwright/web-1280.png`、`output/playwright/web-1440.png`、`output/playwright/web-1920.png`。

## v11 User Web 桌面契约校正（2026-08-28）

（历史记录；现行断点、隐藏态与入口以文末 `v201` 当前契约为准。）v10 的 `<=960px` Sheet 规则与当时的
User Web 目标冲突：Codex 分屏、浏览器缩放和高 DPI 显示器会让真正的桌面 Web 报告 786–960px 的
CSS viewport。以下为当时记录的 **767px** 手机边界方案：

- `768px` 以上始终使用固定 shadcn Sidebar、48px icon rail、可调侧栏分隔条和 Web Header；
  不因浏览器缩放切换成手机 Sheet。
- `767px` 以下仍保留原有手机 Sheet 路径；本轮没有修改手机布局和手机 CSS。
- `/app` 使用 Manus 式单一欢迎层级：计划状态 → 标题 → Composer → 建议列表 → 宣传位；
  不在 768–960px 回退到旧快捷卡片布局。
- `/app/project/{ref}` 在 `>1100px` 使用主任务列 + 右侧上下文列，较窄的 Web viewport
  仍保持同一项目层级但将上下文转为单列流，避免 Composer 被压缩。

截图证据：

- `output/playwright/home-916-manus-final.png`
- `output/playwright/project-916-expanded-final.png`
- `tmp/manus-compare/home-reference-vs-web-916-v2.png`

## v12 数据管理与紧凑设置布局（2026-08-28）

- 设置中的“数据管理”不再复用成果库；独立呈现共享任务、共享文件、封存任务、授权应用与云端浏览器数据。
- 授权应用和云端浏览器管理在同一 Settings Dialog 内切换，并更新 hash；子视图刷新后仍恢复设置与对应内容。
- 紧凑桌面只使用一套基础布局。已删除 `(pointer: fine)` 强制宽布局的兼容规则；`<1024 CSS px` 为约 `384×580` 横向导航窗，`>=1024 CSS px` 为双栏设置窗。
- 紧凑导航显示一般、账户、积分与用量、快捷键、个性化、连接器，再由更多菜单承载其余入口，保持参考页的信息密度。
- 数据边界由 `src/data-management/client.ts` 使用 Zod 校验；preview 使用显式空 fixture，不伪造授权应用、分享记录或 Cookie 数据。

同一浏览器窗口的对照截图：

- `output/playwright/data-management/manus-summary-751x674.png`
- `output/playwright/data-management/kokoro-summary-751x674.png`
- `output/playwright/data-management/manus-authorized-apps-751x674.png`
- `output/playwright/data-management/kokoro-authorized-apps-751x674.png`
- `output/playwright/data-management/manus-cloud-browser-751x674.png`
- `output/playwright/data-management/kokoro-cloud-browser-751x674.png`

## v13 折叠 Rail 顶部与主导航封板（2026-08-28）

固定 `1280 × 720` 视口直接测量 Manus 与 Kokoro 的可见 SVG 边界，不再根据截图目测调整。
两边 rail 宽度均为 `52px`，图标中心线均为 `x=26px`。最终坐标如下：

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| 顶部站点标记 | `(12, 14), 28×28` | `(12, 14), 28×28` | 一致 |
| 新建任务 | `(17, 73), 18×18` | `(17, 73), 18×18` | 一致 |
| 直接聊天 | `(17, 110), 18×18` | `(17, 110), 18×18` | 一致 |
| Agent | `(17, 147), 18×18` | `(17, 147), 18×18` | 一致 |
| 连接器 | `(17, 184), 18×18` | `(17, 184), 18×18` | 一致 |
| 已排程 | `(17, 221), 18×18` | `(17, 221), 18×18` | 一致 |
| 资料库 | `(17, 258), 18×18` | `(17, 258), 18×18` | 一致 |
| 专案 | `(17, 315), 18×18` | `(17, 315), 18×18` | 一致 |
| 任务 | `(17, 353), 18×18` | `(17, 353), 18×18` | 一致 |

第一站默认导航删除了重复的顶级“技能”行；技能功能仍保留在设置和项目上下文中。该重复行此前
会把连接器之后的全部入口向下推 `37px`。折叠目标统一为 `36×36`、`10px` 圆角、`18px`
图标，项目区域使用独立的 `2px` 行间距。无站点 Logo 时使用通用线性占位图标；真实 Logo
继续由 runtime manifest 提供。

截图证据：

- `output/playwright/rail-reference-current/manus-rail-top-1280x720.png`
- `output/playwright/rail-reference-current/kokoro-rail-top-1280x720.png`

## v14 MCP 设置与连接器目录封板（2026-08-28）

从 Manus 左侧连接器入口进入，再通过“管理连接器”打开真实设置弹窗；不使用失效的历史 hash
作为参考。固定 `1280×720` 视口后，设置外框与关键内容坐标如下：

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| 设置弹窗 | `(128,36), 1024×648` | `(128,36), 1024×648` | 一致 |
| 左导航列 | `220px` | `220px` | 一致 |
| 标题 | `(373,70), 755×30` | `(372.5,70), 755×30` | `0.5px` 子像素差 |
| 工具栏搜索框 | `y=141, 200×32` | `y=141, 200×32` | 一致 |
| 浏览/创建按钮 | `y=141` | `y=141` | 一致 |
| 空状态图标 | `(734.5,368), 32×32` | `(734,368), 32×32` | `0.5px` 子像素差 |
| 空状态文案 | `y=412` | `y=412` | 一致 |
| 新增连接器按钮 | `y=449, 116×36` | `y=449, 116×36` | 一致 |

左导航图标中心线统一为 `x=154`。第二个及后续分组标题删除旧布局多出的 `2px` 顶部留白，
消除了“功能”组 `2px`、数据组 `4px` 的累计漂移。

“浏览连接器”打开独立 shadcn Dialog，双方均为 `(240,20), 800×680`。目录卡片统一为
双列 `370×76`，坐标从 `(264,178)` 开始，以 `88px` 节奏排列。第一站 fixture 补齐
Outlook Mail 与 TikTok for Business，首屏 12 项与参考的信息密度一致；素材存储在
`public/assets/connectors/`，不依赖 Manus 鉴权或私有接口。

截图证据：

- `output/playwright/mcp-reference-current/manus-mcp-settings-1280x720.png`
- `output/playwright/mcp-reference-current/kokoro-mcp-settings-1280x720.png`
- `output/playwright/mcp-reference-current/manus-connector-catalog-1280x720.png`
- `output/playwright/mcp-reference-current/kokoro-connector-catalog-1280x720.png`

## v15 自订 MCP 创建链路（2026-08-28）

真实 Manus 交互确认：自订 MCP 不是设置内容区的内联表单，而是在连接器目录上方打开第三层
Dialog。当前三层几何为：设置 `(128,36), 1024×648`；目录 `(240,20), 800×680`；MCP
设置 `(340,4), 600×712`。本地已改为相同嵌套结构，关闭与提交不再依赖旧的设置滚动区。

创建菜单从 2 项补齐为 4 项：自订 API、自订 MCP、透过 JSON 汇入 MCP、透过 URL 添加 MCP；
菜单宽 `220px`，每项带语义图标，URL 入口带测试版标记。自订 MCP 表单保留现有 Hub 已支持的
名称、传输类型、URL、工具和凭据字段，名称与传输类型使用首行双列，底部命令改为“保存”。

Manus 参考中的图示、备注和自订 headers 需要后端持久化；对应请求字段、secret 边界和 JSON/URL
端点已加入 `docs/integration/user-web-api-contract-v4.md`。在后端实现前不渲染提交后会丢失的假控件。

截图证据：

- `output/playwright/mcp-flow-reference-current/manus-create-menu-1280x720.png`
- `output/playwright/mcp-flow-reference-current/kokoro-create-menu-1280x720.png`
- `output/playwright/mcp-flow-reference-current/manus-mcp-form-1280x720.png`
- `output/playwright/mcp-flow-reference-current/kokoro-mcp-form-1280x720.png`

## v16 项目工作区主网格统一（2026-08-28）

固定 `1280×720`、折叠 `52px` rail 后重新采集真实项目页。旧 CSS 在文件尾部保留了三套
互相覆盖的桌面规则：普通桌面单列、折叠 rail 双列、窄窗口兼容单列。因此相同页面会随
shell 状态切换信息架构，并将主栏和右栏整体推离参考坐标。现已删除这些尾部覆盖，只保留
一个桌面项目网格和既有窄屏分支。

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| 项目画布 | `(82,56), 1168px` | `(82,56), 1168px` | 一致 |
| 主任务列 | `768px` | `768px` | 一致 |
| 列间距 | `44px` | `44px` | 一致 |
| 右上下文列 | `(912,88), 320px` | `(912,88), 320px` | 一致 |
| Composer | `(100,160), 768×120` | `(100,160), 768×120` | 一致 |
| Composer 外框 | `1px rgb(0 0 0 / 20%), 22px` | `1px rgb(0 0 0 / 20%), 22px` | 一致 |
| 任务标题轴 | `x=116, y=312` | `x=116, y=312` | 一致 |
| 指令卡 | `320×149` | `320×149` | 一致 |
| 资源/技能卡 | `320×208.5` | `320×208.5` | 一致 |
| 网站卡 | `320×133` | `320×133` | 一致 |

模块标题统一为 `14px/20px, 500`，项目标题为 `20px/28px, 500`，任务说明为
`13px/19.5px`。品牌和业务内容继续来自 Kokoro runtime/fixture，不复制 Manus 账户数据。

截图证据：

- `output/playwright/project-reference-current/manus-project-1280x720.png`
- `output/playwright/project-reference-current/kokoro-project-1280x720.png`

## v17 项目上下文模块内部封板（2026-08-28）

在 v16 外框网格一致后，继续测量右栏内部文字与控件，而不是用卡片尺寸替代组件验收。
资源模块标题、说明和双按钮分别对齐至 `y=270 / 298 / 325.5`；技能模块标题与构建器行
对齐至 `y=394.5 / 426.5`；网站与定时任务标题、说明和新增按钮沿用相同的
`14px/20px` 标题与 `13px/18px` 正文节奏。

技能空态由无操作的“暂无已添加的技能”改为参考页的信息架构：扳手图标、技能构建器入口和
右侧新增操作。资源按钮恢复 `14px/18px, 500`，连接器行恢复 `14px, 500`，不再继承旧卡片
的 `12px/650` 密度。网站插画容器改为参考的 `75×64` 占位范围；图形继续使用 Kokoro 自有
Lucide 组合，不依赖 Manus 私有静态资源。

截图证据：

- `output/playwright/project-context-reference-current/manus-context-1280x720.png`
- `output/playwright/project-context-reference-current/kokoro-context-1280x720.png`

## v18 专案指令交互与弹窗封板（2026-08-28）

真实交互确认“指令”不是向 Composer 注入提示词，也不会离开项目页；它打开专案级编辑
Dialog。本地删除了原来的 `onPrompt` 跳转行为，改为 shadcn/Radix Dialog，并通过
`PATCH /api/hub/projects/{project_ref}` 只提交 `{ instruction }`。`project_ref` 来自路由，
浏览器仍不提交 `tenant_id`。

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| Dialog | `(360,80), 560×560` | `(360,80), 560×560` | 一致 |
| 正文编辑器 | `(384,173), 512×381` | `(384,172), 512×381` | `1px` 垂直差 |
| 历史记录 | `(384,580), 80×36` | `(384,580), 80×36` | 一致 |
| 取消 | `(744,580), 72×36` | `(744,580), 72×36` | 一致 |
| 保存 | `(824,580), 72×36` | `(824,580), 72×36` | 一致 |

弹窗保留加载、保存错误和关闭状态；保存失败不丢失输入。遮罩增加与参考一致的背景模糊，避免
旧实现只覆盖半透明黑层。交互测试验证打开弹窗、编辑、保存回调和不触发 Composer 跳转。

截图证据：

- `output/playwright/project-instructions-reference-current/manus-project-instructions-1280x720.png`
- `output/playwright/project-instructions-reference-current/kokoro-project-instructions-1280x720.png`

## v19 项目文件与资源弹窗（2026-08-28）

真实交互确认“文件和资源”打开独立项目资源 Dialog，而不是跳入账户级成果库设置。当前本地已
替换旧 `onOpenSettings("library")` 行为，采用 `680×680` shadcn/Radix Dialog：外框
`(300,20)`，标题 `(324,40)`，筛选与搜索控件位于 `y=80`，空态说明位于 `y=331`，新增
分段按钮位于约 `y=367`。

新增下拉复现三层信息架构：添加本地文件、搜索网络、更多；更多子菜单提供 Google Drive、
OneDrive 个人及工作/学校入口。文件选择使用原生隐藏 input，选择后调用
`POST /api/hub/projects/{project_ref}/resources` multipart 上传，不再保留无提交行为的假按钮。
对应 Hub 契约已补入 `docs/integration/user-web-api-contract-v4.md`。

截图证据：

- `output/playwright/project-resources-reference-current/manus-resources-menu-1280x720.png`
- `output/playwright/project-resources-reference-current/kokoro-resources-menu-1280x720.png`

## v20 专案技能弹窗与启用状态（2026-08-28）

真实交互确认“技能”打开项目级技能 Dialog，不跳转到账户设置。当前实现采用
`800×680` shadcn/Radix Dialog，并按 `1280×720` 同视口逐项测量：

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| Dialog | `(240,20), 800×680` | `(240,20), 800×680` | 一致 |
| 工具栏 | `(260,108), 760×32` | `(260,108), 760×32` | 一致 |
| 技能卡 | `(260,152), 374×147` | `(260,152), 374×147` | 一致 |
| 卡片标题行 | `(277,169), 340×21` | `(277,169), 340×20` | `1px` 字体行盒差 |
| Switch | `(591,171.5), 26×16` | `(591,171), 26×16` | `0.5px` 垂直差 |
| 描述 | `(277,198), 340×39` | `(277,198), 340×39` | 一致 |
| 底部元数据 | `y=267, 18px` | `y=267, 18px` | 一致 |

补齐“检视我的技能”入口、筛选/搜索/新增/更多工具栏、官方来源和更新时间信息。技能描述使用
runtime 品牌变量，不把站点品牌硬编码进通用组件。Switch 采用乐观更新，并通过
`PATCH /api/hub/projects/{project_ref}/skills/{skill_name}` 提交 `{ enabled }`；请求失败时回滚
视觉状态。交互测试覆盖独立弹窗、不触发旧设置跳转、保存参数和失败回滚。

截图证据：

- `output/playwright/project-skills-reference-current/manus-project-skills-1280x720.png`
- `output/playwright/project-skills-reference-current/kokoro-project-skills-1280x720.png`

## v21 项目网站与排程任务交互（2026-08-28）

删除网站和定时任务“向 Composer 注入提示词”的旧行为。真实 Manus 交互证明二者首先打开
项目级选择 Dialog；定时任务还可叠加打开任务编辑器。Kokoro 已改成同样的信息架构。

### 网站选择

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| Dialog | `(400,54), 480×612` | `(400,54), 480×612` | 一致 |
| 标题 | `(420,74), 18/24 600` | `(420,74), 18/24 600` | 一致 |
| 搜索外框 | `(420,110), 440×36` | `(420,110), 440×36` | 一致 |
| 空态文字 | `y=387, 13/18` | `y=387, 13/18` | 一致 |
| 取消/保存 | `(708/788,610), 72×36` | `(708/788,610), 72×36` | 一致 |

### 排程选择与编辑器

选择 Dialog 与网站弹窗复用 `480×612` 底座；搜索宽 `200px`，建立新项目按钮
`(754,110), 106×32`。嵌套编辑器为 `(300,53), 680×614`，标题 `(320,73)`，底部操作区
`(300,593), 680×74`。

| 编辑器区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| 标题输入外框 | `(324,144), 632×36` | `(324,144), 632×36` | 一致 |
| 时间控件 | `x=536, y≈226, 420×36` | `(536,227), 420×36` | `1px` 垂直差 |
| Prompt | `(324,338), 632×90` | `(324,338), 632×90` | 一致 |
| 自动核准卡 | `y=444, 632×66.5` | `y=444, 632×64` | `2.5px` 行盒差 |
| 进阶设定卡 | `y=526.5, 632×66.5` | `y=526.5, 632×66` | `0.5px` 高度差 |

新增任务提交到 `POST /api/hub/projects/{project_ref}/scheduled-tasks`，包含标题、提示词、频率、
时间、可选到期日和自动核准状态。BFF 契约同步定义网站目录/绑定和排程任务目录/创建接口；浏览器
仍不提交可信 `tenant_id`。

截图证据：

- `output/playwright/project-website-schedule-reference-current/manus-website-picker-1280x720.png`
- `output/playwright/project-website-schedule-reference-current/kokoro-website-picker-1280x720.png`
- `output/playwright/project-website-schedule-reference-current/manus-schedule-picker-1280x720.png`
- `output/playwright/project-website-schedule-reference-current/kokoro-schedule-picker-1280x720.png`
- `output/playwright/project-website-schedule-reference-current/manus-schedule-editor-1280x720.png`
- `output/playwright/project-website-schedule-reference-current/kokoro-schedule-editor-1280x720.png`

## v22 账户菜单与个性化设置（2026-08-29）

账户菜单使用固定 `1280×720` 同视口重新测量。外框 `(10,258), 284×418` 已与参考完全一致；
本轮补齐的不是外框，而是内部语义和真实行为：菜单摘要使用“个人”范围与上下切换图标；积分行
读取 Billing summary 并显示帮助、余额和右箭头；账户/个性化/设置使用对应图标；设置行恢复
`⌘⇧,`；首页、帮助和文件恢复尾部跳转图标。原先禁用的个性化入口现可打开真实设置页。

个性化设置沿用现有 `1024×648` shadcn/Radix Settings Dialog，并新增资料/知识两个 tab、AI
记忆导入入口、昵称、职业、个人信息和自订指令。桌面几何如下：

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| Settings Dialog | `(128,36), 1024×648` | `(128,36), 1024×648` | 一致 |
| 标题 | `(373,70), 755×30` | `(372.5,70), 755×30` | `0.5px` 横向差 |
| 内容 tab | `x=373, y≈162, 755×42` | `(372.5,162), 755×42` | `0.5px` 横向差 |
| AI 记忆卡 | `(373,228), 755×75` | `(372.5,228), 755×75` | `0.5px` 横向差 |
| 昵称/职业 | `y=354.5, 369.5×36` | `y=355, 369.5×36` | `0.5px` 垂直差 |
| 个人信息 | `(373,434.5), 755×122` | `(372.5,435), 755×122` | `0.5px` 差 |
| 自订指令 | `(373,669), 755×122` | `(372.5,669), 755×122` | `0.5px` 横向差 |

预览态使用本地 fixture 持久化；live 调用同源 Hub personalization projection。BFF 契约新增
`GET/PATCH /api/settings/personalization`，明确 actor 与经 service auth/allowlist 校验的 RFC 7239
`Forwarded` binding 隔离、版本字段及不接收可信 `tenant_id`。同时补齐 8 种上线语言和个性化菜单/字段交互测试。

截图证据：

- `output/playwright/account-personalization-reference-current/manus-account-menu-1280x720.png`
- `output/playwright/account-personalization-reference-current/kokoro-account-menu-1280x720.png`
- `output/playwright/account-personalization-reference-current/manus-personalization-1280x720.png`
- `output/playwright/account-personalization-reference-current/kokoro-personalization-1280x720.png`

## v23 My Computer 与云电脑建立流程（2026-08-29）

设置导航中的“我的电脑”由禁用占位改为真实 `SettingsTab`。页面复现云电脑/本地电脑 tab、持续
云工作空间卡片和立即建立入口。固定 `1280×720` 几何：

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| Settings Dialog | `(128,36), 1024×648` | `(128,36), 1024×648` | 一致 |
| 标题轴 | `x=373, y=70` | `x=372.5, y=69` | 最大 `1px` |
| 云/本地 tab | `x≈373, y≈141, 755×42` | `(372.5,141), 755×42` | 最大 `0.5px` |
| 云电脑卡片 | `(373,198), 755×87` | `(372.5,198), 755×87` | `0.5px` 横向差 |
| 建立按钮 | `(1020,225), 92×32` | `(1019.5,225.5), 92×32` | 最大 `0.5px` |

建立流程使用嵌套 `800×684` shadcn/Radix Dialog；Basic/Standard/Advanced 三方案卡、推荐状态、
规格列表、方案公共能力、月总计和固定 footer 均与参考同层级。Dialog `(240,18)`、取消
`(864,642), 72×36`、下一步 `(944,642), 72×36` 完全一致。下一步进入名称确认，live 最终提交
同源 `/api/hub/cloud-computers`。

BFF 契约新增云电脑列表、方案目录和幂等创建接口，明确价格/规格以服务端重校验结果为准，浏览器
不提交云厂商凭据、内部实例类型或可信 `tenant_id`。

截图证据：

- `output/playwright/my-computer-reference-current/manus-my-computer-1280x720.png`
- `output/playwright/my-computer-reference-current/kokoro-my-computer-1280x720.png`
- `output/playwright/my-computer-reference-current/manus-create-cloud-computer-1280x720.png`
- `output/playwright/my-computer-reference-current/kokoro-create-cloud-computer-1280x720.png`

## v24 Mail 设置与工作流邮箱（2026-08-29）

设置导航中的 Mail 由占位改成真实 `SettingsTab`。页面复现设置/收件匣 tab、任务邮箱、工作流邮箱、
授权发件人以及两个创建流程。固定 `1280×720` 下，Settings Dialog 继续使用 `(128,36),
1024×648` 底座；主页面按钮位置与参考保持一致：

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| 工作流按钮 | `(966,292), 162×32` | `(966,292), 162×32` | 一致 |
| 发件人按钮 | `(994,352), 134×32` | `(994,352), 134×32` | 一致 |
| 工作流引导 Dialog | `(400,214), 480×292` | `(400,214), 480×292` | 一致 |
| 引导主按钮 | `(788,454), 72×32` | `(788,454), 72×32` | 一致 |
| 工作流表单 | `(400,156), 480×408` | `(400,156), 480×408` | 一致 |
| 表单 Textarea | `(420,396), 440×90` | `(420,396), 440×90` | 一致 |
| 表单取消/保存 | `(724/796,512), 64×32` | `(724/796,512), 64×32` | 一致 |

工作流表单已按参考拆成固定 header/body/footer，不再依赖 Dialog 默认 `gap` 推导垂直位置；字段使用
shadcn `FieldGroup/Field/FieldLabel/FieldDescription`，输入、错误占位、说明和 90px Textarea 保持
稳定节奏。预览态在当前设置生命周期内维护创建结果；live 调用同源邮件管理接口。

BFF 契约新增 `GET /api/settings/mail`、工作流邮箱与授权发件人的创建/删除接口。完整邮箱地址始终由
服务端根据经 service auth/allowlist 校验的 RFC 7239 `Forwarded`、session 和 actor context 生成，
浏览器不提交邮箱域名、actor id 或可信 `tenant_id`。

截图证据：

- `output/playwright/mail-reference-current/manus-mail-1280x720.png`
- `output/playwright/mail-reference-current/kokoro-mail-1280x720.png`
- `output/playwright/mail-reference-current/kokoro-workflow-intro-1280x720.png`
- `output/playwright/mail-reference-current/manus-workflow-form-1280x720.png`
- `output/playwright/mail-reference-current/kokoro-workflow-form-1280x720.png`

## v25 部署设置页（2026-08-29）

设置导航中的“部署”由禁用占位改为真实 `SettingsTab`。页面按参考拆成网站、应用、已购买域名三段，
每段固定 `207px` 高度，使用独立空态图标、说明和 32px 操作按钮。固定 `1280×720` 几何：

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| Settings Dialog | `(128,36), 1024×648` | `(128,36), 1024×648` | 一致 |
| 网站标题 | `(373,141), 32×22` | `(372.5,141), 32×22` | `0.5px` 横向差 |
| 应用标题 | `(373,348), 32×22` | `(372.5,348), 32×22` | `0.5px` 横向差 |
| 域名标题 | `(373,555), 96×22` | `(372.5,555), 96×22` | `0.5px` 横向差 |
| 三个操作按钮 | `x=704.5, y=256/463/670, 92×32` | `x=704, y=256/463/670, 92×32` | `0.5px` 横向差 |

网站与应用入口不再是无行为按钮：点击后关闭设置、回到当前空工作台、切换对应创建意图，Composer
保持聚焦并显示“描述你想要建立的网站/应用程序”占位；域名入口切换到订阅/购买流程。BFF 契约
新增部署 projection、网站/应用异步创建和域名购买意向接口，浏览器仍不提交可信 `tenant_id` 或
云厂商/DNS 凭据。

截图证据：

- `output/playwright/deployment-reference-current/manus-deployment-1280x720.png`
- `output/playwright/deployment-reference-current/kokoro-deployment-1280x720.png`

## v26 整合目录与详情（2026-08-29）

设置导航中的“整合”由禁用占位改为真实 `SettingsTab`。目录页复现 Zapier、Slack、Telegram、LINE
四张卡片，并使用参考页面实际的 Zapier WebP 与 Slack SVG；品牌文案通过 runtime `brandName`
插值，不把 Manus 或 Kokoro 固化进共享组件。

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| 标题/说明 | `x=373, y=70/104` | `x=372.5, y=69/104` | 最大 `1px` |
| 第一行卡片 | `y=163, 371.5×90` | `y=163, 371.5×90` | `0.5px` 横向差 |
| 第二行卡片 | `y=265, 371.5×90` | `y=265, 371.5×90` | `0.5px` 横向差 |
| 卡片列间距 | `12px` | `12px` | 一致 |
| Zapier 详情 Hero | `y=143, 755×72` | `y=143, 755×72` | `0.5px` 横向差 |
| Zapier 概览卡 | `y=272, 755×92` | `y=272, 755×92` | `0.5px` 横向差 |

点击卡片进入同一 Settings Dialog 内的 provider 详情，标题行显示返回箭头；Zapier 页面包含外部
入口、概览与双列 Zap 模板，Slack 包含概览，Telegram/LINE 提供真实连接动作。预览态连接后更新
按钮状态；live 调用同源连接接口并只接受服务端返回的 allowlisted `authorization_url`。

BFF 契约新增整合目录、详情、连接和解除绑定接口，明确 OAuth state、bot token、webhook secret、
provider credential 与可信 `tenant_id` 不进入浏览器。

截图证据：

- `output/playwright/integration-reference-current/manus-integration-1280x720.png`
- `output/playwright/integration-reference-current/kokoro-integration-1280x720.png`
- `output/playwright/integration-reference-current/manus-zapier-1280x720.png`
- `output/playwright/integration-reference-current/kokoro-zapier-1280x720.png`

## v27 开发人员设置（2026-08-29）

设置导航中的“开发人员”已启用为真实页面，包含 API 密钥与 Webhooks 两个 tab、对应空态、创建弹窗和
创建后的本地 projection。页面继续复用 `1024×648` shadcn/Radix Settings Dialog；创建流程使用
独立的 `400px` Dialog，不依赖设置内容区推导尺寸。固定 `1280×720` 实测如下：

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| Settings Dialog | `(128,36), 1024×648` | `(128,36), 1024×648` | 一致 |
| API 空态标题 | `y=441, h=20` | `y=441, h=20` | 一致 |
| 创建按钮 | `(697.5,495), 106×32` | `(697,495), 106×32` | `0.5px` 横向差 |
| API Key Dialog | `(440,220), 400×280` | `(440,220), 400×280` | 一致 |
| Webhook Dialog | `(440,251), 400×218` | `(440,250), 400×220` | 中心一致，参考内容高少 `2px` |

API Key 弹窗包含名称和到期时间；Webhook 弹窗只接受 HTTPS URL。live 模式调用同源
`/api/settings/developer/*` BFF，并为创建请求附带 `Idempotency-Key`。完整 API secret 和 Webhook
签名 secret 仅允许在创建或轮换成功的单次响应出现，浏览器不提交可信 `tenant_id`。

截图证据：

- `output/playwright/developer-reference-current/manus-developer-api-1280x720.png`
- `output/playwright/developer-reference-current/kokoro-developer-api-1280x720.png`
- `output/playwright/developer-reference-current/manus-developer-webhooks-1280x720.png`
- `output/playwright/developer-reference-current/kokoro-developer-webhooks-1280x720.png`
- `output/playwright/developer-reference-current/manus-create-api-key-1280x720.png`
- `output/playwright/developer-reference-current/kokoro-create-api-key-1280x720.png`
- `output/playwright/developer-reference-current/manus-create-webhook-1280x720.png`
- `output/playwright/developer-reference-current/kokoro-create-webhook-1280x720.png`

## v28 账户设置与登录方式（2026-08-29）

账户页删除旧的团队身份、切换团队和禁用操作布局，按参考重构为全名、套餐积分、邮箱、用户 ID、
登录方式和删除账户六个区域。预览态使用 `preview@example.test` 与不透明 fixture ID；live 数据来自
`GET /api/settings/account`，不从 session envelope 或团队名推断个人资料。

固定 `1280×720` 实测：

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| Settings Dialog | `(128,36), 1024×648` | `(128,36), 1024×648` | 一致 |
| 邮箱标题 | `y=432` | `y=431` | `1px` |
| 用户 ID 标题 | `y=486` | `y=486` | 一致 |
| 登录方式标题 | `y=573` | `y=572.5` | `0.5px` |
| 删除账户标题 | `y=627` | `y=626.5` | `0.5px` |
| 更改邮箱 Dialog | `(440,215.5), 400×289` | `(440,215.5), 400×289` | 一致 |
| 删除账户 Dialog | `(440,145), 400×430` | `(440,145), 400×430` | 一致 |

“管理登录方式”使用设置内容区子页面，不使用弹窗；进入后 header 替换为返回箭头和标题，展示
Google、Microsoft、Apple、Passkey 与空态。Provider 图标使用对应品牌矢量图形，不再使用字母占位。
邮箱变更实现验证码与新邮箱双步骤；删除确认实现项目符号警示区、验证码和禁用态危险按钮。

参考页面包含真实邮箱和用户 ID，因此参考截图只在内存中测量，不写入仓库。仓库只保留无隐私本地证据：

- `output/playwright/account-v28-reference-current/kokoro-account-1280x720.png`
- `output/playwright/account-v28-reference-current/kokoro-login-methods-1280x720.png`
- `output/playwright/account-v28-reference-current/kokoro-change-email-1280x720.png`
- `output/playwright/account-v28-reference-current/kokoro-delete-account-1280x720.png`

## v29 常规设置（2026-08-29）

常规设置按固定 `1280×720` 桌面视口重新测量参考页的 DOM 与 computed style，不再沿用旧卡片
字号。分区标题由 `18px/650` 收敛为参考的 `16px/500`，偏好行标题由 `16px/600` 收敛为
`14px/500`；主题图标使用 Lucide `18×18`，主题卡保持 `110×62`，选中卡使用 `1.5px` 边框。

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| 外观标题 | `(373,141), h=22` | `(372.5,141), h=22` | `0.5px` 横向差 |
| 语言控件 | `(373,211), 208×36` | `(372.5,211.8), 208×36` | 最大 `0.8px` |
| 主题标题 | `y=271, h=24` | `y=271.8, h=24` | `0.8px` |
| 主题卡 | `x=373/491/609, 110×62` | `x=372.5/490.5/608.5, 110×62` | `0.5px` 横向差 |
| 通讯偏好标题 | `y=415, h=22` | `y=414.8, h=22` | `0.2px` |
| 前三行标题 | `y=453/515/577` | `y=452.8/514.8/576.8` | `0.2px` |
| 前三行开关 | `y=464/526/588, 26×16` | `y=464.3/526.3/588.3, 26×16` | `0.3px` |
| 广告标题 | `y=664` | `y=662.8` | `1.2px`，简体文案基线差 |

checked switch 使用参考的 `#0081f2`，thumb 为 `14×14`、位移 `10px`；浏览器通知关闭时声音
提醒保持 disabled。preview 使用无网络 fixture；live 从 `GET /api/settings/preferences` 加载，并对
单字段 `PATCH` 做乐观更新和失败回滚。品牌广告标题与说明通过 runtime `brandName` 插值，浏览器
不提交可信 `tenant_id`。

截图证据：

- `output/playwright/general-v29-reference-current/kokoro-general-1280x720.png`

参考页截图未通过当前 in-app Browser 截图能力落盘；上述参考数值来自同一登录会话、同一
`1280×720` viewport 的实时 DOM 测量。

## v30 积分与用量（2026-08-29）

旧 embedded Billing 的冻结余额、配额、趋势和模型分析布局不再进入 Settings；独立 BillingPanel
仍保留这些运营能力。Settings 内改为任务、网站、电脑三个独立 projection，使用同一个 shadcn
ToggleGroup，但每个页签拥有自己的组件结构和数据状态。

任务页先消除了 Settings 通用 `[data-embedded]` 对账单顶部间距的覆盖；账单使用独立
`data-embedded="billing"` 边界，避免 MCP、Skills 等 surface 的间距规则串入。固定视口测量如下：

| 任务区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| 套餐卡 | `(373,206), 755×191` | `(373,206), 755×191` | 一致 |
| 套餐/积分/每日刷新 | `y=224/280/338` | `y=224/280/338` | 一致 |
| 刷新说明 | `y=362, h=18` | `y=362, h=18` | 一致 |
| 积分历史标题 | `y=421, h=24` | `y=421, h=24` | 一致 |
| 日期/首条流水 | `y=449/485.5` | `y=449/485.5` | 一致 |

网站页重组为单一概览容器，不再使用三张独立描边后台卡；日期范围改为合并控件，金额省略无意义的
`.00`，周期日期按 UTC 展示，并补齐参考空状态图标。

| 网站区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| 用量概览 | `(373,206), 755×244` | `(373,206), 755×244` | 一致 |
| 自动充值行/类别网格 | `y=207/263, 729px` | `y=207/263, 729px` | 一致 |
| 使用详情标题 | `y=474, h=20` | `y=474, h=20` | 一致 |
| 日期范围 | `(373,498), 275×33` | `(373,498), 275×33` | 一致 |
| 表头/空态图标/标题 | `y=540/575/618` | `y=540/575/618` | 一致 |

电脑页使用独立居中空状态：Monitor 图标、标题、说明和创建按钮分别位于 `y=373/421/441/478`；
图标 `32×32`，按钮 `92×32`，与参考一致。三个页签均无横向溢出。

截图证据仅保存无隐私的本地 fixture；参考页含登录账户信息，只在同一会话内存中测量：

- `output/playwright/credits-v30-reference-current/kokoro-credits-task-1280x720.png`
- `output/playwright/credits-v30-reference-current/kokoro-credits-websites-1280x720.png`
- `output/playwright/credits-v30-reference-current/kokoro-credits-computer-1280x720.png`

## v31 Settings 共享外壳（2026-08-29）

Settings 继续使用 shadcn/Radix `Dialog`、`Tabs`、`ScrollArea` 和 `Input`，但桌面布局不再从
窄屏横向 tabs 推导尺寸。固定 `1280×720` 下，外壳使用与参考一致的两列坐标系；左侧导航的
滚动容器覆盖完整轨道，按钮通过 `12px` 内边距保持稳定宽度，避免滚动条出现时挤压文字或让
内容区产生横向位移。

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| Settings Dialog | `(128,36), 1024×648` | `(128,36), 1024×648` | 一致 |
| 左侧导航 / 右侧内容 | `221px / 803px` | `221px / 803px` | 一致 |
| 内容画布 | `x=373, w=755` | `x=373, w=755` | 一致 |
| 品牌身份行 | `(148,64), 180×36` | `(148,64), 180×36` | 一致 |
| 搜索框 | `(140,114), 196×32` | `(140,114), 196×32` | 一致 |
| 首个活动行 | `(140,190), 196×32` | `(140,190), 196×32` | 一致 |
| 标题 | `(373,70), 755×30` | `(373,70), 755×30` | 一致 |
| 关闭 SVG | `(1116,52), 20×20` | `(1116,52), 20×20` | 一致 |
| 导航滚动区 | `(128,154), 220×530` | `(128,154), 220×530` | 一致 |

导航行统一为 `14px/20px`，普通字重 `400`、活动字重 `500`，内边距
`8px 16px 8px 14px`，图标间距 `8px`，圆角 `8px`；活动背景为
`rgba(55,53,47,.06)`。图标优先使用 Lucide 对应项：`Settings2`、`UserRound`、
`Keyboard`、`Cable`、`Monitor`、`CodeXml`；个性化、技能、Mail、数据管理、部署和积分采用
同一图形语言下的最接近 Lucide 图标。整合图标使用 `Plug` 并旋转 `45deg`。

代表性页面已验证 General、Credits、Developer 三次切换：URL hash 异步更新，Dialog 和右侧
内容坐标不变；切到 Developer 只滚动左轨，回到 General 时 `scrollTop` 恢复为 `0`。搜索
“开发”后保留当前页与匹配项，清除后恢复完整导航；所有状态均无页面级横向溢出。

截图证据只保存无隐私的本地 fixture：

- `output/playwright/settings-shell-v31-reference-current/kokoro-settings-shell-general-1280x720.png`
- `output/playwright/settings-shell-v31-reference-current/kokoro-settings-shell-credits-1280x720.png`
- `output/playwright/settings-shell-v31-reference-current/kokoro-settings-shell-developer-1280x720.png`

Manus 参考页包含真实账户显示名，只在登录会话内存中完成同视口 DOM 与 computed-style 测量，
不将参考截图、Cookie、Token、邮箱、用户 ID 或私有资源写入仓库。

## v32 连接器首屏与目录（2026-08-29）

连接器首屏继续复用 Settings 的 MCP projection，但搜索控件不再是缺图标的裸 `Input`。当前使用
Lucide `Search`、shadcn `Input` 和固定外框组成与参考一致的复合搜索框；目录仍使用 Radix
`Dialog`、`Tabs` 和 `DropdownMenu`，打开后将焦点交给目录搜索框。

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| 页面标题 | `(373,70), 755×30` | `(373,70), 755×30` | 一致 |
| 搜索外框 | `(373,141), 200×32` | `(373,141), 200×32` | 一致 |
| 搜索图标 | `(386,149), 16×16` | `(386,149), 16×16` | 一致 |
| 搜索文字行盒 | `(408,146), 152×22` | `(408,146), 152×22` | 一致 |
| 浏览 / 创建按钮 | `(970/1064,141), 86/64×32` | `(970/1064,141), 86/64×32` | 一致 |
| 空态新增按钮 | `(692.5,449), 116×36` | `(692.5,449), 116×36` | 一致 |
| 目录 Dialog | `(240,20), 800×680` | `(240,20), 800×680` | 一致 |

目录首屏两列卡片、`40px` 图标框、`28px` 新增按钮、标签和创建菜单的坐标与参考一致；Beta
徽标增加 `white-space: nowrap`，避免简体文案把最后一行菜单撑高。目录打开后搜索框自动聚焦，
因此聚焦描边和键盘输入路径与参考一致。

“自订 MCP”表单原有契约差距已在 v33 补齐；图标、备注与只写 header 使用新的两阶段 BFF
契约，不再沿用旧的 Hub server/credential 表单。

截图证据仅保存无隐私本地 fixture：

- `output/playwright/connectors-v32-reference-current/kokoro-connectors-empty-1280x720.png`
- `output/playwright/connectors-v32-reference-current/kokoro-connectors-catalog-1280x720.png`
- `output/playwright/connectors-v32-reference-current/kokoro-connectors-create-menu-1280x720.png`

## v33 自订 MCP 创建器（2026-08-29）

Settings 中删除旧的名称/URL/工具白名单/凭据选择布局，改为独立 `CustomMcpForm`：服务器名称与
传输类型双列，图标上传，备注，服务器 URL，可重复的自订 headers，以及底部拆分保存按钮。
standalone MCP 管理面板仍保留底层 server/credential 编辑器，两者不再共享视觉布局。

| 区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| MCP Dialog | `(340,3), 600×714` | `(340,3), 600×714` | 一致 |
| 名称 / 传输输入 | `x=360/648, y=87, 272×36` | `x=360/648, y=87, 272×36` | 一致 |
| 图示标签 / 上传行 | `y=139/167` | `y=139/167` | 一致 |
| 备注标签 / 输入 | `y=243/271, 560×100` | `y=243/271, 560×100` | 一致 |
| URL 标签 / 输入 | `y=387/415, 560×36` | `y=387/415, 560×36` | 一致 |
| Headers 标签 / 新增按钮 | `y=467/495` | `y=467/495` | 一致 |
| 保存 / 下拉按钮 | `(815/887,661), 72/33×36` | `(815/887,661), 72/33×36` | 一致 |

图标只接受 PNG/JPEG 且最大 `1 MiB`。创建采用两阶段协议：先上传图标获得不透明 `asset_id`，
再提交 connector metadata 和只写 header 值。前端已实现 `registerCustomMcp` 与
`uploadConnectorIcon` 客户端；权威请求、SSRF 规则、header 禁止清单、加密与不回显要求记录在
`docs/integration/user-web-api-contract-v4.md` 的统一契约。创建请求不包含可信 `tenant_id/site_id/user_id`；
产品域名上下文只来自服务端 `KOKORO_DOMAIN` 并以 RFC 7239 `Forwarded` 转发。

真实桌面浏览器进一步验证了重复 header、拆分保存和错误状态：填入名称与 URL 后保存按钮启用；
“保存并启用”和“保存为停用”均可从下拉菜单访问；新增 header 后值列保持密码遮蔽，删除前后
保存按钮均为 `(815,661), 72×36`，表单均为 `(340,55), 600×662`，没有发生底部动作区漂移。
超过 `1 MiB` 的文件会显示“图示必须小于 1 MB。”。表单同时禁用账户自动填充，header 名称使用
`autocomplete=off`，header 值使用 `autocomplete=new-password`，避免浏览器将登录邮箱或密码误填
进 connector 凭据。

Hub 客户端契约测试覆盖 `/self/connectors/mcp` JSON body、无浏览器可信租户字段，以及
`/self/connectors/assets` multipart `file` 和响应 schema；相关 UI/Hub/Settings/App Frame 回归为
`82/82` 通过。

截图证据：

- `output/playwright/custom-mcp-v33-reference-current/kokoro-custom-mcp-empty-1280x720.png`
- `output/playwright/custom-mcp-v33-reference-current/kokoro-custom-mcp-with-header-1280x720.png`

## v34 高桌面自适应与 i18n 基础门（2026-08-29）

本轮补做 `1728×1117` 同视口对照，确认宽度约束本身正确：直接会话 Composer 为 `768×120`，
项目工作区为 `1168px`，右侧上下文固定 `320px`，页面均无横向溢出。实际差异来自欢迎页纵向
坐标：旧的 `@media (min-width:1200px)` 将顶部固定为 `3.6875rem`，导致高桌面下标题和 Composer
比 Manus 提前约 `75–78px`；推荐区域也没有维持下折页节奏。

欢迎页现改为高度感知的桌面 flow token，不使用绝对定位：

```css
padding-top: clamp(3.6875rem, calc(19vh - 5rem), 8.25rem);
margin-top: clamp(5.75rem, calc(100vh - 39.25rem), 26rem);
```

| 视口与区域 | Manus | Kokoro | 结果 |
| --- | --- | --- | --- |
| `1280×720` Composer | `(282,288), 768×120` | `(282,289.8), 768×120` | `y` 差 `1.8px` |
| `1728×1117` Composer | `(506,367.4), 768×120` | `(506,362.8), 768×120` | `y` 差 `4.6px` |
| `1728×1117` 推荐区域 | `y=959, 540×98` | `y=958.8, 540×98` | 一致 |
| `1728×1117` 页面滚动宽度 | `1728` | `1728` | 无横向溢出 |

同轮修复 Settings 预览账户的硬编码中文：免费计划与每日刷新说明由 `t()` 派生，语言切换不再
依赖 effect 同步状态；日语补齐全部当前缺键，韩/西/法/德/葡/俄补齐导航、账单和 MCP 的核心
可见文案，各上线 overlay 覆盖率重新达到 `95%` 门槛。预览 billing 测试同步到当前稳定 fixture。

本地无隐私截图：

- `output/playwright/wide-desktop-v34/kokoro-home-1728x1117-final.png`
- `output/playwright/wide-desktop-v34/kokoro-project-1728x1117.png`

Manus 同视口截图仅在浏览器会话内存中对照，没有保存账户、Token、Cookie 或参考资源。

## v36 品牌标记、侧栏同步与设置自适应（2026-08-29）

默认站点品牌不再使用 Manus 风格手掌或语言相关的“心”字符，改用 Lucide
`AudioWaveform` 中性产品标记。运行时 `brandLogoUrl` 和非空 `brandMark` 仍保持更高优先级；
展开槽位固定 `32×32`，折叠槽位固定 `28×28`。

桌面 Rail 的开合状态统一取自 shadcn `SidebarProvider.state`。Sidebar container、布局 gap、
主内容 inset 和唯一分隔条共用 `200ms linear` 宽度轨道；分隔条从折叠边界同步移动并淡入，
不再从终点瞬间出现。`1280×720` 实测如下：

| 状态 | container | gap | inset x | divider x |
| --- | ---: | ---: | ---: | ---: |
| 折叠 | `52px` | `52px` | `52px` | `51px`（透明） |
| 展开 100ms | `176.19px` | `176.19px` | `176.19px` | `175.19px` |
| 展开完成 | `300px` | `300px` | `300px` | `299px` |

品牌文字在宽度动画后段淡入，收起时先淡出，因此不再出现半截 `Kok...`。设置 Dialog 在桌面
视口使用 `min(64rem, calc(100vw - 1rem))` 和高度上限，左侧导航与内容 gutter 使用 clamp
自适应；高 DPI 或窄桌面窗口仍保留双栏，而不是退回拥挤的窄竖窗。

本地无隐私截图：

- `output/playwright/rail-transition-v36-final-100ms.png`
- `output/playwright/rail-expanded-v36-fixed.png`
- `output/playwright/rail-collapsed-v36-fixed.png`
- `output/playwright/settings-v36-1280x720.png`

## v37 跨页面品牌标记统一（2026-08-29）

登录/营销顶栏、工作台 Rail 和公开分享页改为复用同一个 `BrandFallback`。本地首站旧默认
“心”字符统一映射为 Lucide `AudioWaveform`；运行时上传 `brandLogoUrl` 仍优先，其他租户的
非空 `brandMark` 保持原值。登录顶栏和展开 Rail 使用同一 `32×32` 深色圆角方形槽位与
`18×18` 线性标记，避免同一站点在认证前后呈现两套品牌。

`1280×720` 登录页实测品牌槽位为 `(40,15.5), 32×32`；DOM 中不存在 `.lucide-hand`，
也不再显示“心”字符。截图：

- `output/playwright/login-brand-v37-1280x720.png`

## v38-v39 项目上下文多语言与动作图标（2026-08-29）

项目工作区继续以 `1280×720` Manus 项目页为固定基线。主工作区保持 `1168px`，主任务轴
`768px`，右侧上下文轴 `320px`；资源与技能仍是同一个连续模块，不拆成两张卡。

资源说明按实际语言行数分轨：中文、韩文保持参考卡高 `208.5px`，英文、日文、西班牙文、
法文、德文、葡萄牙文和俄文使用 `226.5px`。9 种语言均通过真实 DOM 测量：说明文本的
`scrollHeight <= clientHeight`，说明底边与操作按钮顶边保留 `8-9.5px`，没有裁切或覆盖。

项目动作图标同步参考语义：连接器由链环改为 Lucide `Cable`，网络搜索由普通放大镜改为
`ListFilter`；上传动作增加状态点和尾部下拉提示。动作结构由共享 `ProjectContextSection`
表达，不使用 CSS 伪元素代替交互语义。首屏网站插图使用 eager 加载，消除 Next.js LCP
告警并稳定右栏首次绘制。

截图与验证证据：

- `output/playwright/project-reference-current/manus-project-1280x720.png`
- `output/playwright/project-v38-zh-1280x720.png`
- `output/playwright/project-v38-en-1280x720.png`
- `output/playwright/project-v39-icons-zh-1280x720.png`
- 项目工作区测试 `6/6`、TypeScript、ESLint、`git diff --check` 通过。

## v40 设置弹窗连续自适应与账户页回归修复（2026-08-29）

设置弹窗移除紧凑横向 tabs 分支后，曾把 `1280×720` 的高度错误扩张到 `704px`，导致外框
从参考 `y=36` 移到 `y=8`。现在高度约束改为
`min(48.375rem, calc(100vh - 4.5rem))`：宽高继续按桌面视口连续变化，但标准基线保留上下
`36px` 呼吸区。

| 视口 | Dialog | 导航 / 内容 | 页面横向溢出 |
| --- | --- | --- | --- |
| `1280×720` | `(128,36), 1024×648` | `221px / 803px` | `0` |
| `1056×1264` | `(16,245), 1024×774` | `221px / 803px` | `0` |
| 高缩放等效 `430×720` | `(16,36), 398×648` | `160px / 238px` | `0` |

账户页同时恢复参考文案密度：搜索框为“搜索设置…”，设置/账单套餐卡使用 `billing.freeTier`
而不是工作台的 `firstSite.freePlan`。`1280×720` 实测搜索框 `(140,114), 196×32`、标题
`(373,70), 755×30`、关闭 SVG `(1116,52), 20×20`；邮箱、用户 ID、登录方式和删除账户标题
分别位于 `y=431/486/572.5/626.5`，继续与 v28/v31 Manus 基线一致。

截图证据：

- `output/playwright/settings-v40-before-1280x720.png`
- `output/playwright/settings-v40-account-final-1280x720.png`
- `output/playwright/settings-v40-zoomed-430x720.png`

## v41 全局账户菜单回归复核（2026-08-29）

全局账户菜单在 `1280×720` 重新实测：外框 `(10,258), 284×418`，积分、账户、个性化、设置、
首页、帮助、文件和退出登录均为 `276×36`；两条分隔线位于 `y=514/631`，页面无横向溢出，
继续与 v22 Manus 基线一致。

账户菜单套餐标题此前仍误用工作台键 `firstSite.freePlan`，显示为“免费计划”；现与设置账户页、
嵌入账单统一使用 `billing.freeTier`，恢复参考的紧凑“免费”标题，不改变菜单外框和操作坐标。

截图证据：

- `output/playwright/account-personalization-reference-current/manus-account-menu-1280x720.png`
- `output/playwright/account-menu-v41-final-1280x720.png`

## v42 直接会话首页与折叠 Rail 纵向节奏（2026-08-29）

`1280×720` 首页主体继续保持 Manus 基线：标题轴 `x=282, w=768`，Composer
`(282,289.8), 768×120`，快捷动作 `y=429.8`，推荐区域视觉起点约 `y=563`，页面无横向
溢出。本轮实际偏差位于共享折叠 Rail，而不是首页内容。

`.collapsedBrand` 继承了基础绝对定位的 `top:0`，使品牌标记贴顶；collapsed header 同时只有
`56px`，导致全部主导航比参考提前 `8px`。现在品牌触发器固定在 `y=10`，header 使用 `64px`
轨道，主导航统一恢复参考节奏：新建任务 `y=64`、聊天 `y=101`、Agent `y=138`、外挂
`y=175`、已排程 `y=212`、资料库 `y=249`、项目 `y=306`、任务 `y=344`。底部设备、通知、
账户固定轨道未移动，账户仍为 `(10,680), 32×32`。

展开/收起实测：Rail 为 `300px ↔ 52px`，Composer 只在横轴从 `x=406 ↔ 282` 平移，始终
保持 `768×120` 和 `y=289.8`，没有纵向跳动或页面级溢出。

截图证据：

- `output/playwright/home-reference-current/manus-home-1280x720.png`
- `output/playwright/home-v42-before-1280x720.png`
- `output/playwright/home-v42-rail-aligned-1280x720.png`

## v43 Composer 资源菜单打开态与焦点恢复（2026-08-29）

直接会话“+”菜单此前包含 7 行，其中两个条目同名“文件和资源”并进入同一 Library，连接器又与
相邻专用按钮重复；“计划/定时任务”则错误进入对话偏好设置。菜单高 `285.3px`，底边
`y=356.3`，覆盖 Composer 顶部约 `66px`。

现在菜单只投影当前真实且互斥的“文件和资源”和“技能”，连接器继续由相邻独立按钮承担。
`1280×720` 打开态菜单为 `(299,192), 240×88.4`，底边 `280.4px`，与 Composer
`(282,289.8), 768×120` 保留 `9.4px` 间距；页面无横向溢出。

真实交互验证：文件和资源、技能、连接器分别进入
`#/account/settings/library|skills|mcp`，对应 Settings panel 可见。Portaled 菜单项不再导致关闭
Settings 后焦点回退到账户按钮；AppFrame 显式保存“+”触发器，关闭后焦点准确返回该按钮。
账户菜单和命令菜单继续使用各自原有返回目标。

截图与测试证据：

- `output/playwright/composer-plus-v43-before-1280x720.png`
- `output/playwright/composer-plus-v43-final-1280x720.png`
- AppFrame/Composer 聚焦回归 `54/54` 通过。

## v44 快捷任务“更多”菜单焦点语义（2026-08-29）

`1280×720` 的“更多”菜单为 `(829,478), 128×202`，6 个菜单项均为 `118×32`，距视口
底部 `40px`，页面无横向溢出；Composer 继续保持 `(282,289.8), 768×120`。菜单作为浮层
覆盖下方推荐素材，但不改变文档流和 Composer 几何。

真实浏览器发现选择菜单项后虽然草稿正确注入，Radix 的关闭自动聚焦仍会把焦点从 textarea
夺回“更多”按钮。单帧和双帧延迟在 jsdom 中通过，但都无法可靠覆盖真实浏览器时序。现在
`KokoroDirectChatWelcome` 使用 `onCloseAutoFocus` 区分两种关闭意图：

- 选择提示词：阻止默认返回 trigger，由 AppFrame 将焦点交给 Composer textarea；
- Escape/点击外部关闭：保留 Radix 默认行为，焦点返回“更多”。

“整理要点”实测注入完整草稿后活动元素为 `TEXTAREA`；重新打开后按 Escape，活动元素为“更多”
按钮。菜单关闭过程不改变 Composer 高度或页面滚动宽度。

截图证据：

- `output/playwright/quick-more-v44-before-1280x720.png`

## v45 设置弹窗连续自适应（2026-08-29）

设置弹窗不再把 `1024×774` 和 `755px` 内容画布作为所有桌面屏幕的硬上限。
`1280×720` 仍保持参考基线 `(128,36), 1024×648`；`1728×1117` 则连续扩展到
`(172.8,111.7), 1382.4×893.6`，内容区从 `803px` 扩展到 `1161.4px`，而不是在 2K
视口中悬浮一个小画布。

桌面浏览器高缩放使 CSS 视口降到 `430×720` 时，仍保留同一个两列设置模型，
仅把导航收为 `52px` 图标轨，内容区由原来的 `238px` 增至 `346px`。三个实测视口
均无页面级横向溢出，也不会回退到横向 tabs 的旧小布局。

截图证据：

- `output/playwright/settings-adaptive-1280x720.png`
- `output/playwright/settings-adaptive-1728x1117.png`
- `output/playwright/settings-adaptive-430x720.png`

## v46 首页顶栏代理选择与积分摘要（2026-08-29）

原实现的顶栏工作区入口只有一行“设置”，积分入口则直接跳入完整 Settings Dialog，
两者的信息架构均与参考不一致。现在两个入口分别使用 shadcn/Radix Popover 重构：

- 代理选择器提供 `1.6 Max / 1.6 / 1.6 Lite` 三档，含 Pro 标识、说明、选中标记和
  `radiogroup` 语义；选择后顶栏标题立即更新，浮层关闭并把焦点返回 trigger。
- 积分入口先展示免费套餐、总积分、免费点数和每日刷新摘要；只有“查看使用情况”
  才进入 `#/account/settings/credits`，“升级”进入订阅页。

`1280×720` 对照实测：顶栏高 `56px`，代理 trigger `(68,12), 156.1×32`，浮层
`(68,48), 348×164`；积分 trigger `(1178,12), 78×32`，浮层 `(988,48), 268×223`。
除品牌文字宽度差异外，入口轴、浮层尺寸、上下间距与参考几何一致，页面横向溢出为 `0`。

截图证据：

- `output/playwright/header-v46-agent-final-1280x720.png`
- `output/playwright/header-v46-credits-polished-1280x720.png`

## v47 通用设置与快捷键跨页对照（2026-08-29）

使用同一 `1280×720` 视口对 Manus 当前通用设置和本地 `appearance` 分区进行实时
DOM 对照。弹窗均为 `(128,36), 1024×648`；标题、外观标题、语言选择和主题按钮
保持同一坐标轴。具体控件偏差仅为浏览器子像素取整：语言选择参考 `y=211`，本地
`y=211.8`；主题按钮参考 `y=303/303.5`，本地 `y=303.3/303.8`；开关列均为
`x=1102, 26×16`。这些数值不构成另一套 CSS 补偿的依据。

稳定差异位于左栏语义：参考的账户副标题为“个人”，搜索占位为短文案“搜索”；本地原为
“工作区”和“搜索设置…”。现已使用 `rail.userMenuScope` 表达个人范围，并将 9 种语言的
搜索文案同步收短，不改变 `(140,114), 196×32` 的输入框几何。

快捷键分区另行核对了 5 行操作、按键帽、单行清除按钮和“重设为预设值”位置，
与参考保持同一行高和轴线，本轮不添加无根据的几何覆盖。

截图证据：

- `output/playwright/settings-general-before-v47-1280x720.png`
- `output/playwright/settings-general-v47-final-1280x720.png`
- `output/playwright/settings-shortcuts-before-v47-1280x720.png`

## v48 个性化记忆入口与滚动工具位（2026-08-29）

个性化分区的资料字段、二级标签和导入卡宏观坐标已与参考一致，但原实现将
“导入记忆”按钮放在普通文档流末尾，首屏只露出一截“自订指令”，主要动作落在视口外。
实时 DOM 测量确认 Manus 将该按钮固定在设置 Dialog 的内容工具位：滚动前后始终为
`(373,624), 80×36`，而自订指令仍在后方继续滚动。

现在导入按钮使用 Dialog transform 坐标系的固定工具位，横坐标由导航轨宽度和内容
gutter 共同计算；个人资料内容补足底部滚动空间。结果与参考同时满足：

- 初始：导入卡 `(373,228), 755×75`，导入按钮 `(373,624), 80×36`，自订指令 `y=641`；
- 末端滚动：`scrollTop=215`，导入按钮仍为 `y=624`，自订指令移至 `y=426`；
- 导入卡图标由带外框分割的 `Grid2X2` 改为参考语义的 Lucide `Blocks`。

知识切换同时增加了回归资料页后保留未提交昵称的回归测试。

截图证据：

- `output/playwright/settings-personalization-before-v48-1280x720.png`
- `output/playwright/settings-personalization-v48-final-1280x720.png`
- `output/playwright/settings-personalization-v48-final-scrolled-1280x720.png`

## v49 连接器目录比例与关闭焦点（2026-08-29）

在 Manus 当前登录态直接打开连接器目录，并以浏览器真实 CSS 视口 `784×674` 采集
computed geometry。参考外框为 `(19.6,16.9), 744.8×640.3`，对应
`width: min(800px, 95vw)`、`height: min(680px, 95vh)`；本地此前使用固定减法，
导致横纵安全边距写反，列宽和滚动高度持续存在数像素偏差。

改用同一比例公式后，本地外框、工具栏和双列网格与参考只剩浏览器子像素取整：标签
`(44,130), 48×32`，创建按钮 `(676,130), 64×32`，首行卡片
`(44,174), 342×76` 和 `(398,174), 342×76`。`1280×720` 下继续命中
`(240,20), 800×680` 上限。

真实交互同时发现受控目录没有 `DialogTrigger`，Esc 关闭后焦点会落到 `body`。现在记录
实际触发目录的“浏览连接器”或“新增连接器”按钮，并通过 `onCloseAutoFocus` 准确归还
焦点。搜索 GitHub、切换自订 API、添加/移除状态与 Esc 回焦均加入回归测试。

截图证据：

- `output/playwright/connectors-catalog-local-v49-784x674.png`
- `output/playwright/connectors-catalog-local-v49-1280x720.png`

## v50 自订 API 创建流程（2026-08-29）

目录“建立 → 自订 API”此前仅切换 API 分类，没有 Manus 对应的创建流程。当前参考实测为
嵌套 `600×min(680px,95vh)` Dialog，包含名称、图标上传、备注、环境变量密钥、动态添加
密钥以及固定底部取消/保存操作栏。

现已拆分独立 `CustomApiDialog` 并使用 shadcn Dialog、Field、Input、Textarea 和 Button
实现。`784×674` 下本地与参考 computed geometry 完全一致：

- Dialog `(92,16.9), 600×640.3`；
- 名称输入 `(112,118.9), 560×36`；
- 上传按钮 `(184,198.9), 64×32`；
- 备注 `(112,302.9), 560×100`；
- 首个密钥输入 `(129,491.9), 526×36`；
- 取消/保存分别为 `(516,601.1), 72×36` 和 `(600,601.1), 72×36`。

保存按钮初始禁用，名称与所有密钥完整后启用；新增空密钥行会重新禁用，移除后恢复。
保存或取消只关闭创建层并保留连接器目录，焦点返回“创建”按钮。相关搜索、分类、添加状态、
动态密钥和两层 Dialog 焦点行为由同一浏览器流程回归覆盖。

截图证据：

- `output/playwright/connectors-custom-api-v50-final-784x674.png`

## v51 自订 MCP 创建与动态碰撞布局（2026-08-29）

以 `784×674` CSS 视口直接测量 Manus 自订 MCP 创建层，而不是从截图估算尺寸。
参考弹窗固定为 `600×714`；初始状态在视口顶端碰撞定位，新增 Header 后整体再向上
移动 `40px`，保证底部操作区仍可见。当前本地实现采用同一内容高度和状态驱动定位，
不再受全局窄视口按钮 `44px` 最小高度影响。

初始状态的本地 computed geometry 与参考逐项一致：

- Dialog `(92,0), 600×714`；
- 名称 `(112,84), 272×36`；
- 备注 `(112,268), 560×100`；
- URL `(112,412), 560×36`；
- 新增 Header `(112,492), 151.74×32`；
- 保存 `(567,658), 72×36`。

新增 Header 后，Dialog 为 `(92,-40), 600×714`；两个输入分别为
`(112,452), 262×36` 和 `(382,452), 262×36`，删除动作改为参考的裸红色
`Trash2` 图标。分裂保存菜单仅保留带文件夹图标的“发布到专案”，移除原先不存在于
参考流程中的“保存并启用 / 保存为停用”双选项。测试覆盖保存禁用条件、Header
新增/删除、参考占位符和单一发布菜单。

截图证据：

- `output/playwright/connectors-custom-mcp-v51-final-784x674.png`
- `output/playwright/connectors-custom-mcp-v51-header-menu-final-784x674.png`

## v52 设置根网格与账户页精确自适应（2026-08-29）

在 `784×674` 视口重新对照 Manus 账户页时确认，原先的响应式根网格会同时压缩
Dialog 和导航列：本地为 `(16,36), 752×602`、导航 `169.34px`，参考实际为
`(32,33.7), 720×606.6`、导航 `221px`。这不是账户内容的局部间距问题，而是所有
设置分区都会继承的坐标系错误。

设置根弹窗现统一使用参考公式：

```css
width: min(1024px, calc(100vw - 64px));
height: min(774px, 90vh);
grid-template-columns: 221px minmax(0, 1fr);
```

只有 CSS 视口低于桌面阈值时，导航才收为 `52px` 图标轨，不再切换成另一套顶部品牌、
横向标签的小弹窗。实测 `1280×720` 为 `(128,36), 1024×648`，高缩放
`518×632` 为 `(32,31.6), 454×568.8`，两者均保持同一内容和滚动模型。

账户身份区同步按参考修正为 `60×60` 头像、`16px` 间距、`13px/18px` 标签和
`32×32` 退出按钮。`784×674` 下标题 `(277,67.7)`、姓名输入
`(353,161.7), 280×36`、邮箱标签 `y=429.75`、管理按钮 `(664,573.7), 64×32`
及删除按钮 `(648,627.7), 80×32` 均与参考重合；升级按钮仅存在浏览器半像素取整。

截图证据：

- `output/playwright/settings-account-v52-final-784x674.png`
- `output/playwright/settings-account-v52-final-1280x720.png`
- `output/playwright/settings-account-v52-final-518x632.png`

## v53 管理登录方式二级页与 Provider 行为（2026-08-29）

Manus 的“管理登录方式”是设置 Dialog 右侧内容区内的二级页，不另开 Dialog。页面保留
左侧设置导航，右侧标题使用返回箭头，依次显示 Google、Microsoft、Apple 三行和通行
密钥分区。原本地实现虽有相同入口，但 Provider 列表逐行向下漂移、通行密钥按钮错误添加
加号，并额外渲染了参考不存在的大型钥匙空状态。

当前三行 Provider 图标顶部与参考同为 `y=153/222/291`，每行使用 `40×40` 品牌图标、
底部分隔线和 `64×32` 操作按钮。通行密钥分区删除多余空状态和加号后，标签为
`(281,377.7)`，新增按钮为 `(624,380.7), 100×32`，与参考重合。

连接操作不再是无效按钮：预览态立即切换连接状态，live 态按
`user-web-api-contract-v4` 调用 `POST /api/settings/account/login-methods/{provider}/connect`
或 `DELETE /api/settings/account/login-methods/{provider}`，成功后更新账户投影。回归测试覆盖
进入/返回二级页、三方 Provider、连接/断开切换、通行密钥入口以及无多余空状态。

截图证据：

- `output/playwright/settings-login-methods-v53-final-784x674.png`

## v54 更改邮箱与删除账户验证弹窗（2026-08-29）

账户危险操作的两个嵌套 Dialog 均使用 Manus 当前登录态在 `784×674` 视口直接测量。
更改邮箱层为 `(192,192.5), 400×289`；验证码说明此前因 `12px/18px` 排版占用
`51px` 并把字段标题提前 `5px`。现改为参考的 `13px/20px` 两行布局后，字段标题
`(212,297.5), 360×20`、说明 `(212,321.5), 360×40`、验证码组合框
`(212,369.5), 360×36`，取消/下一页分别为 `(420,425.5), 72×36` 和
`(500,425.5), 72×36`，全部重合。

删除账户层为 `(192,122), 400×430`，警告区 `(212,178), 360×202`。原验证码区和
footer 分别高出参考 `20px` 和 `12px`；修正字段盒模型后，验证标签 `(212,400)`、
验证码组合框 `(212,428), 360×40`、取消 `(420,496), 64×36`、删除
`(492,496), 80×36`，与参考逐项一致。

原发送验证码和删除按钮只有外观没有事件。当前按 BFF v3 契约调用
`POST /api/settings/account/email-verifications`、
`POST /api/settings/account/deletion-verifications` 和带 `verification_code` 的
`DELETE /api/settings/account`；预览态保持无网络并完成可见流程。测试覆盖发送、输入、
按钮启用和确认关闭。

截图证据：

- `output/playwright/settings-email-v54-final-784x674.png`
- `output/playwright/settings-delete-account-v54-final-784x674.png`

## v55 用量与计费页面精确对齐（2026-08-29）

在 `784×674` CSS 视口直接测量 Manus 用量页。该页面沿用设置右栏的单列信息架构，
不是独立账单仪表盘：标题下依次为任务/网站/电脑线形标签、免费套餐积分卡和积分历史。
本地保留独立 Billing 面板的分析能力，但嵌入 Settings 时只渲染参考层级。

本地与参考的 computed geometry 现逐项一致：标题 `(277,67.7), 451×30`；标签栏
`(277,138.7), 451×41`；套餐卡 `(277,203.7), 451×191`；积分历史标题
`(277,418.7), 451×24`；首个日期行 `(277,446.7), 451×36.5`。修复内容包括：

- 移除全局窄桌面规则对标签按钮施加的 `44px` 最小高度；
- 嵌入内容顶距由 `26px` 改为参考的 `24px`；
- “Free” 套餐标识按当前语言显示为“免费”；
- 积分和历史增量使用本地化千位分隔，如 `1,000`、`+1,000`；
- 页面名称改为“用量与计费”，每日刷新行使用 `CalendarSync` 语义图标；
- 网站、电脑、任务三种 scope 切换均完成真实浏览器回归。

截图证据：

- `output/playwright/settings-usage-v55-final-784x674.png`

## v56 快捷键页面与录制交互精确对齐（2026-08-29）

在 `784×674` CSS 视口重新测量 Manus 快捷键页，修正早期只在 `1280×720`
验证后被共享 Settings 根布局带来的纵向偏移。当前标题 `(277,67.7), 451×30`、说明
`(277,101.7), 451×18`、首行 `(277,160.7), 451×69`、输入框
`(498,176.7), 230×36` 和重设按钮 `(628,529.7), 100×32` 均与参考重合。
重设按钮同步为参考的 `14px/500/8px` 字体、字重和圆角。

录制状态不再只是替换文字：输入框切换为 `#0081f2` 边框和 `8px` 圆角，内部按钮为
`(499,177.7), 228×34`，显示“输入按键序列”并隐藏清除动作；悬停提示不会覆盖录制文字。
录制完成、清除和重设均完成真实浏览器回归。录制期间的按键由 window capture 阶段接管，
因此 `Escape` 只退出录制并保留原组合键，不再继续冒泡导致整个 Settings Dialog 关闭。

截图证据：

- `output/playwright/settings-shortcuts-v56-final-784x674.png`
- `output/playwright/settings-shortcuts-v56-recording-final-784x674.png`

## v57 个性化资料与知识管理（2026-08-29）

个性化页改为资料、知识两个明确 scope。资料页的导入卡、昵称、个人说明与自订指令按
`784×674` 参考视口重新测量；知识页新增搜索、新增知识 Dialog、本地筛选与 live BFF
保存流程。新增知识 Dialog 为 `(52,52), 680×570`，输入区和 footer 均与参考坐标重合。
记忆导入使用独立 Dialog，不再错误切换到知识页，并提供复制提示词、粘贴回应和禁用态。

截图证据：

- `output/playwright/settings-personalization-v57-final-784x674.png`
- `output/playwright/settings-personalization-v57-knowledge-final-784x674.png`
- `output/playwright/settings-personalization-v57-knowledge-dialog-final-784x674.png`
- `output/playwright/settings-personalization-v57-import-dialog-final-784x674.png`

## v58 设置导航滚动裁切修复（2026-08-29）

设置左栏继续保持独立纵向滚动。问题根因是 shadcn `TabsList` 默认居中对齐：当导航总高
超过容器时，内容从上下两端同时溢出，即使 `scrollTop=0`，首个“一般”选项仍会位于
裁剪边界上方。纵向列表现明确使用 `justify-content:flex-start`，并在选中项变化后统一校正
滚动位置；返回“一般”时严格归零，其他选中项按最近边界完整进入视区。

真实 DOM 验证中列表顶部为 `151.7px`，首个 tab 顶部为 `187.7px`，`scrollTop=0`，
保留了 `36px` 分组标题空间且不存在文字或图标裁切。

截图证据：

- `output/playwright/settings-nav-scroll-v58-final-784x674.png`

## v59 云电脑建立 Dialog 窄桌面滚动（2026-08-29）

原云电脑建立 Dialog 仅按 `1280×720` 校验并固定为 `800×684`。在 `784×674` CSS
视口中，其实际位置为 `(16,-5), 752×684`，上下边缘各越出视口 `5px`；中间方案区虽然
具有滚动，但外框圆角和 footer 边缘仍会被浏览器裁切。

Dialog 高度现使用 `min(684px, 100vh - 32px)`。标准桌面尺寸保持不变，在当前窄桌面下
精确落为 `(16,16), 752×642`。标题区固定 `60px`，footer 固定在
`(16,540), 752×118`，中间 body 为 `464px` 且拥有 `538px` 内容高度，可滚动 `74px`。
方案切换会同步月总计，下一步确认页与取消关闭均保持同一外框和固定 footer。

截图证据：

- `output/playwright/settings-computer-create-v59-final-784x674.png`
- `output/playwright/settings-computer-create-v59-scrolled-784x674.png`

## v60 Mail Dialog 与 shadcn 桌面尺寸归一（2026-08-29）

Mail 工作流引导和表单在 `784×674` 下复测：引导为 `(152,191), 480×292`，列表
`(172,247), 440×138`，主按钮 `(540,431), 72×32`；表单为
`(152,133), 480×408`，Textarea `(172,373), 440×90`，footer 为
`(152,469), 480×72`。创建 `kokoro-daily@kokoro.bot` 后列表即时更新。

授权发件人 Dialog 暴露出旧移动端尺寸污染：基础 shadcn Button、Tabs、Select、Command、
DropdownMenu、Toggle、Dialog 与 Sheet 中被额外加入 `max-[960px]` 的 `44px` 视觉尺寸，
`globals.css` 又重复强制所有 Dialog footer 按钮为 `44px`。浏览器缩放至窄桌面时，这些规则
会覆盖页面明确的 `32/36px` 几何，并非标准 shadcn 底座。

上述视觉尺寸覆盖已从共享 primitives 删除。授权发件人 Dialog 从 `480×210` 恢复为
`(152,236), 480×202`，输入与 footer 按钮均为 `36px`，关闭按钮保持 shadcn `32px`。
开关和复选框仅扩展不可见点击热区的规则未改动，不影响布局。新增 primitive 回归测试防止
`960px` 视觉尺寸类再次进入 Button、Tabs、Select 和 Dialog。

截图证据：

- `output/playwright/settings-mail-workflow-intro-v60-784x674.png`
- `output/playwright/settings-mail-workflow-form-v60-784x674.png`
- `output/playwright/settings-mail-sender-v60-final-784x674.png`

## v63 一般设置与语言下拉层精确复测（2026-08-29）

重新在 `784×674` CSS 视口读取 Manus 与本地真实 DOM 的 computed geometry/style，修复了
此前仅凭截图近似留下的差异。设置 Dialog 外框均为 `(32,33.7), 720×606.6`，左栏“一般”
恢复为 `(44,187.7), 196×32` 且 `scrollTop=0`，不会再裁切首项或卷走“设置”分组标题。

右栏标题 `(277,67.7), 451×30`、外观标题 `(277,138.7), 451×22`、语言按钮
`(277,208.7), 208×36` 已与参考重合。语言按钮改为 `rgba(55,53,47,.04)` 背景、
`16px/24px/400` 排版和无投影样式；主题按钮恢复参考的 `110×62/63`、`16px/24px/400`、
`10px` 圆角与 `12%` 中性边框。Dialog 阴影同步为参考的四层轻阴影，不再使用单层重阴影。

语言列表仍由 shadcn Select/Radix 提供键盘、焦点和单选交互，但定位改为 popper/start：弹层
从触发器下方 `y=249` 展开，不再以 item-aligned 模式覆盖触发器。弹层宽 `208px`、圆角
`12px`、每行 `36px`，只呈现 Kokoro 当前实际支持的 locale，不伪造未实现语言。

截图证据：

- `output/playwright/settings-general-v63-final-784x674.png`
- `output/playwright/settings-general-language-open-v63-final-784x674.png`

## v64 设置导航图标逐项审计（2026-08-29）

在 `784×674` 视口逐项读取 Manus 与本地导航 SVG 的 viewBox、路径、描边和 bounding box。
一般、账户、快捷键、连接器、电脑、开发人员、帮助均已有完全对应的 Lucide 路径，保持不动；
所有未旋转图标均为 `16×16` 且左边为 `x=58`。整合继续使用旋转 `45deg` 的 Plug，旋转后
bounding box 与参考同为 `22.627×22.627`。

修正三处此前仅“语义接近”的错误：Mail 从加号邮件改为邮件+星光；数据管理从闪电数据库
改为数据库+设置；部署从窗口面板改为 Lucide `MonitorSmartphone`。当前 Lucide 版本没有
`DatabaseCog`，因此数据库设置图标使用 `createLucideIcon` 按同一 `24×24 / stroke-width=2`
规范组合，不引入第二套图标库。帮助项的分组间距增加 `3px`，图标顶部由本地 `y=721.7`
修正为参考 `y=724.7`。

截图证据：

- `output/playwright/settings-nav-icons-v64-final-784x674.png`

## v65 Developer 空态与创建弹窗精确对齐（2026-08-29）

在 `784×674` CSS 视口重新读取 Manus Developer 页与本地真实 DOM。Developer 内容根节点
现完整占用设置右栏的 `525.6px` 可用高度，不再因 Radix ScrollArea 的 intrinsic measurement
wrapper 把空态压缩成 `130px`。标签栏 `(277,138.7), 451×40`，说明条
`(277,195.7), 451×42`，空态区域 `(277,253.7), 451×370.6` 均与参考重合。

空态由图标、文案组和按钮三个稳定组件组成：图标 `y=374`，标题 `y=418`，说明 `y=442`，
建立按钮 `(449.5,472), 106×32`。API Key Dialog 与参考同为 `(192,197), 400×280`；
Webhook Dialog 修正为 `(192,228), 400×218`，输入框 `(212,321.9), 360×36`，footer
按钮在 `y=390`。两个 Dialog 打开时不再自动把 Input 绘制成粗焦点环，后续键盘 Tab 仍由
Radix FocusScope 管理。

截图证据：

- `output/playwright/settings-developer-v65-aligned-784x674.png`
- `output/playwright/settings-developer-api-key-dialog-local-784x674.png`
- `output/playwright/settings-developer-webhook-dialog-v65-aligned-784x674.png`

## v66 部署空态与入口行为精确对齐（2026-08-29）

在 `784×674` CSS 视口逐项量测部署页的三个纵向 section。问题并非 Dialog 或
ScrollArea 尺寸错误，而是部署根节点残留了 `2px` 顶部补偿，图标自身又比参考低 `1px`。
部署根节点现不再附加旧布局偏移，空态图标间距独立调整为 `19px`，没有使用 transform 或
影响其他 Settings surface 的全局覆盖。

当前网站、应用、域名标题的 y 坐标分别为 `138.7 / 345.7 / 552.7`，图标为
`179.7 / 386.7 / 593.7`，空态文案为 `223.7 / 430.7 / 637.7`，按钮为
`253.7 / 460.7 / 667.7`；尺寸、间隔和参考逐项一致。第一个“立即建立”在参考产品中关闭
Settings 并返回网站创建工作区，本地保持同一交互模型；网站和应用仍通过明确的 kind 回调
进入各自 composer intent，域名入口切换到订阅/购买 surface。

截图证据：

- `output/playwright/settings-deployment-v66-final-784x674.jpg`

## v67 整合列表、Zapier 详情与导航上下文（2026-08-29）

在 `784×674` CSS 视口采集 Manus 整合列表和 Zapier 详情的真实 DOM、computed style、
ScrollArea 与 URL 变化。列表继续保持两列：Zapier/Slack 为 `219.5×128`，Telegram/Line
为 `219.5×90`，列间距和行间距均为 `12px`。本地删除旧的固定 `90px`、标题 nowrap 和
描述 clamp 后，四张卡的自然高度、文字区域、`rgb(250 250 250)` 背景、`6%` 中性边框、
`40px` logo 容器与参考逐项一致。Telegram 改为纸飞机图标，Line 的可访问名称不再被
装饰 logo 重复。

Zapier 详情不再是四项简化示例。Hero 为 `(277,138.7), 451×74`，标题与说明分别位于
`y=157.7 / 177.7`；概览完整保留说明与文档入口；模板区标题位于 `y=418.7`，八张模板卡
按两列渲染，首行卡为 `219.5×135 @ y=450.7`。每张模板包含语义应用图标组与独立 CTA，
详情内容可在 `526px` 高的 shadcn ScrollArea 中滚动。进入和返回详情会同步
`#/account/settings/integration/{id}` 与 `#/account/settings/integration`，刷新可恢复详情。

设置左栏同时修复深链初次挂载的滚动竞态。选中“整合”时容器与参考同为约 `603/489px`
的内容/视口高度，并为选中项下方保留 `94px` 导航上下文；不再只露出选中行的一条边。

截图证据：

- `output/playwright/reference-manus-integration-zapier-v67-784x674.jpg`
- `output/playwright/settings-integration-list-v67-final-784x674.jpg`
- `output/playwright/settings-integration-zapier-v67-final-784x674.jpg`
- `output/playwright/settings-integration-zapier-scrolled-v67-784x674.jpg`

## v68 连接器目录与 Custom API 表单（2026-08-29）

连接器设置右栏、目录 Dialog 与 Custom API 创建 Dialog 均在 `784×674` CSS 视口下以
真实 DOM geometry 逐项复测。设置右栏 body 为 `(277,114.7), 451×525.6`，空态 toolbar
与内容区分别为 `(277,138.7), 451×32` 和 `(277,182.7), 451×441.6`；导航不再依赖固定
尾部空白，而是将选中项滚到视口中心并让浏览器自然 clamp，因此连接器页 `scrollTop=11.5`。

目录 Dialog 为 `(19.6,16.9), 744.8×640.3`，搜索、四个分类、创建菜单和两列卡片使用
shadcn/Radix 的语义交互。Custom API Dialog 为 `(92,16.9), 600×640.3`；标题、描述、
名称、图示、备注和密钥区的 x/y/width/height 与参考重合。旧实现的单行密钥值已改为
`526×80` textarea，正文为独立 `502px` 可滚动区域，footer 固定在 `y=581/601.1`，不会
再因内容增长吞掉表单。添加密钥操作移到密钥卡片外，新增行会使保存重新禁用，删除后恢复。

图示上传现校验 PNG/JPG 与 1 MB 上限，错误以 `role=alert` 呈现；取消、关闭和保存都会
重置草稿并把焦点返回创建入口。表单不提交或回显 raw secret，后端契约只允许 write-only
secret value 与 masked metadata。

截图证据：

- `output/playwright/reference-manus-connectors-empty-v68-784x674.jpg`
- `output/playwright/reference-manus-connector-catalog-v68-784x674.jpg`
- `output/playwright/reference-manus-custom-api-v68-784x674.png`
- `output/playwright/settings-custom-api-v68-final-784x674.png`

## v69 Connector 创建链路：Custom MCP、JSON 与 URL（2026-08-29）

连接器“创建”菜单此前虽然显示四个入口，但 `form/json/url` mode 在上层被丢弃，JSON 导入和
URL 添加实际仍打开 Custom MCP 表单。本轮将布尔 `registering` 改为明确的
`form | json | url` 状态，每个入口使用独立 shadcn/Radix Dialog、独立表单状态和提交模型。

Custom MCP 在参考布局中的内容坐标全部按 Dialog 左上角归一量测：标题 `(20,20), 524×24`，
两列名称/transport 标签 `y=56`、输入 `y=84`，图示标签 `y=136`、60px 预览 `y=164`，
备注 `y=240/268`，URL `y=384/412`，headers `y=464/492`，保存 split button `y=658`。
本地删除旧 `20px/650` 标题和 16px 按钮覆盖后，字体、padding、背景和全部相对坐标命中；
隐藏 file input 不再形成 600px 的伪几何或多余可访问控件。

JSON Dialog 为 `600×458`：标题/描述相对 `y=20/44`，textarea 为 `(20,74), 560×308`，
导入按钮为 `72×36` 且距右/下均 20px。非法 JSON 显示字段内 alert；合法 `mcpServers`
fixture 会完成 mock 导入，不复用 Custom MCP 页面。

URL Dialog 折叠态为 `480×408`，展开 OAuth 后为 `480×500`。名称和 URL 内容宽均为
440px；URL 使用 Lucide Link 图标与 390×20 内部 input。进阶区域不是备注，而是
`OAuth client ID / client secret` 两个 `406×36` 输入，secret 使用 `new-password` 且只写。
HTTPS URL 才启用“保存”和“保存并发布”，非 HTTPS 保持禁用。

截图证据：

- `output/playwright/reference-manus-custom-mcp-v69-784x674.png`
- `output/playwright/settings-custom-mcp-v69-final-784x674.png`
- `output/playwright/reference-manus-mcp-json-v69.png`
- `output/playwright/settings-mcp-json-v69-final-784x674.png`
- `output/playwright/reference-manus-mcp-url-v69.png`
- `output/playwright/reference-manus-mcp-url-advanced-v69.png`
- `output/playwright/settings-mcp-url-v69-final-784x674.png`
- `output/playwright/settings-mcp-url-advanced-v69-final-784x674.png`

## v70 窄桌面侧栏状态机与 Composer 控件（2026-08-29）

窄桌面此前把折叠态错误实现成整条侧栏 off-canvas：`sidebar-gap/sidebar-container` 被强制为
`0px`，分隔条在 compact 模式始终 `display:none`，标题栏与侧栏又同时提供“展开侧栏”按钮。
这导致窗口变窄后导航完全消失，展开后也不能继续调整宽度。

（历史记录，已被 v167 当前基线覆盖。）当时记录为 `<=1365px` 且细指针的桌面 Web 会自动折叠为
`52px` 图标轨道，保留十个实际导航与
账户入口；折叠态分隔条仅禁用命中，展开后恢复 `pointer-events:auto`、键盘步进和指针拖拽。
主标题栏不再重复渲染汉堡入口，折叠轨道只保留一个稳定展开按钮。真实浏览器中展开宽度为
`300px`，ArrowRight 调整后 CSS 变量提交为 `316px`，侧栏容器与分隔条同步移动。

Composer 外框在同高桌面视口下继续保持参考的 `120px` 高度；连接器入口从直插头图标改为
Lucide `Cable`，更接近参考的线缆/连接节点语义，同时保留 shadcn Button 的尺寸与焦点行为。

截图证据：

- `output/playwright/sidebar-compact-v70-784x674.png`
- `output/playwright/sidebar-expanded-resize-v70-784x674.png`

## v71 首页 Composer 与快捷操作精确几何（2026-08-29）

首页继续使用 `1280×720` CSS 视口和真实 computed style 对照。此前 Composer 把水平留白
同时放在外框、textarea 和 controls 三层，造成左侧控件整体右移 4px、发送按钮左移 4px；
快捷操作还残留 12px 间距、12.48px 字体和实色背景。现在外框只负责 `12px 0` 垂直
padding，textarea 使用 16px 水平 padding，controls 使用 12px 水平 padding。

本地最终几何为：计划入口 `(595.5,114), 141×36`，标题 `y=200, 36/54px`，Composer
`(282,288), 768×120`，边框 `rgba(0,0,0,.2)`、圆角 `22px`、gap `12px`。添加、连接器、
Desktop 与发送控件的 x 坐标分别为 `295/335/375/1005`，y 均为 `363`。快捷操作行
`y=428`、gap `8px`；五个按钮宽度为 `112/112/84/112/58px`，统一 `14/21px`、
`7px 14px` padding、8px icon gap 和 6% 中性边框，均命中参考基线。

有内容状态通过真实 fill 复测：textarea 保持透明背景、0 边框、0 圆角和无阴影，外框仍为
`768×120`，发送按钮切换为可用状态且控件坐标不变，因此用户截图中的内层白色圆角面板不再
出现。当前仍需继续处理侧栏部分图标字形与推广轮播素材/文案差异，不能据此宣称首页整体完成。

截图证据：

- `output/playwright/reference-manus-home-v70-1280x720.png`
- `output/playwright/local-home-v71-final-1280x720.jpg`
- `output/playwright/local-home-v71-typed-1280x720.jpg`

## v72 首页输入态任务创建上下文与侧栏图标（2026-08-29）

同一段草稿输入后，参考首页会从“快捷提示 + 推广轮播”切换为任务创建上下文；本地此前只改变
发送按钮状态，导致功能层级明显缺失。AppFrame 现把 shell-owned `draft` 作为只读投影传给
站点空态，站点不接管编辑器状态、提交或传输。草稿非空时，快捷提示和推广轮播退出文档流，
改为专案归档条、创建类型和内建整合预览。

`1280×720` 下，白色 Composer 继续为 `(282,288), 768×120` 和完整 `22px` 圆角；灰色
专案底板从 `y=386` 开始，向上压住 22px，尺寸为 `768×79`，因此不会出现直角拼接。
创建区域为 `(298,485), 736px`，标题行高 `27.5px`，类型按钮行位于 `y=524.5`、高
`40px`、gap `10px`。首个“电子商务 + Shopify”按钮为 `193×40`，其余按钮按内容自然
收缩。内建整合预览从 `y=584.5` 开始，宽 `736px`；标题位于 `y=604.5`，并展示模型、
Shopify、资料库、图像、地图、通知、储存、API、Stripe 与语音转文字 mock 能力。

“新增到专案”使用 shadcn/Radix DropdownMenu，可选择站点 runtime brand 对应专案或新建
专案占位，并回显选中目标。真实坐标指针验证菜单打开时欢迎页 `scrollTop=0`，标题仍为
`y=200`，菜单在触发器下方 `y=457.5` 展开；自动化 locator 自带的 scrollIntoView 未被
误写入产品逻辑。

侧栏 DOM 对照同时确认：聊天入口由 `MessageSquare` 改为 `MessageSquareMore`，任务入口
由 `ListChecks` 改为 `ListTodo`，排程入口使用参考同族 `Clock`。三者继续保持 `18×18`
和原有 `x=17` 轨道，不改变 shadcn Sidebar 的折叠/拖拽状态机。站点品牌 mark 仍由 runtime
manifest 决定，没有复制参考产品 Logo。

截图证据：

- `output/playwright/reference-manus-home-v73-1280x720.jpg`
- `output/playwright/local-home-typed-context-v80-final-1280x720.jpg`
- `output/playwright/reference-manus-rail-v73-52x720.jpg`
- `output/playwright/local-rail-v80-final-52x720.jpg`
- `output/playwright/local-home-project-menu-v82-final-1280x720.jpg`

## v73 网站创作胶囊、类型横向浏览与整合预览（2026-08-29）

输入态右侧整合区域不再保留空白。站点自有 `project-website.webp` 与 CSS 服务面板组合在
`(823,572), 211×128` 的稳定 artwork 范围内；主窗口为 `(836,606.5), 132×100`，API
面板为 `(948,628), 86×72`。实现未复制参考产品 Logo、线上素材或私有接口数据。

部署设置中的“立即建立网站”现在把 AppFrame 已有的 `deploymentIntent` 投影为 Composer
只读状态胶囊，而不是只改变 placeholder。真实入口验证后，胶囊位于 Desktop 环境选择器
之后，几何为 `(522.55,363), 72×32`，使用 999px 圆角、14px 文案、6px 图文间距、
浅蓝背景和蓝色描边；Composer 保持 `(282,288), 768×120`，右侧语音与发送动作没有位移。
普通聊天不渲染该状态，避免把未选择的创作上下文伪装成默认能力。

创建类型行改为固定 `creationTypesFrame`、独立横向 scroll viewport 和绝对定位控制按钮。
viewport 为 `(298,524.5), 736×40`，内容宽 `1192px`；右侧按钮始终为
`(1002,528.5), 32×32`。真实坐标点击后 `scrollLeft` 从 `0` 平滑变为 `320`，按钮坐标
完全不变。Playwright locator 会额外触发外层 ScrollArea 的 `scrollIntoView`，本轮继续以
真实坐标点击结果作为产品行为证据，没有把工具造成的纵向滚动写入页面逻辑。

截图证据：

- `output/playwright/local-home-integration-artwork-v84-1280x720.jpg`
- `output/playwright/local-website-capsule-v85-1280x720.png`
- `output/playwright/local-home-types-scrolled-v85-1280x720.png`

## v74 Composer 状态胶囊与创建类型导航精确状态机（2026-08-29）

重新读取参考真实 DOM 后，网站胶囊不再只按截图近似。参考 computed style 为 `68×32`、
`padding: 6px 9px 6px 7px`、6px gap、14/21px 文案、9999px 圆角、
`rgba(0,129,242,.08)` 背景和 `rgba(0,129,242,.28)` 描边。本地通过“部署 → 网站 →
立即建立”的真实入口逐项复测，除站点品牌导致 Desktop 文案宽度不同外，上述参数全部命中。

空白直接会话此前比参考多渲染一个 AudioWaveform 按钮。参考该状态只有 `(965,363),32×32`
的语音输入和 `(1005,363),32×32` 的发送动作；本地现在采用相同结构。活动会话仍保留语音
模式与语音输入两个入口，不把首页视觉修正扩散到其它工作状态。

创建类型导航由固定向右 `320px` 改为参考的双态状态机。初始右箭头为
`(1002,532.5),24×24`；真实坐标点击后滚动至浏览器计算末端 `415.5/416px`，右箭头退出，
左箭头出现在 `(306,532.5),24×24`。返回点击后 `scrollLeft=0` 且右箭头恢复。滚动容器不再
保留人为右 padding，因此末端左箭头会像参考一样覆盖被裁切的前一项边缘。仪表板与生产力
图标同步改为 Lucide ChartPie 与 Rocket，避免继续复用错误的 Gauge 字形。

整合预览 wrapper 对齐参考 `(823,584.5),211×128`，内部合成素材分为主窗口
`(852,609),132×100`、左侧连接标记 `(830,670),44×20` 和支付面板
`(946,640.5),80×72`。素材使用站点自有 CSS/fixture 构造，没有下载参考线上资产。

截图证据：

- `output/playwright/reference-manus-home-current-v86-1280x720.png`
- `output/playwright/local-home-website-final-v86-1280x720.png`
- `output/playwright/local-home-types-end-v87-1280x720.png`

## v75 设置弹窗统一滚动文档与导航 thumb（2026-08-29）

常规设置继续以 `1280×720` 同视口和真实账户入口对照。两侧 Dialog 外框均为
`(128,36),1024×648`，左列宽 221px、内容分界 x=349，标题、语言、主题和通知区初始坐标
保持一致。此前本地虽然首屏相似，但标题固定在 ScrollArea 外，只有 `(373,117),755×567`
的正文滚动；参考右侧是覆盖完整内容列的 `(349,36),803×648` viewport，标题与正文属于
同一滚动文档。

当前 TabsContent 只在活动面板挂载一个 shadcn ScrollArea，内部 `contentColumn` 保留原有
755px 内容轴，panelHeader 与业务内容共同位于 viewport 内。真实滚轮验证中，参考达到
`scrollTop=52` 时标题 y=18；本地因简体中文少一行内容达到自身末端 `scrollTop=42` 时标题
y=28，二者均按各自 scrollHeight 正确裁切标题，不再出现固定标题与正文割裂。

左侧导航仍由原 TabsList 负责滚动和键盘焦点，但不再依赖 macOS 会自动隐藏的原生滚动条。
参考常驻 thumb 可见范围为 `(342,156),4×461`，颜色 `rgba(166,166,166,.5)`；本地现在
按 `clientHeight/scrollHeight` 动态计算相同几何。真实滚动到末端后，TabsList 为
`scrollTop=72/72`，thumb 移至 `(342,221),4×461`。选中项自动居中、常规页归零和窗口 resize
三条路径都会同步 thumb，不改变 Tabs/Radix 的交互语义。

截图证据：

- `output/playwright/reference-manus-settings-general-open-v88-1280x720.png`
- `output/playwright/local-settings-general-scroll-owner-v88-1280x720.png`
- `output/playwright/local-settings-general-scrolled-v88-1280x720.png`
- `output/playwright/local-settings-general-thumb-v89-1280x720.png`

## v76 账户信息分组与网站状态胶囊复核（2026-08-29）

账户设置继续使用 `1280×720` 桌面视口验证。Dialog 保持
`(128,36),1024×648`。字段标题和操作按钮不再继承旧的小字号：标题为
`14/20px, 500`，按钮为 `14/18px, 500`。Email 与 User ID 现在属于同一个身份信息组，
Email 行不画分隔线，只在 User ID 行结束后绘制 1px 分隔线。四个操作按钮的真实几何分别为
`(1064,435),64×32`、`(1064,489.5),64×32`、`(1064,576),64×32` 和
`(1048,630),80×32`，与参考纵向节奏一致。

网站状态胶囊通过真实“部署 → 网站 → 立即建立”入口重新验证，而非直接渲染孤立组件。
胶囊为 `(522.55,363),68×32`，与 Desktop 环境控件同处 `y=363`；computed style 为
`padding: 6px 9px 6px 7px`、6px gap、`14/21px` 文案、16px 图标、
`rgba(0,129,242,.08)` 背景和 `rgba(0,129,242,.28)` 描边。它保持只读选中状态，不参与
Composer 宽度分配之外的绝对定位，因此桌面宽度变化不会产生基线漂移。

截图证据：

- `output/playwright/local-settings-account-v91-1280x720.png`
- `output/playwright/local-website-capsule-v91-1280x720.png`

## v77 部署设置空状态、图标与滚动文档（2026-08-29）

部署设置通过真实账户菜单分别进入参考与本地页面，并在 `1280×720` 桌面视口对照。三组标题
统一为 `16/22px, 500`；网站、应用和域名标题分别位于 `y=141/348/555`。空状态图标位于
`y=182/389/596`，文案位于 `y=226/433/640`，`92×32` 操作按钮位于
`y=256/463/670`。三个分区的 x 坐标、宽度、分隔线、文字颜色和按钮圆角均与参考一致。

网站和应用空状态此前分别使用近似自绘图标与 Lucide Smartphone，左侧部署导航也错误使用
Lucide MonitorSmartphone。当前三者改为独立的填充式通用部署图标，保持参考的
`14×14`、`21.068×29.068` 和 `13.333×14.667` viewBox 比例；域名继续使用 Lucide Globe，
并修正为前景色和 2px 笔画。图标均为本地组件，不依赖参考站点线上资产或品牌资源。

最后一个域名分区移除多余 9px 底部空白。参考与本地右侧 ScrollArea 现在均为
`clientHeight=648`、`scrollHeight=693`、`maxScroll=45`；滚动到底部后标题 y=25，立即购买
按钮为 `(704.5,625),92×32`。右侧 thumb 统一为 8px 容器内的 6px 深灰圆角条，代替旧的
7px 浅灰实体。参考 Simplebar 对左侧导航末端取整为 73px，本地 Radix 为 72px；没有为这
1px 引擎取整差异添加破坏通用滚动模型的单页偏移。

截图证据：

- `output/playwright/reference-manus-settings-deployment-v92-1280x720.png`
- `output/playwright/local-settings-deployment-v92-1280x720.png`
- `output/playwright/reference-manus-settings-deployment-bottom-v92-1280x720.png`
- `output/playwright/local-settings-deployment-bottom-v92-1280x720.png`

## v78 整合列表、Zapier 模板卡片与跳转语义（2026-08-29）

整合列表和 Zapier 详情通过账户菜单真实进入，并在 `1280×720` 同视口复测。列表页继续保持
两列 `371.5px` 卡片、12px gap、88px 行高和 12px 圆角；Zapier、Slack、Telegram、Line
四项的标题、说明、图标容器和 Chevron 坐标均与参考一致，品牌文案由 runtime manifest
投影为当前站点名称。

Zapier 模板卡此前固定为 135px，导致 footer 下移 20px、第二行下移 20px，整个滚动文档也
与参考不一致。当前八张模板卡统一为 `(371.5×115)px`，首行 y=421、footer y=490.5，
第二行 y=548、footer y=617.5；两列 gap 为 12px，四行 grid 总高 496px。模板操作为
`64×32px`、`14/18px`、8px 横向 padding，与参考一致。

Calendly、Google Forms、Teams、Outlook、Salesforce、Shopify、Zendesk 和 Zoom 不再复用
通用 Lucide 线框图标，而是使用本地可识别服务图标；Outlook 复用仓库已有 connector 资源，
其余由本地 SVG 组件呈现。站点一侧仍使用非参考品牌标记，不复制参考 Logo 或线上素材。

八个“试试看”由无行为按钮改为真实 `_blank` 链接，使用只含 Zapier template ID 的 URL，
不复制参考页面中的账户、邮箱或会话参数。详情 ScrollArea 补齐 16px 底部空间，参考与本地
现在均为 `clientHeight=648`、`scrollHeight=897`、`maxScroll=249`。滚动到底部后八张卡完整
可见；点击返回后两侧都恢复整合列表及对应 URL，而不是只替换 DOM 内容。

截图证据：

- `output/playwright/reference-manus-settings-integration-v93-1280x720.png`
- `output/playwright/local-settings-integration-v93-1280x720.png`
- `output/playwright/reference-manus-settings-zapier-v93-1280x720.png`
- `output/playwright/local-settings-zapier-v93-1280x720.png`
- `output/playwright/reference-manus-settings-zapier-bottom-v93-1280x720.png`
- `output/playwright/local-settings-zapier-bottom-v93-1280x720.png`

## v79 开发人员空状态、创建弹窗与深链恢复（2026-08-29）

开发人员页继续通过真实账户菜单进入参考与本地设置中心。API 密钥与 Webhooks 使用同一组
`14/20px, 500` 子 Tab、2px 活动态下划线、42px 提示横幅和 FileText 空状态图标；空状态
按钮恢复 shadcn outline 语义，不再使用无边框近似按钮。API 与 Webhook 两个空状态均只
渲染一个 `32×32px` FileText 图标，标题、说明和按钮保持三段稳定垂直节奏。

API 密钥创建 Dialog 为 `400×280px`，标题区 60px、字段区 144px、footer 76px。字段标签
统一为 `14/20px, 500`，Input、Select 和 footer 按钮统一为 `14/20px`；两个字段控件均为
`360×36px`。Webhook Dialog 为 `400×218px`，标题区 60px、URL 字段区 82px、footer 76px，
Input 与两个 `72×36px` 操作按钮的尺寸、圆角和禁用态均与参考一致。两个弹窗均由 shadcn
Dialog、Field、Input、Select 和 Button 组合，不引入第二套弹窗实现。

本轮同时修正了开发人员深链。参考真实菜单生成的路径包含复数 `developers`，旧解析器只接受
`#/account/settings/developer`，因此复制或刷新复数 URL 会错误回到账户页。当前解析器按最后一个
`settings` 路径段读取目标页，并将 `developers` 归一到内部 `developer`；本地输出 URL 统一为
`#/account/settings/developers`。真实浏览器刷新验证会首帧打开“开发人员 / API 密钥”，关闭设置
后 URL 恢复为 `/app`，且 Dialog 数量归零。嵌套参考形式
`#/account/general/developers/settings/developers` 也由回归测试覆盖。

## v80 云电脑储存配置与订单确认流程（2026-08-29）

“我的电脑”通过真实设置导航重新进入参考与本地页面。空状态卡不再使用近似的 Lucide Monitor
线框，而是使用本地 `32×32px` 填充式屏幕与底座图标；外层图标容器、标题、说明和
`92×32px`“立即建立”按钮继续保持参考的单行卡片结构。

套餐 Dialog 补齐此前缺失的配置正文。三个方案后依次呈现“每个方案都包含”、地点和储存空间；
地点固定为服务端创建契约当前支持的美国东部，储存空间由 shadcn Slider、数值 Input 和
`35/70/120/250/500/750/1000 GB` 七个快捷档位共同控制。Standard 默认包含 70GB，额外
储存按参考实测的 `$0.10/GB/月` 计算：70GB 显示 `$0`，250GB 显示 `$18`，footer 月总计
同步从 `$30` 更新为 `$48`。创建请求现在发送 `plan`、`region` 和 `storage_gb`，不再丢弃
用户在 UI 中选择的储存配置。

第二步删除了本地旧的“电脑名称”替换页面。参考点击“下一步”会在套餐 Dialog 之上打开独立
订单确认 Dialog，本地现在采用相同嵌套 Radix Dialog 模型。确认层固定为 `480×340px`，展示
套餐价格、包含出站流量、额外储存、月预估费用和税费说明；取消只关闭确认层并恢复套餐层，
支付完成后关闭两层创建 Dialog，但设置中心继续保留。真实桌面滚动、250GB 价格联动、取消与
支付关闭链路均已复测。

## v81 本地电脑文件夹授权状态（2026-08-29）

“我的电脑”的本地电脑 Tab 此前只有静态按钮，点击后仍显示云电脑卡片，并残留一个与参考不符的
矩形 focus background。当前两个 Tab 由真实 `cloud | local` 状态驱动，`aria-selected`、2px
活动下划线和正文内容同步切换；Tab 的 focus-visible 只保留语义焦点，不再叠加灰色块。

本地电脑正文改为独立文件夹授权空状态。面板顶部 `y=198`、高度约 `470px`，使用 Lucide
FolderPlus `32×32px` 图标；图标、标题和两行说明在面板中垂直居中，与参考相同。说明中的
桌面应用入口为真实 `kokoro://app` 协议链接，显示品牌名来自 runtime manifest 投影，不硬编码
Manus 文案。切回云电脑后授权面板卸载，“立即建立”卡片恢复；两个方向均由浏览器交互和测试
覆盖。

## v82 Mail 设置与收件匣双状态（2026-08-29）

Mail 页面此前只有“设置 / 收件匣”两个静态按钮，点击收件匣不会改变正文。当前两个入口改为真正的
shadcn Button Tab，`aria-selected`、2px 活动态下划线和正文同步切换；focus-visible 不再产生
参考中不存在的矩形灰底。

设置页继续保留任务邮箱、工作流邮箱、授权发件人及两条创建 Dialog 流程。收件匣页新增与参考
相同的寄件人、内容、日期三列表头与右侧刷新图标，并覆盖加载、空数据和列表三种正文状态。空态
在约 362px 高的正文区垂直居中，文案为“没有资料”；刷新会重新请求收件匣，并在请求期间禁用
刷新按钮。

前端请求统一到 v4 契约的 `/api/mail/*`，删除未被契约承认的 `/api/hub/mail/*` 路径。收件匣
新增 `GET /api/mail/inbox` 分页 projection；工作流和授权发件人创建均携带
`Idempotency-Key`。预览模式仅返回合成空数据，不读取或复制参考账户的邮箱、Cookie 或 Token。

真实 `1280×720` 桌面浏览器对照确认：设置 Dialog、左侧导航、标题、Tab、表头、刷新动作与空态
均在完整应用壳层内渲染和交互，而非孤立组件截图。

## v83 数据管理层级、密度与云浏览器状态（2026-08-29）

数据管理首屏删除旧版近似字号：标题由 `0.92rem` 统一为 `16/24px, 500`，说明由
`0.78rem` 统一为 `14/20px`。共享任务、共享文件、封存任务三段固定为 89px 高并使用 24px
顶部节奏；授权应用与云端浏览器两行标题间距按参考实测收敛到 67px。两条管理行之间不再绘制
参考中不存在的 Separator。真实桌面对照中，前三段标题坐标误差为 `2–4px`，授权应用标题约
`1px`，云端浏览器标题约 `1px`。

此前授权应用与云浏览器只替换正文，Settings 顶部仍错误显示“数据管理”。当前子视图状态提升到
Settings 壳层，二级页面会同步显示返回箭头和“授权应用 / 云浏览器”标题；点击返回同时恢复首屏
与 `#/account/settings/library`，刷新二级深链也能直接恢复正确标题、正文和 URL。

授权应用空态改为占满标题以下内容区的 flex 居中布局，Shield 图标、标题和说明与参考垂直位置
一致。云浏览器详情补齐标题下 24px 间距，持久登录卡为 64px 高，Switch 校准为 `36×20px`；
Cookies 标题和 File 空态在同视口下分别约 `1px` 与 `3px` 误差。Switch 继续使用乐观更新，保存
失败时恢复旧值，避免界面状态与服务端持久化结果脱节。

## v84 外挂一级页面、目录网格与管理交接（2026-08-29）

此前 Rail 的“外挂”错误打开 Settings MCP 面板，与参考的 `/app/plugins` 一级工作台完全不同。
当前新增 `/app/plugins` App Router 页面和站点自有 `KokoroPluginsSurface`；Rail 与 Command Menu
通过受控本地 registry 导航到同一 URL。插件页不渲染会话 WorkspaceHeader、Composer 或欢迎面，
但继续复用同一个 shadcn Sidebar 壳层，页面切换无整页刷新且 URL 同步变化。

插件首屏按真实 `1280×720` 参考重建：72px 顶部区域、右侧“管理连接器 / 建立”、四项推荐横条、
36px 搜索框，以及连接器和资料来源两个双列目录。推荐卡为 `280×115px`、16px gap；目录卡为
双列、12px gap、76px 行高。首屏标题和操作按钮坐标误差约 `0–1px`，推荐卡与搜索框坐标一致，
目录首卡约 `2px` 误差。推荐顺序固定为 My Browser、Gmail、Notion、Meta Ads Manager，与参考
一致。

搜索会同时过滤连接器与资料来源；上一页、下一页和查看全部维护真实分页状态；每张卡片的添加按钮
在 Plus 与 Check 状态间切换并提供完整可访问名称。“管理连接器”和建立菜单继续打开 Settings
MCP 管理面，URL 形如 `/app/plugins#/account/settings/mcp`，关闭后恢复插件页上下文。目录数据使用
本地合成 fixture 和仓库自有图标，不复制参考账户、Cookie、Token 或受保护素材；正式数据契约继续
使用 `GET /api/connectors/catalog`。

## v85 外挂资料来源语义与完整分页（2026-08-29）

进一步对照完整页面后发现，旧 fixture 将 ElevenLabs、OpenAI、OpenRouter 等 Custom API 管理项
错误渲染为“资料来源”。当前目录数据明确拆分为 `APP_CONNECTORS` 与
`DATA_SOURCE_CONNECTORS`：资料来源首屏按 Similarweb、World Bank DataBank、X/Twitter、
Brand24、Ahrefs、CoinGecko、PopHIVE、Morningstar、Alpaca、Alpha Vantage 排列，第二页继续
提供 FRED 与 OECD Data Explorer。没有仓库自有品牌资源的项目使用稳定文字标识槽，不抓取参考
账户资源。

推荐卡改用独立文案映射，不再错误复用目录卡说明。目录第一张卡从 `y=353` 上移到 `y=350`，
与同视口参考一致；分区标题约 `0.5px` 误差。资料来源“下一页”现在可用，真实点击后上一页启用、
下一页禁用并显示第二页两项；“查看全部”和搜索仍复用同一数据状态。页面隐藏原生视觉滚动条，
但保留滚轮、触控板和键盘滚动。

契约同步要求 `/api/connectors/catalog` 使用 `kind=connector | data_source` 区分目录，正式后端不得
把 Custom API 管理能力投影为内建资料来源。

## v86 管理连接器弹窗语义、滚动反馈与焦点交接（2026-08-29）

从外挂页执行同一“管理连接器”动作后，参考与本地设置弹窗在 `786×674` 桌面视口下重新对照。
本地 Dialog 实测为 `722×606.6px`，参考约 `721×607px`；分栏线、标题、搜索、操作按钮与空态
中心位置保持约 `0–2px` 差异。设置正文的可见页面标题由 `h2` 调整为 `h1`，隐藏的 Radix
`DialogTitle` 继续提供 Dialog 可访问名称，页面层级与参考一致。

左侧导航继续使用无原生滚动条的自绘反馈，但灰色 thumb 不再因打开弹窗时自动聚焦活动 Tab 而
常驻；只有鼠标实际悬停导航区域时才显示。站点自有页面的 `onOpenSettings` 回调新增可选
`returnTarget` 参数，外挂页把“管理连接器”按钮作为显式返回目标。真实浏览器验证关闭后 URL 从
`/app/plugins#/account/settings/mcp` 恢复 `/app/plugins`，Dialog 数量归零，焦点准确回到该按钮，
不会落到 `body`、侧栏账户按钮或不存在的 Composer。

## v87 专案工作区容器自适应与资源弹窗视口约束（2026-08-29）

专案页原先只在浏览器视口小于 `768px` 时切换单列，因此在 `786×674` 的桌面 Web 窗口中，
扣除 52px 导航 Rail 后仅剩约 734px 的工作区仍被强行拆成任务栏与 256px 上下文栏。当前
`AppFrame` 将主工作区声明为 `workspace-main` inline-size container；当真实可用宽度不超过
`60rem` 时，专案信息、Composer、指令、文件资源、技能、网站、定时任务和任务列表进入同一
文档流。宽桌面继续使用双栏，不再用浏览器宽度猜测侧栏和 Canvas 占用后的剩余空间。

同视口对照确认专案身份起点为约 `(76,88)`、Composer 为 `(76,160), 686×120`、指令卡从
`y=305` 开始、资源卡从 `y=470` 开始，与参考页保持约 `0–1px` 差异。专案资源和技能 Dialog
仍以 680px 为理想高度，但增加 `height: min(42.5rem, calc(100dvh - 2rem))` 与内部纵向滚动；
在 674px 高视口中资源 Dialog 从原先贴顶贴底的 `y=0/h=674` 修正为 `y=16/h≈643`，参考为
`y≈17/h≈642`。标题、筛选、搜索、空态图标和新增分段按钮继续沿用同一 shadcn/Radix 组件树。

## v88 一般、账户与个性化设置同视口复核（2026-08-29）

在 `786×674` 桌面视口中重新通过真实账户菜单进入参考设置中心。本地与参考的一般页 Dialog
外框、220px 左侧导航、正文标题轴、主题三段按钮和通讯偏好行保持约 `0–1px` 差异；账户页
身份行、套餐卡及账户详情行保持约 `1–2px`。账户套餐中的“每日刷新积分”图标由普通日历修正为
Lucide `CalendarSync`，使图形语义与参考的刷新日历一致。

个性化个人资料页补齐“知识”后的帮助图标，导入卡图标由重叠方块改为四宫格；“更多关于您的
资讯”编辑器由 122px 收敛为参考的 104px 并移除原生 resize 手柄，删除参考中不存在的底部提示
行。修正后编辑器为 `y≈452–556`，固定导入按钮仍位于 `y≈581`。新增知识 Dialog 的内容面板由
180px 增至 215px，字符计数进入灰色面板右下角；外框、三个字段和 footer 坐标不变。知识 Tab、
新增入口、三字段表单和计数状态均由交互测试覆盖。

## v89 网站创作状态胶囊图标与色值复核（2026-08-29）

通过“设置 → 部署 → 网站 → 立即建立”真实入口复核 Composer 内联状态。胶囊继续保持
`76×36px`、`7px` 图文间距、`18×18px` 图标槽和 `12×12px` 图标，未改变 Composer 或右侧
动作的布局。旧 `AppWindow` 在小尺寸下呈现日历式顶栏，已替换为更接近网站代码语义的 Lucide
`CodeXml`；背景与描边统一为参考的 `rgba(0,129,242,.08)` 和
`rgba(0,129,242,.28)`。状态仍为只读 `role=status`，不伪装成可点击按钮。

## v90 快捷键页面位置与录制状态闭环（2026-08-29）

快捷键正文不再继承 Settings ScrollArea 的额外 `24px` 顶部留白；标题、说明、分隔线和第一行
分别稳定在约 `y=72/105/136/177`。列表自身使用 `24px` 外边距补偿，因此只修正标题区，不移动
已经与参考一致的五行快捷键、清除动作和重置按钮。

真实浏览器依次验证“点击录制 → 输入 `⌘⇧P` → 清除 → 重设”：按钮内容依次为“输入按键序列”、
`⌘⇧P`、“未设置”和默认 `⌘⇧O`；录制结束后清除按钮恢复，重置后不残留 recording 状态。
同轮复核用量与计费首屏，继续保持标题、任务/网站/电脑线形标签、单一套餐容器和积分历史的既有
结构，没有加入参考中不存在的独立后台卡片。

## v91 Dialog 关闭命令与二层弹窗交互复核（2026-08-29）

整合与开发人员页面在 `786×674` 桌面视口重新实测：整合页维持两列卡片，开发人员页保持
API 密钥/Webhooks 线形 Tab、说明条和居中空态。API 密钥与 Webhook 创建 Dialog 的外框、字段、
footer 和遮罩未改变。

真实交互发现右上角 X 曾与 footer 的“取消”共享可访问名称；API secret Dialog 的 X 也与“完成”
重名。现在项目上下文、账户、知识、云电脑、Mail 和开发人员二层 Dialog 均统一使用
“关闭对话框”作为 X 的命令名称，footer 继续保留“取消”“完成”等业务动作。浏览器 DOM 已确认
API 密钥 Dialog 内“关闭对话框”“取消”“建立”各自唯一；测试覆盖 API 密钥、secret 和 Webhook
三个二层 Dialog，视觉尺寸与 CSS 没有变化。

## v92 窄桌面侧栏跨断点状态与唯一分隔线（2026-08-29）

（历史测量；现行隐藏/展开行为以文末 `v201` 当前契约为准。）

在 `786×674` 桌面视口实测折叠轨道为 `52px`，固定 Sidebar container 与 gap 同宽，唯一自绘
分隔元素位于 `x=51/w=1`；shadcn stock rail 未重复挂载。手动展开后 container、gap 均为
`300px`，分隔线为 `x=299/w=1`；键盘 ArrowRight 调宽后三者同步提交为 `316/316/315px`，
没有不同速度或双边线。

补齐跨断点状态：窄桌面临时展开后放宽窗口，`compactRailOpen` 会被清除；后续再次缩窄总是从
参考的 `52px` 图标轨道开始，不恢复旧窄窗口会话的展开状态。进入专案时窄桌面同样回到图标轨道，
设置 Dialog 打开和关闭期间保持该状态。动态 `matchMedia` 测试覆盖“宽 → 窄 → 手动展开 → 宽 →
再次窄”的完整转换。

## v93 首页推广轮播从静态占位升级为真实交互（2026-08-29）

首页原先只有一张游戏推广内容，却渲染五个不可操作圆点；该结构视觉上模仿轮播但没有对应功能。
当前改为五项真实 carousel，使用站点自有的游戏、网站、排程、Slack 与 Zapier 素材和合成文案，
不复制参考账户或受保护资源。容器继续保持 `540×100px`，五点轨道尺寸和页面流位置不变。

轮播每 `6s` 自动前进，也可点击圆点直接选择；hover、键盘焦点和
`prefers-reduced-motion: reduce` 会暂停自动切换。活动点使用 `aria-current`，内容切换通过
`aria-live=polite` 通知。真实浏览器逐项验证五张图片均完成加载，标题与活动点依次同步；组件测试
覆盖第二项点击切换，不再以静态圆点伪装功能。

## v94 专案指令 GET/PATCH 水合与 preview 持久 fixture（2026-08-29）

专案指令此前只在 Dialog 内维护草稿，即使 PATCH 成功，刷新后编辑器仍从空值开始。AppFrame 现在
按 `projectRef` 读取 `GET /api/hub/projects/{projectRef}` 的 `instruction` projection，保存继续使用
同路径 PATCH `{ instruction }`；请求体不包含 `tenant_id`、`site_id` 或 actor 身份字段。成功写入后
同步更新当前 projection，重新打开无需等待第二次网络读取。

preview 模式使用 `kokoro.preview.project.{projectRef}.instructions` 隔离合成 fixture，使本地 UI 的
保存、刷新和再打开与 live 状态机一致，而不伪造跨租户服务响应。真实浏览器完成“输入 → 保存 →
刷新 `/app/project/kokoro` → 重新打开”验证，内容完整恢复；Dialog 仍为 `560×560px`，Textarea、
历史、取消和保存按钮几何未改变。AppFrame 测试覆盖按 projectRef 水合和保存后 projection 更新。

## v95 专案指令历史双栏弹窗与版本切换（2026-08-29）

通过真实 Manus 专案依次打开“专案指令 → 历史记录”，并在同一 `1280×720` 桌面视口与本地对照。
两边二层 Dialog 均为 `(140,24), 1000×672px`，左栏宽 `300px`；标题约位于 `(164,49)`，正文
起点约 `(464,94)`，关闭按钮位于右上角。历史列表使用浅灰背景表达当前版本，不再让 Radix 初始
焦点给首行叠加粗灰焦点框；Dialog 容器接收初始焦点，按 Tab 仍可进入版本按钮。

版本列表改为真实 `ul > li > Button` 结构，按钮用 `aria-pressed` 暴露选择状态。真实浏览器保存两次
不同指令后，历史按新到旧显示；点击旧版本会切换右侧正文，关闭二层 Dialog 后仍回到父级专案指令
编辑器且当前草稿不丢失。preview revision 使用项目隔离的 localStorage fixture；作者回退为本地化
“你”，不再错误使用产品品牌名。BFF 契约补充 revision ID、指令、ISO 时间、当前版本标记和最小
actor projection，并要求 PATCH 原子创建版本。

## v96 折叠 Rail 图标字形与底部真实入口（2026-08-29）

在同一 `1280×720` 视口重新截取 Manus 与本地首页。两边 Rail 均为 `52px`，新建任务、聊天、
Agent、排程、资料库、项目、任务和通知的中心轴与纵向停靠点一致。品牌位继续由 runtime manifest
提供，不在通用包硬编码参考商标。外挂图标原先四个半径过大的圆相互粘连成花形，现改为四个独立
圆环；底部电脑图标补齐参考中的右下状态徽记。两个自定义 SVG 分别暴露稳定的
`data-slot="plugins-icon"` 与 `data-slot="computer-status-icon"`，回归测试锁定其图元结构。

功能复核发现底部电脑和通知过去只是 `aria-hidden` 静态 `span`。现在两者使用 shadcn `Button`
保持同一 `32×32px` 命中区、hover 和键盘焦点：电脑入口打开现有“我的电脑”设置页，通知入口
打开“一般”页的“通讯偏好”。真实浏览器 DOM 确认两个按钮均有唯一可访问名称，目标 Tab 正确
选中；没有新增虚假的通知中心或无响应占位。

## v97 网站创建模式单一状态与刷新恢复（2026-08-29）

同视口对照发现，本地刷新后仍保留网站创建选项和网站提示词，却丢失 Composer 的“网站”胶囊；
根因是两套互不一致的判定：欢迎面用“草稿非空”猜测网站模式，胶囊则读取只存在于内存的
`deploymentIntent`。这也会让普通聊天草稿错误进入“您想建立什么？”网站布局。

当前 `EmptyStateProps` 增加显式 `creationIntent` projection，Kokoro 欢迎面只在
`creationIntent === "website"` 时渲染网站创建选项，非空草稿不再被当作产品模式。待创建工作区
使用 `kokoro.web.pending-creation-intent` 保存 `website | app`，与现有 pending draft 一起跨刷新
恢复；新建任务会同时清空 intent，已有消息的 Composer 不继承待创建胶囊。

真实浏览器完成四段验证：“建立网站”后胶囊和创建区同时出现；刷新 `/app` 后两者同时恢复；点击
“新建任务”后胶囊消失并回到场景按钮；输入普通草稿后仍保留聊天场景结构且没有网站创建标题。
组件和 AppFrame 测试分别覆盖显式 intent、普通草稿隔离、刷新挂载恢复及新任务清理。

## v98 Figma 与 Shopify 入口标记（2026-08-29）

网站创建区不再使用通用黑色网格图标代替 Figma，也不再把 Shopify 降级成无标记文本。当前
“从 Figma 汇入”使用独立 `14×14px` 彩色标记；电子商务入口保持“电子商务 · [绿色标记]
Shopify”的信息顺序。两处分别暴露 `data-slot="figma-mark"` 和 `data-slot="shopify-mark"`，便于
组件测试和同视口视觉回归稳定定位。

在 `1280×720` 桌面视口复核后，第一行创建类型按钮的宽度、间距和页面坐标没有被标记替换带动。
真实参考页点击“从 Figma 汇入”时没有出现 Dialog、URL 变化或其他可见状态，因此本地没有虚构
导入弹窗或额外 API；后续出现可验证的产品流程时再补对应契约。

## v99 网站模式胶囊几何与图标（2026-08-29）

Composer 的网站模式胶囊由 shadcn `Badge` 承载，不再使用自定义状态容器；稳定槽位为
`data-slot="creation-intent"`。真实参考页 DOM 测得外层为 `68×32px`、padding 为
`6px 9px 6px 7px`、描边为 `rgba(0,129,242,.28)`，本地按相同数值实现，并保持 `6px` 图文间距、
完整圆角和固定布局占位，切换模式时不会挤压左右控件。

原 `SquareCode` 表达的是代码而非网站窗口，现替换为 Lucide `AppWindow`，与参考的方形网页窗口
字形一致；浅蓝背景、蓝色描边及文字基线同步收紧。参考胶囊没有可见关闭按钮，本地也不虚构 `×`；
模式退出继续由“新建任务”的显式状态清理负责。组件测试锁定槽位、可访问状态和具体图标字形。

同视口浏览器复核中，本地与参考工具栏起点均为 `x=295`，发送按钮均为 `x=1005`，控件行均为
`y=363/h=32`。环境选择器不再在共享 Composer 内硬编码 `Kokoro Desktop`，而由 AppFrame 使用
runtime `brandName` 和 i18n `settings.desktopApp` 投影；简体中文统一为“{brand} 桌面版”。本地网站
胶囊比参考向右约 `2.9px`，该差值完全来自 `Kokoro` 与 `Manus` 的实际字宽差异，外层 gap 和控件
尺寸一致；不使用品牌专属 magic offset 破坏其他 site 的可维护性。

## v100 网站收纳提示条结构与下拉交互（2026-08-29）

在同一 `1280×720` 视口测量 Composer 下方提示条。参考外层为 `(282,386), 768×79px`，背景
`rgba(55,53,47,.04)`，仅左右和底部 `1px` 边线，圆角 `0 0 22px 22px`；内容 padding 为
`32px 12px 10px`。本地已逐项使用相同数值，不再用实体灰底和四边边框制造 Composer 中间白线。

标题和说明从 `span > strong + small` 改为与信息层级一致的 `div > p + p`：两行均为
`13px/18px`，标题 `500/#4d4d4d`，说明 `400/#737373`，位置分别为 `y=418/436`。右侧 shadcn
Button 从 `109×32px` 收敛为参考的 `28px` 高、`8px` 横向 padding、`4px` gap 和 `8px` 圆角；
简繁体字形使当前按钮宽度与参考相差 `2px`，但两者右边界均为 `x=1037`，因此不加入语言偏移。

DropdownMenu 功能保持完整。真实浏览器验证展开时触发器设置 `aria-expanded=true`，选择项目后菜单
关闭、按钮回显目标项目且焦点返回触发器；结构测试锁定标题和说明的段落语义。

## v101 网站创建标题行与横向类型选择器（2026-08-29）

同一 `1280×720` 视口下，创建区标题行保持 `(298,485), 736×27.5px`。标题从粗体 `h2` 收敛为
参考的段落标签，使用 `500 14px/20px` 与 `#1a1a1a`；section 继续通过 `aria-labelledby` 获得区域
名称。标题行补齐右侧 `8px` 内缩，操作组内部 gap 从 `4px` 调整为参考的 `2px`。

“新增网站参考”和“从 Figma 汇入”继续使用 shadcn Button 保持键盘语义，但皮肤按参考调整为
`13px/19.5px`、`4px 6px` padding、`4px` 图文 gap 和 `4px` 圆角。操作组右边界与参考同为
`x=1026`；简繁体总字宽造成左边界约 `5.5px` 差异，不使用语言专属偏移。

类型按钮保持 `40px` 高、`12px 12px 12px 14px` padding、`10px` 内部 gap 和 `10px` 圆角；行间
gap 从 `10px` 修正为参考的 `12px`，文字统一为 `#4d4d4d 14px/20px`。Shopify 标记补充绿色袋身
和提手轮廓，不再是纯绿色字母方块。真实浏览器验证箭头控制使 `scrollLeft` 按
`0 → 433.5 → 0` 变化，`data-direction` 和可访问名称同步在 `next/更多` 与 `previous/上一组` 间切换。

## v102 内建整合预览与稳定插画槽（2026-08-29）

整合预览外层与参考同为 `(298,584.5), 736×128px`，`12px` 圆角、`8px` flex gap、左侧 `16px`
padding 和 `rgba(55,53,47,.04)` 背景。原先四向 padding 让文案列从 `y=601.5` 开始，现改为参考的
`(314,592.5), 501×112px`，使用上下 `12px` padding、`8px` 内部 gap 和垂直居中。

标题由 `700` 调整为参考的 `500 14px/20px #1a1a1a`，箭头恢复为 `16px`。标签容器精确为
`501×60px`、gap `6px`、两行裁切；每项从无边线的 `24px/12px` 标签改为 `27px` 高、
`0.5px rgba(0,0,0,.06)` 边线、`4px 10px` padding、`13px/18px` 文本和 `8px` 圆角。

右侧合成插画使用稳定 `211×128px` 槽位，坐标 `(823,584.5)`，与参考图片的横向边界一致，外层
统一负责裁切，宽屏或侧栏变化不会带动插画漂移。类型选择器的 Lucide 主图标同步从 `16px` 修正为
参考的 `18px`，使首项文字横坐标恢复到参考基线。参考卡片点击不会改变 URL、Dialog 或输入状态，
本地不虚构额外动作。

## v103 一般设置通知行弹性宽度回归（2026-08-29）

通过真实账户菜单进入 Manus 设置，而非只依赖 hash 首帧。`1280×720` 下两边 Dialog 均为
`(128,36), 1024×648px`，`16px` 圆角；左栏活动项为 `(140,190), 196×32px`。一般页标题、外观、
语言、主题和通讯偏好的关键坐标继续保持一致，证明公共设置壳未发生回归。

通知行暴露出截图不易发现的自适应缺陷：本地文案列按短中文内容收缩为 `294px`，参考使用 flex
占满 Switch 前的剩余空间，宽 `713px`。当前 `.notificationRow > div` 增加 `flex: 1 1 auto`，使行宽
稳定满足 `755 - 16 gap - 26 switch = 713px`；实测恢复为 `(373,453), 713×38px`，Switch 仍为
`(1102,464), 26×16px`。长文案和其他语言不再提前换行，也不会推动开关位置。

真实交互验证“接收产品更新”依次为 `checked → unchecked → checked` 并恢复原值；关闭设置后 Dialog
数量归零、URL 从设置深链恢复 `/app`。深链没有原始触发器时，焦点回到 Composer 输入框而非落在
document body。设置测试 `46/46` 覆盖既有导航、表单和二层 Dialog 行为。

## v104 账户菜单内部密度与焦点交接（2026-08-29）

账户菜单外框此前已与参考同为 `(10,258), 284×418px`，但内部仍混用旧组件密度：头像文案起点
偏右约 `4.8px`，名称使用 `700` 粗体，套餐按钮高 `32px`，菜单项使用 `6px 8px` padding 和
`8px` 图文间距。外框相同并不能掩盖这些基线差异，视觉上会呈现“结构相似但细节松散”。

当前头部固定为 `276×56px`、`8px` padding 和 gap；头像为 `(22,270), 28×28px`，名称恢复为
`(58,270), 500 14px/20px`，工作区说明为 `(58,290), 400 12px/16px`。套餐行为
`(14,318), 276×44px`，使用 `8px 8px 8px 12px` padding；套餐标题为
`700 14px/20px` serif，升级按钮精确为 `(226,326), 56×28px`、`8px` 圆角与
`500 13px/18px`。

积分、账户、个性化、设置、首页、帮助、文件和退出均统一为 `276×36px`、`8px` padding、
`4px` gap、`8px` 圆角与 `14px/20px`。图标槽调整为 `20px`，使图标起点 `x=22`、文字起点
`x=46`；退出色与参考同为 `rgb(251,73,79)`。所有条目的 y 坐标继续保持
`366/402/438/474/519/555/591/636`，菜单总高没有因头部和套餐行修正而漂移。

真实浏览器验证 Escape 关闭菜单后焦点回到账户按钮；选择账户后 URL 进入
`#/account/settings/account`，焦点进入账户页签；关闭设置后 Dialog 归零、URL 恢复 `/app`，焦点
再次回到账户按钮。首页、帮助和文件继续使用真实链接语义，分别指向 `/app`、`/docs`、`/docs`。

## v105 首页计划状态三段结构（2026-08-29）

同一 `1280×720` 桌面视口复核首页时，Composer 与主标题的横向轴已稳定，但顶部计划状态仍保留
旧皮肤：本地为 `(595.5,114), 141×36px` 的灰色圆角胶囊，参考实际为透明的
`(611.5,121.5), 109×21px` 三段文本组。该差异不是语言字宽造成，而是本地额外添加了背景、
外层 padding 和药丸圆角。

当前结构改为“计划文字 + shadcn Separator + 升级 Button”三个同级元素。父级为 `109×21px`、
`12px` gap、无背景和 padding；计划文字为 `56×21px`，分隔线为 `1×16px`、
`rgba(0,0,0,.14)`，升级动作是 `28×21px`、`14px/21px`、`rgb(0,129,242)`。原先挂在计划文字
上的伪边框已删除，Button 继续保留键盘和焦点语义。

调整过程中同时锁定纵向流，避免缩小计划组后把整页向上拉动：最终计划组 y 为 `121.5`，主标题
仍为 `y=200/h=54`，Composer 仍为 `y=288/h=120`，均与参考一致。真实浏览器点击“升级”后进入
`#/account/settings/subscription` 且订阅页签为 active；关闭设置后 URL 回到 `/app`，焦点返回升级
按钮。

## v106 插件目录 768px 文档轴与卡片内部密度（2026-08-29）

同一 `1280×720` 视口对照 `/app/plugins`。本地旧布局把推广、搜索和目录从 `x=76` 铺到
`x=1256`，宽 `1180px`，一次显示四张推广卡；参考页头操作保持全宽，但正文固定在与首页相同的
`(282…1050), 768px` 文档轴，只展示两张完整推广卡和第三张的裁切提示。当前新增页面正文容器，
推广、搜索及所有目录 section 统一由该容器控制宽度，页头不受影响。

推广卡现与参考同为 `280×114px`、`12px` padding、`8px` gap、`12px` 圆角；轨道 gap 保持
`16px`，视口为 `(282,96), 768×114px`。搜索框恢复为 `(282,234), 768×36px`、`8px` 横向
padding 和 `6px` gap。分类标题区从搜索框底部 `y=270` 直接开始，使用 `24px 0 12px` padding、
总高 `79.5px`；标题、说明和右侧三个操作分别恢复到参考坐标，首张连接器卡为
`(282,349.5), 378×76px`。

卡片内部不再沿用偏大的图标和按钮尺寸：图标槽统一 `40×40/radius 8`，真实图片 `24×24`；名称
从 `600` 收敛为 `500 14px/20px`。加号按钮通过页面限定选择器隔离 AppFrame 的通用
`icon-sm=32px` 覆盖，最终为 `(619,373.5), 28×28px`，图标 `14×14px`，与参考一致。该限制只
作用于插件目录，不修改共享 shadcn Button。

真实浏览器验证搜索 Gmail 后 GitHub 从 DOM 移除，添加后按钮切换为“移除 Gmail”；清空并点击
可用的下一页后进入后续目录，World Bank DataBank 出现、My Browser 离开当前页。管理连接器打开
`#/account/settings/mcp` 并激活 MCP 页签，关闭后焦点回管理按钮；建立菜单展示自订 API、自订 MCP、
JSON 汇入和 URL 添加四个入口，Escape 后焦点回建立按钮。

## v107 插件页头、建立菜单与自订 API Dialog（2026-08-29）

插件正文对齐后继续测量全宽页头。参考标题为 `(76,14.5), 500 18px/27px`，本地仍使用
`600 20px/28px`；管理连接器和建立按钮本地还带 outline 边框与灰底。当前标题恢复参考字号与字重，
两个操作改为透明 shadcn ghost action：管理连接器为 `(1098,12), 86×32px`，建立为
`(1192,12), 64×32px`，均使用 `8px` 横向 padding、`4px` gap、`8px` 圆角和
`500 14px/18px`，页头正文位置没有变化。

建立菜单从本地有边框的 `252×182px/padding 8` 收回参考的 `(1004,48), 252×181px`：无实体边框、
`12px` 圆角、`4px` padding 和分层阴影。标题行为 `(1008,52), 244×29px`、`4px 12px`
padding；四个菜单项依次位于 y `81/117/153/189`，每项 `244×36px`、`8px` padding、`8px` gap。
图标增加稳定 `20×20px` 槽位，SVG 为 `16×16px` 且使用前景色 `rgb(26,26,26)`，不再被共享
DropdownMenu 的 muted icon 规则压灰。

URL 创建入口从 Lucide `Globe2` 改为参考 DOM 使用的 `Globe`。文案和测试版标识包装为同一
`4px` gap 文案组，徽标精确为 `(1173.03,198), 50×18px`、`500 12px/20px`、
`rgba(0,0,0,.14)` 边线及 `8px 10px 10px 0` 圆角，不再通过 `margin-left:auto` 漂到菜单右缘。

真实点击两边自订 API 后发现外框仅余 `4px` 高度差：本地 `600×680/y=20`，参考
`600×684/y=18`。自订 API 专属 Dialog 高度从 `42.5rem` 调整为 `42.75rem`，继续受 `95vh`
约束；最终外框、标题和首个输入分别为 `(340,18), 600×684px`、`y=38`、`y=120`。打开时焦点
进入名称输入，关闭后回到建立按钮；通用连接器目录 Dialog 的既有高度未修改。

## v108 Direct Chat 创建意图与专案工作区隔离（2026-08-29）

重新对照 `/app/project/{projectId}` 时，专案分栏、`768px` Composer 和右侧 `320px` context rail
已接近参考，但本地 Composer 多出一个“网站”胶囊。该胶囊来自首页
`kokoro.web.pending-creation-intent`，AppFrame 因复用 Composer 而把 direct-chat 待创建状态直接
投影进 project workspace；参考专案通过独立的网站能力卡管理网站，不会继承首页模式。

AppFrame 现在显式计算 `projectedCreationIntent`：direct chat 继续读取 `deploymentIntent`，
project workspace 始终投影 `null`。该值同时约束共享 Composer 和 site-owned EmptyState，避免只隐藏
其中一处后出现状态与页面结构不一致。原始 pending intent 不会在访问专案时被删除，因此用户返回
首页仍能继续未发送的网站草稿。

真实浏览器完成 `/app/project/kokoro → /app → /app/project/kokoro` 路由验证：两次专案页的
`data-slot=creation-intent` 数量均为 `0`，中间首页为 `1` 且文案为“网站”。新增 AppFrame 回归测试
同时锁定 EmptyState projection、Composer 状态和 pending intent 保留，防止未来共享壳再次发生
跨路由状态泄漏。

## v109 Composer 网站意图胶囊图标统一（2026-08-29）

同一 `1280×720` 桌面视口对照首页 Composer。网站意图胶囊的 `32px` 高度、圆角、蓝色浅底、
描边和间距已接近参考，但本地使用 Lucide `AppWindow`，字形是横向浏览器窗口；参考使用方形的
网页/代码窗口图标，导致胶囊内部视觉重心仍不一致。

当前把首页快捷入口已有的 `CodeWindowIcon` 抽到共享图标组件，Composer 的 shadcn `Badge` 与首页
入口统一使用同一字形。胶囊仍保持固定高度和不可伸缩行为，不改变输入区、环境选择器、语音和发送
按钮的几何位置；测试通过稳定的 `data-slot=code-window-icon` 锁定图标契约，不再依赖 Lucide 类名。

## v110 Settings 与专案工作区复核及任务文案节奏（2026-08-29）

同一 `1280×720` 桌面视口真实打开两边 Settings，而不是只依赖 hash。General 与 Developer 的
外框均为 `(128,36), 1024×648px`，左栏分隔线 `x=348`，内容轴 `x=373`；页头、Tabs、表单、
Developer 空态中心和左栏滚动位置一致。现有 CSS 虽有重复历史规则，但当前渲染没有可见偏差，
因此本轮不做无证据的重排，避免破坏已经对齐的多个设置页。

随后复核专案工作区：Composer、任务区和四组右栏卡片的外框、间距、空态中心均与参考一致。
剩余可见差异位于文字节奏：本地项目元数据紧贴为“由你创建·今天更新”，任务说明与空态还多出
句号。当前将元数据改为“由你创建 · 已更新 今天”的顺序与 `4px` 分隔间距，并移除任务说明和
空态末尾句号，使项目标题下方和任务空态的字宽、停顿与参考一致。

## v111 普通新任务与网站创建意图的语音入口分态（2026-08-29）

清除本地 pending 创建意图后，同一 `1280×720` 视口对照普通新任务首页。Composer、五个快捷
建议和 `540×98px` 推荐横幅的坐标已与参考一致，但右侧动作少了一个入口：参考普通新任务同时
显示语音模式与麦克风，网站创建意图才收成只保留麦克风；本地此前用 `emptyWorkspace` 一刀切，
所有空白首页都隐藏语音模式。

当前条件改为仅在“空白直接会话 + website 创建意图”时隐藏语音模式。普通空白首页、活动会话和
专案会话继续显示两个 `32px` 入口，网站模式保持一个入口，因此状态切换不会引入虚假占位或改变
发送按钮锚点。组件测试分别锁定普通首页、网站意图和活动会话三种状态。

## v112 账户登录方式 Passkey 空态（2026-08-29）

同一 `1280×720` 桌面视口真实进入 Settings → 账户 → 管理登录方式。账户主页面的 identity、
套餐卡、邮箱、用户 ID 和危险操作几何已与参考一致；二级页面也正确复用 Settings 外框与左栏，
没有错误地打开第二个小 Dialog。但本地在 Passkey 标题与“新增通行密钥”按钮下方完全留白，参考
在内容区下半部居中显示钥匙图标、空态标题和说明。

当前使用 shadcn `Empty` 的完整组合补齐该状态，图标使用 Lucide `KeyRound`。空态区域高
`224px`，图标 `32px`，标题 `14px/20px`，说明 `13px/18px`；图标从区块顶部下移 `124px`，
保持提供商三行与 Passkey 操作行坐标不变。测试锁定空态标题与说明，避免后续再次出现功能存在但
页面下半部无反馈的空白状态。

## v113 个性化资料页纵向流（2026-08-29）

快捷键页的静态态与捕获态经同视口截图确认一致；随后切换到 Settings → 个性化，发现资料页存在
连续的纵向误差。本地“从其他 AI 导入记忆”卡片高 `94px`，参考为 `75px`，使昵称、职业及后续
内容整体下移 `19px`；“更多关于你的资讯”textarea 本地仅 `104px`，参考约 `131px`，且本地隐藏了
其下方说明，导致自订指令和固定导入按钮在首屏挤压。

当前导入卡恢复 `75px` 高度并将图标/文案 gap 收为 `12px`，两列资料字段由正常文档流自动上移
`19px`。资料 textarea 改为 `131px`，用途说明恢复为 `13px/18px`、上方 `16px` 间距；不增加
绝对定位补偿。这样导入卡、资料字段、长文本输入和说明均使用参考的纵向节奏，同时保留原有字段
持久化与导入记忆 Dialog 功能。

## v114 Composer 网站意图胶囊内部像素对齐（2026-08-29）

同一桌面视口读取参考与本地真实 DOM 后确认，网站意图胶囊的外框已经一致：两边均为
`68×32px`、`padding: 6px 9px 6px 7px`、`gap: 6px`，蓝色浅底和描边值也相同，因此不再误改
正确的外部几何。剩余差异来自内部字形与前景色：本地窗口图标使用普通圆角矩形，文字和图标为
`rgb(0,112,224)`、`20px` 行高；参考为专用代码窗口轮廓、`rgb(0,129,242)` 与 `21px` 行高。

当前共享 `CodeWindowIcon` 改用与参考比例一致的窗口轮廓，保留 `18×18` viewBox 和既有代码折线；
Composer 的图标与文字统一使用 `rgb(0,129,242)`，文字改为 `14px/21px`。真实热更新复测结果为：
胶囊 `68×32px`、图标 `16×16px`、文字 `28×21px`，图标与文字 y 坐标分别为 `371`、`368.5`，
与参考完全一致。组件测试同时锁定图标由两个 path 构成且不再回退为通用 rect 字形。

## v115 个性化导入记忆 Dialog 滚动与焦点闭环（2026-08-29）

同一 `1280×720` 桌面视口真实打开两边导入记忆 Dialog。外框均为 `(360,100.5), 560×519px`，
标题、复制按钮、第二步 textarea 和底部按钮坐标已一致；剩余差异来自提示词内部结构。本地此前把
一段短文直接放进 `120px` 外壳并硬裁切，字号为 `13px`，步骤编号位于 `x=380`；参考使用固定
`120px` 外壳、独立原生纵向滚动层、`14px/20px` 正文和底部 `60px` 淡出层，步骤编号位于
`x=384`，正文位于 `x=428`。

当前迁移提示词改为完整的合成 fixture，覆盖基本资讯、工作与教育、个人背景、偏好与指令等稳定
分类；滚动层 `clientHeight=120px`、`scrollHeight=876px`，正文为 `14px/20px`。外层增加
`linear-gradient(transparent, rgb(236 236 235))` 的 `60px` 淡出层并保持
`pointer-events:none`。步骤编号、内容轴、复制按钮和 textarea 坐标经真实 DOM 复测后与参考一致。

该 Dialog 没有静态 `DialogTrigger`，因此此前取消或 Escape 后焦点会落到 `body`。两个入口现在在
打开时记录各自触发按钮，`onCloseAutoFocus` 在嵌套焦点域解除后的下一动画帧归还焦点。真实交互
验证提示词可从 `scrollTop=0` 滚到 `401`，复制按钮切换为“已复制”，取消和 Escape 均关闭内层
Dialog，并把焦点还给原“匯入记忆”按钮。

## v116 个性化知识页与新增知识 Dialog（2026-08-29）

同一 `1280×720` 桌面视口切换两边个性化 → 知识。搜索框和新增按钮均位于 `y=220`，尺寸分别为
`200×32px` 和 `64×32px`；本地剩余差异是空态整体高出参考约 `20.75px`，选中知识 Tab 继承
通用 Button 的 hover 背景与矩形 focus ring，新增按钮文字行高也比参考多 `3px`。当前空态有效高度
调整为 `384px`，空态文案最终为 `(722.5,472), 56×20px`；个性化 Tabs 改为透明 hover，并用底部
`2px` 指示线承接选中与键盘焦点，新增按钮锁定 `14px/18px`。

新增知识 Dialog 的外框、标题、字段轴和按钮坐标本就与参考一致：外框 `(300,75), 680×570px`，
输入轴 `x=324`，Footer 按钮 `y=585`。本地此前把内容 textarea 拉到 `215px`，再将计数绝对定位
覆盖在输入区上；参考是 `180px` textarea 后独立 `18px` 计数行。当前 textarea 最终为
`(324,327), 632×180px`，计数行为 `(324,515), 632×18px`。首个输入聚焦时增加参考同值的
`1px rgba(0,0,0,.14)` 内描边。

新增入口会记录实际触发按钮，取消、Escape 和保存完成后均在嵌套焦点域解除后把焦点还给“新增”。
真实浏览器使用合成条目验证：内容计数更新、三字段完整后保存启用、保存后列表出现条目，搜索可在
`0/1` 条结果间过滤；未向参考站点写入任何数据。回归测试覆盖取消焦点、计数、保存与搜索链路。

## v117 部署入口、应用意图与域名升级确认（2026-08-29）

同一 `1280×720` 桌面视口真实进入两边 Settings → 部署。三段区块的标题坐标均为
`x=373`、`y=141/348/555`，空态按钮均为 `92×32px`、`y=256/463/670`。本地外部几何已经
一致，但标题仍错误使用 `h3`；参考使用 `h2`。按钮底色透明，但当前参考 DOM 复核证明仍保留
`1px rgba(0,0,0,.12)` 内收轮廓，最终状态以 v122 为准。

网站和应用入口都经真实点击复核。网站入口继续关闭 Settings 并进入 `68×32px` 网站胶囊状态；
应用入口补齐 `96×32px`“开发应用”胶囊，使用 Lucide `Smartphone` 的 `16px` 字形。应用状态不再
错误显示网站创建模块或旧推广轮播，而是从 Composer 下方 `24px` 处显示五条 `40px` 高应用示例，
每条使用 `13px/18px` 正文、底部分隔线和斜向左上箭头。部署入口切换意图时保留现有草稿，不再
清空用户已输入内容；示例点击继续保持 `app` 意图。

域名入口此前直接把 Settings 切到订阅页，破坏部署上下文。参考行为是在部署页上叠加
`400×240px` 升级确认 Dialog：顶部 `40×40px` Globe、右上关闭、`20px/26px` 衬线标题、
`14px/20px` 说明和两枚 `174×36px` 操作按钮。当前使用 shadcn Dialog 完成同一结构，并补齐
顶部“请先升级”状态提示。取消、Escape 和右上关闭只关闭内层 Dialog，并在嵌套焦点域释放后把
焦点还给“立即购买”；只有“立即升级”才切换订阅页。聚焦测试覆盖胶囊图标、五条示例、旧轮播
移除、Dialog 文案/图标/按钮、取消、Escape、焦点回收和确认切页。

## v118 Composer 创作意图胶囊组件边界（2026-08-30）

用户再次标注网站创作意图胶囊后，先以参考截图的整体缩放比例复核，而不是直接放大控件。参考图中
圆形入口、环境选择器、创作意图和发送按钮均被约 `1.2×` 展示；折算为 CSS 像素后，网站胶囊仍为
`68×32px`，与 v114 的真实 DOM 证据一致。因此保留正确几何，不把它误改为 `40px` 高度。

此前胶囊 JSX 直接内嵌在 `Composer`，创作类型、图标、可访问名称和 Badge 组合没有独立边界，后续
增加创作类型或调整通用 Badge 时容易再次漂移。当前提取专用 `CreationIntentPill`，统一承接
`website/app` 两种意图，并通过 `data-intent` 明确状态契约；共享 Composer 只负责决定何时显示。
底层继续组合 shadcn `Badge`，但尺寸、颜色、字形和排版由专用 CSS 锁定，不依赖 Badge 默认视觉。

热更新后的桌面真实 DOM 复测为：`68×32px`、`border-radius:999px`、`font-size:14px`、
`line-height:21px`、`gap:6px`、`padding:6px 9px 6px 7px`，背景与边框分别为
`rgba(0,129,242,.08)` 和 `rgba(0,129,242,.28)`。截图确认胶囊仍紧跟桌面环境选择器，未挤压
右侧麦克风与发送按钮；组件测试锁定两种意图的图标及 `data-intent` 状态。

## v119 整合首页与四个详情页（2026-08-30）

同一桌面视口真实打开两边 Settings → 整合。首页四张卡的外部结构原本已接近参考，但本地内容轴
位于 `x=277`、有效宽度 `453px`，参考为 `x=278`、`451px`，导致每列多 `1px`。当前整合首页和
详情内容各自内收 `1px`，最终两列均为 `219.5px`，卡片 `128px` 高、列/行 gap `12px`，标题、
说明、40px 图标容器及右箭头均保持参考坐标。LINE 首页图标由绿色文字圆片改为 24px 白色聊天
气泡标识，不再与参考字形明显不同。

逐项进入 Zapier、Slack、Telegram、LINE 详情并验证深链。Zapier 的 hero、概览、八张 Zap 范本
和九个外链保持原有功能；Telegram 与 LINE 保持只有连接 hero 的简洁结构。LINE 详情标题与 hero
名称统一为规范的 `LINE`。连接按钮不再固定 `88px`，改为由文案、16px 外跳箭头、6px gap 与
水平 padding 共同决定宽度：Zapier 三字操作保持 `88px`，两字连接操作收为参考宽度。

Slack 详情此前只有一行概览，缺少参考中的命令说明和文档入口。当前补齐 `mute`、`unmute`、
`!skip` 三条命令及各自说明，命令行采用 24px 垂直节奏，概览卡固定 `184px` 高，并增加 Slack
文档外链。真实截图确认 hero、概览标题、卡片上下边界、命令行和文档入口与参考同轴。组件测试
覆盖四张首页卡、Zapier 九个外链、Slack 三条命令/文档、LINE 标题/箭头、详情返回、连接状态和
刷新深链恢复。

## v120 开发人员首页与创建弹窗（2026-08-30）

同一桌面视口真实进入两边 Settings → 开发人员。API 密钥与 Webhooks 两个标签、40px 信息条、文件
入口、空态图标/标题/说明和“建立新项目”按钮已经同轴：标签下划线位于 `y=177px`，信息条为
`451×42px`，空态图标顶部为 `375px`。两个标签切换不会改变内容宽度或空态中心，也不会打开新的
页面层级。

建立 API 密钥 Dialog 的外框均为 `400×280px`，字段与 Footer 坐标一致。本地此前二级遮罩只有
灰色覆盖，后方 Settings 文字依然清晰；参考会同时降低亮度并模糊背景。当前 API 密钥、Webhook
和密钥结果三个 Dialog 共用 `rgb(0 0 0 / 30%)`；当前参考复核后统一为
`backdrop-filter:blur(4px)`。打开创建 Dialog
后首个输入框自动聚焦，但焦点仅使用 `1px rgba(0,0,0,.14)` 内描边，不再出现粗黑外圈。

到期时间选择器由 `36px` 白底描边控件改为参考的 `40px` 浅灰无边框控件，按钮与字段之间的纵向
距离保持不变。Webhook Dialog 保持 `400×218px`，URL 输入使用同一安静聚焦样式。使用合成 fixture
完整验证了密钥命名、创建按钮启用、一次性秘密密钥结果、复制状态、完成后列表记录，以及 Webhook
HTTPS 校验、保存和启用状态；未在参考站点建立真实 API 密钥或 Webhook。组件测试锁定首字段焦点、
专用模糊遮罩、结果复制和两个创建流程。

## v121 数据管理总览与两个详情页（2026-08-30）

在相同 `786×674` 桌面视口逐页打开两边 Settings → 数据管理。参考 Dialog 为
`(33,33.7),720×606.6px`，本地此前为 `(32,33.7),722×606.6px`，导致侧栏、内容轴与卡片宽度
各偏 `1–2px`。弹窗紧凑桌面宽度现改为 `calc(100vw - 66px)`，宽屏仍由 `1024px` 上限控制；
本地内容轴最终为 `x=278 / 451px`，与参考一致。Dialog 打开时同步隐藏被遮罩工作台的原生滚动条，
不再在弹窗右缘透出一条深色竖线，Settings 自己的 ScrollArea 仍独立保留。

总览不再使用“固定高区块 + 独立 Separator”的近似结构，而是参考的 `24px` 纵向组：前三段各
`65px`，自身携带底边和 `12px` 底部留白；两条管理行各 `42px`。五个标题的 y 坐标最终为
`138.7 / 227.7 / 316.7 / 405.7 / 471.7px`。两枚管理按钮均为 `(665,410.7/476.7),64×32px`，
使用 `14px/18px,500` 字体，不再因按钮内边距造成文案列宽漂移。

云浏览器页的保持登录卡、Switch、Cookie 标题和空状态均按真实 DOM 收敛。标题/说明分别为
`14px/20px,500` 与 `13px/18px`，Cookie 标题为 `16px/22px`；空态图标固定
`(487.5,404.5),32×32px`，说明为 `(343.5,448.5),320×36px`，两者间距 `12px`。删除了空字符串
标题产生的零高 `<strong>`，避免通用 gap 暗中改变中心。授权应用页同样改为“32px 图标 + 12px
文本组”，文本组内部标题/说明间距 `4px`，整体坐标与参考一致且 `scrollHeight === clientHeight`，
不再依赖 transform 或正负位移制造视觉对齐。

本地 fixture 真实点击验证云浏览器开关 `unchecked → checked → unchecked`；组件测试新增保存失败时
回滚并重新启用开关的覆盖。参考站点只做只读导航、DOM 测量和截图，未改变账户设置或删除数据。

对照截图：

- `output/playwright/data-management-v121/manus-summary-786x674.png`
- `output/playwright/data-management-v121/kokoro-summary-786x674.png`
- `output/playwright/data-management-v121/manus-authorized-apps-786x674.png`
- `output/playwright/data-management-v121/kokoro-authorized-apps-786x674.png`
- `output/playwright/data-management-v121/manus-cloud-browser-786x674.png`
- `output/playwright/data-management-v121/kokoro-cloud-browser-786x674.png`

## v122 部署空态与域名升级确认复核（2026-08-30）

在相同 `786×674` 桌面视口重新读取当前 Manus 部署页 DOM，纠正 v117 仅凭静态截图得出的按钮
结论。网站与应用的“立即建立”均为 `(457.5,253.7/460.7),92×32px`，透明背景之上仍有
`1px rgba(0,0,0,.12)`、`outline-offset:-1px` 的内收轮廓。本地恢复该轮廓，并覆盖 shadcn
Button 的额外 `3px` focus ring；Dialog 关闭后按钮仍保留稳定的同值轮廓，不会突然变粗。

三个空态此前用图标、说明、按钮各自 margin 拼接，子元素虽然暂时同轴，容器却与参考不同。当前
统一为参考的 `451×120px`、`justify-content:center`、`gap:12px` 结构，容器顶部距标题 `12px`。
网站图标最终为 `(487.5,179.7),32×32px`，说明和按钮继续保持原坐标。域名 Globe 不再错误使用
黑色前景色，改为参考的 `rgb(115,115,115)`；升级 Dialog 内的独立 Globe 仍保持黑色强调。

域名升级 Dialog 外框继续为 `(193,217),400×240px`，标题 `20px/26px`、说明 `14px/20px`、
两枚按钮均为 `174×36px`。两边每层遮罩的真实样式为 `rgba(0,0,0,.3) + blur(4px)`；本地内层
此前仍继承默认 `50%` 黑色且无模糊，现已改为专用 overlay。取消按钮改用参考的内收 outline，
文本组恢复内容驱动宽度。真实点击验证取消后焦点回到“立即购买”，本地与参考 activeElement、
outline 和无额外 box-shadow 状态一致。

同轮打开开发人员 → API 密钥创建层复查通用遮罩结论。参考外层 Settings 与内层创建 Dialog 均为
`rgba(0,0,0,.3) + blur(4px)`，本地开发人员内层仍残留 `blur(8px)`，现已同步为 `4px`；只打开后
使用 Escape 关闭，未创建真实或 fixture 密钥。

对照截图：

- `output/playwright/deployment-v122/manus-deployment-786x674.png`
- `output/playwright/deployment-v122/kokoro-deployment-786x674.png`
- `output/playwright/deployment-v122/manus-domain-upgrade-786x674.png`
- `output/playwright/deployment-v122/kokoro-domain-upgrade-786x674.png`

## v123 一般设置主题与通知行为（2026-08-30）

在相同 `786×674` 桌面视口打开两边 Settings → 一般。外观标题、语言标签与 `208×36px` Select、
主题标题、三枚 `110×62/63px` 主题选项、分隔线以及通知区三行首屏坐标原本已基本同轴。进一步
读取子节点后发现，本地主题文字错误继承父级 `16px/24px,400`，参考实际为
`14px/20px,500`，导致图标与文字整体偏上 `2px`。

当前主题标签改为独立 `14px/20px,500`，恢复图标与标签间 `2px`，并只对主题标题做 `0.5px`
光学补偿，不移动选项外框。最终三项非选中/选中外框 y 为 `301.2/300.7px`，三枚图标均为
`y=314.2px`，标签均为 `y=334.2px`，与参考逐项一致。继续使用 shadcn ToggleGroup 的 radio
语义，单选状态和键盘行为不因视觉对齐而降级。

功能核对发现本地把“声音提醒”错误依赖于“浏览器通知”：浏览器通知关闭时，声音开关被禁用；
参考两项可以独立配置。该 disabled 条件已删除，本地 fixture 真实验证声音提醒
`unchecked → checked → unchecked`，浏览器通知始终保持关闭；测试锁定开关可用性、独立状态和
自动主题选中。语言弹层宽度、位置、行高与滚动模型保持参考结构；选项数量仅展示 Kokoro 已安装的
语言包，不伪造尚未实现的翻译。

对照截图：

- `output/playwright/general-settings-v123/manus-general-786x674.png`
- `output/playwright/general-settings-v123/kokoro-general-786x674.png`
- `output/playwright/general-settings-v123/manus-language-select-786x674.png`
- `output/playwright/general-settings-v123/kokoro-language-select-786x674.png`

## v124 账户首页与登录方式二级页（2026-08-30）

在相同 `786×674` 桌面视口逐项读取账户首页的真实 DOM 和 computed style。套餐卡此前虽然总高
接近参考，但内部仍是四个并列直系行，标题使用 `15.2px/22.8px,650` 无衬线字体，操作按钮则
保留 shadcn 默认灰底、实体边框和 `10px` 圆角。当前套餐卡重构为参考的两层结构：`57px` 套餐
Header 与 `132px` Body；Body 再由 `42px` 积分组、`16px` 间距和 `42px` 每日积分组组成。
卡片最终为 `(278,214.7),451×191px`，`12px` 圆角、`6%` 边框和 `rgb(250,250,250)` 背景；
“免费”恢复为 `16px/22px,700` 衬线标题，积分标题统一为 `14px/20px,500`。

“更改 / 复制 / 管理”均改为透明背景、无实体 border、`1px rgba(0,0,0,.12)` 内收 outline 与
`8px` 圆角；删除账户使用 `rgb(251,73,79)` 文案和 `rgba(242,90,90,.5)` outline。卡片、按钮
和详情行不再混用两套视觉语言。

登录方式二级页原本复用顶层 `81px` Header，导致标题、分隔线、三行提供商和 Passkey 空态整体
上移 `14px`。现在只对 `account + back` 状态使用 `95px` Header；标题、Google、Microsoft、
Apple 与通行密钥标题相对 Dialog 的坐标分别与参考一致。提供商和新增通行密钥按钮同样统一为
透明底、内收 outline、`8px` 圆角，提供商标题改为 `14px/20px,500`。真实交互验证进入二级页、
返回账户首页、断开/重新连接 preview 提供商均保持工作；未修改参考站点的真实登录方式。

对照截图：

- `output/playwright/account-v124/manus-account-786x674.png`
- `output/playwright/account-v124/kokoro-account-786x674.png`
- `output/playwright/account-v124/manus-login-methods-786x674.png`
- `output/playwright/account-v124/kokoro-login-methods-786x674.png`

## v125 首页网站创建态滚动与文档轴（2026-08-30）

在 `786×674` 桌面视口重新进入双方首页网站创建态。初始截图中，本地套餐条、主标题、Composer、
项目归档提示和创建类型区统一比参考高约 `59.5px`。逐层测量后确认顶部 CSS padding 本身正确；
真实根因是点击“建立网站”后 starter 按钮被较高的网站创建区替换，浏览器在双帧 Composer 焦点
交接结束时把欢迎页独立滚动容器写成 `scrollTop=59.5`。因此此前看到的是整个文档被滚动，而不是
六个区块各自的 margin 错误。

欢迎页现在持有自身滚动 viewport ref，并在显式创建意图完成渲染与焦点交接后于第二帧恢复
`scrollTop=0`。没有保留经真实浏览器否定的 `overflow-anchor` 方案。窄桌面左右 padding 同时从
错误的 `14px` 纠正为参考的 `16px`，Composer 从 `(66,279),706×120px` 收敛到
`(68,279),702×120px`，创建区正文轴由 `x=82` 回到参考 `x=84`。

最终套餐条、标题、项目提示、创建标题与类型行 y 坐标分别为
`112.5 / 191 / 409 / 479.75 / 515.5px`；参考为
`112.30 / 190.80 / 408.80 / 479.55 / 515.30px`，差值只来自两个标签根布局的统一
`0.203px` 子像素起点。真实点击验证普通“制作简报”提示与“建立网站”模式均保持
`scrollTop=0`、标题 `y=191px`；回归测试锁定网站模式切换后的滚动复位。

对照截图：

- `output/playwright/home-website-v125/manus-website-786x674.png`
- `output/playwright/home-website-v125/kokoro-website-786x674.png`

## v126 Agent 独立页面与平台连接弹窗（2026-08-30）

此前侧栏 Agent 入口没有注册页面路由，点击后仍调用新建聊天并停留在 `/app`；因此本地不存在可与
参考 `/app/agents` 对照的产品 surface。本轮新增 `/app/agents` 独立路由和 site-owned
`KokoroAgentsSurface`，侧栏通过 runtime navigation registry 导航到真实 URL，不再把 Agent
语义映射成聊天动作。页面保持与聊天、专案、外挂页面解耦，其他 site 可以替换自己的 Agent
布局而不继承 Kokoro 皮肤。

在参考 `648×674` 桌面视口读取 Agent 首页：内容列 `x=20,w=608px`，标题
`y=275,w=608,h=30px`，CTA `(252,345),144×40px`，首张能力卡
`(20,417),608×115px`，卡片间距 `12px`。本地最终内容列同为 `x=20,w=608px`，标题实际文字框
`y=274.39,h=30px`，CTA `(252,344.39),144×40px`，首卡
`(20,416.39),608×115px`；统一的 `0.61px` 差值来自字体基线与根布局子像素，不存在区块间累积
漂移。`648×674 / 1440×900 / 2048×1152` 三档桌面视口下内容列始终保持 `608px` 居中，页面
`scrollWidth === clientWidth`，没有固定最小宽度造成的横向滚动。

Agent Hero 使用本地 Lucide 与 CSS 组合的 Telegram、LINE、Slack 等平台标记，不复制参考站点
Logo 或受保护素材。四项能力卡保持 `16px` 圆角、`0.5px 14%` 边框、`16px` padding 和
`14/21px` 标题；动态用途词在 reduced-motion 环境自动停用动画。

“开始体验”使用 shadcn Dialog 与 Tabs。弹窗最终为 `(124,114),400×446px`、`16px` 圆角、
`rgb(248,248,247)` 背景，支持 Telegram、LINE、Slack 三个真实 tab 状态，二维码为本地连接
占位图。首次截图发现 Portal 脱离 skin 根节点后 CTA 错误继承全局蓝色 primary，现由 Dialog
Content 显式承接 `data-web-skin="kokoro"`，最终 CTA 为参考黑色 `rgb(26,26,25)`；LINE
标签也从重复的 `LINE LINE` 修正为单一名称。真实浏览器点击验证 Slack tab 后标题、说明、按钮
和二维码标记同步切换，关闭按钮可退出弹窗。

对照截图：

- `output/playwright/agents-v126/home-648x674-verified.png`
- `output/playwright/agents-v126/home-1440x900-verified.png`
- `output/playwright/agents-v126/home-2048x1152-verified.png`
- `output/playwright/agents-v126/dialog-648x674-verified.png`
- `output/playwright/agents-v126/dialog-slack-648x674.png`

## v127 Composer 网站模式胶囊与工具行单一尺寸源（2026-08-30）

用户标注的参考网站模式胶囊约为 `78×36px`，同一行的新增、连接器、桌面环境和发送控件也采用
`36px` 基线。本地此前胶囊仅为 `68×32px`，文字 `14/21px`、图标 `16px`；环境选择器为
`127.56×32px`，导致选中态虽然颜色接近，整体仍明显偏小。

当前胶囊改为最小宽 `78px`、高 `36px`、`16/24px,500` 文案、`18px` 图标、`6px` gap，
实测最终为 `(383.14,388),78×36px`。环境选择器同步为 `143.14×36px`，新增和连接器按钮、
发送按钮均为 `36×36px`。普通模式与网站模式的 Composer 均保持
`(131,317),768×120px`，工具行均为 `y=388,h=36px`；模式切换只插入胶囊，不改变 Composer
高度、环境控件位置或右侧发送轴。

复核过程中定位到 AppFrame 曾用全局 `icon-sm=32px !important` 穿透覆盖 Composer，这也是此前
多套 UI 尺寸互相冲突的直接来源。该壳层规则现已排除 `data-slot="composer-wrap"` 后代，Composer
重新成为自身控件尺寸的唯一所有者，导航和设置区的 `icon-sm` 仍保持 `32px`。`648px` 窄桌面
下环境文案会按既有规则隐藏，但按钮从错误的 `32×36px` 椭圆修为 `36×36px` 圆形，页面
无横向溢出。

对照截图：

- `output/playwright/composer-intent-v127/before-978x674.png`
- `output/playwright/composer-intent-v127/normal-978x674-verified.png`
- `output/playwright/composer-intent-v127/website-978x674-verified.png`
- `output/playwright/composer-intent-v127/website-648x674-verified.png`

## v128 Agent 连接二维码从视觉占位升级为可扫描编码（2026-08-30）

v126 的 Agent Dialog 虽然外框、Tabs、标题和 CTA 已与参考几何一致，但二维码仍由硬编码偶数格组成，
实际呈现为规则棋盘纹理，既不像标准二维码，也无法承载连接信息。这种“静态视觉近似”不满足功能
还原要求。

当前使用 `qrcode.react@4.2.0` 的 `QRCodeSVG` 生成标准 QR，编码 Kokoro fixture 连接地址和平台
参数，纠错等级为 `H`，为中央平台标记保留高容错空间。二维码容器保持
`(244,187.59),160×160px`，内部 SVG 为 `(253,196.59),142×142px`，因此 Dialog
`400×446px`、文案和 CTA 轴均未发生位移。Telegram、LINE、Slack tab 切换时分别生成对应平台
URL，不读取或复制 Manus Token、Cookie、用户身份或接口数据。

对照截图：

- `output/playwright/agents-v128-dialog-qr-648x674.png`

## v129 Agent 连接 setup 契约与真实继续入口（2026-08-30）

v128 的二维码已经可扫描，但 payload 和继续 URL 仍由组件硬编码，CTA 点击只关闭 Dialog；这无法
承接 live provider 授权，也把数据边界留在视觉组件内部。当前新增独立 `agents` domain：
`AgentClient` 使用 Zod 严格校验 Telegram、LINE、Slack setup projection，live 客户端请求同源
`GET /api/agents/connections/setup`，preview client 返回 `.fixture.test` 合成数据。Dialog 打开或切换
tab 时读取对应 setup，加载态继续占用固定 `160×160px` QR 槽；成功后二维码消费 `qr_value`，CTA
成为消费 `continue_url` 的真实链接。

浏览器实测 Telegram 链接为
`https://agents.fixture.test/continue?platform=telegram&ticket=preview`，Slack 切换后为对应
`platform=slack` 链接；二者不复用平台参数。切换后 Dialog 仍为 `(124,114),400×446px`，QR 仍为
`(244,187.59),160×160px`。

CTA 从 Button 改为 `asChild` 链接后，截图发现全局 `a { color: inherit }` 覆盖了 shadcn
`text-primary-foreground`，形成黑底黑字。全局规则现拆为所有链接仅移除下划线、非 Button 链接才
继承颜色；最终 CTA computed style 为黑底 `rgb(26,26,25)`、白字 `rgb(255,255,255)`、无下划线。
该修复同时消除了其他 primary Button 链接的同类潜在冲突。

后端契约和 fixture 矩阵已分别补入 `docs/integration/user-web-api-contract-v4.md` 与
`docs/integration/mock-fixture-matrix-v1.md`，明确短时 ticket、provider allowlist、RFC 7239 `Forwarded`
解析以及禁止
暴露 tenant ID、provider credential、Cookie 和用户身份字段。

对照截图：

- `output/playwright/agents-v129/slack-contract-648x674.png`
- `output/playwright/agents-v129/slack-contract-color-fixed-648x674.png`

## v130 Agent 页面真实 Shell、卡片网格与 Dialog 内部几何（2026-08-30）

本轮通过已登录 Manus `/app/agents` 页面在相同 `786×674` 桌面视口读取真实 DOM、computed style
和截图，纠正 v126 基于窄视口证据作出的错误结构判断。参考 Agent 页面并非脱离工作台的独立全屏
Surface：它继续使用 `52px` 收起侧栏和 `56px` 页面 Header；主内容为左右各 `20px` 的
`694px` 列。此前本地提前返回 `KokoroAgentsSurface`，导致共享侧栏完全消失，属于 Shell 层错误。

`/app/agents` 现在与外挂页一样由通用 `AppFrame` 承载，Agent Surface 只拥有页面内容。最终侧栏
`(0,0),52×674px`，Surface `(52,0),734×674px`，Header `(52,0),734×56px`，内容列
`(72,0),694px`。Hero artwork 为 `(259,72),320×234px`，主标题
`(72,346),694×30px`，与参考逐项一致。Hero 删除了无证据的 `AI Agent / Always available`
文案，品牌名来自 runtime manifest；保留本地 Lucide/CSS 平台标记，不复制第三方品牌图像文件。

能力区从错误的单列横向卡片恢复为参考 `2×2` 网格。第一行两卡分别为
`(72,408),341×115px` 与 `(425,408),341×115px`；第二行分别为
`(72,535),341×136px` 与 `(425,535),341×136px`。卡片使用 `24px` 无底图标槽、`12px` 垂直
间距、`16px` padding、`0.5px 14%` 边框和 `16px` 圆角；已删除参考不存在的 hover 箭头和
`40px` 灰色图标底。说明文字恢复为 `14/21px`。CTA 移到卡片之后，最终为
`(347,703),144×48px`，不再夹在标题和能力卡之间。

真实参考 Dialog 外框为 `(193,114),400×446px`，但 v126/v129 只验证了外框，内部内容仍整体
上移 `42–59px`。当前内部几何也逐项对齐：Header `400×60px`，Tabs
`(251.75,174),282.5×32px`，QR `(313,230),160×160px`，文案
`(193,414),400×50px`，CTA `(217,496),352×40px`。二维码 SVG 为本地 setup ticket 的标准
编码，不复制参考 payload；Tabs 和 CTA 删除了参考不存在的额外箭头。Dialog overlay 增加参考的
背景 blur，Telegram、LINE、Slack 切换及 live/preview setup 契约保持不变。

对照截图：

- `output/playwright/agents-v130-manus-current.png`
- `output/playwright/agents-v130-local-final.png`
- `output/playwright/agents-v130-manus-dialog.png`
- `output/playwright/agents-v130-local-dialog-final.png`

## v131 外挂目录边框、区块节奏与推荐区滚动（2026-08-30）

在相同 `786×674` 桌面视口读取已登录 Manus `/app/plugins` 的真实 DOM、截图和 computed style。
本地首屏的 Header、推荐区、搜索、连接器标题和十张目录卡已有相同几何，但视觉 token 与后续文档轴
仍有偏差：推荐卡和目录卡使用较深的 `#e5e7eb` 边框而非参考 `rgba(0,0,0,.06)`，搜索框未使用
参考 `rgba(0,0,0,.12)`；每个 `.section` 还额外保留 `32px` bottom margin，使资料来源首卡从参考
`y=857px` 累积漂移至 `y=889px`。

当前推荐卡为 `(76,96),280×114px`、`rgb(250,250,250)` 背景和 `6%` 黑色透明边框；搜索框为
`(76,234),686×36px`、`12%` 边框。连接器十张卡均为 `337×76px`，两列 x 轴
`76 / 425px`，五行 y 轴 `349.5 / 437.5 / 525.5 / 613.5 / 701.5px`，边框统一为 `6%`。
去除错误 Section 间距后，资料来源首卡恢复为 `(76,857),337×76px`。分页控件分别为
`(610,305.5),32×32px`、`(650,305.5),32×32px` 与 `(690,304.5),72×33px`；圆形箭头使用
`6%` 边框，“查看全部”保持参考的无边框状态。

参考推荐区并非静态裁切，而是 `686px` viewport / `1168px` scrollWidth 的横向滚动区，并在 hover
时显示 `(722,137),32×32px` 圆形滚动按钮。本地新增同规格 shadcn Button；真实浏览器点击验证
`scrollLeft` 依次为 `0 → 296 → 482`，到达最大值后按钮切换为“向后滚动”，点击后回到 `0`。
按钮平时 `opacity:0`，容器 hover 或键盘 focus 时显示，兼顾参考视觉和可访问操作。

“建立”菜单也在双方真实打开后复核：均为 `(510,48),252×181px`，标题、四个条目、图标槽和
测试版标签几何一致，因此未重写已正确的 shadcn DropdownMenu 结构。

对照截图：

- `output/playwright/plugins-v131-manus-current.png`
- `output/playwright/plugins-v131-local-final.png`
- `output/playwright/plugins-v131-local-carousel-hover.png`
- `output/playwright/plugins-v131-manus-create-menu.png`
- `output/playwright/plugins-v131-local-create-menu.png`

## v132 独立排程页面、编辑器复用与真实路由（2026-08-30）

已登录参考页面确认“已排程”是独立一级路由 `/app/scheduled?tab=calendar`，不是“新建聊天”的别名。
本地此前 Rail 点击该项仍执行 `onNewChat()`，URL 与内容都不变；当前 runtime navigation registry
将 `scheduled` 注册为 `/app/scheduled?tab=calendar`，App Router 新增对应 page，Kokoro site adapter
将其投影为独立 `KokoroScheduledSurface`。页面继续由共享 `AppFrame` 承载，因此保留 `52px` icon
rail 与 `56px` Header，不创建第二套 Shell，也不残留会话 Composer。

相同 `786×674` 桌面视口的最终几何：Surface `(52,0),734×674px`，Header
`(52,0),734×56px`，内容列 `x=76,w=686px`；标题 `(76,254),686×42px`。三条建议卡分别位于
`y=320 / 386 / 452px`，均为 `686×54px`、`12px` 纵向间距、`16px` 圆角和 `0.5px 14%`
黑色透明边框。建立 CTA 为 `(339,530),160×36px`。页面与 body 均无横向溢出。

新增共享 `ScheduledTaskEditorDialog`，项目排程和独立排程入口使用同一份 shadcn Dialog、Select、
Checkbox、Switch、Input 与 Textarea，不再保留项目 CSS 中重复的编辑器样式。Dialog 每次打开时挂载
全新的表单状态，建议卡可预填 prompt，普通 CTA 使用空 prompt；打开时 URL 写入
`#scheduled-tasks/new`，关闭时清理。最终 Dialog 为 `(53,30),680×614px`，overlay 使用 `4px`
backdrop blur，body 为 `680×496px` 且 `overflow-y:auto`，实测滚动范围 `20px`、可到达
`scrollTop=19.5px`。保存按钮在 title 或 prompt 为空时禁用，提交结构化 frequency/time/expiry/
auto-approve payload。

独立排程契约补入 `docs/integration/user-web-api-contract-v4.md`：全局日历使用同源
`GET/POST /api/scheduled-tasks`，项目入口继续使用 project-scoped path；两者共用 projection，后端在
service auth/allowlist 通过后解析 RFC 7239 `Forwarded` 的 tenant，浏览器不提交或接收 `tenant_id`。fixture 矩阵新增 empty/populated/loading/error、
创建、暂停、stale revision、删除和跨 tenant 场景，所有示例均为合成数据。

对照截图：

- `output/playwright/scheduled-v132-manus-current.png`
- `output/playwright/scheduled-v132-local-final.png`
- `output/playwright/scheduled-v132-manus-create.png`
- `output/playwright/scheduled-v132-local-create.png`

## v133 Composer 网站上下文胶囊与 32px 工具栏（2026-08-30）

本轮针对用户标注的“桌面版 + 网站”上下文胶囊重新读取 Manus `/app` 网站创建状态的真实 DOM、
computed style 和同视口截图。此前根据截图目测把空工作台控件统一设为 `36px`，但参考 DOM 证明
加号、连接器、桌面环境、网站意图和发送按钮全部为 `32px`；该误差使本地环境项从参考 `x=161`
漂到 `x=181`，也把网站胶囊错误放大为 `78×36px`。

当前 `786×674` 视口中，工具栏为 `(81,354),676×32px`，无横向溢出。加号、连接器、环境项、
发送按钮的 x 轴分别为 `81 / 121 / 161 / 725px`，与参考 `81 / 121 / 161 / 725px` 一致。
网站胶囊恢复为 `68×32px`，padding `6px 9px 6px 7px`，图标/文字 gap `6px`，背景
`rgba(0,129,242,.08)`，边框 `rgba(0,129,242,.28)`，文字 `14/21px 500`。本地网站胶囊
`x=295.77px`，参考为 `x=293.66px`；`2.1px` 差值完全来自 runtime 品牌“Kokoro 桌面版”比
“Manus 桌面版”更宽，而非布局 token 偏移。

环境项为透明底、`6%` 黑色内收 outline、`8px` 横向 padding、`14/18px` 和 `16px` Monitor。
加号恢复为参考 `17px` 中灰图标，连接器为 `16px`；发送按钮仍为 `32px` 黑色圆形，Lucide 箭头
盒从错误的 `18.4px` 收到参考 `15px`。网站图标进一步逐 path 核对：两边都使用
`viewBox="0 0 18 18"`，窗口轮廓与代码折线坐标一致，描边分别为 `1.60714` 与 `1.5`。

对照截图：

- `output/playwright/composer-v133-manus-pill.png`
- `output/playwright/composer-v133-local-pill-verified.png`

## v134 Composer 内联语音输入（2026-08-30）

参考站点在网站创建状态点击麦克风后不打开 Popover、Dialog 或额外面板，而是在原有 Composer
工具槽中直接请求浏览器语音能力。参考麦克风为 `32×32px`、Lucide Mic `16×16px`，hover 背景
为 `rgba(55,53,47,.04)`；点击前后 DOM 几何和 URL 均不变化。

本地删除了不可交互的 disabled 占位，新增独立 `useVoiceInput` controller，统一管理
`idle / listening / transcribing / error`。preview 使用确定性合成转写，live 使用浏览器
`SpeechRecognition`；再次点击停止，浏览器不支持或拒绝权限时通过 `aria-live` 回报，不创建与参考
不符的浮层。AppFrame 只投影 preview 能力，Composer 继续拥有所有工具栏布局。

相同 `786×674` 桌面视口实测：麦克风在 idle、listening、transcribing 和转写完成后始终为
`(685,354),32×32px`；发送按钮始终为 `(725,354),32×32px`。点击后 URL 保持 `/app`，Dialog
数量为 `0`，body `scrollWidth=786px`。转写完成只将合成文本写入现有 draft，不移动网站胶囊、
环境项或发送锚点。

对照与状态截图：

- `output/playwright/composer-v134-manus-mic-after-click.png`
- `output/playwright/composer-v134-local-mic-listening.png`
- `output/playwright/composer-v134-local-mic-transcribed.png`

## v135 胶囊关闭、侧栏无闪动与功能入口收敛（2026-08-30）

本轮按桌面 Web 真实交互复核四个入口：创作胶囊、侧栏切换、技能创建、Agent/排程/资料库。
创作胶囊不再是静态占位：关闭按钮使用同一枚 `32px` capsule 内的 `20px` hit area，关闭动作由
AppFrame 控制并清理 pending intent；关闭后不提交表单、不改变 URL，文本草稿保留。参考视觉中的顺序为
`X → label`，因此可关闭状态不再重复绘制网站/应用图标；未提供关闭回调的纯展示态仍保留 intent icon。

侧栏 resize 只有 React controlled width 一条写入路径，拖拽期间关闭 Sidebar container 的 width transition，
并以 `flushSync` 同帧更新 rail、main 与 seam。折叠时 seam 延后至 `200ms` 几何过渡完成再显示，避免两条线
或内容先后跳动。Rail 导航保持真实 Link：Agent、Scheduled 和 Library/Skills 不再借用新建聊天路径。

技能设置继续使用 shadcn Tabs/Dialog/DropdownMenu/ToggleGroup/Switch。创建菜单同时支持鼠标点击、Enter、
Space，上传入口切到现有 upload surface，官方技能入口打开独立 catalog dialog；关闭由共享 overlay/focus
管理器收口。真实 `1280×720` 验证：Skills 创建菜单 4 项可见，上传入口可达；Agent `/app/agents`、排程
`/app/scheduled?tab=calendar` 和 Settings `skills/library` 均保持独立 URL 与独立 surface。

对照/验收截图：

- `output/playwright/current-v135-capsule.png`
- `output/playwright/current-v135-agents.png`
- `output/playwright/current-v135--app-scheduled-tab-calendar.png`
- `output/playwright/current-v135--app-project-kokoro-settings-skills.png`
- `output/playwright/current-v135-agents-setup.png`
- `output/playwright/current-v135-scheduled-create.png`

## v136 交互回归与桌面验收（2026-08-30）

针对本轮回归反馈，按同一份桌面 Web Shell 逐项复测，不引入手机端分支：

- 创建胶囊的关闭入口固定在胶囊内部左侧，使用 `20px` hit area；关闭后只清理 creation intent，
  保留草稿，且不会提交表单或改变 URL。`X` 与文字之间不再重复绘制网站图标。
- Rail 折叠/展开由 SidebarProvider 的单一受控状态驱动。实际 `1280×720` 点击后，`data-state`
  在 `collapsed ↔ expanded` 间切换，宽度变化只发生一次，未出现第二条 seam 或内容闪动。
- Skills 的 Create 使用受控 shadcn DropdownMenu，鼠标、Enter、Space 都展示四项入口；Upload
  关闭菜单并切入同一个 upload surface，Official 入口打开独立 catalog Dialog，不叠加重复创建流程。
- Agent、Scheduled、Library 均通过真实一级导航进入独立 surface；Agent setup 使用同一套 Dialog、Tabs、
  QR 槽位，Scheduled 创建通过 `#scheduled-tasks/new` 深链，Library 使用独立 `/app/library` 目录，
  不再把作品库误当成账户设置页。

实测结果：

```text
1280×720  creation capsule: 104.78×32px, dismiss 20×20px, after dismiss count=0
1280×720  Skills Create: 4 menuitems, Upload -> upload surface/input
1280×720  Agent: /app/agents, no dialog before Start now; setup opens 1 dialog
1280×720  Scheduled: /app/scheduled?tab=calendar; create -> 1 dialog + #scheduled-tasks/new
1280×720  Library: settings-panel-library mounted in the Settings dialog
```

复测截图：

- `output/playwright/current-v136-capsule-before.png`
- `output/playwright/current-v136-skills-create.png`
- `output/playwright/current-v136-skills-catalog.png`
- `output/playwright/current-v136-agents.png`
- `output/playwright/current-v136-agents-setup.png`
- `output/playwright/current-v136-scheduled-create.png`
- `output/playwright/current-v136-library.png`（设置中心的数据管理页回归）
- `output/playwright/current-v136-rail-agent.png`
- `output/playwright/current-v136-rail-collapsed.png`
- `output/playwright/current-v136-rail-expanded.png`

## v137 资料库一级目录与桌面空态对齐（2026-08-30）

重新打开已登录 Manus `/app/library` 对照了桌面 DOM、computed style 和 `1280×720` 截图。资料库是
独立产品目录，不是设置中心弹窗：标题位于 `(76,14.5),59×27px`，筛选工具栏为 `y=56,h=32px`，
筛选项从 `x=166` 开始；右侧搜索、收藏和网格/清单切换保持同一行。空态使用 Archive 槽位，居中
内容整体落在视口中心略下方，提供“新建任务”按钮，点击后回到 `/app` 的直接聊天 Composer。

本地新增 `KokoroLibrarySurface` 和 `/app/library` App Router page。筛选、搜索、网格/清单切换、空态、
artifact 下载和来源会话跳转均由 site surface 组合 shadcn `ToggleGroup`、`Button`、`Input`；实际数据
仍来自 `listArtifacts`，preview 或开发环境请求失败时只展示确定性的空目录 fixture，生产 live 失败仍显式
显示重试错误。Settings 的 `library` tab 仍保留为数据管理能力，两个语义不再混用。

最终本地 `1280×720` 几何：Shell rail `52px`；标题 x=`76px`；筛选首项 x=`166px`、y=`56px`；
search input x=`915px`（中文字体下与参考 `919px` 的文字槽差异只来自字体宽度）；空态组顶部约
`336.5px`，无横向溢出。Rail Library 的 href 为 `/app/library`，不调用 `onNewChat` 或 `openSettings`。

对照截图：

- `output/playwright/current-v139-library-local.png`
- Manus 参考 `/app/library`：本轮通过桌面真实 DOM 与截图采集，未复制其源码、素材、Cookie 或响应数据。

## v142–v144 Agent 导航选中态与技能 AI 创建（2026-08-30）

继续以 `1280×720` 桌面视口复核 Manus：一级页面进入后，选中的 Rail 项保留与页面一致的浅灰
active tile，而不是仅改变 URL。AppFrame 现在将 route surface 映射为唯一的 `activeNavigationKey`
（`agent`、`mcp`、`scheduled`、`library`、`chat`），由 shadcn `SidebarMenuButton isActive`
统一绘制选中态；因此点击切页不会短暂出现“页面已切换但 Rail 仍选中旧项”的视觉闪动。

技能 `Create → Create a skill with AI` 也按 Manus 的真实流程校正：它关闭 Settings、创建一个新的
直接聊天会话、回到 `/app` 并在共享 Composer 中预填 `/skill-creator` 提示，不再错误地把 AI 创建误导到
上传 zip 页面。新会话 ID 分配后，草稿直接写入该会话键，避免异步 state 切换造成提示词被吃掉。
Upload/GitHub 仍进入上传预检，Official 仍打开独立 catalog。

验证截图：

- `output/playwright/current-v142-agents-local-active.png`
- `output/playwright/current-v144-skill-ai-chat-local.png`
- `output/playwright/current-v144-website-capsule-before.png`
- `output/playwright/current-v144-website-capsule-dismissed.png`

## v164 Agent 桌面 surface 布局与 setup 可用性收口（2026-08-30）

本轮只调整 `KokoroAgentsSurface` 及其 CSS Module、UI 测试和本审计文档；Rail、AppFrame、手机端
和其他 site surface 均未进入修改范围。沿用 v130 的 Manus 对照几何：Hero artwork 保持
`320×234px` 比例，桌面内容列继续使用 `20px` 安全边距和 `1000px` 最大宽度。

能力卡栅格改为按实际 Agent surface 容器宽度响应，而不是读取外层浏览器 viewport：`60rem` 以下
桌面主区使用两列，足够宽的桌面主区使用四列；窄桌面卡片的行高下调到 `115px` 起步，内容较长时
自然增高。规则包在 `min-width: 768px` 内，手机展示保持既有路径不变。

setup Dialog 继续使用 shadcn `Dialog`、Radix `Tabs`、shadcn `Alert`/`Skeleton` 和 Lucide 图标。
Dialog 的 `400×446px` 正常桌面尺寸保持不变；短桌面高度使用 `100dvh - 32px` 的上限，固定头部和
关闭按钮不随内容滚动，Tab/二维码/继续入口放入独立滚动 viewport。可访问名称由当前可见的
`DialogTitle` 提供，打开时焦点交给首个平台 Tab，关闭时回到实际 Start opener；箭头键保持 Radix
Tab 顺序。

二维码槽始终保持 `160×160px`：请求中使用带 `role=status` 的 Skeleton 且设置 `aria-busy`，成功后
渲染 `QRCodeSVG`，失败后使用 shadcn `Alert` 和 Retry Button，不生成假 continue link。合成 preview
fixture 仍只使用 `https://agents.fixture.test` 地址。

回归证据：

- 视觉基线与 Manus 对照：`output/playwright/agents-v130-manus-current.png`、
  `output/playwright/agents-v130-local-final.png`、`output/playwright/agents-v130-manus-dialog.png`、
  `output/playwright/agents-v130-local-dialog-final.png`。
- 宽/窄桌面当前基线：`output/playwright/current-v163-agents-wide.png`、
  `output/playwright/current-v163-agents.png`。
- `tests/ui/kokoro-agents-surface.test.tsx` 覆盖首屏、平台切换、Radix 箭头焦点、二维码 loading、
  setup error/retry、关闭后焦点回收六条路径。

## v148 排程与外挂目录的高度/语言自适应（2026-08-30）

本轮对照 Manus `1280×720` 空态时发现两处仍会造成“看起来不一样”的实际差异：排程页旧的
`686px` 固定最大宽度只在窄视口接近参考，宽桌面会显得内容过窄；固定顶部 padding 也会让
`720px` 与 `674px` 高度的空态上下漂移。现改为 `48rem` 内容轴，并使用以视口高度为输入的
clamp padding。中文 `1280×720` 实测与 Manus 对齐：插画 `(602,106),128×112`，标题 y=`277`，
建议卡 x=`282,w=768`、y=`343/409/475`，按钮 y=`553`。

外挂目录页的右上角动作不再使用固定宽度。固定宽度在英文等较长 locale 下会把“Manage connectors”
与 Create 挤在一起；现在由 shadcn Button 的内容宽度加间距决定，中文仍保持参考坐标，英文也不会
重叠或截断。两项修复只作用于桌面 Web，未引入手机端布局分支。

对照截图：

- Manus `/app/scheduled` 空态（真实浏览器采集）
- `output/playwright/current-v148-scheduled-local-zh.png`
- `output/playwright/current-v148-plugins-local.png`

## v153 通知中心浮层与底部铃铛职责修正（2026-08-30）

重新采集 Manus 桌面通知入口后确认，底部铃铛不是“通讯偏好”设置入口，而是锚定在铃铛右侧的非模态
通知浮层：外层位置为 `(50,76)`、`400×600px`，距离铃铛 `8px`，圆角 `12px`，内容区只有一条纵向
滚动轴。设置中心仍保留在账户菜单和命令菜单中，Appearance 只负责浏览器/声音通知偏好，两个职责不再
混用，因此点击铃铛不会写入 `#/account/settings/general`，也不会造成 Settings 与通知层叠加闪动。

本地新增 `NotificationPanel`，使用 shadcn/Radix `Popover + Tabs + TabsContent`，Popover 负责 Portal、
焦点和 Escape/外部点击关闭，CSS Module 只负责参考几何和内容排版。面板含“全部 / 更新日志 / 消息”
三种真实切换状态，滚动内容使用 Kokoro 合成通知与中性预览块，不读取或复制参考站点的通知正文、素材、
Cookie 或响应数据。通知标题、Tab、aria 文案和 fixture 文案均进入 `notifications.*` i18n namespace。

1280×720 桌面实测：铃铛 `(10,644),32×32px`；打开后浮层 `(50,76),400×600px`；点击/切换 Tab 不改
Rail 宽度、不改 URL；关闭后 Radix 将焦点还给铃铛。窄视口仅由 Popover 的 `max-width/max-height` 防止
桌面浮层越界，本轮没有新增手机端模式或移动端专属布局。

对照截图：

- Manus 通知中心：真实桌面 Popover DOM/截图采集
- `output/playwright/current-v154-notifications-local-open.png`

## v161 网站创作胶囊的默认图标与关闭交互（2026-08-30）

复核用户补充的 Manus 桌面截图后，胶囊的静止态必须保留网站代码窗口图标，而不是把关闭用的 `X`
常驻替换在图标位置。两边的参考几何仍为 `68×32px`、`16px` 图标、`6px` 图标/文字间距、
`14/21px 500` 文案和 `6px 9px 6px 7px` 内边距。

本地 `CreationIntentPill` 现在保留上述网站/应用图标作为默认视觉；受控关闭按钮仍位于同一个 `16px`
槽位内，只在胶囊悬停或获得键盘焦点时将该槽位平滑切换为 `X`。因此既满足“看起来与 Manus
一致”的静止态，也保留了“胶囊可以关闭”的可操作性；槽位宽度不变，不会推动桌面环境选择器、麦克风或
发送按钮发生跳动。关闭事件继续阻止表单提交，仅清理 creation intent，draft 与 URL 保持不变。

本轮实测本地桌面 `1280×720`：网站胶囊为 `68×32px`，网站图标和关闭图标共享 `16×16px` 槽位，
普通态可见网站图标，点击关闭仍可通过 `aria-label="关闭网站创作模式"` 完成，且工具栏其他控件位置不变。

对照截图：

- 用户补充的 Manus 网站胶囊参考截图
- `output/playwright/current-v161-capsule-desktop.png`

## v162 通知滚动、排程短视口与资料库状态补齐（2026-08-30）

补齐只读审计发现的三个实际断点：通知 Popover 的 Tabs 根节点现在承担剩余高度，活动
`TabsContent` 成为唯一纵向滚动容器，内容不会再被 `overflow:hidden` 外框吃掉；“全部”页不再重复
渲染同一条首屏更新，featured 更新与历史连接器更新各占一个时间线条目。

排程编辑 Dialog 改为 `min(38.375rem, calc(100vh - 2rem))`，在 `1280×560` 这类短桌面视口内仍保留
完整标题、滚动表单和底部保存区；勾选“设定到期日期”后，保存按钮会等待有效日期，不再把空字符串
发送给保存回调。

资料库的收藏按钮改为受控 Toggle 状态并以 `aria-pressed/data-state` 暴露；空收藏结果有独立文案。
筛选项不再在窄桌面被静默隐藏，改为同一工具栏内可横向滚动的完整筛选轨；下载失败显示明确的
`role=alert` 文案。以上变化只作用于桌面 Web，不新增手机端布局分支，也不改变后端 API 契约。

## v163 语音输入与网站胶囊复核（2026-08-30）

对照用户提供的 Manus Composer 截图，静止态网站胶囊保留代码窗口图标；只有悬停或键盘聚焦时，同一
`16px` 槽位切换为 `X`，不会把关闭图标永久显示，也不会改变桌面环境、麦克风和发送按钮的位置。
在 `1174×424` 窄桌面视口实测，胶囊仍为 `68×32px`，环境项保持可读的 `Kokoro 桌面版`，不会因
旧的 viewport 规则被错误压成孤立显示器图标。

麦克风使用同一 `32×32px` 内联按钮，不增加 Dialog、Popover 或外部状态条。preview fixture 按
`620ms listening → 220ms transcribing → draft 追加` 完成确定性演示；live 浏览器在支持
`SpeechRecognition`/`webkitSpeechRecognition` 时接入原生识别，不支持或启动异常时留在原位并通过
`role=status` 暴露错误。点击停止会清理计时器/识别实例，URL 与页面布局保持不变。

对照截图：

- `output/playwright/composer-v134-local-mic-listening.png`
- `output/playwright/composer-v134-local-mic-transcribed.png`
- `output/playwright/composer-v134-local-capsule-hover.png`

## v167 当前桌面 Web 收口基线（2026-08-30）

本节覆盖前文旧阈值与旧截图命名的当前实现，以最新真实桌面浏览器复测为准。宽桌面展开/收起共享同一
AppFrame、Sidebar 和内容轴，宽桌面 rail 为 `300px/52px`；fine-pointer 且 CSS viewport `<=768px`
时改为隐藏 rail track/gap/container，由 Header 的单一 navigation trigger 重新打开完整 rail。不再用
`1365px` 抢占宽桌面主画布，导航切换不卸载 rail，不产生双 seam 或整页闪动；可见态唯一 seam 是
`data-seam="rail"` 的单像素 resizer。

当前一级导航语义固定为：直接聊天、Agent、技能、外挂、已排程、资料库。Agent 使用消息气泡图标，
技能使用拼图图标，外挂使用四圆点图标；`/app/agents`、`/app/scheduled?tab=calendar`、
`/app/library` 均是独立桌面 surface，不再把这些入口错误地送进新建聊天或 Settings 弹窗。空 direct
会话列表在宽桌面展开 rail 中不渲染死区；窄桌面隐藏 rail 后由 Header trigger 保持导航入口，展开 rail
或触发 route 都不调用 new-chat handler。

Composer 网站创作态沿用 Manus 的桌面几何：Composer `768×120px`，网站胶囊 `68×32px`，图标与
文字共用稳定 `16px` 槽位；静止态显示代码窗口图标，悬停/键盘聚焦时槽位切换为 X。点击关闭只清理
creation intent，草稿与 URL 不变。麦克风是同一工具栏内的 `32×32px` inline button，preview 为
合成转写 fixture，live 使用浏览器 SpeechRecognition；不增加 Dialog/Popover，不上传原始音频。

最新本地复测：

- `output/playwright/local-v167-final-app-1280.png`
- `output/playwright/local-v167-final-capsule.png`
- `output/playwright/local-v166-agents-wide-final.png`
- `output/playwright/local-v166-scheduled-wide-expanded.png`
- `output/playwright/local-v166-library-wide-expanded.png`

以上截图只用于桌面 Web 的几何与状态回归；品牌名称、插画、项目/通知/技能正文均为 Kokoro
runtime manifest 或仓库内合成 fixture，不复制 Manus 源码、受保护素材、Cookie、token 或响应数据。

## v169 Composer 工具行与文本轴二次像素对齐（2026-08-30）

同一 `1280×720` 视口重新读取 Manus 与本地真实 DOM 后，发现外框尺寸虽然一致，仍有两个会被截图直接
看出的偏差：本地文本第一字靠近左边框，且空态工具行没有内缩，导致加号贴边、发送按钮向右漂移。现将
桌面空态 Composer 的文本编辑器固定为 `padding: 1px 8px 0 16px`，工具行固定为左右 `12px` 内边距。

因此两边当前关键坐标为：Composer `(406,288), 768×120px`；加号 `(419,363),32×32px`；连接器
`(459,363),32×32px`；桌面环境 `(499,363),32px 高`；发送 `(1129,363),32×32px`。Kokoro
环境文字比 Manus 的产品名略宽，因此网站胶囊右侧保留约 `2.1px` 的品牌字宽差异，其他工具槽不发生位移。

截图：`output/playwright/local-v169-composer-aligned.png`。这次只收口桌面 Web 的文本/工具轴，不调整
手机端，不增加新的布局层，也不改变 API 契约。

## v170 窄桌面 Composer 与侧栏断点复核（2026-08-30）

在 `786×674` 真实桌面视口与 Manus 对照后，发现此前 768–960px 的 AppFrame 规则又给 Composer
表单额外加了一层 `12px` 横向 padding。该规则与 Composer 自己的 12px 工具行内边距叠加，表现为
加号向右偏 `12px`、发送按钮向左偏 `12px`，正是窄桌面截图中“左右不在同一轴”的来源。现已删除这条
重复规则，只保留 Composer 自身的文本/工具内边距。

`786×674` 当前与参考一致：外框 `(316,279),454×120px`；文本编辑器包装层 `(317,292),452×50px`；
加号 `(329,354),32×32px`；连接器 `(369,354),32×32px`；发送 `(725,354),32×32px`；页面
`scrollWidth - innerWidth = 0`。断点实测 fine-pointer `768px` 为隐藏 rail + Header trigger，
`769px` 返回宽桌面 `300px/52px` 状态（空间不足时由 resizable shell 自然收窄，不把 300px 硬塞出横向滚动）。

对照截图：`output/playwright/local-v170-narrow-composer.png`、
`output/playwright/manus-v170-narrow-composer.png`、
`output/playwright/composer-v170-narrow-side-by-side.png`。

## v171 桌面导航残留、嵌套弹窗与本地语音回归（2026-08-30）

针对桌面 Web 回归截图中出现的侧栏文字/动作残留、导航点击闪动和技能创建完成后设置层意外消失，重新按真实 DOM 与同一视口交互复测：

- 宽桌面收起 rail 的一级入口只保留 `36×36px` 图标按钮，轨道为 `52px`；fine-pointer `523×674` 窄桌面则移除 rail track/gap/container，只在 Header 保留一个 navigation trigger。点击 Agent 后 URL 变为 `/app/agents`，Tooltip 数量归零，rail/main 几何不变。
- Tooltip 只在桌面收起态挂载；展开态直接使用内联文本，避免宽度切换期间 Radix portal 仍处于活动状态。展开/收起后的焦点交接在 provider 状态提交后执行：展开聚焦收起按钮，鼠标收起聚焦 compact brand，点击不会留下黑色气泡或 focus ring 残影。
- Skills 的 GitHub 导入、官方目录和设置中心现在识别 portalled nested Dialog。点击预览导入完成或关闭子弹窗只返回技能页，不卸载外层 Settings；Esc、关闭按钮和外部点击仍保持各自的层级语义。
- 本地开发即使 session probe 已返回 authenticated，也继续使用 `process.env.NODE_ENV !== "production"` 的合成语音预览：麦克风在原位经历 `listening → transcribing → idle`，合成文本追加到 draft，不新增 Dialog/Popover；生产环境仍走浏览器 `SpeechRecognition`。

真实桌面回归截图：

- `output/playwright/local-home-1280-after-fix.png`
- `output/playwright/local-narrow-rail-final.png`
- `output/playwright/local-agents-after-all.png`
- `output/playwright/local-scheduled-calendar-final.png`
- `output/playwright/local-composer-mic-listening-final.png`
- `output/playwright/local-composer-mic-transcribed-final.png`
- `output/playwright/local-current-reference-comparison.png`

本节只覆盖桌面 Web；没有调试手机端，没有复制 Manus 源码、Cookie、token、Logo 或受保护素材。

## v172 侧栏断点与网站胶囊最终回归（2026-08-30）

针对最新桌面截图再次复核了收起 rail 的残留像素与网站创作胶囊：桌面收起规则现在按
桌面收起规则按桌面宽度生效，同时保留 fine-pointer 桌面缩放路径；因此浏览器缩放、远程桌面或触控屏
桌面仍使用同一 `52px` 图标轨道，不会让隐藏文字或菜单动作漏入图标列。真正的 coarse-pointer 手机
surface 仍由站点自己的手机断点接管，本轮没有调试或修改手机端。

网站胶囊恢复为 Manus 参考的静止态：网站代码图标默认可见，悬停或键盘聚焦时同一 `16px` 槽位切换
为 `X`，点击 `关闭网站创作模式` 只移除 intent，不提交表单、不清理 draft、不改变 URL，胶囊仍为
`68×32px`，不会推动环境、麦克风和发送按钮。

最终实测截图：

- `output/playwright/local-v171-rail-final.png`
- `output/playwright/composer-v134-local-mic-listening-final.png`
- `output/playwright/composer-v134-local-mic-transcribed-final.png`

同一 `1280×720` 桌面视口的 rail 只有一条 `1px` seam，收起态无可见标签、会话 action、Tooltip
残留；展开/收起后的 URL、焦点和主画布轴均稳定。

## v174 胶囊命中区域与 Skills GitHub 导入闭环（2026-08-30）

本轮根据桌面回归发现，网站胶囊虽然视觉上显示 X，但旧实现只有左侧 `16×16px` 的嵌套按钮
可点击，文字区域不是动作，造成“看得到但关不掉”的错觉。现在可关闭态使用单一 shadcn
Button：整个 `68×32px` 胶囊（图标、X 槽和文字）都是同一键盘语义动作，`type=button` 并
阻止表单提交；静止态仍显示代码窗口图标，hover/focus 只在固定 `16px` 槽位切换 X，不推动
环境、麦克风或发送按钮。

Skills 的 GitHub 导入也已从“预览成功提示”改为完整闭环：Create 与 catalog 的 menu item
选择会先关闭 DropdownMenu，再切换目标 surface；检查仓库调用可选的 typed `previewGithub`，
确认导入调用 `importGithub`，preview fixture 会把结果写回本地 skill pool，失活并重取列表。
真实客户端对应 `/api/hub/self/skills/github/preview` 与 `/api/hub/self/skills/github/import`，
请求只含规范化 repository，不把租户、namespace 或凭据放进浏览器数据。

桌面截图与回归证据：

- `output/playwright/bugfix-v174-capsule-default.png`
- `output/playwright/bugfix-v174-before.png`
- 运行时验证：整颗胶囊按钮 `68×32px`；GitHub 导入后 `skill-repo` 出现在 Skills 列表。

本节只覆盖桌面 Web，不调试或修改手机端。

## v175 胶囊与 Skills GitHub 单提交细节收口（2026-08-30）

本轮按 Manus 当前桌面 Web 的真实 DOM、截图和交互重新复核了两个用户可感知的断点：网站胶囊的关闭命中区，
以及 Skills 的 GitHub 入口。胶囊现在始终由单个 shadcn `Button` 承载，静止态显示网站代码图标，hover/focus
在同一个 `16×16px` 槽位显示 X；整颗 `68×32px` 胶囊均可点击，关闭只清理当前创作 intent，draft、URL 和
其它 Composer 控件坐标保持不变。

GitHub 导入按 Manus 的紧凑单提交面重构：居中 `400px` 对话框、GitHub↔Kokoro 品牌流、`URL` 输入、全宽
`导入`按钮和内联错误/完成态。输入先在客户端拒绝非 GitHub host、带 query/hash 的路径和多段路径；合法地址
点击一次即调用 `importGithub`，等待期间锁定按钮，完成后显示成功态并刷新技能池；关闭会使过期响应失效。旧的
“预览卡片→确认”可见布局已移除，`previewGithub` 只保留为旧客户端的内部 fallback，不再成为用户需要理解的步骤。

真实桌面证据：

- Manus：`output/playwright/manus-github-import-reference.png`
- 本地：`output/playwright/current-github-import-final.png`
- 本地完成态：`output/playwright/current-github-import-done.png`
- 本地胶囊 hover：`output/playwright/current-capsule-final.png`

本节只覆盖桌面 Web；不调试或修改手机端。

## v176 Skills GitHub 弹窗垂直节奏与 placeholder 对齐（2026-08-30）

再次按 Manus `400×344px` 实测 DOM 收口 GitHub 弹窗的视觉差异：DialogContent 去除内部边框和 padding，关闭按钮为右上
`28×28px`；内容按 `191px` header、`65px` URL 表单、`88px` footer 三段排列，输入为 `352×36px`，提交按钮为
`352×40px`。URL label 与 input 改为同级元素，避免 label 包裹 input 造成行高/点击区域偏移；placeholder 对齐为
`https://github.com/username/repo`。该调整只改变桌面弹窗的几何，不改变导入状态机与 BFF 契约。

最终本地截图：`output/playwright/current-github-import-v175-final.png`；同视口视觉检查确认父 Settings 保持在后方、没有
残留 Create menu，GitHub dialog 仍是单层可提交 surface。

## v183 Skills 目录与网站胶囊复核（2026-08-30）

本轮使用同一 `1280×720` 桌面 Web 视口重新截图 Manus 与本地实现，并针对“胶囊看得到但关不掉”和“技能目录/GitHub
导入不完整”两个断点做了可见交互复测：

- 网站创作胶囊使用单一 shadcn Button，默认网站代码图标，hover/focus 在固定 `16×16px` 槽位切换 X；整体为
  `68×32px`，点击文字或图标都只清除 intent，保留 draft 与 URL，不触发表单提交。
- Settings 的“技能”嵌入页对齐 Manus 的桌面轴：Settings Dialog=`1024×648px`，技能内容轴 `x=373`、宽 `755px`；
  搜索框=`200×32px` 位于 `y=141`，范围行从 `y=185` 开始，技能卡第一行 `y=233`、卡片=`371.5×135px`；
  卡片标题/描述/元信息采用 `28/48/42px` 三段，描述=`12px/16px`，开关=`22×14px`。
- “浏览技能”目录按 Manus 单独展开为 `800×680px`（`x=240,y=20`），标题/搜索/范围/内容起点分别为
  `60/32/32/168px`；目录卡为 `370×135px`，不会再以更窄的旧弹窗挤压两列内容。
- GitHub 导入从 Settings 主创建菜单、技能目录创建菜单都进入同一单层 Dialog；合法仓库走
  `input→importing→done`，preview-only 注入客户端会明确显示只读预览文案，不伪称已保存；本地 preview client
  的导入完成后会失活并重取技能池，关闭 Dialog 返回后可看到新技能且不重复。

截图证据：

- Manus 目录参考：`output/playwright/skills-v183-manus-reference.png`
- 本地目录对比：`output/playwright/skills-v183-local-wide.png`
- 本地胶囊默认态：`output/playwright/capsule-v183-local-rest.png`
- 本地胶囊 hover/X 态：`output/playwright/capsule-v183-local-hover.png`
- 本地胶囊关闭后：`output/playwright/capsule-v183-local-dismissed.png`

本节只覆盖桌面 Web；没有调试或修改手机端。

## v192 当前桌面行为收口：Capsule、Skills、分页与 Agent/Rail（2026-08-30）

本节追加记录当前实现状态，作为 v191 之后的现行行为基线；不回写或改动前文历史记录。

### 1. 网站创作 Capsule

- 空白 Composer 中的创建意图使用单个 `CreationIntentPill`，网站与应用分别保留自己的语义图标；常态显示图标，鼠标/触控笔悬停或键盘聚焦时在同一 `16×16px` 槽位切换为关闭图标，避免布局跳动。
- Capsule 当前尺寸为 `68×32px`，关闭动作使用 `button` 语义、可聚焦并带有对应的 intent/dismiss 状态标记。按下关闭按钮时会先阻止默认行为，保留 textarea 的草稿与光标；关闭后只清理 session-scoped 的待创建意图并把焦点交还 Composer，草稿、URL 与表单内容不被清空。
- 待创建意图使用 `sessionStorage`，项目工作区不会继承或显示该意图；创建新直达会话时才读取并显示。已有消息或项目工作区中的 Capsule 不重复出现。

### 2. Skills GitHub 导入

- Skills 创建菜单的 GitHub 入口在同一事件中完成菜单收起再打开导入 Dialog；Catalog Dialog 也会先关闭，避免嵌套 portal、焦点抢占或两个遮罩同时存在。重复事件不会启动第二个导入流程。
- 输入支持 `OWNER/REPOSITORY` 便捷写法及 `https://github.com/OWNER/REPOSITORY`（含 `www`）URL，提交前规范化为去掉 `.git` 的 canonical HTTPS URL。非 HTTPS、非 GitHub host、端口、userinfo、query/hash、额外路径段、双斜杠和非法仓库字符均在客户端拒绝。
- 导入流程使用 `input → importing → done/unavailable` 状态；一次提交优先调用 `importGithub`，仅有 `previewGithub` 时明确标为只读预览，不伪装成已安装。请求带取消与 attempt 保护，关闭、卸载或父级受控关闭后，迟到响应不会回写 UI；可恢复的 Hub 错误映射到 Dialog 内的提示。
- 成功后刷新 client-scoped Skills pool 与 Catalog 缓存，导入的个人 Skill 以 `personal/<name>` 身份进入列表并置顶显示完成提示；同名 official/third-party Skill 不会被删除或覆盖。提示可单独关闭，Dialog 完成态的关闭按钮把焦点还给打开入口。

### 3. Skills 详情与 Try

- Skill 名称打开共享 Dialog；详情页当前使用 `SkillCard` 的紧凑投影生成标题、scope/`SKILL.md` 标签、更新时间、三条 prompt 卡片、文件树、YAML 预览与 Copy YAML。Copy 状态会在短时间后、关闭以及切换 Skill 时清理。
- 当前文件树、YAML 与 prompt 卡片是本地确定性 presentation fixture，不代表已从后端取到完整 `SKILL.md`、文件内容或真实 prompt 版本；详情打开不会调用专用 detail/revision endpoint。
- Settings 内嵌路径点击 Try 后关闭 Settings，启动新的直达会话，必要时 pin Skill，把本地化的 Try prompt 写入该会话 Composer 草稿并恢复焦点；Try 不把 prompt 选择当作新的后端请求参数。独立 Skills 页面没有 `onTrySkill` 时保留现有 fallback：未 pin 的 Skill 先 pin，再关闭详情。
- Skill 池/目录的 installed/enabled、revision、导入后的最近项以及列表去重按 `scope/name` 投影；这条记录不扩大到本地 pin 状态等未在本轮复核的状态，也不把来源 scope 当作 tenant 身份，因而不会据此声称所有本地状态都已完成跨来源隔离。

### 4. 分页与稳定列表

- 官方与 third-party Catalog 通过 `GET /api/hub/self/skills/catalog` 按 `scope`、可选 `query` 与 opaque `cursor` 拉取；UI 在一个稳定的 Dialog 滚动区内连续 hydration 所有页，按 `scope/name` 去重，不显示会造成重复请求的第二套分页控件。重复 cursor 会停止继续请求，100 页安全上限会转为可见错误，不静默截断；用户可通过 retry 重新加载。
- Session rail 首次按当前 direct/project scope 拉取第一页，只有服务端返回 `next_cursor` 时才显示 Load more。点击期间禁止并发追加；追加后保留已加载项，刷新重新从第一页开始。Rail 搜索只过滤已加载的本地集合，不在输入每个字符时偷偷启动另一条分页链。
- Direct 与 project 会话列表保持独立 scope；分页、刷新、加载中、空态和错误重试均绑定当前 scope，避免切换工作区后把上一 scope 的 cursor 或会话混入当前列表。

### 5. Agent 与桌面 Rail

- `/app/agents` 继续复用同一个 AppFrame 与桌面 rail，不通过“新建会话”或整页 remount 进入。Agent 导航项使用 `/app/agents` 并以 `aria-current`/active 投影标识当前路由；Skills、MCP、Scheduled、Library 也由同一 runtime navigation registry 映射到各自 route/tab。窄桌面 rail 隐藏时仍由 Header trigger 进入这份 registry。
- Agent 首页已完成 Hero、identity/memory-computer/custom-skills/chat-apps 四张能力卡，以及 WhatsApp/Messenger 的 coming-soon 信息。Start 按钮打开连接设置 Dialog；Telegram、LINE、Slack 使用键盘可操作的 tab，初始为 Telegram。
- 连接设置加载态保留稳定 QR 槽位并禁用 Continue；ready 态渲染后端返回的 `qr_value` 与真实 `continue_url`；error 态只显示 runtime unavailable 与 Retry，不生成假链接。关闭/Escape 恢复 Start 焦点，过期的旧请求不会覆盖当前 platform 的结果。浏览器侧只接收连接设置投影，不接触 runtime identity 或 tenant internals。
- Rail 宽度基线为展开 `300px`、宽桌面折叠 `52px`，可调整范围 `240–440px`；`max-width: 768px` 且 fine pointer 时隐藏 rail track/gap/container，Header trigger 才是唯一可见导航入口。触发后恢复完整 rail、seam、resizer 与搜索；整个 AppFrame 只保留一条可见 rail seam，直达 Inbox 不再复制成第二个桌面主入口。
- Rail 内的 Agent、Skills、Scheduled、Library、MCP route 与 direct/project 会话列表共用当前 scope 语义；未知 manifest 项保持 disabled。隐藏/展开、collapse、search、load more、retry 与 route click 都保留键盘焦点和 active 状态，不触发意外的新建会话。

### 6. 当前边界与 fixture 口径

- 本轮本地预览使用 deterministic Hub/Agent clients 和合成数据验证可见行为；GitHub 导入不会访问真实 GitHub，Agent 预览 URL 使用 `.fixture.test`，不能把这些值当作生产凭据、仓库内容或 runtime ticket。
- 当前后端待接的重点是 Skills 详情所需的完整 `SKILL.md`/files/prompt projection，以及 Agent live BFF route 的真实连接设置来源；这些字段与 endpoint 未在本轮 UI fixture 中冒充完成。契约与 fixture 的字段边界分别记录在 `docs/integration/user-web-api-contract-v4.md` 与 `docs/integration/mock-fixture-matrix-v1.md` 的 v192 追加节。

## v191 胶囊指针态、首屏垂直轴与 GitHub 导入可见闭环（2026-08-30）

本轮继续按 `1280×720` 桌面视口实测 Manus 与本地 DOM，收口两个此前容易被误判为“没有完成”的断点：胶囊只在
特定事件下切换图标，以及 GitHub 导入成功后新技能实际落在列表折叠区。

- 网站创作首屏的 `.directSurface[data-creation-intent="website"]` 桌面 padding-top 调整为 `39px`（`2.4375rem`）。
  本地 composer、标题和网站胶囊现在分别为 `y=269`、`y=181`、`y=344`，与 Manus 同视口坐标一致；普通直接会话和
  手机 media query 不共享这条修正。
- 胶囊保持唯一 `68×32px` shadcn Button 与固定 `16×16px` 图标槽。静止态显示网站代码图标，鼠标/触笔进入或键盘聚焦
  时通过 `data-hovered` 与 CSS 同步切换 X；离开/失焦恢复上下文图标，不改变尺寸、标签宽度、草稿或 URL。整颗胶囊仍是
  唯一关闭命中区，X 没有第二个嵌套按钮。
- GitHub 导入成功回到技能池后，在列表顶部显示刚导入的 personal 技能，并提供可关闭的状态提示；不会要求用户滚动到
  卡片底部猜测导入是否成功。提示只属于前端 presentation，服务端结果仍通过既有 `GithubImportResult` 返回。
- 技能池和版本历史的启停/读取调用会携带可选 `scope` 查询参数，使用 `scope/name` 作为本地视图键。同名 official、
  third-party、personal 技能的开关与修订不会互相串状态；scope 仍是技能来源投影，不是 tenant/site 身份。

桌面实测记录：

- 本地首屏胶囊/X 态：通过真实键盘聚焦验证 `context display:none`、`X display:block`，尺寸保持 `68×32px`。
- 本地 Skills GitHub 完成态：导入 `acme/visible-skill` 后，提示和新 personal 卡同时在首屏可见；关闭提示不会卸载技能池。
- GitHub Dialog：`x=440,y=188,w=400,h=344`；brand flow=`120×40`、title top=`300`、description top=`334`、input=`352×36`、
  footer=`y=444,h=88`，与 Manus 参考保持一致。

本节只覆盖桌面 Web；没有调试或修改手机端。

## v189 胶囊命中区与 Skills 嵌入宽度/导入回归（2026-08-30）

本轮针对“胶囊不能关闭”和“技能模块的创建/GitHub 导入不可用”做了桌面真实交互回归，并修复了一个会把
Skills 操作区推出视口的布局缺陷：嵌入 Settings 的 `.embeddedBody` 原先是 `flex:none` 但没有宽度约束，内部
两列网格按 max-content 计算到 `990px`，导致 `浏览技能`、`创建` 以及右侧卡片在 `1280×720` 下被裁掉。现在
`.embeddedBody` 明确使用 `width:100%`、`max-width:100%`、`box-sizing:border-box`，内容轴保持在 Settings
内部，不再产生页面横向滚动。

桌面实测结果：

- Settings Dialog=`1024×648px`；嵌入 Skills 内容轴 `x=373`、宽 `755px`。
- `浏览技能`=`x=984,y=141,w=72,h=32px`；`创建`=`x=1064,y=141,w=64,h=32px`。
- `document.documentElement.scrollWidth=1280`，与 viewport 完全一致；两列卡片不再被右边界裁切。
- 网站胶囊保持单个 shadcn `Button`、`68×32px`、固定图标槽；整颗胶囊可点击关闭，关闭不提交表单、不清理
  draft、不改变 URL，输入框焦点恢复。
- Skills 的 Create 与目录 Create 都使用单一 `DropdownMenu onSelect` 交接：先关闭菜单，再打开唯一的上传或
  GitHub Dialog，不会因为 portal outside event 卸载父 Settings。
- GitHub 导入使用 HTTPS `github.com/{owner}/{repo}` 规范化输入；拒绝 query/hash、凭据、显式端口、额外路径、
  双斜线和非 GitHub host。真实流程为 `input → importing → done`，一次点击只提交一次规范化仓库，关闭中断请求，
  成功后同时失活技能池与目录缓存。
- 上传入口限制 `.zip`/`.skill`，空候选、非法归档、发布失败均保持可恢复；技能详情的复制状态和定时器在关闭/卸载
  时清理。

本轮桌面验证使用本地合成 GitHub 仓库与技能数据，不访问 Manus API，不复制 Manus 源码、Cookie、token、Logo 或
受保护素材；没有调试或修改手机端。

## v187 网站胶囊与 Skills 上传入口收口（2026-08-30）

本轮针对最新桌面反馈重新验证了两处容易被误认为“没做完”的交互：网站创作胶囊，以及 Skills 的上传/GitHub
创建入口。胶囊继续沿用 Manus 的单槽位行为：静止态显示网站代码图标，hover/focus 显示 X，整颗 `68×32px`
shadcn Button 都是可点击命中区；关闭后 URL 不变、草稿保留、输入框重新获得焦点，且不触发表单提交。

Skills 上传不再把 Settings 内容切换成旧的 inline Upload tab。Settings → 技能 → 创建 → 上传现在保持外层 Settings
和技能池在背景，只打开独立的 `400px` 桌面 Dialog：标题、`360×152px` 虚线 dropzone、文件需求和帮助链接均在同一
个稳定 surface 内。`.zip` 与 `.skill` 均走同一 preview → candidate selection → confirm 状态机；非法文件、预检失败、
重复提交和关闭时的迟到响应均保持可恢复，不伪造已发布结果。

GitHub 入口和上传入口现在共享同一 Create 菜单交接规则：先关闭 DropdownMenu，再打开对应 Dialog，不卸载外层 Settings，
也不把 GitHub 地址误当 multipart 文件。规范化仓库 URL 后只调用一次 `importGithub`；能力不存在、仓库错误、冲突、配额和
服务不可用均回到输入面并显示可恢复错误，成功后刷新技能池。

新增桌面回归截图：

- `output/playwright/skills-v187-local-upload-modal.png`
- `output/playwright/skills-v187-local-github-input.png`
- `output/playwright/capsule-v187-local-rest.png`

本节只覆盖桌面 Web；没有调试或修改手机端，没有复制 Manus 源码、Cookie、token、Logo 或受保护素材。

## v188 胶囊可见关闭态与 Skills 导入交互收口（2026-08-30）

本轮按最新桌面 Web 截图复核了“胶囊不能 X 掉”和“GitHub 导入不完整”两个实际断点。网站创作胶囊现在与
参考交互一致：整颗胶囊仍是单个 shadcn `Button`，`X` 在静止态始终可见，不再依赖 hover 才出现；点击任意位置
只清除当前 creation intent，draft、URL、语音/发送控件和表单提交状态均保持不变。关闭后的下一帧会重新测量
textarea `scrollHeight`，多行草稿不会塌回单行高度，焦点稳定回到输入框。

Skills GitHub 导入补齐了实际失败路径：合法仓库只走一次 `importGithub`，提交期间锁定重复点击，关闭或父 Settings
卸载时通过 `AbortController` 取消请求并使迟到响应失效；仓库 host/path 校验、typed Hub 错误、preview-only 能力
提示和完成态均保留在同一个 Dialog。导入/上传成功后同时失活技能池与目录查询，重新打开目录时不会继续显示旧的“添加”状态。
技能名称可打开独立详情 Dialog，包含文件树、YAML 复制和试用入口；短桌面视口下上传/GitHub 内容区使用内部滚动，
不会裁掉底部动作。

桌面截图证据：

- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v188-capsule-active.png`
- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v188-capsule-dismissed.png`
- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v188-skills-github-input.png`
- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v188-skills-github-done.png`
- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v188-skill-detail.png`

本节只覆盖桌面 Web；没有调试或修改手机端。

## v190 胶囊默认态与 Skills GitHub 导入隔离（2026-08-30）

本轮继续收口最新桌面反馈中的两个可见断点。网站创作胶囊不再把关闭态图标
固定成 X：静止态显示与参考一致的代码窗口图标，鼠标悬停或键盘聚焦时在同一
个 `16×16px` 槽位切换为 X。整个 `68×32px` 胶囊仍是一个 shadcn Button，点击
图标、文字或 X 都执行同一个 dismiss action；不会提交表单、改变 URL、清空草稿
或移动右侧语音/发送锚点。primary pointer down 仍禁止抢走草稿焦点，secondary
button 的 context menu 行为保留。

Skills 的 GitHub 预览 fixture 现在按 `scope/name` 维护目录投影。导入只替换同名
`personal` 副本，不会把同名 `official` 或 `third_party` 技能从池中删除；catalog
merge 也按同一复合键合并，避免刷新后卡片或开关状态串范围。Skills 面板的开关
override 同样只读取复合键，不再从裸技能名回退取值。

桌面回归重点：

- `/app`，`1280×720`：胶囊静止态/hover 态保持同一宽度、图标槽和相邻控件坐标。
- `/app?settings=skills`：Create → 从 GitHub 导入保持独立 Dialog，成功态回到
  技能池后不重复卡片，输入错误可恢复，父 Settings surface 不卸载。
- `acme/copy-editor` fixture：导入后 `copy-editor` 同时保留 `third_party` 与
  `personal` 两条投影，证明导入不是按裸 name 删除。

本节只覆盖桌面 Web；没有调试或修改手机端。

## v193 技能/GitHub 导入与网站胶囊文档基线（2026-08-30）

本节是本轮对已完成桌面 Web 回归结果的文档同步，**只修改文档，不代表真实 BFF 已经实现**。后端仍需按
`docs/integration/user-web-api-contract-v4.md` 完成契约对接；preview client 只能证明 Web 状态机与布局，不能替代
真实权限、持久化、幂等、审计和错误来源。

### 1. 胶囊与 Composer

- 网站创作胶囊是一个且仅一个 shadcn `Button`，桌面尺寸固定为 `68×32px`；图标槽固定为 `16×16px`，不会因为代码窗口图标与
  X 的切换而推动环境、麦克风或发送按钮。
- 静止态显示网站语义图标，鼠标/触控笔悬停或键盘聚焦时在同一槽位显示 X。点击图标、文字或 X 都调用同一个关闭动作，没有
  第二个嵌套关闭按钮；关闭只移除当前 Web creation intent，不提交表单、不清空 draft、不改变 conversation URL，并把焦点交还输入框。
- 环境选择器在当前只读投影下使用 `role="status"`，不是可点击的 `role="img"`，不制造额外 Tab stop 或假装已经可以切换环境。

### 2. GitHub child Dialog 与导入状态

- Settings Skills 与 Catalog 的 GitHub 入口共用一个 child Dialog；父 Settings 保持挂载，菜单或 Catalog 先收起，再打开 child，
  不叠加两个可见创建菜单/遮罩。
- child Dialog 的桌面几何为 `400×344px`，内部使用单次提交节奏：canonical repository 输入、导入中锁定、完成或可恢复错误；不再展示
  “预览卡片 → 第二次确认”的旧布局。
- 输入接受 `OWNER/REPOSITORY` 与 `https://github.com/OWNER/REPOSITORY`（含 `www`），统一规范化为
  `https://github.com/owner/repository`，移除可接受的 `.git` 后缀；非 GitHub host、非 HTTPS、userinfo、端口、query/hash、额外
  path segment、双斜线和非法字符在提交前拒绝。
- `importGithub` 存在时，一次点击只提交一次 canonical repository；导入中使用 `AbortController` 与 attempt guard，关闭、卸载或
  父 surface 变化时取消当前浏览器请求，迟到响应不得改写已离开的 surface。网络、不可用和 typed Hub 错误回到可修复的输入态，不把
  服务端错误 details 直接回显。
- 只有 `previewGithub` 的注入 client 明确显示 preview-only/只读预览，不调用 `onImported`，不刷新技能池，也不声称已经保存。只有
  `importGithub` 的结果才能进入导入完成回调；成功完成后 child 的关闭动作把焦点还给原创建入口。

### 3. 导入可见性、详情与分页

- 本地 preview import 成功后，前端刷新 client-scoped pool/catalog projection，将 `personal/<name>` 的最近导入项置于可见列表前部，
  并显示可关闭的成功 notice；同名 official/third-party projection 不被删除或覆盖。notice 和 recent card 是 Web presentation，
  不是后端已经持久化的证明。
- 技能详情为桌面 `800×648px` 的三段式 surface。当前文件树、YAML 与 prompt 卡片是由 `SkillCard` 生成的确定性 presentation fixture，
  不伪造完整 `SKILL.md` 或不存在的 detail endpoint。Settings 内点击 Try 会关闭 Settings、启动/切换直达会话、必要时 pin 技能、
  将本地化 Try prompt 写入 Composer draft 并恢复焦点；不新增专用 `/try` 请求。
- Catalog 使用同一滚动 surface 沿 opaque cursor 连续读取，直到 `next_cursor=null`；不存在旧的 20 页静默截断。重复 cursor 停止继续请求，
  超过 100 页进入可见错误并允许重试；各 scope/name projection 去重，不将来源 scope 当租户边界。

### 4. 后端对接边界

本轮没有修改任何后端仓库，也不声称 `/api/hub/self/skills/github/import`、Skills detail/content 或 Catalog cursor 服务端已经上线。
真实 BFF 需要先通过 service auth/来源 allowlist，再从 RFC 7239 `Forwarded` binding、httpOnly session 和 membership 派生当前 workspace，重新校验仓库可达性、权限、`SKILL.md`、大小/文件数、
冲突、配额、content hash 幂等及统一错误 envelope；浏览器只提交 canonical `repository`，不提交 tenant/site/namespace、GitHub token 或其它凭据。
`AbortSignal` 只表示浏览器请求取消，不改变服务端导入的幂等和已接受 operation。详情需要的 `SKILL.md`/files/prompt projection、真实导入
审计结果和生产 content hash 仍待 BFF 契约接通。

本节只覆盖桌面 User Web；没有调试或修改手机端。

## v196 Site 仓库边界、胶囊可关闭命中区与 GitHub 导入回归（2026-08-30）

本轮将“当前第一个 Site 应该怎样拆”和最新桌面反馈落到同一个可执行基线。仓库命名已经从
`kokoro-web-user` 收敛为 `kokoro`；它只发布 Kokoro 这一套 Site Web。通用能力不按
菜单或业务数量拆成多个仓库，而由未来的 `kokoro-web-shared` 统一维护并以版本化 package 消费。
详细边界见 `docs/site-repository-architecture-v2.md`。

### 胶囊

- 网站胶囊保持 `68×32px`，图标槽固定 `16×16px`，桌面 hover/focus 时关闭命中区在同一槽位出现，
  不推动文字、麦克风或发送按钮；关闭不会提交表单、改变 URL 或丢失草稿。
- 外壳是非交互布局节点，真实关闭动作是槽位内唯一的 `24×24px` shadcn 风格按钮；这样不会出现
  `aria-hidden` 祖先包住按钮，也不会因嵌套两个 Button 触发表单提交。点击前阻止 primary pointer focus
  抢走 Composer 光标，关闭后由 shell 恢复输入焦点。
- 胶囊没有第二套 CSS 映射或旧 layout 兼容 class；尺寸和颜色来自当前 Composer CSS Module 的语义变量。

### Skills / GitHub

- Skills 的 Create 菜单采用 Radix/shadcn `DropdownMenu`，宽 `252px`、菜单行 `36px`；品牌创建、上传、
  GitHub 三个入口分别对应明确的 action，不把 GitHub 项目错误送入上传表单。
- GitHub child Dialog 为 `400×344px` 的稳定桌面 surface；输入接受 `OWNER/REPOSITORY` 或 HTTPS
  `github.com` URL，规范化后只提交一次 `https://github.com/owner/repository`。
- local preview 使用 `acme/standalone-skill` 等合成仓库数据；实际浏览器回归验证了输入、导入中、完成、
  recent personal card、错误回到输入面、关闭取消和父 Settings 焦点恢复。真实 BFF 仍需自己执行权限、
  `SKILL.md`、大小/文件数、冲突、配额、审计和幂等校验。
- `Github` 并非当前 `lucide-react` 版本可用导出，入口使用仓库已有本地图标资源；通用图标继续使用
  Lucide，避免开发构建因不存在的图标 export 直接失败。

本轮只验证桌面 Web；没有调试或修改手机端。

## v197 网站创建分类展开与首屏滚动锚点（2026-08-31）

本轮使用同一个 `1280×720` 桌面视口重新对比 Manus 与 `kokoro` 的网站创建态，发现此前“网站意图”被
错误地当成“已有草稿”处理：空草稿时专案归档轨道会消失，分类点击还会把不相关的研究 prompt 写进 Composer，且新增
内容触发 Chromium scroll anchoring 后一次跳动约 `88.5px`。这些都是用户可见的布局/交互差异，不是可通过品牌文案解释的差异。

现在的状态边界收敛为：

- `creationIntent=website` 即保留网站上下文轨道，即使输入为空；未关闭胶囊前不因为没有 draft 而删除“让你的网站井然有序”与
  “新增到专案”。空提交按钮保持 disabled，网站胶囊、麦克风和发送按钮仍固定在同一工具栏坐标。
- 网站创建分类是局部选择状态，不是提交动作。点击“着陆页”等分类不会写改 draft，也不会调用 `onPrompt`；只在选中后展开
  Manus 同样的“探索点子”三项。只有点击灵感按钮才把网站 prompt 写入 draft 并交给 shell。
- 未选择分类时直接进入“强大的内建整合”，整合区顶部与 Manus 基线一致；选择分类后整合区随灵感行下移，保持页面文档流而非
  absolute overlay。
- 分类灵感展开使用桌面滚动锚点：在基线视口里 surface 的 `scrollTop=12.5px`，灵感标题 `y=572px`、整合标题 `y=681px`，
  与 Manus 点击分类后的几何一致；不再把顶部计划和 H1 推出视口。`overflow-anchor` 与 layout effect 只作用于桌面 Web welcome surface。
- 移除旧的、与 Manus 当前网站创建 baseline 冲突的“默认探索点子”层；重新确认后，将它作为分类选中态而不是首屏常驻层，避免
  额外 89px 空洞和错误层级。对应旧 i18n key 已一并删除，当前三条灵感文案改为与参考内容语义一致的合成 fixture。

实测坐标（本地空网站态 / Manus 空网站态）：

```text
H1                  (522/522, 200), 288×54（中文字体宽度不同但轴一致）
Composer            (282, 288), 768×120
website capsule     (local 509.77 / ref 537.66), 68×32（仅由 Kokoro/Manus 品牌环境标签宽度差异引起）
project context    y=418, h=18 title；button y=422, h=28
creation heading    y=488.75, h=20
type row            y=524.5, h=40
integration title   y=604.5（未选分类）
selected ideas      y=572；integration title y=681（选中“着陆页”后）
```

本轮新增/更新 `tests/ui/kokoro-welcome.test.tsx`，覆盖空网站态轨道、无默认灵感、分类点击不改 draft、灵感点击才提交
网站 prompt，以及仍然存在的分类横向滚动。验证范围仅为桌面 Web；没有调试或修改手机端。

## v198 资料库基线与技能详情动作栏（2026-08-31）

本轮继续使用同一个 `1280×720` 桌面视口对比当前 Manus 状态，收口两个此前仍然会让本地画面“看起来像有数据、但参考是空态”的差异：

### 1. 资料库使用诚实的空态基线

- Manus 当前新工作区的 `/app/library` 展示空资料库，而不是预先出现四张本地伪造作品卡。
- preview transport 的默认 `listArtifacts` 现在返回空数组；页面仍保留加载、错误、无匹配、收藏、列表/网格、下载和来源会话的完整状态机。
- 需要验证卡片交互的测试通过 `fixtureArtifacts` 明确注入合成记录，不把 fixture 混进真实路由首屏，也不把不存在的租户作品误显示给用户。
- 实测本地空态与 Manus 坐标一致：顶部 `52px` rail、`56px` header、筛选/搜索工具栏、中央 Archive 图标、空态文案和黑色“新建任务”按钮均保留在同一布局轴。

### 2. Skills 详情补齐 Manus 顶部动作栏

- 技能详情的 `800×648px` Dialog 现在使用共享 shadcn `Button` 组成 `分享 → 更多 → 分隔线 → 放大 → 关闭` 动作栏；桌面父 Dialog 内四个动作槽与参考对齐到 `x=891/923/960/992`、`y=56`。
- “更多”使用共享 Radix/shadcn `DropdownMenu`，当前提供下载合成 `SKILL.md` 文件；“分享”复制当前详情 URL，均不读取或暴露第三方 token、Cookie 或受保护素材。
- “放大”不是另一个弹窗：同一个 Dialog 切换为 `100vw×100dvh` 读者模式，顶部标题栏高 `54px`，正文轨道固定为 `768px`，文件树与 YAML 阅读区在同一 surface 内滚动；再次点击收起回到原 `800×648px` Dialog。
- 全屏切换时隐藏 prompt 卡片以保护阅读器 seam，避免短桌面视口出现内容重叠；普通 Dialog 仍保留 prompt 卡片和 Try 入口。
- Dialog 初始焦点落在动作栏容器，避免打开详情时第一枚分享按钮出现闪动焦点框；Tab 顺序仍可进入每个动作，关闭后继续按原触发器恢复焦点。

本轮新增 `tests/ui/skill-detail-dialog.test.tsx`，覆盖动作栏、放大/收起和更多菜单；本地实测截图已验证资料库空态、详情动作栏与全屏阅读器。验证范围仅为桌面 Web；没有调试或修改手机端。

截图证据：

- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v198-local-library-empty.png`
- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v198-manus-library-empty.png`
- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v198-local-skill-detail.png`
- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v198-manus-skill-detail.png`
- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v198-local-skill-detail-expanded.png`

## v199 Agent 与排程首屏细节（2026-08-31）

继续以 `1280×720`、DPR 2 的桌面 Web 视口对照当前 Manus，修正两个首屏容易被忽略的结构差异：

- Agent 首屏的“开始体验”动作现在保留 Manus 式的三枚渠道图标叠放（Telegram、LINE、Slack），按钮仍固定为
  `144×40px`，图标使用本地 Lucide/SVG 原语，不引入远端受保护素材。
- Agent 与排程页面都把页面标题放回各自 surface 的稳定 header 槽位；排程标题坐标为 `(76,16)`，与
  Manus 的 `56px` header 内容轴一致，不再出现主内容有标题而空态首屏缺标题的情况。
- Site skin 的桌面背景收敛为纯白 `#ffffff`，避免 Agent、Skills、Library、Scheduled 之间出现第二种近白画布；
  rail 仍使用独立的 `--sidebar` 层级。
- 组件行为仍由 shadcn/Radix 基础组件承接；本轮没有调试或修改手机端。

本轮真实截图证据：

- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v199-local-agents.png`
- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v199-manus-agents.png`
- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v199-local-scheduled.png`
- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/v199-manus-scheduled.png`

本轮测试新增 Agent 启动动作的三枚渠道图标断言；排程首屏新增一级标题断言。

## v200 Composer 录音内联状态与共享 package 边界（历史记录，2026-08-31）

> 历史记录说明：本节记录的是一次早期参考站点观察，不是当前 `useVoiceInput` 的实现基线。
> 其中“波形/计时器/取消与完成动作”的描述已被 v210 的实际源码审计覆盖；当前 User Web 不渲染录音行，
> 以同一个麦克风槽位承接全部语音状态。

本轮继续在 `1280×720`、DPR 2 的桌面 Web 视口中复核 Manus 的实际录音状态。点击麦克风后参考页不是
Popover 或 Dialog，而是在同一个 Composer 内将输入行替换为波形/计时器，并在原工具栏槽位显示取消与完成动作。

- `src/ui/composer/use-voice-input.ts` 统一承接 `idle → listening → transcribing → idle/error`；preview 只使用确定性的合成转写文本，浏览器支持时使用 `SpeechRecognition`/`webkitSpeechRecognition`，原始音频不进入 Kokoro BFF。
- 录音态使用同一 120px Composer 外壳，波形行固定 50px、计时器固定 40px、动作固定 32px；取消通过 `abort` 丢弃当前录音，完成后才把转写文本追加到草稿。状态切换不改变页面标题、网站胶囊、专案轨道或发送槽位。
- 录音界面仍由 shadcn `Button` 与当前 CSS Module 组合，不增加第二套 Dialog/Popover/focus 实现；未修改手机端布局规则。
- 共享 package 继续采用“一仓库多包”而不是“一个 package 一个子仓库”：当前 `packages/` 是首站的私有 bootstrap；第二个 Site 消费时整体迁移为兄弟仓库 `kokoro-web-shared`，再用 registry + semver + lockfile。Site 名称和部署边界保持 `kokoro` / `@kokoro/kokoro`，不把通用包反向塞回 Site 页面。

本轮真实截图证据：

- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/composer-v134-local-mic-listening.png`
- `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro/output/playwright/composer-v134-manus-mic-listening.png`

本轮只验证桌面 User Web；没有调试或修改手机端。

## v203 直接会话启动卡片（2026-08-31）

直接会话空态现在采用与参考页相同的文档层级：Composer 之后是“开始使用”标题和固定高度的
`92px` 启动卡片，而不是另一套横向快捷按钮或推广轮播。卡片使用两列网格（`>=768px` 的桌面 Web）
和单列网格（紧凑桌面 Web），每张卡保留 `16px` 内边距、`16px` 圆角、`12px` 网格间距、标题右箭头、
两行描述及本地合成缩略图。点击卡片只将其合成 prompt 交回同一 Composer，不新增路由或弹层。

窄桌面首屏仍使用同一套桌面 Web 轴：`624×674` 视口下标题为 `(28,405)`、第一张卡为
`(28,437,568×92)`；参考 `648×674` 视口下对应为 `(28,404.8)`、`(28,436.8,592×92)`。
旧的桌面 prompt 横排和直接会话推广轮播在该桌面空态中不进入布局流；粗指针/手机规则未修改。

## v201 当前权威上下文与窄桌面 Web rail 契约（2026-08-31）

### 1. 部署上下文不是浏览器字段

- 浏览器不发送 `X-Domain`；任何注入的 `X-Domain`、浏览器 `Forwarded`、`X-Forwarded-*`、tenant/site header 或自定义 scope 都由 BFF 忽略并删除。
- `KOKORO_DOMAIN` 仅存在于服务端部署配置。它不进入客户端 bundle、runtime manifest、query、body、header、localStorage 或 Cookie，也不由浏览器选择。
- BFF 到上游只生成一个标准 RFC 7239 `Forwarded: host=<KOKORO_DOMAIN>`。HTTP `Host` 只表示上游目标连接 authority，不表示产品租户或站点上下文。
- 后端必须先校验 Web BFF 的 service auth 和来源 allowlist（内部 secret/mTLS、网络 ACL 或等价机制），再使用 `Forwarded` 做 domain allowlist、deployment binding 和 tenant resolution；`Forwarded` 不是单独认证凭据。

### 2. 窄桌面 Web rail 与入口

| 条件 | 当前实现契约 | 导航结果 |
| --- | --- | --- |
| `>=769px` | 共享 AppFrame；rail 展开 `300px`，显式收起 `52px`，宽桌面收起保留单一 seam | 直接聊天 `/app`、项目 `/app/project/{project_id}`，一级入口由 runtime navigation registry 提供 |
| `<=768px` 且 `pointer: fine` | 仍是 Web；隐藏 rail、gap、container 和 seam，不保留 `52px` 空白轨道 | Header 只保留一个可聚焦 navigation trigger；点击后打开同一份完整 rail |
| 隐藏/展开后点击入口 | route-only navigation，active marker 跟随 pathname/查询参数 | Agent `/app/agents`、MCP `/app/plugins`、Scheduled `/app/scheduled?tab=calendar`、Library `/app/library`、Skills `/app/skills`；不调用 new-chat |

窄桌面隐藏只改变 presentation state，不改变 direct/project scope、session/resource revision 或 API
上下文；Collapse、trigger、route click 和 Settings open/close 都不得产生 `X-Domain`、
`KOKORO_DOMAIN`、tenant/site 字段或浏览器 `Forwarded`。宽桌面偏好仍由 Sidebar cookie 记录，窄桌面
临时展开不应被当成跨站点或租户配置。

### 3. Composer 胶囊与语音输入当前基线 v202

- 网站/应用创作胶囊按本地化标签自适应宽度、固定 `32px` 高，左侧使用独立的 `16×16px` 图标槽位；静止态显示
  创建类型图标，悬停或键盘聚焦时在同一槽位切换为 X。关闭槽位始终挂载、可聚焦且可直接命中，关闭不提交表单、
  不改 URL，只清除 creation intent 并保留 draft。
- 桌面麦克风是固定 `32×32px` 的内联按钮。点击只改变按钮的无障碍状态和轻微颜色，不替换 textarea，
  不新增录音条、Dialog 或 Popover；preview 按 `listening → transcribing → idle` 追加合成文本，生产
  只使用浏览器 SpeechRecognition 结果。
- 录音状态不能改变 Composer 外壳的宽高、控件坐标或网站胶囊位置；不支持语音能力时按钮保持原位并
  提供 `aria-live` 错误状态。

## v204 桌面 Web 点击响应与挂载内导航（2026-08-31）

针对“点击侧边栏后要等待”的反馈，重新用真实桌面 Web 视口检查了从 `/app` 进入 Agent、Skills、MCP、排程和资料库的完整链路。

- `/app` 的 App Router layout 只挂载一次 `AppGate`；各子路由 page 是空 route shell，内容由同一个
  `KokoroAppSurface` 按 `window.location.pathname` 投影，避免每次 Link 点击重新挂载会话探针、rail 和 Composer。
- `WorkspaceRail` 的同源一级入口在 capture 阶段调用 `interceptMountedSurfaceNavigation`：左键普通点击直接写入
  `history.pushState` 并广播 `kokoro:surface-navigation`，modifier/new-tab 点击仍保留原生 Link 语义。地址栏、active
  marker 和主内容在同一交互帧更新，不等待 Next RSC 导航或新的 HTML 文档。
- Skills 的“试用”与资料库的“新建任务”也使用同一 mounted-surface 导航；不再通过 `window.location.assign` 或等待完整
  `/app` reload，因此草稿和网站胶囊不会先闪回 loading gate。
- 本地显式预览通过 `NEXT_PUBLIC_SESSION_PREVIEW=1` 跳过无意义的 session probe；preview 的会话、技能和资料库数据仍走
  与真实接口相同的 typed client，不以加载中的假数据冒充后端成功。
- 真实浏览器检查确认 `/app`→`/app/skills` 后 URL 与技能 surface 立即更新，且服务端没有产生 `/app/skills` 的 RSC 请求；
  自动化 CUA 命令本身包含固定的约 3 秒 settle wait，这不是页面网络等待。验证范围仅为桌面 Web，没有调试或修改手机端。

### 4. 与最终 API 契约的实现状态

当前 User Web 已有可运行的 shell、direct chat、project route、Skills/Library/Scheduled/Agent surface
和 Settings modal，但 `/api/projects`、`/api/tasks`、`/api/scheduled-tasks`、`/api/skills`、
`/api/connectors`、`/api/mcp` 等 canonical BFF path 尚未全部在本仓库提供独立 route；现有
`/api/session/*`、`/api/hub/*` 是兼容 transport 或 preview/live client 接入面。视觉/preview 完成
不得标记为这些 canonical API 已上线；缺口与优先级以 User Web API contract 的 canonical-path 规则为准。

## v205 桌面 Web 即时交互修正（2026-08-31）

本轮针对“点击后还要等待一下”的实际反馈，去掉了两个不属于产品交互的固定等待：

- 侧边栏账户菜单进入设置不再等待 `180ms` 定时器；菜单先关闭，下一帧交给 Settings，确保 Radix focus scope 已释放，同时把可感知等待压缩到一个渲染帧。
- Mail 预览收件匣不再人为等待 `240ms` 模拟网络；本地合成数据在下一个 microtask 进入空态，真实环境仍保留真实 BFF 请求与 loading/error 状态。

验证证据：

- `WorkspaceRail` 单元测试以 `32ms` 计时窗口验证账户菜单交接，不再接受 `180ms` 回归。
- `1280×720`、DPR 2 的桌面浏览器中，账户菜单关闭后 Settings Dialog 已在 `40ms` 检查点可见，Dropdown 已卸载；收件匣点击后同一检查点已显示空态。
- 截图：`output/playwright/perf-v135-account-settings-immediate.png`。

本轮只修改桌面 User Web 的交互等待，不修改手机端布局；命令菜单与嵌套 Dialog 的延迟仍保留，因为它们用于释放另一个 modal focus scope，不属于无网络的普通导航等待。

## v206 Agent Hero 轴与窄桌面卡栅格复核（2026-08-31）

重新以 `786×674` 桌面视口与已保存的 Manus 基线逐像素复核 `/app/agents` 后，修正了两个会让整页
“看起来不一样”的结构差异：

- 能力卡现在紧跟 Hero 标题，Start/Setup CTA 放在能力卡之后；此前 CTA 插在标题与能力卡之间，
  使窄桌面首屏的卡片整体下移，并与 Manus 的 `Hero → cards → Start now` 顺序相反。
- Agent surface 的两列门槛由 `48rem` 调整为 `42rem`，同时保留 `60rem` 的四列门槛。这样 `786×674`
  下的内容列（`x=72,w=694`）稳定呈现两列 `341px` 卡片，`648px` 紧凑参考仍是一列，宽桌面仍是四列。

实测坐标（`786×674`、DPR 1）：能力卡为
`(72,408,341,115)`、`(425,408,341,115)` 与第二行 `(72,535)`、`(425,535)`；页面无横向溢出。
截图：`output/playwright/agents-local-786x674-dpr1.png`、
`output/playwright/agents-local-786x674-final-grid.png`，对照
`output/playwright/agents-v130-manus-current.png`。

## v207 网站胶囊 QA 入口与欢迎页滚动复位（2026-08-31）

针对桌面复核 URL `?qa=capsule-final` 在新标签页没有网站胶囊、且从目录返回首页时可能保留旧滚动位置的问题，补上两项边界：

- 本地非生产构建在没有 sessionStorage 状态时，将 `qa=capsule-final` 解释为确定性网站创建预览；真实 `/app` 仍保持中性的直接会话，
  用户点击网站入口后才显示胶囊。该 QA 查询不会写入后端、不会改变生产路由语义。
- 胶囊本身拆成独立的 `CreationIntentPill` 组件与 `creation-intent-pill.module.css`：静止态展示 `CodeWindowIcon`，悬停或键盘聚焦时在同一 `16×16px`
  槽位交叉显示 X；关闭按钮始终挂载但不改变尺寸，点击后只清除当前创建意图，不提交表单、不丢失草稿。
- `KokoroDirectChatWelcome` 在挂载和 creation intent 切换时同步把自己的滚动容器复位到 `scrollTop=0`，避免从 `/skills`、`/library` 等独立面返回时，
  页面从中段打开导致 Composer 和网站胶囊被裁出首屏。网站模式后续两帧复位仍保留，用于抵消新增上下文轨道触发的浏览器 scroll anchoring。

本轮只调整桌面 Web 的本地 QA 状态和欢迎页滚动边界，没有修改手机端布局。

## v208 展开 Rail 底部锚点与宽度联动（2026-08-31）

针对展开状态下“底部不像侧边栏、拖宽后内容仍挤在中间”的反馈，复核了 `300px` 默认宽度和拖到
`438px` 的真实桌面截图。底部现在保持一个明确的纵向锚点：邀请卡、账户行、设备和通知动作属于同一
`SidebarFooter`，不再由 shadcn Button 的默认居中规则改变账户组位置。

- 邀请卡固定为 `100% × 56px`，桌面 rail 默认坐标为 `(12,570.8125,276,56)`；账户行坐标为
  `(14,634,192.015625,32)`，设备和通知按钮分别为 `(214.8125,634,32,32)`、`(254,634,32,32)`。
- 账户触发器显式使用 `justify-content:flex-start`：rail 从 `300px` 拖到 `438px` 后，头像和名称仍贴
  左，设备/通知动作随右边界移动，不会在宽度变化时把账户信息推到 rail 中央。
- 邀请图标改为站点中性的 `HandHeart`，标题/副标题为 `14px/12px`，与 Manus 的两行推广卡结构一致；
  Kokoro 的品牌名、头像和文案仍由 runtime/i18n 提供。

截图：`output/playwright/v217-footer-aligned-786.png`、`output/playwright/v218-rail-resize-aligned-440.png`，
对照 `output/playwright/manus-786-baseline-loaded.png`。本轮只覆盖桌面 Web。

## v209 水合稳定性与胶囊直接命中（2026-08-31）

- rail 折叠偏好、settings/conversation URL 状态和 QA creation intent 不在 state initializer 中读取
  `document/window`；首棵树使用服务端安全默认值，layout microtask 再合并浏览器状态，消除 returning user
  的 hydration rebuild 与 Next 开发态 “Issues” 浮层。
- creation capsule 的关闭槽位保持固定 `16×16px`，并在未悬停时也由透明的 close button 作为 hit-test owner；
  悬停/聚焦仍只切换 glyph 的可见性，不改变胶囊宽高。点击 X 不提交表单、不改 URL，只清除 intent 并保留 draft。

真实桌面 QA：`?qa=capsule-final` 中胶囊为 `100.78125×32px`，直接点击关闭后节点立即卸载；本地页面无
hydration/page error。截图：`output/playwright/v220-capsule-visible.png`。

## v210 `useVoiceInput` 当前实现审计（2026-08-31）

本节以当前源码 `src/ui/composer/use-voice-input.ts`、`src/ui/composer/composer.tsx` 和
`src/ui/composer/composer.module.css` 为权威，不沿用 v200 的历史录音行描述。语音输入是 Composer 内联能力，
不是新的页面 surface：

### 1. 状态机与 DOM 语义

- controller 状态只有 `idle`、`listening`、`transcribing`、`error` 四种；同一个 `32×32px` shadcn `Button`
  始终留在 Composer 的语音槽位，Lucide `Mic` 保持 `16×16px`。
- `listening` 与 `transcribing` 时按钮的 `aria-pressed=true`，标签切换为“停止语音输入”；`idle`/`error` 时为
  “语音输入”且 `aria-pressed=false`。按钮通过 `data-state` 暴露四种 controller 状态；不新增 recorder 节点。
- `listening`、`transcribing` 和 `error` 使用同一处 `role=status`、`aria-live=polite` 的屏幕阅读器状态文字；
  状态文字不进入视觉布局流。`error` 使用统一的浏览器不可用文案，不把浏览器错误详情写入 UI。
- 点击 listening/transcribing 状态的同一按钮执行 cancel；清理计时器、使迟到 callback 失效，并对 live recognition 调用
  `abort()`，回到 `idle`。

### 2. Preview fixture

`voicePreview=true` 时 controller 使用浏览器无关的确定性 fixture：点击后 `620ms` 保持 `listening`，随后
`220ms` 处于 `transcribing`，完成后把 i18n 的 `composer.voicePreviewTranscript` 追加到当前 draft 并回到 `idle`。
追加规则是保留已有输入、去掉两端多余空白，并在非空 draft 与新文本之间插入一个空格；preview 不提交表单、不创建
任务，也不发送请求。期间再次点击会取消 pending timer，不追加文本。

AppFrame 在本地开发通过 `voicePreview={preview || process.env.NODE_ENV !== "production"}` 提供确定性预览；
生产默认进入 live 浏览器能力路径，除非调用方显式传入 preview。该开关是本地渲染配置，不是 API 字段。

### 3. Live SpeechRecognition

非 preview 路径只探测浏览器原生 `window.SpeechRecognition` 或 `window.webkitSpeechRecognition`：

- 实例使用 `continuous=false`、`interimResults=false`，语言取 `document.documentElement.lang || navigator.language`；
- `onresult` 将浏览器返回的 transcript 追加到受控 draft，并短暂标记 `transcribing`；正常 `onend` 回到 `idle`；
- API 不存在、`start()` 抛错或浏览器 `onerror`（包括权限拒绝）时回到 `error`，保留原位按钮并允许重新尝试；
- unmount、cancel 和新一轮 attempt 会 abort 当前实例并使迟到的 result/end/error callback 无效，避免卸载后改写 draft。

浏览器可能在首次启动时显示自己的录音权限提示，但 Kokoro 不创建 Dialog、Popover、录音条或第二套焦点容器；
该浏览器提示不属于 User Web DOM。

### 4. 布局与传输边界

- 状态切换不替换 textarea，不改变 Composer 外壳宽高、网站创作胶囊、环境投影、相邻控件或发送按钮坐标；
  不存在 v200 所述的可视波形行、计时器行或完成按钮。
- 原始音频由浏览器语音能力处理，不进入 Kokoro BFF、IAM、System、日志或分析；本地 fixture、截图和测试只保留
  合成文本与 DOM 状态。
- 只有用户随后显式提交 Composer draft，识别出的文本才沿用既有任务消息契约；语音能力不增加 endpoint、request
  body、`audio` 字段、上传流程、凭据字段或 tenant/site 上文字段。

验证依据：`tests/ui/composer.test.tsx` 的 46 项测试与 `tests/ui/use-voice-input.test.tsx` 的 controller 测试在同一次
定向运行中共 56/56 通过，覆盖 preview 转换、cancel、unsupported/error、live recognition、原位 DOM 和两个语音入口；
本节只覆盖桌面 Web，不覆盖手机端。

## v211 收起 Rail 左侧锚定（2026-08-31）

真实桌面回归发现，收起动作提交 `data-collapsed=true` 后，外层 shadcn Sidebar 仍需要约 `200ms` 从 `300px`
过渡到 `52px`。旧规则把已经变成 `52px` 的 `head`、`content` 和 `footer` 子树设置为 `align-self:center`，
因此它们会先在旧的 `300px` 容器中央绘制（例如导航按钮首帧 `x=132`），再随着容器收窄移动到左侧 `x=8`，
用户看到的就是“图标突然跑到中间再收回”。

现行桌面规则将三个紧凑子树统一设为 `align-self:flex-start`：

- 收起点击后 `0ms / 8ms / 16ms / 32ms / 64ms / 120ms / 220ms` 的导航按钮 `x` 均为 `8px`；
- 外层 Sidebar 仍可保留平滑的宽度过渡，图标列不会跟随旧宽度做横向位移；
- 展开态恢复后导航按钮仍从 `x=12px` 开始，按钮宽度最终恢复到完整 rail 内宽，不引入第二条 seam；
- 账户、设备、通知底部组也使用同一左侧锚点，避免 footer 在收起过渡中单独闪到中央。

证据截图：`output/playwright/v222-rail-collapse-mid.png`、`output/playwright/v222-rail-expand-mid.png`。
验证范围为桌面 Web，未修改手机端 Sheet。
