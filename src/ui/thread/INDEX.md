2026-10-28：`use-run-display.ts` 在同scope终态补读被卸载取消后解除读取占用，保留既有事实并允许重新可见时读取；不重置终态补读资格、不重试HTTP失败。`tool-action-presentation.ts` 同时拥有行动行与Canvas状态文案，MCP completed仅表述“调用已结束”，业务失败仍优先显示。

2026-10-28 整轮过程：`completed-turn-sections.ts`只按正式 final 引用与完整正文划分；`turn-process.tsx`拥有整轮披露与可访问隐藏，原相邻动作组及正文顺序保持。未取得 final、partial、在途、HITL、取消/失败继续原可读布局；最终答复和状态反馈在披露外。参考入口实测14px/20px、4px gap、16px chevron，未有可靠耗时不造时长。正常激活和同任务浏览器验收仍待。

2026-10-28 历史fallback：ToolCallRow与ActivityInspector共用简短操作+同次对象，删除MCP裸selector特判；有action_title保持原文优先。真实失败/顺序/详情不变，无推断历史意图。

2026-10-28 行动标题节奏：ToolCallRow公开标题采用单行视觉省略，完整名称与exact详情仍可键盘访问；仅原始文件路径保换行。局部activity-detail样式统一图标居中、hover仅文字强调，保focus/coarse触达，不改变Skill、事件或分组。

2026-10-28：`tool-action-presentation.ts`为主行与Canvas共用的有限显示映射；同活动原生工具名与原路径映射中性操作。主行不拼接MCP参数，实际输入/输出保留在详情；不补旧标题/路径、不改失败或调用顺序。

动作意图（2026-10-28，候选）：ToolCallRow优先原activity.action_title，ActivityInspector用同标题；ActivityResult中的tool_description是独立能力说明，不与调用目的混用。原缺省仍保历史标签/目标。SegmentProcess仅在展开且入视口时调用共享reader.ensureRead，idle-only/同Run去重，不把真实error改成自动重试；显式inspect与原终态补读保持。尚待正常配对和浏览器验收。

过程展示（2026-10-28 参考修正）：`process-summary.ts`只统计当前正文间 passage 的真实操作次数；`process-activity-rows.tsx`保持原次序单层渲染，删除 MCP 准备嵌套分组。动作行保动词、原目标与上下文同一阅读流，详情继续由 exact Run/activity Canvas 承接；计数不表示成功或唯一资源数。

## 动作阅读列重做（本地候选）

正文间活动共用单层简洁披露，摘要计真实操作次数；真实文字仍在原位置。ToolCallRow同行呈现操作动词及原目标名/文件路径，原生按钮按exact Run/activity打开Canvas，完成不重复画勾；运行/失败保持文字。ActivityInspector只读展示，不打开display path；MCP结果复用MarkdownMessage的text-only资源策略排版，原始HTML/URL不成为可执行节点或导航，技术记录保持纯文本。use-run-display在同AnswerActionBoundary/readEpoch/profile/Run共享一次用户读取；成功live或未失败在途至多终态补读，失败仅显式重读，加载不闪缺证。正式Public28.12 activity_details同原生成链接入；本候选不冒正常启用。参考/验证见本仓TD与Root原执行板。

RunDisplay 28.11：run-display-overlay仅按原Run既存MCP id投影安全工具名／已证failed，不重写source／顺序或Run终态；旧RAM缺tool_facts视无新事实。use-run-display以正式profile SHA失效原只读memo，仍仅显式有界GET，原actor/scope/late与动作keys保持。

正式回答消费者候选：OwnerAnswerActions绑定私有durable Message、真实四动作与sameK未知恢复；answer-action-scope把同actor准入暂停与真正身份退休分开。SkillActivityRow／ToolCallRow显native name和默认全virtual path，缺事实不猜；use-run-display只按具体Run显式读，pure overlay保status/order。

回答动作后继：answer-action-target只从现receipt/descriptor或snapshotMessageId绑定durable Message，拒segment fallback及归属歧义；纯view/身份比较不授网络权限。正式feedback／regenerate严格接线后，unread/unknown仍不冒null票，不新增正常假操作。

AnswerActions：独立回答操作栏只持复制与短反馈；重新生成／赞踩需调用方提供真实动作及受控事实才显示。AssistantTurn无私有action boundary时仍只接原真实文本复制；私有边界经OwnerAnswerActions绑定具名engine／网络，不加持久化或假按钮；局部灰色图标、tooltip、键盘focus及disabled独立。

确定取消仅中性“已停止”，原文字／过程保留；空取消可成turn。pending仅原停止中，unknown显示明确未确认及原意图重试，不当失败或完成；真实parts缺口保原只读恢复。

补充历史读取反馈：仅当前可见非空正文的精确 durable Message 归属匹配时安静读屏；Tab 进入原重新读取按钮即恢复整行。无正文／别的 Message 保留原提示，status、原回调与 owner 读取语义不变。

具体动作对象第二阶段（2026-10-27，Public28.4 消费者候选）：`ToolCallRow` 从唯一严格 activity 的 optional display_detail.name 纯文本呈现目标，移除 UI-only targetText 过渡 prop；长名 ellipsis／完整 title，不生链接，不猜 raw 参数／答案。正式 finite profile 与校验入口见本仓技术设计；旧 absent 和第一阶段所有顺序／节点／开合／状态语义保持。SharedThread 的公开 head 在进入私有 hydration 前丢弃，共享 process 必须 null。正常组合／浏览器验收仍由 Root 绑定。

具体动作摘要第一阶段（2026-10-27，Root 已核 D0，完整对象消费待正式发行）：`SegmentProcess` 单项直接呈现安全活动行，多项才提供类别组成摘要和真实调用／活动次数；同一 Collapsible／forceMount 内容树保 1→2 节点身份与原 segment disclosure 偏好，公开正文边界不改。`tool-action-presentation.ts` 是九类 label／icon 的唯一纯 UI 映射，不是 wire DTO；完成小勾配读屏状态，失败与运行仍有文字，混合失败包含 Skill／Subagent。同一行的继续处理 cue 只由 AssistantTurn 原 Run／尾锚／连接／HITL 事实派生且所有活动已落定，不改工具状态或叠加 forming。`targetText` 暂为显式 UI-only prop，不读取 activity 未发布字段；完整 metadata／分享隔离与正常验收仍依赖正式 owner 后继，不以本阶段称整片完成。

文件工具类别（2026-10-27，Public28.3消费者）：ToolCallRow新增正式 `tool.file.write`／`tool.file.deliver` 的九语言中性操作标签，完成与失败仍沿原status。live／snapshot／ordered重开共用原activity schema；不读raw名称、文件路径或参数，不将类别冒成功或Artifact关联。消费者候选验收与正常配对由Root分别记录。

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
- Thread 的 Delivery 卡仅按真实 conversationId＋runId 归到该 Run 最后一个现有助手轮后，不随后续读取轮移到尾部；无所属轮的当前会话成果仅保留一次 Library 入口，不猜 message 关联。Canvas／资料库继续聚合全集，`has_more` 仍是会话级提示。
- Markdown 列表标记由本模块的 `.md ul` / `.md ol` 局部恢复，不能依赖被 CSS reset 清除的浏览器默认样式，也不能改动全局列表或任务列表语义。

精确 model_settlement_pending / false 沿原唯一终态 footer 展示，正文和旧generic不改；没有新重试／结算请求。

Completed-empty text slots use core provenance and do not split adjacent activity disclosures. All nonempty public text remains a boundary; late authoritative content restores that boundary. No CSS change.

2026-10-28 正常浏览器补验：AppFrame 的 AnswerActionBoundary 必须传入持有 ContextPanel 的 AppFrameShell，而不是仅正文 MainSurface。原 conv6530 的成功/失败 MCP 动作现按 exact activity 展示原输入输出，换选不串项，关闭恢复到原按钮；这仅关闭详情接线缺陷，Manus 逐阶段自然语言说明与同视口视觉验收仍未完成。

MCP 详情阅读：`activity-result.tsx` 将已验证预览分为无外部资源的Markdown阅读结果与原始纯文本技术披露；`mcp-result-text.ts` 只识别明确文本形状、单次解码，不推断状态/意图或新增读取。截断与脱敏在结果旁保留，未知表示仍能在技术详情查看。
