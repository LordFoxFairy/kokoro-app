# ui/thread — 会话线渲染

## 职责
阅读列上限768px，列内留16px，滚动区顶部40px/外侧16px，由本组件维护，不从 Frame 再扣一层宽度。

渲染消息流：用户/助手轮次、markdown、工具调用、子智能体、运行态、产物卡与投递卡、失败/402 呈现、自动滚动。

## 公开件
- `ConversationThread`（`conversation-thread.tsx`）：会话线主组件；产物/投递/工具打开回调由 shell 注入。
- 原生 `MessageScroller`：初始贴底；读者向上滚动后停止跟随，「回到最新」恢复。加载态与正文都留在同一消息列表；不把助手/脚手架设为顶部锚点，不额外创建清 spacer 的 observer。
- `formatBytes`（`artifact-card.tsx`）：字节展示（被 library 等复用）。
- 卡片子件：`ArtifactCard` / `DeliveryCard` / `ToolCallRow` / `SubagentRow` / `RunState` / `AssistantTurn` 等。

## 协作者
上游：`@/ui/shell`。内联渲染 `@/ui/hitl` 决策卡。打开产物/文件/工具 → `@/ui/canvas`（经 shell 回调）。

## 陷阱
- 失败双源：机器错误态与 agent 裁决的 run.failed 终态都要显式呈现。
- 402（credit_insufficient）走计费专用说明 + 价格入口，不复用通用失败文案。
- Delivery 卡以二元 ID 打开 Canvas/原生同源下载，详情失败可重试/取消；`has_more` 直达 Library 作品页。
- Markdown 列表标记由本模块的 `.md ul` / `.md ol` 局部恢复，不能依赖被 CSS reset 清除的浏览器默认样式，也不能改动全局列表或任务列表语义。
