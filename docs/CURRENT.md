# Kokoro User Web 当前状态

## WEB-READING-AXIS-ALLWIDTH Root已验收（2026-09-30）

基线 `7c2b4d700c8a4399fae68012c1db7423d790abd7` 的48rem正文与 Composer 只在宽桌面上因上限偶然重合；
Root 真实页面复现700px正文 x2/w696、Composer x16/w668，800px收起侧栏正文 x84/w684、Composer x68/w716，
以及961px展开300px侧栏正文 x332/w597、Composer x348/w565。本候选只在 AppFrame CSS 按 Composer 已有合成
gutter 分段设置消息 viewport：961px以上3rem并显式统一 Web thread wrap 为1.5rem，641–960px为1rem，
640px以下为0.125rem；48rem上限、768px以上顶部呼吸线、圆角 shell 焦点、滚动和消息事实均保持不变。

Node22纯样式回归先 RED（目标文件69项中1失败、68通过，缺少新断点规则），实现后69/69通过；完整
`pnpm check` exit 0：contract 109、architecture 37、全量 Vitest 1800、lint/typecheck/build 均通过。日志为
`/tmp/kokoro-web-reading-axis-red-node22.log`、`/tmp/kokoro-web-reading-axis-green.log`、
`/tmp/kokoro-web-reading-axis-check.log`。
首候选虽通过上述纯门，Root真实10宽度矩阵仍在960px收起侧栏复现正文 x122/w768、Composer x68/w876；
原因是max960覆盖把 form 设成100%，只给正文保留48rem上限。后继纯回归先再次 RED（1失败、68通过），再把该
既有声明收敛为 `min(48rem, 100%)`，不改 gutter、焦点、滚动或消息事实；日志为
`/tmp/kokoro-web-reading-axis-cap-red.log` 与 `/tmp/kokoro-web-reading-axis-cap-green.log`。
二次完整门首跑在既有真实Next HTTP integration的5秒预算超时，实际1799/1800，contract109、architecture37、
lint/typecheck均已过，日志 `/tmp/kokoro-web-reading-axis-cap-check.log`；该文件随后隔离3/3通过，日志
`/tmp/kokoro-web-reading-axis-cap-http-retry.log`。已启动的完整重跑最终exit 0：contract109、architecture37、
全量1800、lint/typecheck/build均通过，日志 `/tmp/kokoro-web-reading-axis-cap-check-rerun.log`，未隐去首跑失败。

Root独立Node22.22.2完整 `pnpm check` exit0：contract109、architecture37、1800 tests、lint/typecheck/build全部通过；日志 `/tmp/kokoro-web-reading-axis-root-final-check.log`。独立只读冻结终审P0/P1/P2=0/0/0。Root只补本段验收记录，CSS/两tests/TECH冻结字节未变。修后截图 `/tmp/kokoro-web-reading-axis-desktop-final.jpg`、`/tmp/kokoro-web-reading-axis-mobile-final.jpg`；重复user/空失败轮次与深链仍独立开放，不称全部产品闭环。

本地 preview Playwright 源码覆盖390/640/641/700/767/768/800/960/961/1280与侧栏状态，writer未运行浏览器或服务。
Root 对真实历史线程的最终矩阵全部通过：390/640左右轨漂移0.40625px，其余宽度为0；800/960明确collapsed，
961/1280明确expanded，无横向溢出且消息全文严格相等。首轮driver只用不完整AX差异判断展开按钮，导致961实际仍
collapsed；Root已改为完整状态核对并直接点击后重测，该问题属于测试driver而非生产布局。受管runtime仅同步CSS，
未重启或调用新模型。

## WEB-COMPOSER-VISUAL-ALIGN 实现候选（2026-09-30）

基线 `5058ae2c400dd8be1964bba5df03fd7ce5b52133` 的 Composer 把焦点环画在零圆角 textarea 内部，形成直角方框；同一个 MessageScrollerContent 又被48rem和后声明的46rem规则重复定宽，桌面实际 Composer 768px、内容736px。手机 thread shell 已有横向gutter，仍额外继承桌面2rem viewport padding，进一步压缩正文。

本候选把键盘可见焦点环移到圆角 Composer shell，textarea保留透明 2px outline 的 forced-colors 语义而不再显示内部方框；会话与Composer统一48rem阅读轴。桌面仍保留2rem viewport留白，767px以下只保留0.125rem光学内缩并复用外层安全gutter。未修改消息、retry、owner/API/data、滚动机制或空assistant事实。Node22目标断言先 RED（2个目标测试失败、125通过），最终定点 Composer/AppFrame/CSS architecture 为129/129通过；`pnpm check` exit 0（contract 109、architecture 37、全量 Vitest 1800、lint/typecheck/build）。日志为 `/tmp/kokoro-web-composer-align-red.log`、`/tmp/kokoro-web-composer-align-final-targeted.log` 和 `/tmp/kokoro-web-composer-align-check.log`。Root独立最终 Node22.22.2 `pnpm check` exit0：contract109、architecture37、全量1800 tests、lint/typecheck/build；日志 `/tmp/kokoro-web-composer-align-root-node22-check.log`。原生 IAB 正式页面桌面 content/form 均x282/768px，390px窄屏 content x15.59/358.81px与form x16/358px，无document横向溢出；欢迎/线程焦点均移到圆角shell，textarea透明outline。多行高度38→100→38px、Shift+Enter不提交、Tab控件可达。仅同步受管运行目录两CSS，无服务重启或模型调用。截图 `/tmp/kokoro-composer-mobile-after.jpg`、`/tmp/kokoro-composer-welcome-after.jpg`；独立源码审查返修后0/0/0。单独prettier检查六文件FAIL（包含现有格式基线，本片未整文件格式化），不冒称所有格式门通过。验欢迎页时另发现新会话后deep-link被清空，已另行只读调查；重复user与空failed assistant事实仍未闭环，未隐藏或去重。

## WEB-FAILED-SNAPSHOT-RESTORE 实现候选（2026-09-30）

基线 `840fa7e0ff9c4d241daca0c297b120f34821018e` 的 live reducer 能显示 `RUN_ERROR`，但 snapshot 水合丢弃已有 `messages[].status=failed`，且 watermark 前终态不会再次 replay。本候选已在唯一 hydration owner 实现最小恢复：仅当 owner-ordered messages 尾项是 failed assistant、没有 active run、没有 `status=pending` pause时恢复本地通用 failed；`runError=null`，尾部新 user/后续成功或在途/HITL 均不得被历史失败污染，resolved/cancelled/expired 历史 pause 不阻挡恢复。

Node22 定点测试先以目标状态 RED 3 fail/45 pass，再以历史非 pending pause 边界 RED 3 fail/17 pass，最终 hydration/machine 51/51通过；`pnpm check` exit 0（contract 109、architecture 37、全量 Vitest 1799、lint/typecheck/build）。未改机器契约、生成物或依赖，也未运行服务、浏览器或数据库。真实 IAB failure→reload→manual retry仍由Root后继组合验收；Agent→BFF安全精确 failure code/message/retryable 契约仍开放，本片不替代它。

## WEB-BILLING-TRUTH（2026-09-30；实施候选，待 Root 独立验收）

基线 `main 752aff9d0744cd55c556079a08a2a28e393e50e4`。正式助手首轮原仅因 taskTitle 有值即显示收费 Badge，
并无 server billing decision；中文宣称免费、其他语言反称消耗积分，均无本次费用事实依据。
本片删除该 Badge/唯一 import、两处 CSS 文件中的专用规则及九语言 `thread.creditNote`；
九语言 `composer.directPlaceholder` 仅保留中性提问与品牌插值，不替换为另一扣费承诺。
当前 fast Composer 使用既有中性 `composer.placeholder`，未新增旧 key 调用；任务标题、正文、复制、键盘/IME 均保留。

本片不改余额 DTO、402 错误传递、SDK、owner 或账户数据；未充值、未入账、未证明正常预留/结算/释放计费链。
余额契约漂移及标准错误 code 消费另待 owner-first 切片。真实余额不足入口不隐藏，健康/服务/模型不触碰。
实际 Node22.22.2 RED：真实带 taskTitle 助手 render 与九语言断言共11失败81通过。
GREEN：聚焦 UI/i18n 3文件92通过；contract 18文件109通过；architecture 4文件37通过；
完整非 integration `pnpm exec vitest run --exclude '**/*.integration.test.ts' --maxWorkers=2` 为154文件1665通过，无skip；
`pnpm lint`、`pnpm typecheck`、`pnpm build`、`git diff --check` 全exit0。日志前缀 `/tmp/kokoro-web-billing-truth-`。
真实浏览器/integration/账户充值/扣费链未执行，本任务未授权服务、数据或模型调用；纯门不替代 Root 独立验收。


## WEB-PERSONAL-CODE（2026-09-30；实施候选，待 Root 独立验收）

基线 `main 49adb4bae88e45fc40489c2d297775e08a70faa4`；Web唯一writer，Root负责index/提交。
BFF `67755d16ff0f40ea02d71a6dad7108507a04766a` public原字节已固定，SHA-256
`40578534da44dff8fcb7bb6812d43753542528b379d684a19100c35a62c60114`；其Platform6519ae9a/v5.0.1。
Team原生成器 --write通过，15派生文件无字节变化；无手改generated、依赖/lock或owner代码。

现正式Skills两个入口共用已发布/本人安装view，五具名client/strict同源分支已接；先Current IAM Product Session，
不可信身份header不透传。List presence/分页、八必填+可选removed_at安全投影、receipt及错误安全头严格解析。
unknown保留原key；历史receipt后Get current，读失败仅重读；取消/迟到fence/循环cursor拒绝有直接回归。
已发布卡显式安装，发布不安装、安装不Chat/Run；源详情失效不先阻止降权。19新文案全九语种明确覆盖。
四核心源码继续各自原职责，无新目录/store/helper，均低于任务卡粒度上限。

实际RED：新同源头/DELETE body与安装入口2失败39通过；五方法client缺口2失败28通过；
非前进cursor补充RED1失败18过滤skip；非法revision补充RED2失败15通过45过滤skip。
Node22.22.2最终GREEN：直接6文件/221通过；contract18文件/109通过（含Team15生成漂移检查）；
architecture4文件/37通过；lint/typecheck/build各exit0。完整非integration `--maxWorkers=2` 为154文件/1654通过、无skip。
对应命令见TECHNICAL_DESIGN本片；integration/e2e未运行，因本任务只授纯门、不授共享基础设施或浏览器。
中间typecheck曾发现新revision范围常量用了低target不支持的BigInt literal，已改现有BigInt构造器并完整重跑上述全部门。
日志前缀 `/tmp/kokoro-web-personal-`。真实owner/浏览器、共享PG/Redis、3310、模型调用均未执行；
没有启动/停止用户服务或操作Git index/commit。Root独立复验/提交/受管snapshot同步与真实产品链是后续门，不称全UI能力完成。

## WEB-PERSONAL-DOC-WRITE（2026-09-30；仅文档门，待 Root 审查）

基线 Web clean main `14a54b4b8da68b37d83a13402bc8abb87001574e`。本片唯一写集为
TECHNICAL_DESIGN/API_CONTRACT/DATA_MODEL/CURRENT；没有代码、generated、依赖/锁、Git index/commit、服务或数据操作。

当前事实：正式 Skills 两个入口共用 PersonalSkillsRead，只读本人 ACTIVE 列表/详情并提供已有发布流程，
无本人 installation consumer；旧 name/scope setSkillEnabled 不用于本次正式 API。snapshot 仍 pin BFF
`571b51de2057905c74c78ac966c8cf5ac11eca93`，SHA-256
`f49023882315a4f46e46e95595a02eaa7bb85475d5f46d2b945bc0555edb0c90`。

已核下一固定来源：BFF `67755d16ff0f40ea02d71a6dad7108507a04766a` public OpenAPI，SHA-256
`40578534da44dff8fcb7bb6812d43753542528b379d684a19100c35a62c60114`；其 consumer 固定 Platform
`6519ae9a7dba63586474d2860f6725d3165b701e` v5.0.1。源码/机器读核不等于此 Web 已实现或真实五方法组合已过。
Root 对上轮 IA 的验收 commit 为14a54b4；下节 IA“候选/待验”保留的是当时交付记录，不是当前未提交源码。

### 本文档门已确定

- 沿既有 Hub/PersonalSkillsRead，独立管理已发布与本人安装；无新 module/store/owner/协议。
- 五方法严格消费、单键原意图、取消与 unknown ACK、replay 后 Get current；不丢 receipt、不发明 public CAS。
- List 的 top-level data array/optional meta、过滤 presence/keyset、removed disabled、隐私与逐状态错误/头均与 BFF 一致。
- 当前通用 Hub 对新路径会丢 request ID/Retry-After、改写 no-store、略过 DELETE body，须具名严格分支后才接 UI。
- Publish 不 auto-install；安装不启 Run/改 refs；公开目录、preview 或空页 stub 不代表可用安装能力。
- 下一精确既有源码/生成 pin/i18n/测试范围与命令已列 TECHNICAL_DESIGN，仍须 Root 单独授写。

### 本片验证与未完成

本片实际执行只读文件/来源核查、owner OpenAPI `sha256sum`、四文档边界一致性检查、`git diff --check` 与四文件 hash。
没有运行代码门或真实服务。Root 后续独立运行 `pnpm contract`、`pnpm test:architecture` 审核文档门；
代码授权后再按 TECHNICAL_DESIGN 的 Node22 聚焦/pure/lint/typecheck/build 命令验收。
真实当前 IAM/BFF/Platform/Storage、跨页签/撤权/ACK lost 与浏览器交互仍待 Root 组合，不触当前3310受管进程或付费模型。
没有新 owner/public 契约裁决项；开放项为文档门审查、代码文件集授权、repin/runtime/UI实施、独立验证与产品激活证据。

## WEB-PRODUCT-IA-CODE（2026-09-30；已实施候选，待 Root 独立验收）

基线 `main 7087225`；本片 Web 唯一 writer、Root 管提交。Conversation 相关 callback alias 已删除，专案会话/排序/加载/错误/
空态/输入提示按会话命名，ScheduledTask 仍独立 live surface；Project scheduled 正式卡只导航 `/app/scheduled`，
不装载 preview task、不挂假选择/保存弹窗、不以缺 callback 或丢弃回执生成正式成功。显式 preview 保留隔离样本。
无 projectRef 不猜 `/app/project/kokoro`；welcome 新建意图单独 callback 走既有 owner createProject 与 frozen retry，
新建后的 opaque ID/草稿保留，展开/收起菜单不将 UI Event 当草稿；已知项目 shortcut 使用“当前专案”，不假称全集/真实名称。
移除首页硬编码广告轮播/计时器；未接通 Figma/Shopify/内建整合只留显式 preview，welcome 默认正式模式。
保留真实聊天提示与 brand 插值；Composer 只保留编辑器 token focus ring，既有 autogrow/IME/Shift+Enter 不改。
仅增加本片七个准确翻译 key 到现语言包，复用已有私密/空态 key，覆盖率门不降低。

Node 22.22.2 实测：新增正式行为 RED **5 failed/88 passed**；旧 CSS 双 focus 负例 RED **1 failed/56 skipped**（按名字聚焦）；
收起菜单 callback Event 负例 RED **1 failed**。最终直接 **7 files/232 passed**；完整非 integration `--maxWorkers=2`
**154 files/1581 passed**；contract **108 passed/18 files**（含生成漂移校验）；architecture **37 passed/4 files**；
lint、typecheck、build、git diff --check 全部 exit 0。首次全门 **1578 passed/1 failed** 为新 key 导致 ko 覆盖率
1464/1547 低于95%，Root 追加批准七个现 overlay 后精确补翻译，原门完整重跑通过，未放宽断言。
日志 `/tmp/kokoro-web-ia-red.log`、`/tmp/kokoro-web-ia-focus-red.log`、`/tmp/kokoro-web-ia-menu-red.log`、
`/tmp/kokoro-web-ia-green.log`、`/tmp/kokoro-web-ia-unit-final.log`、`/tmp/kokoro-web-ia-final-*.log`。

命名审查返修：上一候选 1P1/1P2 未放行；DOM/data-test/aria/CSS 与本地组件统一 Conversation 命名，快捷图标为 MessageSquare，
命令菜单 onNewChat 使用会话文案。原位 rename 为 `kokoro-project-conversation-welcome.tsx` / `project-conversation-empty.tsx`，
旧文件删除且唯一 imports 同步，不留 alias/双文件；INDEX 无旧引用因此未改。
先 DOM/图标两例 RED **2 failed/67 passed**，命令菜单 RED **1 failed/8 passed**；新候选相关 **8 files/243 passed**，
完整 pure **154 files/1583 passed**，contract **108**、architecture **37**、lint/typecheck/build/diff check 全部重新通过。
日志 `/tmp/kokoro-web-ia-naming-{red,green,unit,contract,test-architecture,lint,typecheck,build}.log` 与
`/tmp/kokoro-web-ia-command-red.log`。全 src/tests 的旧 conversation task selector/组件命名零命中，剩余 task loading/error
调用仅属真正 ScheduledTask。上文 1581/232 是返修前候选证据，不作为最终放行门。

本片仅原位重命名两文件，无新目录/依赖/持久 store/网络契约/generated；所有测试进程已退出，未启动应用服务、访问共享 PG/Redis/3310 或用户浏览器。
纯测试的 CSS/输入断言不等于实际浏览器焦点与窄屏验收；Root 仍需固定来源审查/提交/真实用户流程。
完整 Project 集合/真实名称与项目专属任务过滤仍属后继消费者，未宣称本片完成；下节是代码前文档门历史。

## WEB-PRODUCT-IA（2026-09-30；仅文档门，未实施 UI）

基线 clean `main 79f19df`。本次只修改 TECHNICAL_DESIGN/API_CONTRACT/DATA_MODEL/CURRENT：
已核现 rail conversation/task 混名与 callback alias、猜测 `/app/project/kokoro`、Project 无条件 scheduled fixtures/合成成功、
首页未接通集成广告及缺 brand 插值、Composer 双 focus 绘制。目标明确 Conversation/Project/ScheduledTask/Run 分离，
沿既有 owner/同源 adapter 与 shadcn，不新建 UI 框架/store/协议。

下一首片建议先清除错误语义、正式假任务/无效入口、品牌占位和重复焦点环；独立任务复用现 `/app/scheduled` live surface，
不把个人任务列表当项目列表。当前缺 typed Project 全集 rail 消费、ScheduledTask client 未保留 project_id，后继精确 owner 消费
另授；不以删假数据声称完整产品实现。精确既有文件清单、RED 用例与两种放置比较已写同片技术设计。

本门未改代码/contract/generated/锁/index/服务，未运行用户浏览器/3310 或真 owner 数据；文档 diff 与当前既有机器/架构门
Node 22.22.2 实测：contract 108 passed/18 files（含生成漂移校验）、architecture 37 passed/4 files、git diff --check 通过；
它们仅确认现基线机器/边界门，未证明目标 UI。lint/typecheck/build/全测试本次文档门未重跑。
Root 审查三面并授权后才进入代码 RED→GREEN；不能引用上一 Chat 续流门宣称本片 UI 已通过。

## WEB-CHAT-RELOAD-CONTINUATION（2026-09-30；代码切片，待 Root 验收）

基线 `9590a741448923c63eb4f4ff46379135d21061bd`。纯测试已稳定复现：在途 snapshot 的 durable message_id 与
后续 AG-UI segment_id 不同，导致前缀和续文分成两个 Markdown segments，续文反而先显示；不是两条 owner 消息。
现在水合为已知文本建立早于水位后事件的本地显示锚点，仅唯一同 run、pending/streaming 的未认领前缀可续写。
内部保留 snapshotMessageId，并将显示锚点关联到接续 segment；不修改网络 ID、snapshot wire、事件水位或 owner 状态。
mapper 在内部投影保留 START/END 边界：新 START 不认领旧前缀，终态关闭待认领状态；完整 snapshot、其他 run、多个候选不盲拼。
已有 text/tool 的显示次序、重复事件幂等和终态 partial 保留；不改 UI/projections/transport，不重播水位前历史。

Node 22.22.2 实测：契约 snapshot＋真实 mapper CONTENT/END＋最终投影先 RED（1 failed/3 passed）。
独立审查追加：同 run 已完成历史不应参与在途候选唯一性判断；1 条及 3 条 completed＋唯一 streaming 的两例
先 RED（2 failed/5 passed），修复为先按 role/run/pending|streaming 过滤再判断唯一，历史身份/顺序保持不变；
两个 streaming 仍不盲拼。最终相关 5 文件 **144 passed**；非 integration 测试 `--maxWorkers=2`
**1570 passed / 154 files**；contract **108 passed**及生成校验通过；architecture **37 passed**；
lint、typecheck、build、diff check 通过，以上均在候选筛选返修后重跑。
此前候选首次默认并发非 integration 测试有既有 invitation visual 三例 5 秒 timeout
（1564 passed/3 failed），未改其测试/期限；最终降低并发完整门通过。

本片未启动应用服务或访问 PG/Redis/3310；真实用户生成中刷新、终态和完成后刷新由 Root 独立验收。
当前 snapshot 未提供的完整历史过程仍不在 Web 重建范围；不声称恢复 owner 未提供的历史片段。

## WEB-EXPIRED-SUBMIT（2026-09-30；代码切片，待 Root 验收）

基线 `1dc211bb61030926177b72b3dff2061562a1015b`。签名交互 GET/POST 现在复用现有 target helper 的到期判断；
POST 保留严格同源、原始 query 和一次性 CSRF 消费，在调用 IAM 凭据/continue 前阻断已到期交互。
HTML 返回 303 `/login` 启动新 OIDC，非 HTML 保留 403；没有延长期限、重新签名或认证旁路。
该边界缺口由隔离 fixture 证明，不代表已定位用户当前浏览器点击失败的根因。

Node 22.22.2 实测：expired query + 有效 CSRF 的 HTML/JSON 两例先 RED（仍调用凭据及 continue），修复后
相关 system 文件和 expiry unit 初验 **73 passed**；原生旧 DOM 失效 CSRF 点击后经 `/login` 到新表单、token 改变、
无 CSP violation。测试停止独占 Next/mock BFF 后登记动态 origin 精确 prefix 下全部 CSRF keys 并清理、断言余量 0，
覆盖浏览器反馈 GET 漏登记。仅复用 Redis DB 7，不接当前 3310 或真实 IAM。

本片实际门：非 integration 测试 **1555 passed**（154 files）；contract **108 passed**／生成校验通过；
architecture **37 passed**；lint、typecheck、build、diff check 通过。
其他 integration、完整 Playwright E2E、当前 3310 的真实 IAM/用户可见提交由 Root 后续验收，本片未运行。

关闭确认返修：既有 fixture 曾把 TERM 返回 false 或 KILL 后等待到期当作停止成功；三个确定性 fake child/cleanup
负例先 RED。现在只有 `exitCode/signalCode` 终态才完成 stop，TERM 5 秒＋KILL 1 秒仍未退出则抛错并保留 Next handle，
跳过其临时目录/CSRF 清理；独立 BFF 关闭成功后才释放 handle。未创建真实拒杀进程。
返修后同一 system/expiry 两文件 **77 passed**，lint、typecheck、diff check 再次通过；真实 fixture 关闭与精确 CSRF 余量零
断言通过。本次只改变测试生命周期及此状态记录，生产认证代码未再修改；其他门沿上述首片实测，未重复运行。


## W3-WEB-CHAT-SKILL-SELECTION（2026-09-29；代码切片，待 Root 验收）

基线 Web clean `12f9dff909b8e2e8694a96f510676f90d375ecdc`；BFF 已验 `571b51de2057905c74c78ac966c8cf5ac11eca93`，
public OpenAPI SHA-256 `f49023882315a4f46e46e95595a02eaa7bb85475d5f46d2b945bc0555edb0c90`。当前正式个人 Skill 读已保留
`source_ref/revision`，但没有 Chat 选择入口；全局 `usePinnedSkills` 仍读取 `kokoro.web.pinned_skills` 的名称并注入 engine，
`execution-adapter` 仍发送旧 `pinned_skills`，会被新版 BFF 以 400 拒绝。

当前代码已 clean-slate 改为 exact `selected_skill_source_refs`：无选择也显式 `[]`，最多 16 个、有序唯一、单项最长 197 个字符且数组 compact UTF-8 JSON ≤4096 B，
不 trim/拼前缀/规范化；pending submission 冻结选择，未知响应的同键重试复用原数组。BFF `571b51de` 原字节 snapshot 与生成校验 digest 已更新。
旧 store/hook、name 注入、Composer chip 和旧 wire 已删除；遗留 localStorage key 不读取、不迁移，preview 名称动作只在 mounted fixture 内存中。
typed 选择按 active conversation identity 隔离；新建/切换/active 删除回退会清空，删除非 active 与同一 pending 未知 ACK 重试保留当前冻结值。

Agent `dd34a48` 已要求 typed refs，但非空 reader 尚未接通；正式 UI 因此仍不提供选择/执行入口。完整 PersonalSkillsRead
选择 UI、安装/启用裁决和非空执行链仍是后续必须交付项。Web 不新增 SQL/Redis/安装事实，3310 未操作。

## W3-WEB-SKILL-CONSUMER 第二阶段 B（2026-09-29；Web 代码切片，待 Root 验收）

从 clean Web `98aad4cddb231ef7d1363f00630b9b41f51a743f` 实施正式单 ZIP 发布入口；BFF public owner `62daba37fc0267830d73590bb5a3499807d46fc6` 与原字节 pin 不变。正式 `/app/skills` 和 Settings Skills 共用 `PersonalSkillsRead` 的新发布 Dialog：浏览器校验单 `.zip`、大小和 SHA-256，经同源 `/api/hub` 依次调用 CreateDraft、Get package-upload、Begin、Complete、Validate、零字节 Publish；ZIP 原 File 只按受控短期签名引用直接 PUT ObjectStore，`credentials:omit`、`redirect:error`、唯一 `content-type:application/zip`。本地仅 loopback HTTP 页面→loopback HTTP ObjectStore 允许；正式 HTTPS 页面拒绝 HTTP mixed-content。BFF 仍负责精确批准 ObjectStore origin，Web 不传 Cookie/Bearer 或自建 allowlist。每条 mutation 在一次意图中固定 key/body，网络丢失最多同键重放一次；只有 strict ACTIVE Publish 回执或本人 ACTIVE by-ID 核回才标记发布，CLEAN/validated/Get/旧 pool 不构成成功。旧 preview/confirm、`.skill`、namespace/多候选与 GitHub 导入仍限显式 preview fixture，正式页没有 fallback。

当前 BFF 六项写候选仍 default-off、Platform v4 仍 inactive；UI 已接契约不代表当前开发环境能发布。真正 HTTPS 双 origin CORS/原字节 PUT、IAM/Storage/感染/撤权/刷新/过期引用由 Root 隔离 Chromium 门验；本仓测试不能替代。同一页面会话内关闭/重开 Dialog 保留 File、描述符、key 和当前 attempt：Complete 的 pending/unknown 只显示扫描中，用户显式复核 owner 当前 attempt 后用同一 Validate key 继续；丢 Publish ACK 首次 by-ID 404 显示未知，再显式核对仍 404 时只以原 Publish key/零 body 重发，401/403 原码失败且不重发。浏览器不持久化草稿/key/reference/receipt；整页刷新后丢失当前意图不会以旧 phase 猜成功。旧 attempt 阻止继续，明确要求重新开始，不自动发新 Publish key。BFF Draft 原始 JSON body 硬上限 65,536 字节（字段各自上限不保证组合可达），Web 创建意图前按实际 UTF-8 序列化字节预检，文件名按 Begin schema 在 Draft 前预检；非 self Skills/MCP alias 404。

## W3-WEB-SKILL-CONSUMER 第二阶段 A（2026-09-29；正式只读消费，待 Root 验收）

基线 Web `53760a2c4c9b0420e2a8bb4db8be66d8160169af`；BFF 唯一 public owner 仍为 `62daba37fc0267830d73590bb5a3499807d46fc6`，原字节 pin 未变。正式 `/app/skills` 和 Settings Skills 现在只从同源 `GET /api/hub/self/skills?scope_kind=personal` 读取本人列表，原样使用 opaque cursor，保留 `source_ref/revision`；打开详情另以本人 ACTIVE by-ID 七字段读取，客户端校验响应 ID 与请求 ID 一致。正式 MCP 面只读取 owner-native `server_id/provider_key/server_identity/transport/declaration_digest/status` 六字段，旧 URL、secret、revision、allowed_tools 与无效启停/删除控件不进入正式视图。严格解析、`no-store`/request ID、401/403/404/owner 错误不转空列表；浏览器仍只经 Web 同源 adapter 到 BFF，不直连 owner。旧 pool/catalog/quota 与 MCP secrets 的同源 GET 已封闭，旧 UI/客户端仅限显式 preview fixture 保留，不可作为正式发布事实。

**未完成：** 单 ZIP CreateDraft→Publish 上传状态机没有实施；现有 `SkillUploadDialog` 的 `.zip/.skill` preview/confirm 仍是旧态，仅 preview fixture 隔离显示，不能称为正式发布。六项写候选仍 default-off、Platform v4 inactive。真 IAM/Chromium/Storage/CORS 与 ACTIVE 发布恢复由下一写入片和 Root 隔离验收；本片的本仓测试不能代替该真链。

## W3-WEB-SKILL-CONSUMER 第一阶段（2026-09-29；文档与机器 pin，非运行切换）

开工 Web `main 74dcc101f6c457d10db4511365e6898f44f0e625`、工作树 clean；本阶段把 BFF 唯一 public OpenAPI `62daba37fc0267830d73590bb5a3499807d46fc6` 原字节固定到 `src/generated/bff-public-openapi.yaml`，SHA-256 `5553b798446c8b764fc33d3ccdba6185c3c308213f712cdcf34e751166e0e923`，并更新派生 Team drift pin 与直接 Skills/MCP 负例。BFF 已有个人 `scope_kind=personal` 列表（保留 `source_ref/revision`）、本人未安装 ACTIVE by-ID、owner-native MCP 六字段；六个 Skill 写候选仍**默认关闭**，Platform v4 仍 inactive。机器快照更新不是前端调用激活。

**当前运行态：** `/app/skills`、Settings 仍共用旧 `SkillUploadDialog`，经 `/api/hub/self/skills/upload/{preview,confirm}` multipart 接 `.zip/.skill` 与 namespace/多 candidate；`src/features/app/kokoro-skills-surface.tsx` 与 `src/hub/client.ts` 仍发送 `scope=official|third_party`，和新 BFF `scope_kind` 不符。MCP `src/hub/schemas.ts` 与 Settings 仍用旧 URL、revision、allowed_tools、secret_ref 和启停/删除控件，不能把它们当 BFF 当前六字段投影。当前 UI 不保证读到新个人 ACTIVE Skill，不保证按 ID 恢复发布 ACK，旧 confirm 的 done 不是 Publish 成功。Web 真 Chromium/CORS/原字节 PUT 及产品激活未验；不使用用户 3310 进程充当证据。

**目标运行态（下一阶段，未在本提交实施）：** 单 ZIP→CreateDraft/Get/Begin→批准 ObjectStore origin 无凭据原字节 PUT→Complete→Validate→零 body Publish；严格 ACTIVE Publish 回执或本人 by-ID 权威读回后才宣布成功，个人列表按 `scope_kind=personal` 读取且保留 `source_ref/revision`。GET Draft 不等于发布读取；丢 Publish key/ACK 时显示未知并按 by-ID 重核，不从旧 catalog/validated 猜成功。MCP 只渲染 `server_id/provider_key/server_identity/transport/declaration_digest/status`；旧假字段与正式无效控件随 UI 切片删除。继续复用 shadcn 与语义 token，不新增 Web SQL/receipt/第二 public contract。Root 后续隔离 Chromium 真链单独验批准 origin CORS、CLEAN/INFECTED、撤权/刷新/替换/同键重试；本阶段只运行静态机器/文档门。

## S9-WEB-CODE 候选（2026-09-28；待 Root 集成与真实链验收）

Web 工作树已将 BFF owner OpenAPI 原字节固定到 SHA-256
`a224b186813615467b6c045d3be83082d3e164e140d6da9722bf3f8d7e33b219`，Chat live/replay/snapshot
按 `(conversation_id,artifact_id)` 归一；仅 HTTP 410 且稳定码 `event_cursor_expired` 重取 snapshot，
终态对账保护同步期间新 live，`deliveries_has_more` 导航 Library 作品页。Chat 卡/Canvas 正式路径只取
二元详情并发起原生同源下载，删除旧 hash/path/Blob Delivery 路径；显式 preview 仍为隔离 fixture。
Root 独立 Node22 `pnpm check` 已通过：契约 105、架构 36、单测/集成 1599、lint/typecheck/build；
独立审查发现的 410 旧 run/空快照/迟到控制回调问题已用 RED→GREEN 直接测试修复。本仓 Playwright 不是 IAM→Agent→Storage 真链，
也不证明 live/刷新/私有 404/下载管理器原字节。下节 S9-WEB-DOC 是代码前历史快照。

## S9-WEB-DOC（2026-09-28；Web Chat 代码未迁移）

Web main `102033e34be89ba0e9958447e4d4021fcbf257b7`、BFF owner main
`bd1f794e7b1115d96965aa03d8a3a83a33c42fd7`；Web generated BFF public OpenAPI
SHA-256 `8a0849dcf3ae557d5f3166ad624c5eea9f42bc0b65c7a6ae7fda1741224d567b`，
BFF 新 owner OpenAPI SHA-256 `a224b186813615467b6c045d3be83082d3e164e140d6da9722bf3f8d7e33b219`。
Library 已二元读取与原生下载，Root 既有真浏览器纵切已验；但 Web Chat strict live schema、snapshot
Delivery、reducer/终态同步、卡片/Canvas、旧 `deliveryPath` 及 Blob/内嵌预览未切。BFF 新 snapshot
已经在同事务提供最近 100 件、`deliveries_has_more` 与水位，旧 W2 文档所述 BFF `deliveries: []`
仅是当时基线，不再是 BFF 当前事实。Web 当前 `AgUiChatTransport` 遇 replay HTTP 410 会报错到
machine FAIL，未重取快照；终态同步还可能以较旧 snapshot 整表覆盖新 live 作品。`EDGE-WEB-BFF`
仍 broken；Chat/Canvas 不能从 Library 成功推断已闭环。

本切片只更新 TECHNICAL_DESIGN、API_CONTRACT、DATA_MODEL、CURRENT 四文档，锁定二元归一、
410 重水合、100+入口、Canvas metadata/本人详情/原生下载、正式 hash/Blob 删除与隔离 preview
的目标；无运行代码、生成物、测试或服务变更。Root 审查通过后另授权 Web 代码切片：固定新 BFF
OpenAPI、TDD、Node22 全门与隔离 E2E，再由 Root 固定来源真 IAM/Chromium/Agent/Storage Chat
链分别核 live 帧、刷新快照、两件同 hash、Canvas 原字节/他人 404/窄屏；旧 cursor GC/410
另由隔离 BFF/transport 恢复测试证明，不把此前只验 snapshot 的浏览器 runner 冒称 live/410 证据。Web 文档门
不代表上述代码或端到端验收已完成；3310 不由本片触碰。

## W2-WEB-AGENT-ARTIFACT-F2-CODE（2026-09-28；S9 前历史基线）

正式 Library 作品页代码现从固定 BFF public `GET /v1/library?kind=artifact` 读取页级
`oneOf`，用 `(conversation_id,artifact_id)` 跨页去重、详情预检、内容定位、收藏和来源导航；
空页允许非空 cursor。Web 原字节固定 BFF `55d3c9cd55386d9dcc074e893cc388924dd94c13`
OpenAPI SHA-256 `8a0849dcf3ae557d5f3166ad624c5eea9f42bc0b65c7a6ae7fda1741224d567b`，
15 个派生 generated 文件 drift check 通过。作品页正式旧 `/api/session/artifacts` 列表与 hash 下载
链已移除；Chat `deliveryPath`、Canvas 和 live/snapshot/replay 仍是独立旧链，未切二元 ID。

精确 `/api/hub/library/artifacts/{conversation_id}/{artifact_id}/content` GET 以专用 1 GiB
上限、总/空闲 deadline、Node pause/resume 背压、长度及 `response.complete` 校验、取消传播和
下载安全头流式转发；最终 Proxy 仅精确无 query 路径维持 `no-referrer`。浏览器原生同源
attachment 在详情预检后发起，页面仅显示“已发起”，不把预检当下载授权或把浏览器保存宣称成功。
个人文件 1 MiB 缓冲和通用 Hub 16 MiB 默认不变。本仓直接 contract/UI/transport/Route 与真实
Next HTTP 聚焦测试先 RED 后 GREEN；Node22 `pnpm check` exit0（contract 103、architecture 36、
全量 Vitest 1585、lint/typecheck/build），独立 3452 Playwright 11 pass/1 既有 skip，
`git diff --check` 通过。上述 E2E 是 Web 本仓治理回归，不是 Artifact 真下载验收。
Root 还须在固定 Web/BFF/IAM/Agent/Storage 真组合用 Chromium 核对下载管理器原字节、刷新、
同租户他人/错二元组私有负例；本仓工作树测试不等于完整 W2 或 Chat 已恢复。3310 未触碰。
此外 BFF 当前作品下载对取回校验与出站传输共用 120 秒总 deadline；Web 的较长流时限
不能覆盖此 owner 限制，慢链路 1 GiB 仍待 BFF 独立修复与真实验收。

## W2-WEB-AGENT-ARTIFACT-F2 文档门历史基线（2026-09-28；代码前）

Web main `eaa7ebd56502cf05b6b402a8a013973c1904b8aa` 起始 clean：同一 Library 的个人文件
下载已由 Root 真 Chromium 验收；**作品页仍使用** `/api/session/artifacts` 的
`content_hash/session_id` 列表、hash 内容下载与 hash 键控视图。Web generated public OpenAPI 原字节
仍是 BFF `d5c868f`/SHA-256 `3f8aba161444d8b617df7ff1789e698269a4a6dd2c8b2ae7b3aaadb331947681`。
BFF main `55d3c9cd55386d9dcc074e893cc388924dd94c13` 已发布本人私有 FINAL CLEAN Artifact
的 `GET /v1/library?kind=artifact`、二元详情与 1 GiB 原字节下载，public OpenAPI SHA-256
`8a0849dcf3ae557d5f3166ad624c5eea9f42bc0b65c7a6ae7fda1741224d567b`；Root
Agent→Storage→BFF 组合有真 owner 证据，但使用 IAM 准入桩且 Web/正式浏览器未参与。

本次仅收敛四份三设计/CURRENT 文档：目标是作品页精确回钉 BFF public 契约后从同源 `/api/hub`
读取页级 `oneOf`（允许空页带 cursor）、按 `(conversation_id,artifact_id)` 定位详情/下载、以专用
1 GiB 有界同源流、真实背压、独立总/空闲计时、完整结束及长度核对、安全头和断连取消代替旧 hash 与个人 1 MiB 缓冲；浏览器原生 attachment 不走 1 GiB Blob，UI 只可显示已发起而非已保存；个人文件 1 MiB 和通用
Hub 16 MiB/15 秒边界不变。正式错误/401/403/404/429/502/503 均应可见，不把错误当空页或成功；
Web 不新增持久 Artifact/Blob/授权事实，不自报 tenant/subject。代码、生成物、测试、当前用户 3310
和别仓均未在此门修改，不能把设计写成用户已可用。下一门须先由 Root 审查并另授权代码文件集，
再由 Web 单仓 Node22 `pnpm check`/隔离 `pnpm test:e2e`、Root 固定来源真
IAM→Web→BFF→Agent→Storage/MinIO/ClamAV Chromium 点击后从下载管理器核对原字节及私有负例验收。

Chat 与 Library 是独立断链：BFF live Agent `delivery.created` **已含** `artifact_id/asset_id/artifact_kind`，
Web strict `chat-projection-event` 当前只收旧 hash/path/title/mime/size/note，会拒 live 新 payload；
`SessionDelivery`/Canvas/卡片仍按 hash，而 BFF chat snapshot 当前 `deliveries: []`。本次 Library
Product 接入可独立先做；不能误称 BFF live 缺 ID，也不能由 Web 猜 ID 或由作品页成功推断 Chat
snapshot/replay 已恢复。作品页新列表/详情/下载真验收后才删该页正式旧 `/api/session/artifacts` 与 hash 下载；
Chat/Canvas 的身份及旧路径删除须另有恢复与 owner 契约证据。完整 W2/EDGE 仍 broken。

W2-WEB-PERSONAL-DOWNLOAD 真链已验收（2026-09-28；仅个人文件下载纵切）：
Route Handler 单测虽返回 `Referrer-Policy: no-referrer`，真实 Next 的全局 Proxy 曾将个人文件下载响应覆盖为
`strict-origin-when-cross-origin`。现仅精确、无 query 的个人文件 GET 在 Proxy 最终响应设
`no-referrer`，精确支持浏览器编码的 `asset%3A<64hex>`，不接受任意百分号转义或二次解码；
通用 Hub、登录及全局默认不变。独立真实 Next HTTP 测试先 RED 后 GREEN，包含编码真资产路径与
普通/query/self/编码斜杠/双编码路径负例。Root 固定 `44ee670f9133dd1cf2c374bd62d56f4057c8343a`、Web `d7848de1ee053f1ec626e8858144893cf8633412`、BFF `d5c868f`、Storage `2d87e26`、IAM `4d98144` 的真实 IAM/Chromium/PG/Redis/MinIO/ClamAV 运行 `fee7b756c799f6e62691e8a3` PASS：本人文件卡两次保存原字节与文件名、安全头、刷新、320px 不溢出、同租户他人 GET 404；测试自有数据库/缓存键/进程/对象版本余量均为 0，专用空 bucket 已删除，3310 原预览未重启。其他 Product/Agent Artifact F2 及完整 W2 边仍未闭环。

W2-WEB-PERSONAL-DOWNLOAD-CODE 历史代码门（2026-09-28）：已原字节固定 BFF
`d5c868f8ab8b8a33750e1286e9d020ca72895641` public OpenAPI SHA-256
`3f8aba161444d8b617df7ff1789e698269a4a6dd2c8b2ae7b3aaadb331947681`；生成 drift 15 文件通过。
个人文件卡有 shadcn 下载、取消、就近错误/重试；精确同源 Hub GET 校验完整 ≤1 MiB 原字节与下载安全头，
保留通用 Hub 取消传播，未混用 Artifact。Node22 `pnpm check` exit0（contract 100、architecture 36、
Vitest 1583、lint/typecheck/build）；独立 3449 Playwright 11 pass/1 既有 skip。Root 固定来源真 Chromium
点击按钮核对原字节、刷新与同租户他人私有负例的验收见上节；3310 未触碰。

W2-WEB-PERSONAL-DOWNLOAD 文档门历史基线（2026-09-28，Web main
`224d473758041928a79acfa063eadb13cd779386`）：BFF main
`d5c868f8ab8b8a33750e1286e9d020ca72895641` 的 public OpenAPI 原字节 SHA-256
`3f8aba161444d8b617df7ff1789e698269a4a6dd2c8b2ae7b3aaadb331947681` 已发布个人文件
`GET /v1/library/files/{asset_id}/content`；Web 当前 generated 仍是旧 digest
`6fa107540c6cc60ec8b45f1bcc19c8930f19c803b16f4c6d418c2edc9393fc52`，个人文件卡无下载按钮，
Hub adapter 未窄透传下载安全头。此门仅收敛 `TECHNICAL_DESIGN`、`API_CONTRACT`、`DATA_MODEL`
与本 `CURRENT` 的当前/目标事实；未修改生成物、UI、adapter、测试、3310 或共享服务。
下一片需精确重钉 BFF OpenAPI、复用 shadcn 文件卡与同源二进制 GET，验证坏 header/404/取消及
真 Chromium 点击原字节和他人私有负例。个人上传与 Agent Artifact F2 不因这份文档升为下载闭环。

W1F-WEB-ISSUER-LOGOUT-POST-REDIRECT（2026-09-28，待 Root 真浏览器验收）：当前真实 IAM 的退出确认 POST 成功返回
`200 application/json` 与精确 `{redirect:true,url:WEB_ORIGIN/auth/sign-in}`；此前 Web relay 原样显示 JSON。
本仓已将**仅此固定确认 POST** 的成功 JSON 或固定 302 回执严格转换为无 body 的 303 `/login` 导航
（裸 `/auth/sign-in` 没有 OAuth 签名参数会 404），保留 issuer 清理 Cookie 与安全头；异域、query/hash、
编码路径、额外字段、畸形 JSON、错误状态均不触发转换。
聚焦单元和真实 Next HTTP fixture 已从旧 302-only 切到 200 JSON 测试；3310 当前运行副本尚未由 Root 同步和复验。

W2-WEB-LIBRARY-PERSONAL-UPLOAD-CODE 已发布验收（2026-09-28，Web main `cbae94d30582e6e16f0f8a8f6b8535920af6de32` 起）：已将 BFF
`8a90fdd9ec3809000924229bfc7b986ba8ba1522` public OpenAPI 原字节 SHA-256
`6fa107540c6cc60ec8b45f1bcc19c8930f19c803b16f4c6d418c2edc9393fc52` 固定为唯一 Web generated
快照；Team 派生 client 15 文件 drift check 通过且字节不变。个人文件页签新增 shadcn 单文件 Input/Button/Alert，
Library 页面级 File/key 意图跨页签卸载保留。`File.size > 1 MiB` 先快速拒绝，其余以原生 FormData→Request.clone() 实测整段 multipart
≤1 MiB，再发送同一个 Request；网络/408/429/5xx/待扫/处理中错误仅显式同键重试，扫描待定/处理中提示稍后同文件重试，冲突/中止/感染终态不提供同键重试。
严格 CLEAN 200 不直接插卡，只触发本人 GET 重新加载；GET 失败显示读错误。Node22 `pnpm check`
Root 隔离 Node22 复验通过：contract 99、architecture 36、Vitest 1546、lint/typecheck/build；隔离 3447 `pnpm test:e2e`
11 pass/1 既有 skip，direct native multipart/特殊文件名及 UI 聚焦测试通过。Root 固定
`0a9206969b2edfcf40bb8d5f0f2d85952995fb8f` 的真 IAM/Chromium **UI 点击**上传、刷新、另一成员隐私、
EICAR/同键回放与并发门已 PASS；3310 未触碰。个人下载与
Agent Artifact F2 不在此片，完整 Library/W2 不升绿。

W2-WEB-LIBRARY-PERSONAL-UPLOAD 设计门历史基线（2026-09-28）：代码前 Web main
`8debb35b6c9ad3c818282bb2fe3d828ca550d136` 已有默认个人文件的 shadcn Library Tabs、严格只读 GET
与精确个人 POST 的同源 1 MiB/50 秒代理，但正式个人文件页**没有可见上传控件**；generated public
OpenAPI 仍固定旧 BFF `a67ae2d`。BFF owner
`8a90fdd9ec3809000924229bfc7b986ba8ba1522` 的唯一新 `POST /v1/library/files` OpenAPI 原字节
SHA-256 为 `6fa107540c6cc60ec8b45f1bcc19c8930f19c803b16f4c6d418c2edc9393fc52`，Web 尚未回钉。
Root 隔离真链已验同源直接 POST→CLEAN→个人 GET/刷新及同租户他人空页，**不是 UI 点击上传证据**。
该文档门只收敛四份 Web 文档，未改 generated/runtime/UI/测试；后片须在现有文件页签实现单文件选择、整个
multipart 1 MiB、每文件意图稳定 key、严格 CLEAN 回执后 GET 刷新，未知响应明确同键重试，感染及冲突/中止
终态不误重试（`409 idempotency_in_progress` 除外），并以真实 Chromium 点击、刷新与隐私负例验收。
下载、Agent Artifact F2 和感染/未知结果恢复/并发真实组合仍未完成；完整 Library/W2 不升绿。

W2-WEB-LIBRARY-FILES 已发布只读基线（2026-09-28）：同一 `/app/library`
已用 shadcn Tabs 默认显示个人文件，Agent 作品保留原 `/api/session/artifacts` 模型和操作；文件仅从
`/api/hub/library?kind=file` 经 Product Session/BFF 读入，独立 Zod/`asset_id`/opaque cursor，
真实空页、失败手动重试、切换取消与跨页去重；该只读基线当时不呈现个人上传/下载动作。Web 当时原字节固定
BFF `a67ae2d` public OpenAPI SHA-256 `82df2303f9f86e9b4caa4b5965f930735740d8c044c955450e45406dc29cabb9`，
Team 生成 drift 检查通过。Node22 隔离副本 `pnpm check` exit0（contract 84、architecture 36、
Vitest 1521、lint/typecheck/build），独立端口 3444 `pnpm test:e2e` 11 pass/1 既有 skip。
Root 随后已在固定来源真浏览器验个人文件刷新/隐私；个人可见上传、下载及 Agent Artifact F2
仍是另片未决，不能以文件列表宣称完整 Library 闭环。上段单仓数字是当时基线证据，不代表本次文档门新跑。

W2 个人文件 Product POST 的同源代理边界（2026-09-28）：BFF 已另片发布
`POST /v1/library/files`，Web 尚无可见个人上传控件；现有 `/api/hub/library/files`
仅将该精确 POST 与 Project resource POST 一样限定整段请求 1 MiB、上游 50 秒，
避免默认 15 秒在真实扫描完成前断开。Root 在隔离副本 Node22 `pnpm check`
通过（contract 84、architecture 36、Vitest 1521、lint/typecheck/build）；其余 Hub 路径
仍使用默认边界。这不是上传 UI 点击的完成证据；同源直接 POST 的后续真链正向结果以上段当前记录为准。

W2-WEB-LIBRARY-LIVE-TRUTH（2026-09-28，Root 已复验）：资料库不再以 development 环境自动选择 preview transport。未注入 client 的正式页面在开发与生产均请求同源 `/api/session/artifacts`；失败显示错误，只有用户点击才重试，不把服务不可用显示为空列表。显式 `preview` 和受控 `fixtureArtifacts` 仍保持样本语义。Root 在当前工作树独立运行 Node22 `pnpm check`：contract 83、architecture 36、Vitest 1513、lint/typecheck/build PASS；隔离 3441 端口 `pnpm test:e2e` 11 pass/1 既有 skip。本片不预接尚未发布的个人 Library API，也不改变 BFF 契约、样式或其他页面。

W2-Web-Project-Create（2026-09-28，owner 门通过；Root 真组合待验）：基线正式创建错误生成 `preview-project-*`，导致后续 BFF GET/POST 找不到项目。现正式 rail/欢迎页新建统一经已有同源 `/api/hub/projects` POST 调 BFF 固定 owner 契约，严格解析 canonical ProjectResponse 后按 id 导航；显式 preview 保持 fixture，失败可见且未知结果从错误条、rail 或欢迎页重进均同 key/name/draft 重试。无会话项目与 Direct 草稿分键，A 创建期间编辑的 B 在返回 Direct 后可恢复；owner 成功但导航失败只重试导航，不再 POST。Node 22.22.2 先 RED 后 GREEN；`pnpm check` exit 0（contract 83/83、architecture 36/36、全量 Vitest 1511/1511、lint/typecheck/build）；独立端口 3429 Playwright 11 pass/1 预期 skip；BFF 生成 check 15 文件通过、OpenAPI SHA-256 固定 `87b1ff3a39f5fa0a67cabdf6b78df59697874bd817aa218ca676ec1472ec15e6`、`git diff --check` 通过。真实登录 Product Session + BFF 持久创建/幂等联调仍由 Root 在固定提交后验证，不以本仓 stub 测试代替。

W2-Web-Project-Resources-GET（2026-09-28，工作树待 Root 审查）：当前 BFF owner `31c4803b3df0e90c031a97844f89df384ca1a35c`
发布 GET `/v1/projects/{projectId}/resources`；Web 原样固定 public OpenAPI SHA-256
`87b1ff3a39f5fa0a67cabdf6b78df59697874bd817aa218ca676ec1472ec15e6`。正式项目资源列表只从
BFF 经同源 `/api/hub` GET 读取 CLEAN/ASSET 页面，每页固定 50、opaque cursor 加载更多；初载、刷新、
跨项目切换取消迟到请求，区分 loading/empty/error/retry。POST 成功不再把回执直接当可见持久列表，
先刷新 owner GET；GET 失败显示错误，不伪装空态。`previewResources` 仅显式 preview 模式可见。
无 Web SQL/Redis/缓存/跨 owner 读。Node 22.22.2 聚焦测试先 RED 后 GREEN；`pnpm contract` 78/78、`pnpm test:architecture` 36/36、`pnpm lint`、`pnpm typecheck`、全量 `pnpm test` 1500/1500、`pnpm build` 和 diff-check 均通过。Root 固定 SHA 的真组合/Chromium 仍待验；旧 P1 记录是当时切片历史。

W1F-LOGIN-TLS-REWRITE（2026-09-28，待 Root 集成验证）：隔离 TLS 终止代理下，公开
`https://HOST:PORT/auth/sign-in` 的表单 rewrite 曾被 `src/proxy.ts` 强制降为 `http:`，
Next 将其作为外部 HTTP 代理请求而在真实登录首跳返回 500；仅删除强制降级也不足够，
因为 Next 可能把 `request.url` 规范化为内部明文 listener 的端口。现在 rewrite 目标固定到已验证的
`KOKORO_WEB_ORIGIN`，保留公开 HTTPS scheme、Host 与端口；Next 在内部 origin 不同时经同一真实 TLS
入口转回表单路由，不向内部明文端口发 TLS 请求。
不改签名 query、一次性 CSRF、真实 IAM 提交或可见 UI。Node22 定点回归先 RED 后 GREEN：
HTTPS/非默认端口及内部 listener 端口归一化 rewrite、伪造内部 headers 直达 404 为 3/3；
真实 Next HTTP fixture 中表单渲染和直达 404 为 2/2；本仓真实本地 TLS proxy 的 IAM/RP
交互回归 5/5。`pnpm check` 通过（contract 69、architecture 36、Vitest 1481、lint/typecheck/build）；
独立端口 Playwright 11 pass/1 预期 skip。真实 TLS Chromium + IAM/BFF/Product Session 联调仍由 Root 在固定提交后复验，
此处不宣称完整登录链已经通过。


P1-Web-Project-Resource-Upload（2026-09-28，工作树待 Root 审查）：BFF public OpenAPI 原样固定
`kokoro-bff` main `199a1833d5a6c17839ff39b81380cf5a8377cf85`、SHA-256
`8d250e61080f40a0c980b9d5c055bda605b66adcfb11450f1575375cca435f82`；旧 `da03b76` 来源为历史记录。
项目资源浏览器多选现逐文件发送 BFF 唯一 `files` part，每文件生成一次幂等键；失败保留原 `File`+key
供显式重试，只有严格校验 BFF CLEAN/单一资源 200 回执才进入已确认资源列表。BFF 同源代理仅精确
`POST /projects/{id}/resources` 使用 1 MiB 整体请求边界和 50s deadline，其他 hub 请求维持默认 15s。
BFF GET 资源列表与本仓预览样本未在此片变更；页面刷新后的持久资源列表尚未闭环，不声明已完成。
Node 22.22.2 原切片已执行：contract 74/74、architecture 36/36、全量 Vitest 1490/1490、lint、typecheck、Next production build、`git diff --check` 均通过；首次全量命中既有 OIDC pending-refresh 间歇失败（1/1488），其单文件 38/38 与随后全量 1490/1490 通过。后续审查补上精确 409 分类（仅 `idempotency_in_progress` 保留原键重试，conflict/aborted 不提供同键重试）及 projectRef 纳入工作区 remount key，阻止 A 项目失败 File/key 留到 B；新测试先 RED 后 GREEN，Node22 聚焦 80/80、lint/typecheck/diff-check 通过，补丁后的全量/build 待 Root 串行复验。Root 集成与真实多仓 Chromium 上传仍待验；本切片不改 3310 用户预览进程。

W1F-LOGIN-SHADCN（2026-09-26，Web main `1fa25d2b4760dc428d3fcdf77628ba343a5bc3ff` 已发布）：`/login` 仍固定 Product OIDC 302→IAM 签名交互；正式 `/auth/sign-in` GET 已从手写 HTML 改为 Web Proxy 签发一次性 CSRF、内部 HMAC 证明 rewrite 到真实 Next/shadcn Card/Input/Button/Label/Alert 页面，内部页直达 404。POST 保留原始签名 query/issuer Cookie/Origin/BFF→IAM，HTML 401/429/503 通过短时加密反馈 303 回同一表单并签发新 CSRF；非 HTML 错误语义不变。Root Node22 `pnpm check` exit0（contract 69、architecture 36、Vitest 1478、lint/typecheck/build）；3310 隔离运行拷贝已按明确文件热同步，无重启，Root 全新 Chromium 实测 `/login` 302→302→200、真实 shadcn 输入 2、登录按钮 1、旧重试/连接状态 0，错误态仍同页且密码清空。当前只证明本地登录可见面与错误态；正式生产部署及完整跨仓登录/Platform 闭环不由此代替。

W1E-IAM-0.6-RELAY-CONSUMER（2026-09-26，Root 复验后发布）：当前 Web 从 BFF `1105553cfc24d4f44a90f626132bc30323a77946`
原样复制 policy `2.1.0`，SHA-256 `8f7d4f4cb6fa0ec34d2cce8702d8882d3270a316a6cbdb2d8bdaccefb9c6b4a1`；
其中 IAM owner 为 `a4c2b61467f1fc1772d6b6d8e98f081c090289fb`，OpenAPI `0.6.0` SHA-256 为
`392ca0e49544c0ec6e0d2fa782c46c33c1847e2c350102e7ad3b8af43f858ced`。只更新只读快照、运行 provenance
与契约断言；17 个 browser relay route、登录表单、OIDC/CSRF、请求/响应、SQL/Redis 均不变。下方 W1D 来源是历史验收，不是当前 pin。
来源测试先 RED、复制 BFF 原始字节后 GREEN；与上一版 JSON 比较仅三个 IAM 来源字段变化。Node22 `pnpm check`
由 Root 独立复跑通过（contract 69、architecture 36、Vitest 1478、lint/typecheck/build）；第一次全量运行中一个既有 OIDC refresh 真 HTTP 用例间歇性返回 200，单文件 38/38 与第二次全量 1478/1478 均通过，需后续单独稳定化。跨仓运行与 Root gitlink/库存仍待 Root 固定版本验收。

W1D-LOGIN-UI-POLISH（2026-09-26，已发布）：签名 `/auth/sign-in` 仍由原 Route Handler
签发一次性 CSRF 并向 BFF→IAM 提交凭据，`/login` 仍直接启动固定 Product OIDC；没有中转、连接中或整页重试页。
唯一可见邮箱/密码表单及 401/429/503 的表单内提示已统一为中文，沿用本仓 shadcn 语义色、
Card/Input/Button 尺度的无脚本 HTML shell，明确 `zh-CN`、焦点与移动端布局。聚焦测试先红后绿；
隔离真实 Next/Chromium 的桌面、窄屏、移动及 401 错误态通过，移动两状态 axe WCAG 2 A/AA 零违规。
本片不更改 API、Cookie、Redis/OIDC/POST 语义，也不触碰用户 3310 进程；Root 尚需审查并固定 Web SHA。

W1D-RELAY-PIN-WEB（2026-09-26，历史验收）：Web 当时的
`src/generated/iam-relay-policy.json` 已从 BFF main
`bc45632b8654db7e06eb9878bb4d7a609d12dc7b` 的 `contract/iam-relay-policy.json`
原始字节复制，SHA-256 `b18a559d162509c3029908b2e1c77ee7e59ed6af61b82e18be6b2e7669a0ef0c`；
policy `2.1.0` 固定 IAM main `6a55ffb4c22f0b155ddb83157735c0ace766701d`，OpenAPI `0.4.0`
摘要仍为 `a18d57172df841cb2f55aa845a3eeb519ddb5abc8bea1c2be74fbb7e0fb62416`。
运行 provenance、固定来源断言同步重钉；不改变 UI、route、请求/响应、SQL、Redis 或用户 3310 进程。
聚焦 contract RED→GREEN 已通过；Node22 `pnpm check` 通过（contract 69、architecture 36、
Vitest 1474、lint/typecheck/build）。Root 固定 SHA 组合验收结果待补；本片不触碰用户 3310。

W1D-WEB-IAM-DIRECT-CUT（2026-09-26，Web main `71d408e1a36fbe8c3ff7dc350311e5b4eeb8be23` 已发布）：本仓
`docs/{TECHNICAL_DESIGN,API_CONTRACT,DATA_MODEL}.md` 已定义删除旧 IAM 直连、两条旧 auth route 与 sealed
session 的单一路径，同时保留正式 Auth.js Product Session、六个同源业务 adapter 及其 CSRF/失败语义。
该提交已删除旧 `auth.ts`、sealed envelope 与两条旧 route，正式认证保留。Node22 `pnpm check`
通过（contract 69、architecture 36、Vitest 1474、lint/typecheck/build）；独立 Next
生产进程实测公开 `/` 200、安全头/HTML，旧两 URL 的 GET/POST 404；独立 dev 端口 E2E 11 pass/1 预期
skip，first-site 的 liveness/preview 模式与隔离 live fixture 均通过。Root 已固定该 Web gitlink；真三仓回归仍待执行。Root 已将
本地隔离联调入口改为 `http://127.0.0.1:3310/login`，普通 Codex IAB 可见真实 IAM 登录表单并到达
`/app`；该入口由 Root 启动器组合 IAM/BFF/Web，不是本仓单独 `pnpm dev` 的默认状态。

W1-LOGIN-UI（2026-09-25）：`/login` 仍仅在服务端启动 Product OIDC，浏览器直接进入唯一签名
`/auth/sign-in`；后者保留完整 Route Handler、一次性 Cookie-bound CSRF、原始签名 query、
同源 Origin 与 BFF→IAM 真实提交，GET 和凭据失败均显示紧凑正式表单。视觉按本仓 shadcn
token/尺寸/焦点收敛，但没有在 Route Handler 中导入 React 组件或新增第二条登录链。Root 用
Node 22.22.2 复验真实 Next HTTP/Chromium 7/7（含桌面、窄屏、移动和错误态）、contract 69、
architecture 34、Vitest 1483、lint、typecheck、production build，均通过。该次切片验收时 3310 无监听，
本仓也没有 `.env.local`；这些隔离测试本身不是用户 3310 已可登录的证据。后续 Root HTTP loopback
组合与浏览器验收见上方新记录；不能用可见错误页或假表单代替。

R5-INVITE-BROWSER-ORIGIN 修复（2026-09-25）：真实 Chromium 表单 POST 暴露邀请页
`Referrer-Policy: no-referrer` 会使浏览器发送 `Origin: null`，与严格同源写入门禁冲突。
邀请静态入口与 Web proxy 的该精确路径改为 `same-origin`：跨站不传邀请 URL，
同源 POST 保留 canonical Origin；`/iam/verify-email` 继续使用 `no-referrer`。
该项仅记录代码事实，真实三仓 Chromium 结果以 Root 最新验收记录为准。

R5-INVITE-WEB-ENTRY 历史来源重钉（2026-09-25）：当时 Web `src/generated/iam-relay-policy.json` 与 BFF
main `2f1fc3382df31ba107d7eb2b2b6a611fa893bc13` 的 policy `2.1.0` 原始字节相同，SHA-256
`f7a3a44d9839a0e54faffc8cf6b7ceb601d0d6b647637faf10e9070c927d93e7`；其中 IAM owner commit 为
`7215223b2ed27a0d5217f3bbaaabce547006d3bb`，OpenAPI 0.4.0 SHA-256
`a18d57172df841cb2f55aa845a3eeb519ddb5abc8bea1c2be74fbb7e0fb62416` 不变。本次只更新只读快照、
provenance 与固定来源断言，邀请 UI/行为不变；这一段与下方旧 commit/digest 均是历史证据，不是当前消费 pin。
真实三仓 SMTP/HTTPS 浏览器组合及用户 3310 仍由 Root 独立验收。

R5-INVITE-WEB-ENTRY C 实现切片（2026-09-25，跨仓验收仍待 Root）：基线 Web main
`63a0c8523bc06a513ff897b9ed8326ac543a3895`。同一静态邀请页的 recipient-only pending 预览增加真实接受/拒绝
表单；Web Redis 一次性证明绑定固定 tenant、canonical 邀请 ID、当前 issuer Cookie 和动作。POST 精确同源 Origin、
方法、表单字段与 Cookie 后经 BFF 原生转发 IAM，不发送 Product Bearer、业务 body 或幂等键；仅匹配 owner 200
成功 shape 才确认：接受 303 `/login` 启动 Product OIDC，拒绝显示完成状态。404/超时/未知结果不推断成功、不自动
重放。注册失败改为注册区就近错误并自动展开，保留姓名/邮箱、不保留密码；致命依赖失败不再提示“从原链接重来”。
Node 22.22.2 本切片经 Root 复跑 contract 69/69、architecture 34/34、lint、Next typegen、typecheck、全量
Vitest 1483/1483 和隔离 production build，全部 exit0；真 SMTP/HTTP 浏览器组合仍待 Root 跨仓验收，本切片不触用户 3310。

R5-INVITE-WEB-ENTRY B 已提交 main `63a0c8523bc06a513ff897b9ed8326ac543a3895`（2026-09-25）：Web 已在上一 A commit
`45388f620d2d255eee02073ffe5ef62102b6a430` 固定 BFF policy 2.1.0、IAM 0.4.0 和 verify-email 精确邀请 Location。
该切片增加唯一静态 `/iam/interactions/invitation`：无 issuer Session 可用独立真实邮箱/密码登录或新邮箱注册；注册 callbackURL
由服务端固定同源邀请 ID 构造，成功只提示验证邮箱；有效 issuer Session 则向 BFF 读取 recipient-only pending context，并仅投影
组织/角色/到期。Web Redis 一次性 CSRF 对 sign-in/sign-up 分别绑定静态路径、ID、动作；页面使用仅邀请生效的紧凑视觉 variant，
不改变旧 OAuth sign-in/consent 布局。B 提交时 **accept/reject POST 尚未实现**，预览页不显示虚假操作按钮；这部分由上方 C 切片补齐，用户 3310 仍未验证。Node 22.22.2 B 切片复跑 contract 69/69、architecture
34/34、全量 Vitest 1474/1474、lint、Next typegen 和 `tsc --noEmit` 均通过；Chromium 独立页面布局/默认收起注册
3/3，通过桌面和移动端截图核对。隔离 production build 的临时目录使用仓外 node_modules symlink，Turbopack 因
filesystem root 限制拒绝该测试布置；随后 Root 在不改变用户 `.next` 的前提下于本仓隔离重跑 production build exit0。真 SMTP/HTTPS 浏览器验收仍待执行。


R5-INVITE-WEB-ENTRY 设计门（2026-09-25，仅文档，**未实现/未验收**）：Web main
`63aca94f93095722425340a0a95985e8796a5b33` 仍固定 BFF policy `2.0.0`，没有
`/iam/interactions/invitation` 静态入口；既有 `/auth/sign-in` 仅服务签名 OAuth，`/login` 仅服务 Product RP，
未入组邮件收件人没有真实首登路径。BFF main `d6dc8a0ea5a3fee7a4f54f01fefdeff0e28892e7` 已发布 2.1.0
policy SHA-256 `b3ff912e70858cc5a5cf7bdbc597c8872ab29c5bfec4dfbe070ce4b37500239d`，上游 IAM
`ac94f152daffa2293801ea4f56f98b3ae59452d7`/OpenAPI 0.4.0。Web 三设计面已记录下一切片：只读固定
policy 来源；唯一静态邀请页完成独立 issuer 登录/新邮箱注册+验证、recipient-only context、一次性 CSRF 接受/拒绝，
accept 200 后才启动 Product `/login`；无可见“连接中／整页重试”、假 `/auth/invitation`、Web SQL 或 Product 未入组 fallback。
未决且须代码证明：Web policy 2.1.0 pin、静态 Route Handler/表单/CSRF、安全响应和 owner 错误映射、Node22 全门、
Root 固定 SHA 的真实 PostgreSQL/Redis/SMTP/HTTPS Chromium 两类邮箱与错人/过期/并发验收；用户 3310 未由此门
启动或验证。早期 policy 2.0.0 与邀请空缺的后文属于历史/当前运行基线，不是已经完成 2.1.0 消费的证据。

R5-Web-Team-Product 切片（2026-09-25，Root 最终集成待验收）：已将旧 Team context、
namespace/inbox 与 IAM `/bff/*` 直达实现替换为 BFF public Team contract 生成客户端和
同源 `/api/team/*` adapter；设置中心只展示固定租户的成员、角色、管理邀请与显式确认写操作。
Node 22.22.2 的 `pnpm check` 已通过：contract 69/69、architecture 34/34、全量
Vitest 1459/1459、lint、typecheck 和 Next production build。独立只读审查发现的
写后刷新误报、跨页 actor/角色和邀请分页已修复并补测；真浏览器组合验收仍待 Root 执行；
不能把本地单仓门禁等同正式登录闭环。

R5-Web-Team-Product 前置切片（2026-09-24，工作树待 Root 审查）：固定 OIDC RP scope 在既有
三个 Team read scope 后追加 IAM `ad5224a` 的 `iam:member.write`、`iam:invitation.write`；
Auth.js authorization Location 仍按完整有序 scope 精确比较，缺项/额外项/重复项 fail closed。
聚焦测试先 RED（2 个预期失败），再 GREEN（13/13），Node 22.22.2。
该前置切片当时尚未替换旧 `/api/team/*` sealed-session→IAM `/bff/*`、namespace/inbox UI；
scope 申请本身不代表正式 Team Product 写、邀请链接或浏览器验收完成。BFF public Team contract 固定
`da03b76`、OpenAPI SHA-256 `5ac3c225193f70b99555e87f765c13128e43343929611f446fe744b77eef7954`。

R5-Web-policy-pin（2026-09-24，本仓来源重钉待 Root 验收）：Web browser-private IAM relay
只读快照原样复制 BFF `dd605c99e9bb5c6669ec31e04e285e5f92b79ed0` 的
`contract/iam-relay-policy.json`；policy 仍为 `2.0.0`，SHA-256
`74893ba4e566e4824a278cd3ee1548030a33435f9b37b7026a8a7e943c080037`，
IAM owner commit 仅更新为 `ad5224a9e0a3a31d1c593d214d37940d6923b2e7`。
IAM allowlist/vendor digest、relay route/header/cookie/限额与 Web 运行语义均未改变；
此切片不包含 Team Product 写或邀请邮件入口。下文旧来源 SHA/commit 是当时切片的历史证据，
不再是当前 consumer pin。Node `22.22.2` 在 Web 工作树先验证来源断言 RED，再执行
聚焦 4/4、`pnpm contract` 57/57、`pnpm test:architecture` 34/34、`pnpm lint`、
`pnpm test` 1424/1424，均通过；`pnpm typecheck` 与 `pnpm build` 在独立复制目录通过，
未触用户 3310 共享 `.next`。Root 的来源门、最终集成与真组合仍待审查。

W1C-FIXED-TENANT-WEB-D 第三切片（2026-09-24，Root 独立代码门与固定来源真三仓烟测已验）：Web RP code callback
在创建 Product Session 前、refresh 在 generation finalize 前，均以当前 user Bearer、固定 service
identity 和受信 `Forwarded` 调用 BFF `GET /v1/me`（owner OpenAPI SHA-256
`75ab482132602bd1d7ce77dbec1423b10d4ce7a8244ad284ecac78cd4e7b50ca`），严格核对
`data.user_id` 与 OIDC subject、`data.tenant_id` 与 server-only `KOKORO_TENANT_ID`。配置缺失、
非 200、超时/取消、响应超限/shape 错误或身份错配均 fail closed；callback 不创建 session，refresh
错配撤销 pending record，旧 generation 立即失效。无 JWT 自验、fallback 或可见中转，凭据不进响应/日志。
Root 在当前工作树重跑 contract 57/57、architecture 34/34、lint、全量测试 1424/1424、
typecheck 以及独立目录的 Next production build，均通过；3310 预览进程未重启。
Root 以 IAM `7f39193`、BFF `e0663a8`、Web `d117688` 固定来源运行测试自有 HTTPS
SMTP 首登→正式 IAM 邀请加入同一 tenant→OIDC→BFF `/v1/me`→Product Session/refresh/logout，
结果 `status=passed`、`owned_resources_remaining=0`。该结果不代表当前仅起 Web 的 3310
已经配齐 BFF/IAM/RP；只读实测 `/login` 仍为 HTTP 503、空 body，不显示旧中转页。

W1C-FIXED-TENANT-WEB-D 第二切片（2026-09-24，来源已重钉；真组合证据见上）：
该切片当时固定消费 BFF `e0663a8c85f055c2bac5af894070fea8e24ff3ce` 的
browser-private policy `2.0.0`（artifact SHA-256
`70cc9704ecf6f61d616011a72447ff3df8c209b3a769d5e4009692b81329e96f`，
IAM owner `7f39193fff97dbb1398cb536ded7dca0db354213`）。
`/iam/organization/list` 不再是可消费 Web GET；`/iam/interactions/select-tenant`
不再渲染选择表单/全屏重试、签发 tenant CSRF 或接受浏览器 POST，而是在精确签名
query 与 issuer cookie 下，以 server-only `KOKORO_TENANT_ID` 经窄 BFF
set-active 直接 302/303 续接。外层 `/auth/select-tenant` 仍仅保留把
`Path=/iam` issuer cookie 带入内层的无状态 302。Web RP callback/refresh 对
BFF `/v1/me` 的固定租户核验已由第三切片实现；本片不冒充 Product 登录全链验收。
真实 Next 51 个 IAM interaction 测试、5 个 HTTPS 反代测试与 Web 全量 Vitest
1417/1417 已通过；3310 当前 `/login` 仍是空 503（Web-only 未配齐），未改用户进程。
下文描述 tenant 表单、policy 1.x 的段落记录历史发布基线，以本节为当前事实。

W1C-FIXED-TENANT-WEB-D 第一切片（2026-09-24，待 Root 来源 pin）：已删除可见
Team switcher、客户端 `switchTeam` 和 `/api/team/switch` route；邀请/成员管理继续按
旧 Team context 展示，不把本片冒称固定租户登录已完成。三设计文档已明确目标：
待 IAM 第一方 Web client 续接和 BFF `/v1/me` 固定契约发布后，Web 内层 tenant
交互须无选择页、server-only 固定 ID 续接，并在 RP code/refresh 时校验受信
subject/tenant。测试先 RED 后 GREEN：Node22 聚焦 85/85、contract 57/57、
architecture 34/34、全量 Vitest 1418/1418、lint PASS；共享 3310 的 `.next`
仍缓存已删 route，当前 checkout 的裸 `tsc --noEmit` 被旧生成类型阻断，未清理
用户进程。一次性独立复制（实体 `node_modules`，无共享 `.next`）的 `pnpm typecheck`
及 `pnpm build` 均 exit0，生产路由表无 `/api/team/switch`。3310 `/login`
仍是 Web-only 的空 503，不是已打通的可见 IAM 入口。

R2e-IAM-VERIFY-WEB（2026-09-24，历史发布证据）：Web 当时从 BFF
`dadf9264116ea9df2c0886c4af84bacb67aa6e41` 固定只读 IAM relay policy `1.1.0`，artifact
SHA-256 `97022ea8727619bae03927027ef6a8ce87a3d2da4580ba5d211dc63b16fdc42c`，IAM owner
`b363554d07e5b6e182160b42ae1402330e55d9db`；原始切片仅新增
浏览器精确 `GET /iam/verify-email`。Web 对规范化后单一非空 `token`/可选单一 `callbackURL`
执行准入，重复/额外键本地拒绝；Next 可能在 handler 前规范化编码，故不声称任意 raw query 字节
保真。BFF/Web 继续受固定同源 302 Location 与 issuer cookie/Authorization 隔离约束；此精确路径
的最终浏览器响应无论成功、拒绝或上游失败均强制 `Cache-Control: no-store` 和
`Referrer-Policy: no-referrer`，其他 GET 不变。真 Next HTTP 聚焦测试覆盖 200/302、缺失/恶意缓存头、
外域 Location、错方法/路径别名/重复键零 BFF socket；真实 Chromium 从 token URL 的 200 页面点击
同源链接，出站 request 不带完整 token Referer。该 fixture 未验证 IAM JWT、SMTP 邮件点击或完整账号
登录；Web 无新 SQL/Redis owner。Next 16.2.6 开发模式默认会把完整 incoming URL 写入 stdout；
本工作树仅对精确 `/iam/verify-email`（含 query）启用 `logging.incomingRequests.ignore`，隔离真 Next
测试以独特 token 验证该框架请求日志不含 token、普通 `/iam/jwks` 仍被记录。此结论不覆盖 TLS
前置 access log、浏览器历史或外部邮件系统。Root 独立重跑 Node22 聚焦真 Next/登录/contract
13/13、`pnpm contract` 56/56、`pnpm test:architecture` 32/32、`pnpm lint`、`tsc --noEmit`、
`pnpm test` 1414/1414 均通过；为不触用户 3310 的共享 `.next`，`pnpm typecheck` 的 Next typegen、
正式 `pnpm build` 仍待隔离验收。Root 跨仓来源门与真 IAM 邮件点击/完整登录也待执行。

W1D-Chat 浏览器闭环修复候选（本工作树，尚待 Root 固定 SHA 真实 Chromium 复验）：BFF 当前
`RUN_FINISHED` 带 `status/outcome`（取消时另有 `result`），`RUN_ERROR` 带
`threadId/runId`，工具结果带 `isError`；此前 Web AG-UI 严格 schema 将这些 owner
字段误判为未知字段，使终帧解析失败。当前精确声明字段、仍拒绝未知键，并在内部投影保留
cancelled/tool error。SSE 同源代理此前使用普通 HTTP 15 秒总 deadline；当前仅
`GET /sessions/:id/events` 在首部连接后改用 60 秒可续的 idle deadline，普通响应保留原总
deadline。上述两项分别以旧实现 RED、修改后 GREEN 的 contract/真实 Node HTTP 测试证明；
尚未据此宣称浏览器 Chat 完成，须等 Root 独立固定版本端到端验收。
Node `22.22.2` 本工作树已执行 `pnpm contract` 56/56、`pnpm test:architecture`
32/32、`pnpm lint`、`pnpm test` 1408/1408、`tsc --noEmit`；共享 3310 dev 仍在运行，
本切片未在其 `.next` 上运行 build/Playwright，交 Root 串行完成。

状态日期：2026-09-24。范围：`kokoro-app` 独立子仓。本文只陈述当前工作树可验证的事实；历史报告、preview fixture、截图和 Agent 自报均不构成生产验收。

W1C 旧可见失败链清理：`/api/auth/magic-link/request` 与旧 `/api/auth/callback` 两个 browser-private
Route Handler 已删除，不再生成 magic-link 开发回调，也不再从失败回调 303 到
`/login?auth=link_unavailable`。固定 Auth.js `/api/auth/callback/kokoro-iam` 仍由
`/api/auth/[...nextauth]` 承载；旧 `auth.ts` helper、其他认证和 Team 路径本片未删。

W1C-2F-S1 已发布 Web main `0e0ec3a6a9682a09a7f335fbd7d96743afefd7dc`（含 HTTPS Product cookie `Secure` 修正）；后续已发布的旧 generation signout CAS 保持有效。S1 在已验 RP-only 基线之上接入 Web 自有 Product Session：成功 callback
以加密 HttpOnly cookie（随机 session ID/generation、server-only access，无 refresh；固定 Web origin 为 HTTPS 或 Web production mode 时带 Secure）和 Web Redis 加密
refresh record 建立在线状态；同源标准 `GET/POST /api/auth/session` 分别返回无 token 的最小 projection/
执行受 CSRF 保护的双 CAS refresh，`POST /api/auth/signout` 仅匹配 cookie generation 的 active record 才 take 已确认当前 refresh，
pending 时只 tombstone。旧 generation signout 不发送 Product `Set-Cookie`，避免乱序响应清除浏览器已收到的新 cookie；HTTP 200 返回 `stale_session`/`not_required`，旧 cookie 仍被在线 generation 校验拒绝，不改当前 Redis record、不 revoke、也不返回 issuer 引导；其他 signout 返回固定同源 `issuer_end_session_url` 与 `issuer_session=pending_browser_confirmation`；浏览器实际完成 `/iam/oauth2/end-session` GET 确认页和受 Origin/签名确认 cookie 保护的 POST 后，IAM issuer session 才算结束。七个普通受保护 BFF adapter 已切换为在线 Product Session generation 核验与唯一 access Bearer；legacy magic-link/team route 仍是**待删除旧态**，UI 主链不再消费它们；本切片不声称它们已删除；S1 真实三仓 HTTPS 组合已通过，S2-A 普通业务代理组合已通过固定三仓真 HTTPS。固定 BFF relay policy 已重钉
`eb1eb2926d08b8a3779898b2c31e604a8585ec8b`/IAM `e36da9ecf8d62a364182949817431a8e2329d50a`，
SHA-256 `ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`；仅来源 metadata 变化。
本地 Node `22.22.2` 在 Web main `0e0ec3a6a9682a09a7f335fbd7d96743afefd7dc` 以 `caffeinate -dimsu` 执行：
`pnpm contract` 6 files/52 tests、`pnpm test:architecture` 4/32、`pnpm lint`、`pnpm typecheck`、
`pnpm test` 139/1369、`pnpm build`、`pnpm test:e2e` 6/6 均通过。RP-only 固定 503 的成功断言先
反转获 RED，再在 S1 获得 GREEN；真实 Web→BFF→IAM 三仓 runner 首轮识别出 HTTPS Product cookie 缺 Secure，已由 main 修复、待 Root 复验。本次 stale-signout 切片新增 Redis CAS 与真实 Next HTTP 回归：旧 cookie 不发 Product `Set-Cookie`、不触发 revoke、不返回 issuer 确认引导、不影响新 cookie；Node `22.22.2` 在本工作树执行 `pnpm check`，contract 52/52、architecture 32/32、全量 Vitest 1371/1371、lint/typecheck/build 均通过，`pnpm test:e2e` 6/6 通过。普通 `/v1` Bearer adapter、
Team、GitHub runner 与上线验收仍未执行/完成。

## 1. 当前边界

- 历史 W1C-2B-2 基线曾为 `/auth/sign-in`、`/iam/interactions/select-tenant|consent` 的服务端 GET 表单加上共享无脚本品牌外壳；当时 Email/Password、Tenant、Consent 各自原生 POST。当前 tenant 表单/POST 已由本文件首节的固定租户服务端续接取代，sign-in 与 consent 仍保留表单。旧真实 Next+Chromium fixture 只证明当时的视觉与交互边界，不冒充当前完整 OIDC/Product Session 闭环。
- 当前工作树的真实 Chromium 登录切片修复了 `GET /iam/oauth2/authorize` 的浏览器导航断层：IAM owner 实际返回 200 `application/json` `{redirect:true,url}`；Web 只在该固定 route 经原生 header/issuer cookie 和固定同源交互 Location 校验后转为无 body 302。其他 IAM JSON 保持原生，异常 authorize continuation 返回不透传上游 body/cookie 的 502。真实 Next + Chromium fixture 已验证浏览器进入 `/auth/sign-in`；完整 Product Session/Chat 浏览器闭环仍由 Root 独立组合 runner 验收。
- 公开入口已收敛：`/` 使用固定单租户 Kokoro 品牌直接渲染营销首页；`/login` 现为服务端 Product RP OIDC 启动路由，不依赖 System runtime manifest，浏览器成功时直接进入真正的 IAM `/auth/sign-in` 邮箱/密码表单。可见的连接中/整页重试组件与失败态共用的假登录页面均已删除；RP `signin` 失败后 303 回登录重试页的分支也已删除，失败仅返回结构化错误。`/login` 启动失败仅返回无 body 的 HTTP 503，并在服务端记录阶段。没有 RP 配置时当前本地 3310 返回这个空 503（非可登录预览），不会显示假凭据表单。`/app` 仍需在线 Product Session，System manifest 仅增强展示。IAM 表单已收敛为紧凑单列，浏览器凭据错误留在表单内并重签一次性 CSRF。`/preview/marketing` fixture 和未使用的 HomeGate 已删除。
- 本次改动在 Node `22.22.2` 下的 `pnpm check` 通过：contract 54、architecture 32、Vitest 1401、lint/typecheck/build；真实 Next HTTP 集成测试覆盖首次及已有 CSRF cookie 的 `/login` 302 与 RP cookie；聚焦 3310 离线 Playwright 10/10 通过。Auth.js v4 Route Handler 读取当前 Next request context 的 `cookies()`，不是合成 `NextRequest` 的 cookie header；服务端启动已显式同步经过 Auth.js 签发的 CSRF cookie。固定 Web `175a6d805b69b88c1478b86164fdcbfe925f498a` 的 Root 真 HTTPS Chromium 组合已 PASS：浏览器从 `/login` 直达带签名 IAM 表单，提交邮箱/密码、tenant、consent 后到 `/app` 并取得 Product Session；浏览器未发 CSRF/signin 中转请求。其后独立 CookieJar 完成 BFF/Agent worker 聊天回归，不能冒充 Chromium Chat；测试自有 PG、Redis、进程均清零。3310 仍无 RP/IAM/BFF 配置，HTTP 503 是当前环境事实。
- W1D-Web-Gate：`/app` 的访问权只由在线 Product Session 决定；System manifest 为可选展示数据。已认证状态即使用本仓固定品牌/导航装载 live 工作台，有效 manifest 才覆盖动态展示；失败或重试会清除旧站点皮肤，不切到 preview transport。旧 `RuntimeUnavailable` 页面、样式、测试与九语种死文案已删除。当前 Node22 contract/architecture/lint/typecheck、串行 Vitest 1385/1385、build、Playwright 11通过/1既有skip；真实浏览器在已认证探针与 System 503 下仍于 `/app` 显示核心工作台。
- 浏览器只访问同源 Web 入口；Chat 请求经 `/api/session/*` 代理到 `${KOKORO_BFF_BASE_URL}/v1/*`。Web 不拥有 PostgreSQL、ORM、migration 或任何其他 owner 的数据库事实；Redis 自有 namespace 保存短期 CSRF/RP 摘要和 S1 Product Session 在线协调 record。
- 新 Product Session cookie 使用加密 HttpOnly 信封、`SameSite=Lax`，固定公开 Web origin 为 HTTPS 或 Web production mode 时设置 `Secure`；浏览器 cookie 不透传给业务上游。旧 sealed session 仅属于待删除旧路径。
- Product 上游调用由 `src/lib/server/upstream-http.ts` 统一执行：重建可信 `Forwarded` 上下文，删除浏览器可控的 domain/tenant/site/forwarded 头，设置总 deadline，并限制请求与响应体大小。W1C-2A `/iam` 原生协议例外使用独立 transport，避免合并多个 `Set-Cookie`。
- `src/proxy.ts` 为每次页面请求生成 CSP nonce；配合动态 layout 注入的 nonce，响应包含 CSP、frame、referrer、permissions 与 no-sniff 防护头。`/api/*` 明确 `Cache-Control: private, no-store, max-age=0` 与 `Vary: Cookie`。
- `kokoro-app` 是 Web remote 名；主控仓中的对应 submodule 路径是 `apps/kokoro-app`，不使用歧义的 `kokoro/` 名称。
- W1C-2A 已新增 BFF-only 的同源 `/iam/[...path]` 只读入口：只允许固定 policy 中无需 browser Bearer 的
  discovery、JWKS、authorize、issuer session、organization 与固定参数 end-session GET；仅 logout-confirm POST 通过专用窄路由，其他浏览器 POST、userinfo、
  Authorization 和 handler 可见的未知/编码 route alias 均在连接 BFF 前拒绝。固定 server-only
  `KOKORO_WEB_ORIGIN` 固定公开 authority：入站 Host 必须精确匹配，GET 如携 Origin 也须匹配，POST
  必须携精确 Origin；响应 Location 仍只相对该固定 origin 验证。Next 在反代后可能把 handler 的
  `request.url`/`nextUrl.origin` 重建为内部 `https://localhost:<port>`，因此不以它作公开 origin
  校验，也不信任浏览器可控的 `Forwarded`/`X-Forwarded-*`。真实 Next HTTP 探针记录 dot/encoded-dot 在 handler 前成为同一
  canonical route、双斜线返回 308、编码 route 名返回 404，并证明无 Content-Length 的 chunked GET body
  在连接 BFF 前返回 400；这些行为不扩张固定 allowlist。policy 中三个 `/auth/*` Location 在
  W1C-2A 发布时只是后续交互目标，未安装页面；2B-1 和本次 2B-2 才逐片安装。专用 transport
  保持原生 status/header/body 与多个
  `Set-Cookie`，并实施 issuer-cookie 白名单、16 KiB header、1 MiB response、5 s deadline 与取消传播。
- 只读 snapshot 固定 BFF `eb1eb2926d08b8a3779898b2c31e604a8585ec8b`、IAM
  `e36da9ecf8d62a364182949817431a8e2329d50a` 和 policy SHA-256
  `ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`；Web 不编辑 owner policy，
  `tests/contract/iam-relay-policy.test.ts` 对 snapshot 原始字节与 provenance 做漂移门。
- 已发布的 W1C-2B-1 新增 `/auth/sign-in` 交互入口：GET 保留 IAM 原始签名 query 并在 Web Redis 自有前缀写入
  5 分钟一次性 CSRF 摘要/目标 POST method/issuer-cookie 绑定，POST 必须精确同源 Origin、Cookie+hidden token 与原始 query
  匹配，Redis `GETDEL` 原子消费后才向 BFF 的 `/iam/sign-in/email` 与 `/iam/oauth2/continue` 发起两个有界原生
  POST；IAM 签名仍由 IAM owner 验证。中间 sign-in 响应中的 session token JSON 不返回浏览器；最终继续响应
  对 IAM 实际 200 `{redirect:true,url}` 严格校验固定 Web origin/允许交互路径后返回 303/Location 与多个
  issuer `Set-Cookie`；中间 sign-in 失败仅受控 401/429/503 且不调用 continue。直接 browser `/iam/*` POST
  仍全部拒绝；此项是 2B-1 历史切片状态，当前 S1 已安装 Auth.js/Product Session；普通业务 adapter 已由 S2-A 切换。Redis 依赖精确固定
  `redis@5.12.1`，`KOKORO_WEB_REDIS_URL` 缺失或 Redis 故障时交互 fail closed，Web 不清理共享 Redis。
- W1C-2B-2 新增 `/auth/select-tenant` 与 `/auth/consent` 严格 GET 外层，引导至
  `/iam/interactions/select-tenant|consent` 真正的 Web-owned GET/POST；外层 POST 405。IAM issuer
  cookie 原生 `Path=/iam`，真实浏览器不会将其发送至 `/auth/*`，故外层不得直接呈现需要会话的表单。
  静态内层路由优先于 `/iam/[...path]` catch-all，仍不开放直接 owner mutation。Tenant GET 经固定 BFF
  `/iam/organization/list` 取 owner 返回的 active 组织，候选 ID 摘要与一次性 CSRF/原始 query/issuer
  cookie 绑定；POST 先验证所见候选，再重读当前 owner 列表，只有仍在列表内才调用
  `/iam/organization/set-active`。Consent GET 只从 IAM 跳转 query 的唯一受限 `scope` 展示**未验签预览**，
  并未由 Web 确认签名/权限；POST 不接收浏览器自报 scope，仅在明确 Agree 后将该 query 的 scope 与原始
  `oauth_query` 送 `/iam/oauth2/consent`，由 IAM 最终验签并核 scope 子集。伪造 query 的 401/错误响应
  受控清洗。两页的 CSRF cookie/digest/form/clear 均绑定 `/iam/interactions/*`，复用 Redis 原子 CSRF、
  严格 Origin、固定 relay、原生多 issuer cookie 与交互 Location
  白名单；直接 `/iam` 浏览器 POST 仍拒绝。IAM 成功最终跳到固定未来
  `/api/auth/callback/kokoro-iam` 时，因本片未安装 Auth.js RP，Web 返回不泄露 code/cookie/Location 的
  `503 rp_callback_unavailable`，不假装浏览器登录闭环。Next16 dev HTTP 对 `%20` 可能正规化成 `+`；
  IAM 以参数规范化验签，Web 不自行解码再重签或改变已进入 handler 的 query。
  四条新外/内层 route 的 HEAD/OPTIONS 显式 405，零 BFF/CSRF Redis 写入；当 IAM 对
  `session_data` 下发 `Max-Age=0` 或已过期 `Expires` 删除时，Web 的后续 CSRF issuer 绑定与
  浏览器 CookieJar 一致，只保留有效 `session_token`，且有效 `Max-Age` 优先于旧 `Expires`。
- 历史 W1C-2C RP-only 切片（现已发布且被 S1 接续）：当时固定 `/api/auth/[...nextauth]` 只开放 CSRF GET、
  `kokoro-iam` signin POST 与 callback GET；固定 Host/按方法精确 Origin、Auth.js CSRF、固定 issuer/client/
  callback/resource、S256/state/nonce 与 300 秒 Redis `SET NX`/`GETDEL` 绑定。签名算法显式 pin
  EdDSA；自定义 token request 调用验证型 `openid-client` callback，server-only Basic token、
  Bearer userinfo 与 JWKS 仅走固定 BFF backchannel，每次独立 agent 限制绝对 5 秒、响应头/正文
  1 MiB，并传播浏览器 `request.signal`：callback 断连销毁当前 BFF socket 且不继续后续 backchannel。
  真实 Next+BFF fixture 覆盖签名/issuer/audience/nonce/过期/算法、userinfo sub、CSRF、
  竞态重放、body/响应超限与慢滴流；在当时 RP-only 基线验证成功仍只返回受控
  `503 product_session_unavailable`，清 RP cookie，不签发可用 Auth.js/旧 Product Session；当前 S1 成功回调已建立新 Product Session 并 303 到 `/app`。
  W1C-2D 将 IAM consent 实际成功响应的唯一 `code`、`state`、`iss` 三参数严格准入，
  `iss` 必须等于固定 `${KOKORO_WEB_ORIGIN}/iam`；完整 query 交验证型 `openid-client` 再核 issuer。
  缺失、重复、错误 issuer 或额外参数在 relay/RP 边界拒绝，不把 2B-2 的受控 503 误判当成功。
  当时旧 magic-link route 仍待删除，但 UI 登录/探针/退出主链与普通 `/v1` Bearer 代理均已迁移；本轮已删除其中的申请和回调 route，其余旧认证/Team 路径仍在。该历史 fixture 不是 IAM owner 签名组合验收；当前 S1 已实现新 session/refresh/signout，但三仓真实闭环仍待 Root runner 验收。

## 2. 已落地的质量门

- 单仓工具链固定 Node `>=22 <23`、`pnpm@11.25.0`，`.npmrc` 启用严格 engine、精确版本和 peer dependency 检查。
- `pnpm check` 依次执行 contract、架构、lint、typecheck、unit/integration test 与 production build；Playwright/axe 浏览器门禁单独使用 `pnpm test:e2e`。
- Scheduled Tasks 与 MCP configuration 已按 feature/职责拆分；scheduled feature 的 AST 架构测试约束 React 入口与函数体量，测试归 Web 子仓所有，不迁入主控仓。
- CI 固定 Action 的完整 SHA，执行文件系统 dependency/misconfiguration/secret 扫描、浏览器 accessibility/responsive smoke 和镜像候选构建。发布流在推送前扫描候选镜像、验证 health/隐私响应头，并生成 SBOM、provenance 与 digest 签名。
- 生产 Dockerfile 固定 Node base image digest，并提供非 root 运行与 `HEALTHCHECK`；本地开发仍从源码 `pnpm dev` 运行，compose 示例只引用已构建镜像。

## 3. 当前验证证据

在本次 Web 收敛提交上执行：

```bash
pnpm contract
pnpm test:architecture
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

已获得的本地结果：130 个 Vitest test files / 1,221 个测试通过；Playwright desktop + mobile 共 6 个浏览器、可访问性与 viewport smoke 通过；Next production build 通过。该证据不等价于 live BFF、真实外部存储、生产 telemetry/SLO 或镜像发布验收。

W1D 登录 handoff 旧基线使用 Node `22.22.2` 执行 `pnpm check`：contract 6 files/54 tests、
architecture 4 files/32 tests、lint、typecheck、全量 Vitest 142 files/1,396 tests与 production build
均通过；`pnpm test:e2e` 在 desktop/mobile 为 15 passed、1 个既有 mobile rail logout skip。浏览器门证明
旧基线首屏零 CSRF/System 请求、点击后固定 CSRF/provider POST、失败停止重试、axe 与 viewport；本次自动登录与无卡片布局已替代“点击后”行为，当前工作树的聚焦浏览器门禁见本切片交付记录；其中真实 303
用例只证明当时 RP 配置缺失时的受控早退；其中失败后跳转登录重试页的旧行为已删除。
当前 RP `signin` 失败返回无跳转的结构化错误，`/login` 不承载中转或重试 UI；这不代表
authorize/token/userinfo、IAM 签名、Product Session 或完整 OAuth 失败链已经通过。

W1C-2A 当前工作树使用 Node `22.22.2` 重新执行：vendor policy 与固定 BFF commit blob 的 SHA-256/字节
对照一致；聚焦 4 files / 38 tests、`pnpm contract` 6 files / 52 tests、`pnpm test:architecture`
4 files / 29 tests、`pnpm lint`、`pnpm typecheck`、全量 `pnpm test` 134 files / 1,259 tests、`pnpm build`
与 `pnpm test:e2e` 6 tests 均通过，build 列出动态 `/iam/[...path]` route。聚焦集合包含启动真实 Next dev
HTTP 边界的系统测试；它验证 canonical path、evil Host、chunked GET body 及 alias canonicalization，
并使用独立临时 Next 工程/构建输出且清理进程、server、目录；BFF 仍是本地
HTTP fixture。全量 Vitest 仍输出既有 jsdom `Not implemented: navigation to another Document` 提示但退出 0；
本切片未宣称真实 Browser→Web→BFF→IAM 登录闭环。

W1C-2B-1 在基线 `85b4bad25769efcca8f417e0232fdaa6c485bf01` 的未提交工作树使用 Node
`22.22.2` 执行 `pnpm check`：contract 6 files/52 tests、architecture 4 files/32 tests、lint、
typecheck、全量 Vitest 135 files/1,295 tests、production build 均通过；`pnpm test:e2e` 原有 6/6
通过。聚焦真实 Next HTTP 17/17 验证恶意/缺失 Origin、缺失 CSRF、签名 query 变化、重放、错 path 和超限
均零 BFF socket，正向保留原始 query 至 BFF `oauth2/continue` 并将 IAM 实际 200 JSON 转为
303/Location/多 Set-Cookie；evil URL/错 shape 以及 sign-in 401/429/503 的敏感 body/cookie 均拒绝透传，
后者不调用 continue。Redis 测试仅删本次随机 token 的精确 key，预存同前缀 key 不误删，失联清理有限退出。
该测试的 BFF 是本地 HTTP fixture，**不是 IAM owner 的签名验证证据**。测试后 Web 自有 Redis CSRF key、
Next 临时目录和进程均为零；GitHub Actions runner、真实 IAM 组合仍待 Root 验收。

W1C-2B-2 以 Web main `d619f2c06951cb2decdb1eeac48547e3bcf40361` 为基线，使用 Node
`22.22.2` 跑聚焦 policy contract+真实 Next HTTP+Redis 3 files/52 tests、`pnpm lint`、`pnpm typecheck`、
`pnpm contract` 6 files/52 tests、`pnpm test:architecture` 4 files/32 tests、`pnpm test`
135 files/1,320 tests、`pnpm build` 与 `pnpm test:e2e` 6/6 均通过。真实 Next fixture
使用遵守 `Path` 的 CookieJar 与要求 issuer session token 的 BFF HTTP stub，证明外层无 cookie、
内层有 cookie、静态路由优先、两次交互继续和直接 owner POST 405/零 BFF；未假称真实 IAM 签名/RP 闭环。
BFF 仍是 HTTP fixture，
未做真实 IAM/RP 闭环或 GitHub Actions runner 验证。测试覆盖 tenant 列表信任、重核/越界、
签名 query 变化、Origin/CSRF/重放、consent 拒绝/伪造 query owner 401、恶意导航、native
302/多 Set-Cookie、错误敏感体清洗及未安装 RP callback 503。当前 R2d-WEB-RELAY-PIN 再次机械 re-pin BFF policy
`eb1eb2926d08b8a3779898b2c31e604a8585ec8b`/IAM
`e36da9ecf8d62a364182949817431a8e2329d50a`，复制 BFF 发布的只读 JSON 原字节，其余 route/method
语义与前 pin 相同。

## 4. 尚未闭合的边界

1. Chat transport 仍保留 legacy `SessionEvent` 解析回退；AG-UI 单一路径、`AgUiChatTransport` 与 Vercel AI SDK `UIMessage` 映射尚未完成。
2. 历史基线曾保留旧 magic-link/refresh 与 IAM 直连 helper；W1D 工作树已删除，不再作当前运行路径。S1 新 Auth.js Code+S256、server-only token/userinfo 和 Product Session 已落地，普通 BFF adapter、UI 登录/会话探针/退出主链已切换；其余旧路径仍须由后续 S2-B 清理。
3. 全部 route 的 success/error envelope、request/trace ID 和结构化 telemetry 尚未统一；没有实测 SLI、错误预算、burn-rate alert 或 production runbook 证据。
4. 未建独立 `/healthz` 与 `/readyz`；W1D 工作树镜像 liveness 改为公开 `/`，不冒充 IAM/BFF readiness。
5. 部分遗留 UI/CSS 仍超出目标粒度；视觉回归与 bundle budget 尚未成为阻断门禁。

## 5. 后续顺序

1. 完成 S1 真实三仓 IAM 组合验收，继续 S2-B：删除旧 Web→IAM 直连和旧认证/Team 路径；
   legacy Chat 双读另由 W1D generated Product consumer/AG-UI 切片删除。
2. 统一 route envelope、request/trace ID、日志与 telemetry，并补 health/ready 与生产观测证据。
3. 独立完成遗留 UI/CSS 切片、视觉回归、bundle budget 与 live release acceptance。
