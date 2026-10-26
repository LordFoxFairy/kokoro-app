工具类别（2026-10-26，源码候选）：`ToolCallRow` 只按正式 Public28 的安全 `display_code` 穷尽映射本地标签；旧 generic、状态行及稳定节点不变，不读取 raw名称/参数或猜 Skill/网页标题、phase、时长。唯一activity schema与生成来源见技术设计，正常组合由Root另验。

<!-- Ordered private histories keep all public text visible, fold only consecutive activities, use stable run/turn keys and expose a per-Message read-only partial reload. Shared threads use only the original inline public parser and never request private parts. -->
过程行顺序（2026-10-25，局部候选）：`SegmentProcess`在单个折叠块内按传入`activities`首次顺序逐项渲染Tool／Subagent／Skill，不按类型重排；同`activity_id`状态更新保原节点及手动开合，安全摘要、失败计数和独立HITL不变。本片不修正文／过程的跨段timeline或折叠块数量，正常组合由Root另验。

过程样式（2026-10-25，局部候选）：沿已归档Manus完成态将普通过程入口收为14px／20px、常规字重的muted内容宽度披露；去外框、静态Sparkles、主体底色与嵌套滚动，普通Tool／Skill／Subagent行仅在`processBody`内去胶囊，随主聊天滚动。保Collapsible、inert、手动开合、键盘焦点、窄端44px触达和减少动态；不改独立HITL、错误footer、Forming、正文或Canvas，不造时长／浏览语义。运行态未有参考，本片不重新设计；跨段顺序、连续分组及正常视觉组合由Root另验。

CHAT-1（2026-10-24，候选）：`UnconfirmedSubmissionFeedback`与依赖未就绪共用中性恢复排版，但明确区分未确认admission和owner执行失败；原文/原请求人工恢复，不把已完成Run误说失败，不自动POST。

## 2026-10-20 执行未就绪反馈

`ExecutionUnavailableFeedback`仅呈现明确pre-admission agent_not_configured且无unattributed RunFailure的状态；中性status＋服务就绪后显式原请求恢复，不伪称已暂停/已执行/已保存，不自动发请求。原真实run.failed/未知失败、归属、402资金分支和machine恢复逻辑保持；同一阅读列内紧凑布局，不改滚动或Composer。模块独立CSS只用现语义token。

## SET28 Web阅读轴滚动槽修补（2026-10-15；正式D0）

正式Web基线7e062cd5e69847bfb34181b6674cb998c4cc50f1，939 tracked clean。runtime_audit唯一writer仅app-frame-main.module.css；931保护/Root7。Root设计/docs/Git/资源/正常激活/CUA。既有精确E2E已多次真实RED，无新tests-only或新增镜像测试；全部tests/阈值/mock/skip/等待保持字节。

Web专属thread viewport统一隐藏滚动条槽以匹配Composer阅读轴；共享/mobile代码和滚动逻辑保持，现精确E2E阈值保护。

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

精确 model_settlement_pending / false 沿原唯一终态 footer 展示，正文和旧generic不改；没有新重试／结算请求。

Completed-empty text slots use core provenance and do not split adjacent activity disclosures. All nonempty public text remains a boundary; late authoritative content restores that boundary. No CSS change.
