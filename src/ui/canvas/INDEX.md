## 原动作只读详情（本地候选）

CanvasContentRef新增activity的Run/activity/subject/generation引用，resolve只在原Run定位最新活动，不储存活动快照、不授权文件读取。现壳保关闭/全屏与焦点返回；活动不提供文件列表/下载。same-subject新admission generation不重开旧槽。Canvas与阅读列共用同scope RunDisplay reader，公开分享没有私有详情读取。

# ui/canvas — 工作区第三栏

## 职责
产物/文件/工具快照的第三栏展示（全屏切换、文件/投递切换、拖拽改宽）。内容按会话隔离。

## 公开件
- `CanvasPanel`（`canvas-panel.tsx`）+ `formatDeliveryTime`：第三栏组件。 桌面 ContextPanel 在焦点位于面板内时用 Escape 走现有关闭路径，按原动作身份回焦。 同一或另一件的显式打开意图退役旧退出计时器及回焦；普通 metadata 更新不重挂预览。
- `canvas-store.ts`：事件总线 store——按会话键各存一槽（内容+开合+全屏）；`openCanvas`/`closeCanvas`/`reopenCanvas`/`toggleCanvasFullscreen`/`canvasSlot`/`resolveCanvasContent`/`subscribe`/`read`/`serverState`/`resetCanvasStore`(test)。
- `useCanvasResize`：main/canvas 宽度拖拽；观察实际 workspace 容器并在 rail/窗口变窄时钳制第三栏，保证 main 最小宽度。

## 已交付成果目录

仅按已核可选 `SessionDelivery.displayPath` 的虚拟目录分组，原生目录可展开；无目录的旧成果留平列，同路径不同交付版本分别按原 Conversation＋Artifact 选择。目录不参与下载／预览读定位，不表示未交付的过程文件。紧凑宽度继续使用同一 Files／Preview 选择器与可访问名称。

## 过程文件版本

原 Process 的已读 RunDisplay 可在没有 FINAL 时打开同一 Canvas。Files 只投影当前会话已加载并已读的 Run 版本；同路径可并列，内容始终按会话／Run／opaque version 获取。路径只显示，旧按路径 API 和伪造的空文件均不回退。预览复用原文本渲染与准入失效，下载先核原长度和 SHA-256。

## 协作者
上游：`@/ui/shell` 的 `useCanvasWorkspace`（订阅 store、绑定 activeId、暴露打开/关闭回调）。

## 陷阱
- 槽按会话键隔离：切会话即读回各自的槽，无需 effect 清理。
- 「closed」只由用户手动关闭记账；重开入口读残留内容。
- 正式 Delivery 槽只保存二元 metadata 引用；不内嵌 1 GiB Blob/iframe，下载由 Library 二元详情与原生附件完成；workspace File 小对象仍独立预览。
