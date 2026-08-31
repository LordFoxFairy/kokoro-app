# CSS Modules 约束

## 目标

CSS Modules 只负责页面布局和产品皮肤；交互语义、焦点管理、浮层定位和控件状态由 shadcn/Radix 组件负责。这样重写页面时不会再出现“同一个按钮有两套 hover、disabled、focus 规则”的冲突。

## 允许放在 CSS Modules 的内容

- 页面网格、flex/grid、滚动容器和响应式断点
- 内容尺寸、间距、排版层级与文本截断
- 产品专属的插图、卡片、品牌标记和状态色皮肤
- 由业务状态驱动的内容布局，例如 `data-status`、`data-mode`、`data-open`
- 组件变体的少量尺寸调整，例如列表分页按钮的宽度和外边距

## 不重复定义的内容

- `Button` 的背景、前景色、边框、hover、focus、disabled 和 cursor
- `Input`、`Textarea`、`SelectTrigger` 的基础输入框外观和焦点环
- `Dialog`、`Sheet`、`Popover`、`DropdownMenu` 的背幕、portal、定位和焦点陷阱
- `Tabs`、`ToggleGroup` 的选中态和键盘行为

## 实现规则

1. 先选择 shadcn 组件的 `variant`/`size`，再给 CSS Module class；不要用 CSS 覆盖语义颜色来模拟另一个 variant。
2. CSS Module class 只覆盖布局和尺寸；若确实需要产品皮肤，使用语义 token（例如 `--accent`、`--primary`、`--destructive`、`--shadow-xs`），不写页面级旧 token。
   动效统一使用 `--motion-fast`、`--motion-base`、`--motion-slow` 与 `--ease-standard`，不在单个站点控件里发明新的节奏。
3. 可交互的状态优先读取组件公开的 `data-state`、`data-disabled`、`aria-*`；业务对象状态才使用 `data-status` 等自定义属性。
4. 原生 button 只保留给非标准语义的内容控件（例如对话过程摘要）；普通操作统一使用 `Button`。
5. 每次新增交互控件，都要补键盘、focus-visible、disabled、移动端宽度和错误态验收。

## 嵌入式面板的横向 gutter

Settings 里的 Skills、MCP、Team、Billing、Pricing、Library 使用各自的
`*Content`，不是再套一层 Dialog。此时由 Settings 的 ScrollArea viewport 统一提供
横向 gutter；Content 接收 `embedded`，只保留纵向内边距并通过 `data-embedded="true"`
标注布局契约。嵌入态 body 必须 `flex: none; min-height: auto; overflow: visible`，
禁止再创建第二个纵向滚动容器；独立 Dialog 仍使用面板自己的完整 gutter。禁止同时保留两层横向 padding，
否则在 390px 视口会把卡片压窄并制造“展开后布局跑偏”。

## 当前验收

- 所有页面交互入口均使用 shadcn Button/Input/Field/Tabs/ToggleGroup/Select 或 Radix 容器。
- CSS Modules 已移除通用层的重试、关闭、分页、旧 hero 和旧场景卡按钮语义皮肤；Kokoro site-owned welcome 只保留自己的 Card 布局皮肤，Rail、Canvas、Settings 均只保留各自布局皮肤。
- 桌面欢迎页的 topbar、Composer 间距和 Manus 风格建议列表收口在单一 Web desktop 皮肤块中；浏览器缩放导致 CSS viewport 落在 768–960px 时仍使用同一套 Web 层级，不回退到旧的场景矩阵或手机壳。
- Settings 的桌面导航/焦点皮肤与 Composer 的桌面 resting/focus 皮肤同样各自收口到单一 desktop block；移动端只通过明确的 `max-width`/container 规则覆盖触控尺寸。
- 手机规则与桌面规则分区维护；桌面重构不得改变 `@container (max-width: 560px)` 及短屏手机计算结果。
- `pnpm check` 必须通过后才视为可交付。
