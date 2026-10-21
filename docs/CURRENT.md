## 2026-10-20 账户切换闪动（局部修复，尚未远端交付）

针对“点击切换有闪动”，不是失效按钮：设置窗口内保留当前准入范围已确认的姓名/邮箱/积分摘要，返回账户时重核但不先清空；换身份/代次、撤准入或关闭窗口清空。inactive panel仍卸载，不保活草稿和弹窗，不引入持久缓存或新增请求。初读积分用有无障碍标签的占位，资料读未确认前禁编辑/保存，旧回调也受最终门闩；新读仅同步未编辑姓名，保留草稿/CAS及未知写入恢复。

真实缺陷 RED→GREEN，216 项相关回归通过；只读复核 Approved。正常3310鼠标“通用→账户”及键盘“账户→用量与计费→账户”实测返回保留Owner/邮箱、输入可用，无先空字段；当前612×766设置窗口可达。最终冻结1121输入隔离副本：contract295、architecture50、lint、types、完整233文件4451PASS/0SKIP、webpack生产build和post-types全部exit0；活动源码与验证副本逐文件hash一致。首次缺陷RED与阶段失败保留，未加skip/retry或放宽门。未运行本轮全站浏览器E2E，未据此称桌面全尺寸/Manus一比一或金融整链完成。尚未开通积分账户文案仍存在，隐藏初始化、当前租户充值和实际用量扣减属于独立未闭环工作；无模型/工具/积分写入、真钱支付、自动化/连接器修改。

## 2026-10-20 聊天执行未就绪反馈（局部修复）

仅将明确 `agent_not_configured` 且无真实 run failure 的提交前依赖状态，拆为紧凑中性反馈组件；原402、真实运行失败、未知提交、恢复能力及原key/body流程不改。中英文完整、role=status、装饰图标隐藏，只有明确点击原恢复按钮才调用既有回调；没有自动发送、轮询、owner/API/Schema或新依赖。

正常3310先复现红字/孤立重试，再验新卡片、历史、草稿编辑与键盘到达按钮（568×766）。BFF前置guard为disabled，测试请求止于该guard，无模型/工具/扣费；不据此称全尺寸或竞品一比一完成。原后台错误标签仍有工具准入阻塞，本段不冒MC-02后台写旅程或全目标闭环。

业务停写的1119输入隔离副本：contract295、architecture50、lint/types、完整233文件4446PASS/0skip、webpack build/posttypes均exit0。全测后仅整理两个新增用例格式、将“无能力无按钮”断言加强为实际新标签；最终53项与lint重跑通过，其余1118输入hash不变，活动与隔离源码一致。只读复核Approved，新增只占原suite两用例；未增加skip/timeout、改engine/资金、其他开发者自动化/连接器或运行配置。实际截图及阶段/最终收据仅Root ignored chat-feedback-20261020。

## 2026-10-20 MC-02 Public21.1模型配置桥（本地候选）

唯一BFF固定 `f3da7d5feb855b2b97c77a6ae9928cee96e1b8aa` /21.1.0/175，SHA256 `4db8bab6159a2f36061f8b292fba9074ea2614adab2a1489bf9d1b3b066b6fe3`。仅扩现Admin Product adapter的10具名模型配置路径，复用原Product session、服务身份和request-id，原body/key/CAS透传；发布严格证明实际EOF，不虚构JSON正文或丢幂等头。没有直连System/读取运行Key、模型执行、自动重试或新的OAuth。

七现有生成器按固定artifact正规重出；test-only21.1→21精确全文逆回，再委托原21→20及历史oracle，不作runtime兼容。Skills/MCP、自动化、聊天与其他owner语义不变。主方完整相关门与正常页面分别验收，受控peer adapter测试不是owner整链证据；首次完整测试缺资源配置的失败保留，后续按既有受管Redis隔离prefix验证。Node22最终七生成check、contract295、architecture50、lint、typegen/types均通过；受管Redis独立prefix的完整233文件4444 PASS/0skip、官方webpack生产build及post-types通过。首次漏传既有Redis配置导致fixture beforeAll失败/2skip，原记录保留；补齐既有资源后完整重跑，不改timeout/skip或测试断言。当前不做目标浏览器的替代通道操作，未运行本轮浏览器E2E；源码/adapter和真实owner链分别有证据，不宣称正常页面完成。正常切换及集中PR尚待，模型/实际工具/扣费暂停。

## 2026-10-20 MC-02A Public21 Chat模型消费完成源码验收（正常未切）

正式从BFF `513b18e2942f94c5f2d4f48d9f9d3010b92db7e6` Git blob固定Public21.0.0/165，SHA256 `a902a20ad95e46c01bfc8f5a80260c14565cfe557137759d5ecd42bc1a60f7c2`。六现public generator正规write，七生成check全0；connector-command-errors独立source/pin不变。现catalog严格接必需有效display_name、model/revision/provider精确ID、feature/request_model及nullable next_cursor；未知/旧/extra字段拒绝。新test-only21→20全文逆回后委托原20→19及双父proof，旧oracle字节保持。

初期仅配对decoder而保留provider:name的阶段判断已撤回：BFF/Agent实际把message.model当System label_key。新增4处真实RED证明旧UI把real-provider:chat/fast发给engine、旧偏好注入请求、缺chat query及非chat混入；现Composer菜单/Settings复用原helper直接使用raw candidate.name，展示仅必需display_name，不以provider/alias/request_model拼身份。Chat client固定feature_key=chat且拒非chat候选，真实same-origin HTTP验证query原样到BFF。默认偏好仅使用kokoro.web.chat-prefs.v2，旧key保留但不读/迁移/删除，合法label可含冒号；真实hook→engine回归证明旧值不进入message。原未知提交冻结body/key、Mode lock、auth、preview及状态机不改，无UI布局变化。

最终Node22/pnpm11.25、Vitest最多2 workers：七生成check、contract26文件295PASS、architecture50PASS、lint、typegen/types、完整233文件4442PASS/0SKIP、own production webpack build、post-build types全部exit0。既有完整桌面/手机Playwright108PASS，candidate自有端口和子进程已自动退出并核验关闭；随后正规next typegen＋tsc再次exit0，Next dev产生的next-env路径已由官方typegen恢复，未手改generated。受管Redis只复用原fixture随机prefix，前后88keys/摘要相同，无flush或新实例。主方独立同源副本另验7生成、31文件735合同/受影响engine/UI/偏好/HTTP、architecture50及lint/types/build/posttypes全0，证据与本writer完整门分开记录。

首轮合法Public21被旧strict decoder拒收的RED保留；新负控误用SessionClientError.kind、lint未使用解构变量及新HTTP夹具缺BFF meta均已最窄修正。前轮阶段默认4439PASS/1OIDC刷新fixture失败及1Radix跨realm unhandled保留，未改登录/Skills源或放宽门；最终完整清单自然通过，不将环境时序通过称作修复那些模块。模型、工具与扣费仍暂停，Key保存/领取不在本片，正常3310源码/输出/进程/配置未动，未push/commit/切分支或扩大其他owner写区。

App基线 `3042ae753e9db2e2204562d8a070c0685bdb0306`。Root ignored `var/dev/system-management-20261020/app-mc02a-*` 保存全部阶段RED/首次失败、最终门、Redis与自有服务清理及完整path/hash冻结收据；完整正常owner链及部署由Root另验。下方为历史状态，不覆盖当前raw label/v2/chat filter结论。

## 2026-10-20 后台模型 Product 桥与 Public20（本地候选）

保留已合设置PR43全部成果，仅在既有Admin同源桥补齐三个模型目录GET和精确单标签路由PUT、原CAS头透传与读取拒绝命令头；Product同一会话、原request-id、幂等键／正文和正式owner错误保持，不建立模型执行入口或旧数据兼容层。System4的revision由BFF Public20正规固定artifact消费，其他公开操作完整不变；六个现有窄生成器全部正规write通过，旧Public19 parent proof原封不动保留，由新test-only Public20→19精确逆证承接历史检查，不是运行fallback。

本次主会话 Node22：301 contract/adapter、50 architecture、完整232文件4438 PASS／0SKIP，lint/types、production webpack build及构建后types全部exit0。新桥路径回归真实4FAIL→GREEN，未知请求不会新增写重试。App无页面布局或自动化／Skills/MCP业务变更，新增正常Admin页面旅程与上游真实链分列；尚未以此声明Manus整站对齐或模型、工具、扣费启用。正常运行加载／远端PR另记。

## 设置视觉增量与最新主线集成（2026-10-20）

在最新主线基础上整合账户积分概览、账户/设备内页、资产创建前流程、帮助、套餐详情、团队与响应式样式。保留主线 Public19、聊天恢复、真实知识 CRUD/usage、稳定知识会话、受控 Skills 浏览和连接器五态；不回退到旧知识占位页或修改技能/连接器实现。知识预览仍只展示本地草稿，记忆导入和无正式服务的资产最终操作继续禁用。最终 Node22 验证：契约 294 项、架构 50 项、lint、类型检查及 production build 通过；完整 Vitest 232 文件/4,434 项全部通过，完整 Playwright 桌面/手机 108 项全部通过。完整 Vitest 在两个 worker 下执行，未增加 skip/retry 或放宽超时；前轮时区断言失败、临时 Next 编译就绪超时和加载壳超时记录保留。时区断言改为独立本地日历精确 UTC 期待，业务代码不变。独立静态复查未发现确定 P1/P2。GitHub CI 因账号付款/额度问题未启动，不能称云端检查通过；本段为本地集成验证，实际合并与部署分别核实。

以下设置单独分支的验证为整合前历史证据；知识尚未接通的描述只对应旧分支和预览，不覆盖当前主线的正式知识能力。

## 设置内部流程交付状态（2026-10-20；整合前记录）

设置范围内15个主页面及已确认内页、页签、创建前表单和返回/取消流程已实现。新增账户正式积分读取、帮助筛选、套餐详情与空目录重读；完善个性化、Mail、资产和团队布局、焦点及错误反馈。Skills/MCP 未修改，云电脑和未接通服务的最终操作禁用。

最近修正包括分享恢复重读不得沿用旧 review、Team 本地邮箱校验不得触发未知写入锁，以及退出/移除确认取消优先与回原入口。数据管理三个内页的测试迁移为实际 region/Back 行为，保留不可用、回焦及零请求检查。

本次验证：UI 79 文件/1,358 项、契约 284 项、架构 50 项、lint、类型检查及 production build 通过。完整浏览器回归 101 通过/1 失败，其中 98 项设置检查全部通过；失败仍为手机端项目会话的当前项目链接点击超时。完整 Vitest 初轮为 3,703 通过/12 失败/156 跳过，包含 Redis/认证 fixture 失败、未提交的开户草稿及迁移前的 Data 断言；迁移后全部 UI 已重跑通过，未把完整 Vitest 标为通过。正常本地页面使用认证及 BFF fixture，不代表正式产品服务或真实外部服务验收。设备窄屏覆盖仍有缺口，正式套餐目录为空、团队参考账号无成员页，不能据此宣称所有状态与尺寸完成。

邮箱/号码分配、支付账单、知识持久化、API key/Webhook 和外部授权仍需 owner 正式服务接入；积分开户是独立后续能力，本次不实现或提交其预留测试。历史认证集成失败与移动端公共壳超时没有因本次 UI 交付关闭。功能分支推送不代表主干合并、部署或发布放行。

## 2026-10-20 本地遗漏交付收尾候选（尚未合并）

从旧 mixed 中按职责提取本方已实现但未提交的 Library、侧栏项目行、知识编辑和会话画布修复，基于最新 main e189954 集成，不复制旧工作树。Public19、认证／归档、MCP 五态与 #41 未回执提交保护保持；scheduled 已等效在 main，不重复交付。对方设置分支 ed92864 不在本 PR。

Library 恢复默认产物、查看选项里的个人文件、音视频分类、真实 q/type 过滤与精确 metadata／取消读取；不承诺富预览、任务分组或收藏持久化。知识沿已发布 owner 六操作与现有可信会话提供真实 CRUD／usage，不放行 Agent 消费；接入 main 现有个人资料编辑器，保留其草稿／冲突／显式保存流程。旧新文案与测试 Props 只按当前公开组件配对，固定合同升级为已在 main 的 Public19，不回退 pin。

最终 Node22：lint、typecheck、七生成检查、production build 均 exit0；完整 Vitest 231 files / 4316 PASS / 0 SKIP，原全部 Playwright 桌面／手机 42 PASS，未加 retry 或放宽 timeout。独立复核发现同主体重新准入会卸载知识草稿，已用真实 Card 的 RED→GREEN 修复；preview 保留原禁网络和草稿组件。最终产品／测试冻结输入无变化。

首轮完整门的 Redis fixture 缺变量、OIDC 临时 Next manifest 读取失败及 preview 知识回归保留原日志；补齐既有测试 Redis 地址并修复 preview 组合后重跑完整默认清单全部通过，未删断言或改认证源码。参考沿用已记录的 Manus 实测规格与本地对照，当前浏览器回归不是 Manus 全站一比一验收。远端合并、Root 精确组合和正常服务加载分别另核，不用本段冒称已部署。模型、真实工具执行与扣费保持暂停。

## 2026-10-19 聊天主路径及项目局部布局已验收（本批交付记录）

基线 main `76bb993`，独立 `fix/chat-mainpath` 工作树；原 App/BFF mixed 未覆盖。先复现再修四处：超长恢复/语音草稿亮 Send 却静默拒绝；Direct→Project→Direct 丢未回执 create 的原恢复意图；窄屏长草稿在滚到底后遮住项目最后历史行；私有项目链接弹层含虚构 owner 邮箱和公开访问暗示。

保留原 4000 字符上限、完整草稿、原消息 key/body 和 AG-UI；仅未回执 create 延长同文档 scope 租约，不自动重发，确认回执/无 owner/身份失效按既有边界收束。输入区关联可访问反馈并阻止超限提交；IME/Stop 接线不变。项目留白测量独立 hook 仅管理尺寸，390×650 实测最后一行 bottom 从 430 修到 316，编辑器 top 332，保留 16px 间隔。项目链接只读复制不授予权限；九语言同步，删除无效邀请与假邮箱，无新增权限系统。

最终 Node22：完整 Vitest **226 files / 4249 PASS**；ESLint、Next typegen+tsc、生产 build exit0，七正式 generated contract 检查全部0；相关 public-shell 浏览器 **desktop/mobile 10 PASS**，含项目进入会话、scope 列表隔离、动态缩放/焦点和新增长草稿遮挡回归。新增边界均有实际 RED→GREEN，独立只读复核无确定新增 P1/P2。首次完整运行未配测试 Redis、另有 OIDC JSON 解析失败，且混入迭代中 RED，不作冻结树交付；最终仅复用既有 Redis、独立 UUID session keys 后整套通过，不改断言或超时。首次浏览器9PASS/1插件首导航超时，同期自有2GiB预览进程记录内存阈值重启；只重起自有3461并将临时heap限额改3GiB、预热后10PASS，未改插件源码或测试。原失败日志保留。

Manus 本轮实际1280×800中文亮色 DOM/样式/截图对照，另测1068/1067/390；Vercel仅参考固定c2f8235的职责。聊天原生列表已有吸底/上翻/回到最新，本次实测通过，不重写第二套滚动。原截图曾有采集缩放裁切，已用DOM与正确全视口截图分开识别，不算产品缺陷。

尚未宣称完整 A/B/C：最近会话是否继续分页、live 网站固定 preview 入口的严格隔离、消息内技能选择与更完整前进/后退/刷新矩阵仍待后继；不以本片替代真实模型/工具/扣费验收。临时3461已停止；Root 已记录正常自有源码副本热更新与原浏览器读取验收，未重启服务或发送正常消息。此处记录本批验收范围；远端合并与 Root 精确组合另由 PR 及 Root 收尾记录确认，不以本地 build/commit 冒称已合 main。未主动触发 CI。

## 2026-10-19 MCP 当前可用性消费（本地验收完成）

承接BFF850ffe1/Platform4a4e4c4的既定五态，不新增功能模块或协议。Connector/PrivateServer严格要求availability，拒缺失/未知/旧status冒充；安全header历史完整读出，原写入32限制与同源/身份/CAS/原命令恢复不变。一个只读小组件复用于卡片、提供方详情、私有详情和多账号选择器，不自动续期、重连或执行；原status/enabled管理语义保持。原dev预览fixture仅补必需字段，不新增live降级。

1081输入冻结，正式contract288 PASS、architecture50 PASS、lint/typecheck/webpack build/构建后typecheck全0，默认225文件4240 PASS/0 SKIP；原全部Playwright桌面/手机38 PASS、零retry/原timeout。新增仅三条独有风险案例；八份既有测试经明确fixture字段和新case逆证原断言字节精确保持。首全量4239PASS/1FAIL来自Prepare成功fixture仍静态unavailable，按原两返回对象发布ready后的available修正，未放宽断言后全门重跑。

实际App HubClient→BFF HTTP/Native SDK→受控Native owner五态逐一通过list/detail/private，含33安全header历史；零值、错资源、额外字段拒绝。IAM/同源桥/owner受控，非正常整链。实际Chromium四展示面1280/390、独立Server/Connector字段、键盘焦点及零自动动作已验；参考Manus原已登录tab仅本次AX可读、隐藏视口宽0未获新截图，不冒像素对齐。独审无确定P0–P2。Admin现25操作只有Skills/Provider/包，不消费个人对象，无新增Admin字段或提交。

正常App934输入逐字保持，未改正常配置/服务/数据库/权限/积分；模型、实际工具与扣费暂停。源码验证后复用既有授权集中PR交付，CI不等待但不称绿；后续正常整链、Manus完整页面和手册仍未验收。原始失败/冻结/受控HTTP/组件浏览器/原完整E2E材料只存Root ignored var/dev/app-mcp-availability-20261019，不提交机器记录或截图。

## 2026-10-19 收尾集成候选：完整既有分支与固定 Public19

只集成 main d42fe1d2、PR37 的原生浏览器登录回归、PR38 的六页设置与完整 local362a9b7；保真实 merge ancestry，不按功能片继续开 PR。知识/记忆等其余混合工作保持原位，不在本次顺手接通。唯一 BFF snapshot 固定已合 owner08a2120ea85b6cad5cf6e839ef14dbf83d908b92、Public19.0.0/165、SHA256955412b680bf7a2529c4c35f553ff272d7361769ea95bb441ba820b552ffc564；六个既有窄 generator 正规配对，connector-command-errors 独立 profile 不换 pin。

复用原测试历史逆证，在原 Public16→15.4→15.3 前增加显式 Public19→两个完整 Public16 父版本的逆 delta，保原全文 hash/语义与退役 MCP 写入口负控，不在生产兼容旧协议。接入已经交付并在正常开发环境配对过的 calendar consumer：来源逐路径绑定既有 app-public18 冻结证据，使用每周多星期、每月多日期、一次性 local_date、IANA timezone 和 owner next_run_at；不再消费已退役 recurrence_anchor_at。仅接收该既有切片所需源码、字典及测试，不 wholesale 导入混合工作树。

主干 archive receipt/权限/账户/分享与本地单一 per-scope Reader registry、MCP command provider/受控 Skills scope/刷新及 callback 围栏按语义并集。archive revision/receipt 进入原 Reader host，不再启动第二读者；稳定现 archive retry callback，展示层只接实际使用的归档操作和 busy，不保无消费者字段。旧测试 fixture 接真实 keyed Reader hosts，保原退休/真实 GET/归档断言；未弱化浏览器 Origin:null/CSRF/nonce/CSP/第二次登录。无新 owner、API、DB/Redis schema、网关或认证旁路。

最终冻结 f854962 的 Node22 正式门：contract 288 PASS、architecture 50 PASS、lint/typecheck/webpack build/构建后 types 全 exit0、完整 Vitest 225 files /4237 PASS /0 FAIL。原全部 Playwright 桌面与手机 38 PASS /0 FAIL /0 SKIP，0 retry、原超时；私有端口运行，正常服务不动。只读审查无确定 P0–P2。1080 输入停写校验无源码漂移，正常 App 原934输入保持原字节。

首轮完整门的4197 PASS/40 FAIL保留：两处Settings旧fixture补入实际ConnectorCommandProvider后102 focused PASS；另外38项连接失败在原完整RP90序列、只读进程观测下确认两次Next16.2.6开发worker在私有2GiB堆预算超过80%时exit77并重启。仅将私有验证运行器预算设为4GiB后执行最终完整门，不改生产源码、断言、timeout、skip或retry，不推断历史其他故障同因。

本轮是已交付功能和当前主线的源码集成验收，不代表Manus全站一比一或正常运行组合已激活。知识/记忆等未收到本切片的原mixed仍留原位，正常数据库/配置/服务保持不动，模型、实际工具与扣费仍暂停。

## SET51 登录表单真实 Next 回归已适配，完整门仍 FAILED（2026-10-16）

已重新抓取五个相关远端，主干与上一轮已合并结果相同；同事尚未合并的 Skills/连接器/侧栏分支保留。Web 基线 d42fe1d29e984fccabd1d4916afb534ff0450cab。仅修改两现有真实 Next 测试中的四个登录用例及必要 helper：原 HTTP 验证实际 GET 200 表单、唯一 CSRF、cookie 摘要、nonce/meta；真实浏览器验证 GET 安全头与签发 cookie、实际导航 POST 的唯一 token、摘要、原 cookie 回传、Origin:null、无 Referer、302/state。没有正文读取或导航拦截；原 CSP、新凭据表单、匿名安全壳、零业务 IO、次数、退出生命周期和期限全部保留。生产源、依赖、API/Schema、Skills/连接器及其余项目用例未改。

验证源码 c1b59f708440bacc24e3161f58dfcbc726d7c7cf，独立只读审查无确定 P1/P2、新秘密输出或成功标准放宽。Node22 实际 contract 284 PASS、architecture 50 PASS，lint/typecheck/build 均 exit0。首次完整 test：212 files，3719 PASS/6 FAIL，376.17 秒；四个登录用例全部通过，剩余六个原项目/侧栏用例为 R139、R192、R195×2、R231×2。完整 Playwright：25 PASS/1 FAIL，36.3 秒；24 个设置旅程全通过，失败仍为原手机项目链接超时。未增加 skip/retry、预热请求或预算，未重跑完整门寻绿。

原字节基线四例 4 FAIL/145 CLI 名称过滤；适配后的窄门曾出现 IAM provider POST 503，闭集记录为 rp_unavailable、无 Location/Set-Cookie、signin catch marker。私有阶段诊断四例通过且未复现 503，最终完整门亦未复现，因此原因仍未查明，不能宣称已修复该 503。期间被拒绝的正文采集/导航暂持方案已从最终源码删除。

各实际门的 PG/Redis 库存均恢复，冻结源码 hash 完全一致，993 个范围外 tracked 文件与基线 exact。最终只更新本段验证记录，测试及生产字节保持上述已验证版本；本地原服务与用户数据保留。完整项目门仍 FAILED，不等于完整产品或生产验收通过。
## 设置页第一版（2026-10-17；功能分支快照）

本版完善 Mail、邮箱、电话、钱包、集成、开发者六页内部布局，以及个性化知识/记忆导入弹窗、资料输入反馈和数据管理排版。保留既有资料读取与 CAS 保存；知识保存、记忆解析、资产创建、支付及 API 密钥等尚无正式服务的动作继续禁用并说明原因。技能和连接器业务未修改；部分非中文弹窗文案仍需补齐。

Node 22.22.2 / pnpm 11.25.0 下，contract 284、architecture 50、lint、typecheck、production build 通过。完整 Playwright 35 通过、1 失败；设置回归桌面与手机共 32 项全部通过，剩余失败为手机端项目会话的当前项目链接点击超时。

完整 Vitest 初次因 Redis 测试环境未配置而出现资源错误；复用现有 Redis 并明确测试地址后，第一版范围 3741 通过、11 失败（212 文件、3752 测试）。失败集中于本版未修改的 IAM relay 与 OIDC 原生登录/项目会话系统测试，本轮未定位全部根因，不能宣称全门通过。后续积分开户的未实现 RED 测试不属于此版，保留本地、未提交；没有删除测试、放宽断言或修改生产认证代码。

独立只读审查未发现本版 UI 的确定 P1/P2。按用户要求推送当前第一版快照，现有 PR 保持 Draft，不合入 main、不作为完整产品验收。后续继续完成正式积分开户链路、知识/记忆持久化和其他可实现的设置业务，并关闭完整回归失败。

## SET54-V1 同帧布局测量（2026-10-16；设置浏览器通过，完整门仍失败）

仅把原SET53说明和文档两个boundingBox采样改成一次同步evaluate内真实DOMRect采样，保持非空、y差≤1px、文档在说明右方及全部其余断言；不改产品/CSS/动画/超时。此处是对0fe3980旧E2E精确单块例外，不能沿称旧E2E全文前缀exact。原trace两次采样跨数毫秒且窗口在开场动画中，不把相关性当唯一根因证明。

最终完整E2E 33PASS/1FAIL，58.4s：SET53六项、SET54两项及其余设置全部通过；仍失败原mobile项目当前项目链接30秒超时。首次filtered repeat默认5workers有5项在工作区加载时找不到mail页、1PASS，保留原日志；同一冻结输入显式--workers 1重复desktop/mobile各三次共6PASS，21.4s，未扩大等待或改产品以掩盖失败。lint/typecheck exit0。Vitest明确排除tests/e2e，产品及Vitest输入相对0fe3980完全不变；不重复原3728PASS/10FAIL完整test，不宣新树重新跑全门。

只读审查无确定P1/P2；1测试/2Root文档以外1003tracked逐文件保护、PG/Redis库存恢复。验收后仅本文记录结果，冻结manifest a7a1e6adffd079a3a2e59c722f544cc5eed75eb65e9090fe1ac92b81cf6e41d8 的产品与测试哈希不变。保留同一Draft PR，不合入main；后台功能及总体目标仍未完成。

## SET54 More 原生键盘操作验收（2026-10-16；组件通过，完整门仍失败）

在SET53候选facd846上修复原生Enter/Space打不开More：现同一组件处理detail0原生激活、箭头首末项/循环/Home/End与禁用跳过、Escape仅关本菜单并回焦、选择回焦及外点不抢焦；window capture只处理最近所属Dialog，不拦嵌套Dialog。无API/数据/依赖/Skills业务变化。旧源码新增回归真实5FAIL；最终组件97PASS，原UI/E2E全文前缀精确保留。

Root最终冻结树验证：contract284PASS、architecture50PASS、lint/typecheck/build exit0；完整test3728PASS/10FAIL（3738全部执行，391.36秒），仍为两IAM及八RP登录/项目会话系统用例，未根因关闭。完整浏览器32PASS/2FAIL（约1分钟）；新增SET54两个project原生键盘旅程均通过，原SET53六项中五项通过，mobile说明/文档行测量得到y差3.7109375而门限1，另有原mobile项目链接超时。没有放宽布局断言，不能将该门描述为通过。正常已登录CUA稳定同帧中文宽屏测量y差0，只是额外诊断，不关闭英文mobile失败或证明根因。

冻结manifest SHA-256 bb29e36bca6ef5637dcce62538b3a16fbd79e2db5ec110106f5550761f86e841，3writer/5Root/998保护匹配，各资源门PG/Redis库存恢复。独立只读审查无确定P1/P2。owned本地预览仅热更新此菜单，未重启/重置服务与数据；CUA实际Enter/Space开菜单、末项循环、跳过电脑、Escape保留设置并回焦、Enter选择邮箱关闭菜单均验过。请求320px覆盖下截图实际291×818（当前浏览器缩放），E2E实际320px另已通过；临时视口已恢复为859×885。该预览仍为验收夹具，不代表六项后台接通。验收后仅本文补结果，产品/测试冻结不变；继续同一draft PR，不merge main，完整设置目标仍active。

## SET53 六个灰色入口补齐（2026-10-16；页面完成，完整门仍有失败）

基线主线 d42fe1d29e984fccabd1d4916afb534ff0450cab，交付前核对远端未前移。Computer Use 实际查看 Manus 当前 Mail、邮箱、电话、钱包、集成、开发者六页；本轮已将六个灰色入口补为可进入页面，含导航/深链/搜索/compact More、Mail 设置/收件箱及开发者 API 密钥/Webhooks 局部页签。电脑仍禁用，Skills/MCP 业务排除。BFF public16 当前没有这些资产管理 API，未伪造邮箱地址、号码、密钥、余额、连接状态或无资产结论；创建/授权/绑定/连接/文档等无正式服务的动作明确说明并禁用。此处完成的是页面，不是六项后台服务。

真实 E2E 先发现 320px More 的 body portal 位于 Dialog 焦点范围外，导致键盘选择无法关闭菜单；保持失败断言，仅将现菜单归入所属 Dialog 并转换定位坐标。CUA 又发现 Webhooks 换行及页签竖滚动，修正限于新服务页 CSS，实际文字行数/几何/无溢出断言保留。最终 25 writer/7 Root 文档/974 protected；只读审查三轮无确定 P1/P2。

最终修正树：设置 UI 92 PASS；contract 284 PASS；architecture 50 PASS；lint/typecheck/build exit0。构建最初两次被本地复用依赖的软链接越过 Turbopack root 拒绝；仅将现锁定依赖克隆到本 worktree，并将三个 workspace 链接等价规范化为本地相对路径，随后正式 pnpm build 通过，未改依赖、lock 或 Next 配置。最终浏览器 29 PASS/3 FAIL；新增六个 SET53 desktop/mobile 用例全部通过（320/1600 导航键盘及 320/856/1600 文字布局）。失败为原 SET36 两项目在编辑快捷键按钮可见前的工作区加载超时，以及原 mobile project 链接超时，尚未归因，不宣称全门绿。修正前完整 test 为 3723 PASS/10 FAIL（411.28s，212 files，全部3733用例执行）；失败集中于 IAM/RP 登录跳转及项目会话系统用例。该完整结果对应修正前冻结树，未冒称最终键盘/CSS增量已重跑完整门。更早首轮 3649 PASS/3 FAIL/81 因 beforeAll 失败未运行的结果保留，不能当作81通过。

最终冻结 manifest SHA-256 0e3bf8caeb675deed3de149891f25ba8c8fe786b542625a653d63a2df805d3a6；各资源门前后 PG/Redis 库存恢复、源码哈希匹配。验收后仅 CURRENT 更新结果；产品源及测试保持冻结。现有 owned 3313 隔离验收实例经 HMR 接入最终页面及菜单，无服务/数据库重置；正常已登录 Computer Use 实际打开六页、切换两组局部页签，并在320px用 Enter 从 More 打开邮箱且菜单关闭，随后恢复默认视口。该实例仍是本地验收夹具，不能冒称全部后台服务或生产可用；3311/3312未部署或重启。本分支交付 draft PR，不合入主干。

## SET49 最新主线整合验证与交付（2026-10-16）

本分支已合入最新抓取主线dcd0c836564ed024250c255b8edfc83070c292a1，保留主线登录回调、导航header、项目链接及提交失败展示，账户/设备/Team/搜索/个性化CAS/分享/归档仍完整接线。Skills/MCP/hub业务源码与该main完全相同；本次只整合设置宿主与正式固定消费者。消费BFF正式30df0c428c592ed2710d62035ceb5855d20c7506/public16.0.0/146，全文SHA-256 b4e91483e425fdcc9547eac8bcda554273cbee0863ccb0ddfb185fae18e4e267，六正常生成入口及历史inverse原oracle通过。

最终门：focused9files321PASS，contract24files284PASS，architecture50PASS，lint/typecheck/build均0。完整test212files3715PASS/10FAIL、366.368秒；失败只在两实际Next登录/RP系统测试文件，当前仍未关闭，不把200/302或proxy状态的不同擅自归因为旧故障。浏览器25PASS/1FAIL，24设置旅程全通过；失败是主线新增mobile project链接超时，原字节最新main独立fixture同样3PASS/1相同FAIL。原参数化复制负控全部保留于app-frame-rail；SET36/40/41/42/47浏览器原marked区域完整迁入settings-regression，主线退休旧大套件删除生效。

冻结manifest357572ffc5e86ccc93d9e740b5e2131e81326c825952ada5484831c8564beb74覆盖1000files；独立审查hash exact、无确定P1/P2；本次最终测试源码全量hash exact且PG/Redis库存恢复。最终交付只在这些门后更新本CURRENT记录。完整门仍FAILED，原PR保持draft，不merge main。正常3311/3312仍跑此前源码，本次Git push未部署或重启它们；不把预览旅程说成正常已登录非空任务/支付/完整Agent验收。下面SET49中间树结果仅供追溯，最终以本段为准。

## SET49 整合验证进行中（2026-10-16）

已合并初次抓取主线bd2bf510与设置bb3bc5a。该中间树完整test为3822PASS/115FAIL，377.5秒，冻结999files；资源库存与源码hash完全恢复。纯contract初轮283PASS/1旧全文pin断言FAIL，typecheck发现测试RTL exact属性不合法，两处已窄修，尚未据此宣称完整门绿。

验证期间远端主线更新至dcd0c836，已抓取，后继立即合并其登录回调/rail修复及已退休测试文件删除，保留本分支SET36复制与SET40/41/42/47设置保护。不可把该中间115失败视为最终版结果。最新主线独立UI基线194PASS；此前bd2侧栏43PASS/18FAIL仅证明旧抓取时的基线。

## SET47 真实归档/恢复消费者（2026-10-15；源码与浏览器回归已验，完整门FAILED）

基线Web b979cc946166df9e8d75ecdb3d958239aa286e55，固定消费BFF53f222ec41500d7a608da0c221a4695c402ff678的public15.4.0/150原字节，SHA-256 87186311e67eeebcd5f27d7974326186e1912de49d18d4d524a0bcbc940a0817。任务菜单归档、Data本人分页与恢复、独立archive revision和active状态GET已接线；旧ACK只压过更早读取，post-ACK状态/列表可覆盖；真正尚未持久化draft有同步provenance，列表/状态/成功回执或owner snapshot证明后退休，后续404不合成已删除任务。归档不删除、不清engine、不取消Run、不撤销Share。预览/未可信准入不发archive IO；unknown不自动重写，权威重读后需显式继续。点段历史ID禁用并展示理由，合法历史Unicode保留。技能/连接器业务未改；原测试全文prefix、超时、skip保留，相关声明与owner全文inverse分别核验。

Node22.22.2实际结果：相关9文件253PASS；contract284PASS（含正常generated检查）；typecheck、lint、build exit0。architecture此前单独50PASS，最后与Turbopack构建并行时49PASS/1既有ScheduledTask扫描用例5秒timeout（原日志保留，不改timeout、不冒全绿）。新增framing三例、preview/未准入两例、持久化provenance三例、archive布局class一例与可见点ID理由一例均保留真实RED和修后日志；旧machine首次创建证明两例RED沿用原交接证据。system新例当前为handler/依赖替身，不能冒称真实Next或IAM端到端。Root完整pnpm test实际4124PASS/8FAIL（251.31s；执行收据252.054s），失败为5项既有Skills/MCP/全局翻译及3项HTTPS代理RP auth503，后者仍未归因；无新增归档用例失败，不以未再现关闭此前instrumentation/welcome问题。完整Playwright42PASS/4原SKIP（47.7s），新增4例仅证明preview无归档IO、键盘和边界，不冒真实mutation。93writer/881protected对941基线、九locale完整逆恢复、五原测试全文prefix、owner公契约全文及15.3完整逆恢复均exact，资源库存恢复；冻结源码独审无新增确定P1/P2。验收后仅本CURRENT更新实际结果，业务源与原oracle不变。正常独立实例登录及Data空态另验；旧实例及其数据库/session保留。完整门FAILED、PR仍draft，仅可回退本地候选，不宣完整产品或生产验收。

## SET46 设置内用量资源分类（2026-10-15；D0）

基线aa2e02a，实际Manus当前用量页有任务、网站与游戏、电脑、电话四类，本地尚缺分类。Root唯一writer；现BillingScopedContent只在embedded+已准入时使用既有Tabs固定任务为活动面板，其余三类disabled并关联可见本地化说明；原summary/ledger内容与读取生命周期、独立BillingPanel不变。现TSX/CSS+九locale共11writer，4文档/926保护，无新文件/模块/状态/API/schema/依赖；Skills/连接器不改。不新增镜像实现的低影响文案测试，所有现测试原字节保护；相关既有测试及完整门、独审、真实运行副本和正常CUA逐项验证。单台服务器不是这些能力永久不可实现的理由；它们当前没有已接入的服务契约。

只读owner复核确认：当前Billing没有正式零余额开户入口或注册事件消费者，不能为页面展示调用正额grant或旧entitlement账户路径。当前正常账户如实显示尚未开通，付款仍禁用。上一轮SET45已完成本地与远端候选接入，完整4055PASS/5既有FAIL，Goal active。

SET46验证：相关既有用例276PASS/2既有FAIL；contract283、architecture50、lint、typecheck、build通过。完整4052PASS/8FAIL（228.43s），较SET45新增两项登录503及一项instrumentation采集超时，均未归因；完整门仍FAILED。Playwright38PASS/4原SKIP（39.7s）。原版六例原字节序列6PASS，候选4PASS但IAM readiness失败致两例未执行；该结果不能做等价通过比较。私有诊断首轮IAM collection语法失败仅4PASS，不算行为证据；修正仅私有诊断包装、串行fixture后6PASS/143 CLI过滤（43.49s），无503再现，不构成根因修复或全门通过。正式源码及全部原测试未为诊断改动，11writer/4文档/926保护哈希exact，资源库存恢复。独审无确定P1/P2，仅接受保留回退点的本地候选；实际运行同步和正常认证CUA另验，Goal active。

## SET45 侧栏快捷键预设对齐当前参考页（2026-10-15；代码验证完成）

基线6cd51d9。正常Computer Use当前Manus显示切换侧栏为primary+period，本地预设源码仍为primary+B；未在参考账户执行重置，不将当前绑定冒称其全局默认。仅现keyboard-shortcuts.ts的sidebar预设改为period，用于无已存配置及显式重置；所有已存三字段/四字段绑定保持，零自动迁移。Root唯一writer，3writer/3Root文档/935保护，无新源/API/schema/依赖，Skills/连接器不改。两现test只调整三个明确依赖新预设的旧断言/事件，追加一个真实Sidebar保存B→重挂保留→显式reset→period触发/B不触发旅程；其余旧测试字节、超时和skip不变。旧source真实RED20PASS/4FAIL；候选相关227PASS，contract283/architecture50/lint/type/build通过。完整4055PASS/5既有FAIL（240.39s），Playwright38PASS/4原SKIP（38.0s）；完整门仍FAILED。共享资源恢复、最终三源/测试及935保护哈希exact，独审无确定P1/P2。验收后仅更新三份文档的结果与空行，未改被验代码；实际运行副本同步与正常CUA另行记录。

SET44正常邀请创建/刷新/撤销，以及个性化四字段、多行和双标签冲突的两个选择均已实际验证并恢复原资料；本地IAM无SMTP，重发只验证无错误与pending保留，不声称邮件交付。当前正常Agent关闭；实际测试消息失败、刷新无持久任务，分享撤销仍未实测。Agent真实调用授权消费者缺失，现临时launcher停止会清理其IAM/BFF事实，不为本片重启。此前RP-auth503、instrumentation/welcome偶发失败未根因关闭。PR仍draft，Goal active。

## SET43 已撤销会话资料读取候选（2026-10-15；代码验证完成）

正常设备移除后的资料503已真实复现；现只将可信BFF401 session_invalid映射既有401 account_profile_session_required，其它依赖故障保持503。原200、callback/refresh策略和全部原测试未改。新增真实HTTP18例先16PASS/2预期401实际503，再修3个源文件；前两轮仅collection失败不算行为RED。4writer/930保护/Root7全部逐文件核对，独立审查无确定P1/P2。

Root相关211PASS；contract283/architecture50、lint/typecheck/build通过。一次必要原完整test4054PASS/5既有FAIL（223.67s），此前3项proxy503本轮未复现但根因未关闭，早前instrumentation/welcome亦未根因关闭。完整门仍FAILED，PR维持draft。原完整Playwright38PASS/4原SKIP（35.1s），两门库存恢复，全部源与原测试字节保护。E2E第一次未启动用例：系统旧Python不支持tar filter；改用已有3.12后正式运行，原失败保留。

仅接受可回退本地候选；Root另核实际运行副本与正常登录的独立新会话撤销，HTTP fixture不冒称真实IAM端到端。先前自有会话已触发本地失效检查，其后来401不能证明本次修复。Skills/连接器、owner API、scope、schema和会话清理不变。Goal active。

## SET43 已移除会话的账户资料读取（2026-10-15；D0，先真实HTTP负控）

测试夹具补充：GET不执行的Auth.js agent factory因server-only导入需空stub；身份准入与requestWithDomain仍是真实HTTP。前两轮仅collection失败，不算行为RED。

基线Web6880ec4。正常CUA退出→IAM确认→登录页、匿名/app被送回登录、原测试账户重登及资料恢复已通过。独立HTTP客户端按现正式登录表单创建自有会话，CUA取消后保留、确认移除后列表消失；旧cookie读取sessions为401 session_invalid，但profile持续503 account_profile_admission_failed，auth/session GET仍是本地200投影。根因是profile将在线identity的全部错误统一503；这是本次可重现读取映射问题，不是SET40未归因proxy503的根因。

runtime_audit唯一产品writer，Root设计/文档/资源/审查/Git/接入。现product-identity只对已配置BFF /v1/me的401、严格error/meta闭集及session_invalid、非空message、本次outbound ID同时绑定x-request-id与meta.request_id、JSON精确media type、no-store且无Location/Set-Cookie，抛具名ProductIdentitySessionRejectedError；16KiB/5s/取消保留，401正文解析后复核signal。标准JSON解析后做结构校验，不宣称raw重复键防护。其余错误及原200验证保持。现account-profile catch先check()，仅此instanceof→401 account_profile_session_required，其余503，零userinfo回退。

先只准新test，全部原tests和product源码字节保护。Root在旧source跑新test得真实RED，再准上述3source；4writer（2既有+2新）/930原tracked保护/Root7。测试覆盖正确401、错误ID/额外键/缺no-store/重定向或cookie/畸形JSON/其他401码与503仍依赖故障、200成功及userinfo调用计数。原断言/超时/skip/阈值不改。修后focused含identity/profile/provider/auth与原Next用例、contract/architecture/lint/type/build、一次必要完整test与E2E串行；继承原失败诚实区分。Root核实际运行源和正常撤销会话再访问401。Skills/连接器与IAM/BFF源码不改。

## SET42 任务发送行窄屏排版（2026-10-15；D0）

基线ba975fccf1497d403e70e5221f8d7126a9491060，2writer/930保护/Root7；SET41主题已正常登录CUA测得实际320三项边界完整，352实点浅色→自动并刷新保留。现补SET41截图发现的320英文禁用发送行文案重叠；先RED再局部CSS，不重复修改主题/容器规则。完整门仍FAILED，SET40新增失败根因未关闭；诊断在私有不可变副本进行，不改正式源或oracle。

## SET41 主题窄屏裁切局部修复（2026-10-15）

主题选项允许换行，General现Radix内容table固定布局，语言选择不超过容器；仅2个CSS，既有E2E追加6个实际case。3writer/929保护/Root7、两个CSS整体逆恢复和原测试完整prefix exact，独立审查无确定P1/P2。首探6PASS因逐项滚动掩盖默认裁切，记录保留后修新oracle；旧CSS准确2PASS4FAIL15.1s。V1全E2E30PASS2个320pxFAIL4原SKIP31.0s；V2保持新旧断言，32PASS0FAIL4原SKIP38.4s，库存恢复，1280/390/320六张截图已实际检查。contract283/architecture50/lint/type/build通过。纯CSS/E2E变化未重跑完整pnpm test，继承SET40的FAILED门，5旧及3新增proxy503未归因，早前instrumentation/welcome根因亦未关闭；不称全仓通过。实际部署和正常认证CUA将在接入后单独记录。

正常已登录SET40搜索CUA已通过：昵称/通知父子结果与跳转、保留query/按钮focus、无结果保持当前内容、清除回焦。窄屏实测355px，专用E2E另有真实390px，不混称尺寸。单次热态输入调用35ms、点击到标题162ms，含工具开销且不含资料GET完成，不是性能基准。已恢复中文/自动/空query/General，Skills和连接器业务不改。320截图另见禁用任务发送行挤压，后继窄修另行处理；Goal active。

<!-- SET41 V2 D0: SET41 V1全E2E30PASS2FAIL4原SKIP，390已通过、320父级Radix table仍撑宽。补充D0为3writer/929保护/Root7：现modal CSS只限General table-layout:fixed，现sections CSS主题换行及语言select max-width100%；冻结原追加测试保持，不改oracle。 -->

## SET41 主题选项窄屏可达性（2026-10-15；D0）

基线cfdb9d9120c489e8d9b379b957c6213db0be153d；SET40为本地候选/草稿，完整门4033PASS8FAIL含3新增未归因proxy503，早前instrumentation与welcome失败亦未根因关闭。现634文件已实际同步正常实例。SET41仅2writer/930保护/Root7；先tests-only补1280/390/320真实radio+label几何及操作、刷新，再现CSS flex-wrap，原E2E全文prefix保持。不改Skills/连接器。

## SET40 具体设置搜索本地候选，完整门仍未通过（2026-10-15）

对照 Manus 实际搜索：昵称/通知返回所属页面与匹配子项；仅父标题命中时不带无关子项。一个搜索输入、原生按钮、清除回焦、无结果提示、query/结果焦点保留；只索引静态可见标签，无私有值、隐藏对话框或 Skills/连接器子内容。灰色入口仍不可操作；移动端搜索首行横跨两列，结果有界滚动，原图标导航与内容明确落第二行。九语言只新增两键，旧值与整文件逆恢复 exact；两个旧测试全文 prefix 与冻结 suffix exact，916保护、Root8一致；额外现shell源协调设置初始handoff，已在modal内的焦点保留。

Root旧source原69PASS，新19为18FAIL/1PASS，原69被CLI过滤未跑；最终Root独立88PASS。contract283/architecture50、lint/type/build通过；i18n99PASS/2既有FAIL。最新完整test 4033PASS/8FAIL，214.25s：5既有失败，新增3项proxy RP auth503尚未归因，不当作旧失败。隔离Playwright桌面与手机共26PASS/4原SKIP，31.7s；两门资源库存恢复，四张新搜索截图保留。V1完整4035PASS/6FAIL有新增instrumentation采集超时；V3首次4034PASS/7FAIL还有新增欢迎页项目路由失败。原全量复验两项未复现，根因均未关闭。不可变f82完整4017PASS/5FAIL；原与候选四case序列各4PASS/77 CLI过滤；同一原欢迎页case两版各PASS；私有诊断副本3959PASS/5旧FAIL/77 CLI过滤。这些局部结果不替代全门。全部原始失败保留，完整门FAILED，只允许明确记录风险、可回退的本地试用与草稿提交。独立只读评审未发现确定源码直接回归证据，但不能排除间接影响。V1/V2 E2E均24PASS/2手机焦点FAIL/4原SKIP；V2 Modal guard未解决且已撤回。V3修现shell每settingsTab变化的同步与rAF handoff，保留modal内焦点；原断言保持后复验通过。

正常 Computer Use 已恢复。实际启动器把 Web copytree 到临时 Next 根；此前仅更新 Git 与 receipt 不能证明运行代码更新。Root已备份并将已接收SET39全部634个src/public文件对齐运行副本，保留配置、注入路由、同一PID与登录；刷新实际看到新版个性化。昵称、主题、语言、快捷键实际修改/刷新/恢复通过；此前旧副本上的账户/设备/团队/分享读取证据单独注明。SET40接入后仍须再核对运行副本与正常搜索；Goal active。

## SET40 V3 设置内导航保留焦点（2026-10-15）

V1/V2真实E2E均24PASS/2相同390px焦点FAIL/4原SKIP；Modal延后初始focus guard未解决，撤回该尝试。现shell use-app-frame-overlays 的 effect 随每次settingsTab改变同步及rAF强制focus原tab；桌面搜索rail隐藏，手机可见，因此会覆盖仍存在的结果焦点。Root是唯一writer，扩展一个既有shell源文件，15writer（13source+2冻结tests）/916保护/Root8，无新文件/依赖/owner。现INDEX记录shell归属。

保留命令菜单→设置的初始handoff；同步和rAF各自先检查当前focus是否已在现settings-modal内，已在内部则保留，否则只在该modal内查对应tab并focus。关闭返回、原Tab/键盘/Skills/连接器流程不改。Modal恢复V1仅透传selectTab。禁止把结果无条件focus或隐藏手机rail；原两测试字节冻结。完整旧shell测试、focused88、lint/type/build、独审、原四case instrumentation对照、full/E2E和正常CUA验证后才接收。V1完整test新增采集超时仍未归因。

## SET40 V2 移动端搜索焦点修复（2026-10-15）

Root真实E2E V1为24PASS/2新FAIL/4原SKIP：两个390px项目从搜索结果Enter导航后焦点离开结果。保持原oracle不变，只放行现Modal初始自动聚焦回调的所有权保护；先核对trace和浏览器，再防止延后初始聚焦覆盖用户已转移的焦点。不得把结果无条件强行focus、禁用原iconrail、改timeout或放宽断言。单独全量test还发现1个新观察instrumentation采集超时，仍未归因，不称旧fail；Root串行复验。

## SET40 设置字段搜索源码阶段放行（2026-10-15）

Root 在旧 source 独立执行原69项全PASS；新19项18FAIL/1PASS，69项被CLI过滤未跑。缺失字段结果、父子导航和空结果提示构成真实RED；原测试完整前缀不变。源码范围12现文件，其余917保护，两test冻结。普通本地已登录 Computer Use 已恢复，账户资料、登录设备、团队成员/邀请、已分享任务空状态实际读取成功；积分账户未开通显示真实状态。

## SET40 具体设置项搜索（2026-10-15；D0，先tests-only）

基线Web f82c891965f80eed9ff0c022d3f77b39bdbad42e，939 tracked clean。Computer Use实际Manus：昵称→个性化+昵称、点child切页并保query/结果焦点；通知→通用+浏览器通知；仅菜单名命中只parent；无匹配未找到结果、当前内容不变。现仅菜单过滤且强留selected，窄屏隐藏search，存在明确功能缺口。

runtime_audit唯一writer，Root设计/审查/放行/Git/资源；最终12现source+2现tests/917保护/Root8，无新文件/依赖/契约。现Navigation维护闭合静态标签索引和唯一search DOM/query；Modal仅透传现selectTab。非空query只显示命中parent及匹配child，不把selected当命中；parent仅名称命中时无不匹配child；结果普通button/列表，不伪造第二Tabs或combobox，点击仅现selectTab，不自动focus/写偏好/执行灰操作。全query按literal includes，React片段mark；折叠前后长度变化时退普通原文，不用错索引切片，不注HTML。无结果本地化status；clear具名且focus回唯一input。输入不拦IME，键盘用原生Tab/Enter/Space。

单Input/结果位于Nav toolbar。desktop原flex，search时toolbar flex1/min-height0，结果自身滚动，原tabRail仅CSS display:none退出可访问与键盘树而保持挂载/原ID；content和Tabs关系保持。<48rem nav display:contents、brand隐藏；layout第一行跨两列toolbar，右留close入口，结果max-height:min(30vh,12rem)滚动；第2行52px原iconrail与content显式grid坐标，iconrail保留且不受query过滤。无portal/新dialog/第二份搜索DOM。

索引只来自已有可见静态设置标题/字段/开关：账户、通用、快捷键、个性化、数据管理、帮助，以及已有团队/Billing可见静态章节。值、草稿、成员、余额、隐藏dialog/预览演示、无导航chat页均排除；Skills/连接器仅保原菜单名搜索，业务与child排除。禁用菜单匹配仍是aria-disabled说明，禁用卡片项只导航其已有页不启用操作。九locale只加settings.searchClear/searchEmpty两native值，原locale值不变、各一marked块可整体逆向。

先仅两现test追加marked区块，旧全文prefix保护；929其余文件（含全部product source）冻结。Root运行旧source的新例真实RED，保原modal基线，再授12source。新例覆盖字段/菜单/多结果/无结果保持当前页/clear/focus/locale更新/literal不注HTML/灰操作不执行；现E2E追加真实桌面与390px搜索、键盘、长结果独立滚动、无横向溢出、close可达及query保留。测试不降低原断言/timeout/skip；正常认证CUA另列，隔离工程Browser不能替代。实现后worker focused/i18n/contract/arch/lint/type/build，Root独审逆向+full/E2E串行及资源库存恢复，所有失败真实报告。Goal active。

| 现文件 | 本次职责 |
| --- | --- |
| settings-navigation.tsx | 既有设置导航、静态child索引与唯一搜索交互 |
| settings-modal.tsx | 仅传递既有selectTab回调 |
| settings-modal.module.css | 唯一搜索DOM响应布局及结果可访问显隐 |
| 九个既有locale | 两个搜索反馈native值 |
| 两个既有test | 追加用户行为与真实布局证据 |

## SET39 英日文实际设置缺译已接收（2026-10-15）

英文补用户ID复制成功、个性化读取失败/冲突三键，日文补现禁用导入按钮的一键。Root实际执行模块并与独立审查交叉核对：en1772→1775/1804，ja1721→1722/1804（均含既有fallback，非native完整度），旧值和完整原文件逆变换exact，930保护文件含全部tests与产品行为源保持。i18n99PASS/2原FAIL；lint/type/build通过；纯4值变更未重复contract/architecture/full/E2E，SET38/SET36既有证据独立保留。Goal active，正常认证Browser尚未验。

## SET39 英日文实际设置缺译（2026-10-15；D0）

Root接收SET38后作为此小切片唯一writer，仅en.ts补复制用户ID成功、个性化读取失败/并发冲突3个已有key，ja.ts补生产禁用导入按钮的导入1个key。与billing_scheduler_audit只读调用点复核一致；不修改任何旧文案、界面行为、回退算法、门限、依赖或测试，Skills/连接器排除。2 source/930保护/Root7。每locale一个标记块，删除整体恢复原文件。

纯文案不新增镜像测试：Root执行实际模块核对旧值/新增key/完整文件逆变换，既有i18n、lint/type/build；contract/architecture和完整/E2E不因4个native值重复，继承SET38/SET36证据并单独标注。独立审查后精确路径提交并接入同一实例。正常认证Browser仍需单独验证，Goal active。

## SET38 六种语言实际设置文案已接收（2026-10-15）

ko/es/fr/de/pt/ru各补15个既有设置key的native值；Root实际执行locale模块、独立语义复核及整文件逆变换确认全部旧值不变，926保护文件（含全tests、产品逻辑）和Root7匹配。六种实际OVERLAYS均1676→1691/1804（93.7361%，含共享English fallback，不是native完整率）。i18n99PASS/2既有FAIL（MCP硬编码及ko覆盖不足95%）；contract283/architecture50/lint/type/build通过。未修改算法、门限或Skills/连接器。纯文案变更不重复完整/E2E，SET36的4017PASS/5FAIL与22PASS/4原SKIP证据独立保留，不冒称为本commit重跑。

正常认证Browser仍未验，Goal active。SET37的真实refresh-before-token原case独立1PASS/0FAIL/80 CLI filtered，16.35s，固定manifest元数据诊断并未复现此前500，也不构成根因修复。

## SET38 六种语言的实际设置缺译（2026-10-15；D0）

基线Web 76a42c2e574eda12b86d97eaaf30d1bad3380068，939 tracked clean。runtime_audit唯一writer仅现ko/es/fr/de/pt/ru六locale，926文件保护/Root7；所有tests和产品逻辑字节不变。

每语言只补15个有实际设置调用点的native值：资产/电话/钱包灰菜单标题，个性化读取失败/冲突，账户ID复制成功，任务发送标题/排队说明/排队选项，快捷键保存失败/非法/冲突/帮助/语音不可用/取消。保原中文语义和全部原语言值；SET36 copy-link新key不重复，预览专用身份验证/邮箱/密钥演示和无调用点文案排除，Skills/连接器不改。每locale一个标记块，移除后整体逆恢复原文件；不改回退/覆盖算法/阈值或加英文灌水。

纯本地化值不新增镜像测试；执行既有i18n、contract、architecture、lint/type/build，Root独立native语义及实际模块key集/全部原values/逆变换核对。覆盖数含共享英文回退，不是native翻译完整度；六语言此前1672/1800，单加15仍不足95%，以SET36后最新实际模块值重算，不冒称全覆盖或门禁已绿。正常认证Browser验证另列；Goal active。

## SET37 刷新早期失败诊断已接收，继续六语种缺译（2026-10-15）

现OIDC实际Next测试仅原refresh前及意外早response后采已有固定名单metadata，早分支用现净化nextFailureDiagnostic。两个marked块+唯一表达式逆恢复完整原318631bytes；全部产品源/原断言/race/count/timeout/fixture/cleanup/932保护/Root6精确。lint/typecheck全0，独审无确定P1/P2。

Root实跑同一原pending-refresh case1PASS0FAIL/80CLI过滤未跑，16.35s，库存exact恢复；本次未复现，不称原500/JSON parse已修复或根因确定。新增metadata读可能影响时序，750ms只限等待不取消底层IO/无文件字节上限，文件摘要变化仅关联。SET36全4017PASS5旧FAIL/桌面手机22E2EPASS4原SKIP的产品源码证据保持，不为测试诊断重复完整回归。继续SET38现六locale实际15key缺译，正常认证Browser仍受既有错误页URL策略阻断；Goal active，Skills/连接器排除。

## SET37 登录刷新早期失败诊断（2026-10-15；D0）

基线Web 01780925f62f5cdf2552567d8f97d0c0ee85abc5。runtime_audit仅改现OIDC实际Next测试；932文件保护，Root6文档。产品源码、原race/count/oracle/timeout/fixture/cleanup均不变。

现pending-refresh例在refresh token fixture收到请求前已返回500 HTML、Unexpected end of JSON input，与SET20/28/35观测签名一致，但尚无根因。仅在本例启动refresh前及意外早返后调用已有nextManifestMetadata，并把该早返分支转为已有nextFailureDiagnostic。固定名单、摘要/size/json-validity及既有净化parse/request诊断，不记正文、cookie、凭据、任意路径或原始异常。不新建诊断框架/依赖、重试/请求或修改业务逻辑。新增I/O可能影响时序，metadata的750ms截止不代表底层read取消；文件变化仅关联证据，须parse来源与摘要相符才能确认根因。

新增标记块+显式微替换须整体逆恢复原测试文件，保留SET32/33全部逻辑。worker仅静态纯门，Root独立审查逆变换及输出后，实跑同一原case，显式verbose/silent=false，使用已拥有的隔离fixture并核共享库存恢复。若PASS仅表示本次未复现，不宣称已修复或整体native稳定。正常认证Browser另待验证；Skills/连接器不改，Goal active。

## SET36 复制当前任务链接已接收，继续诊断与缺译（2026-10-15）

现快捷键新增复制当前任务链接，primary+Shift+L且仅打开的同源真实任务可用；旧三项值与默认不变、旧数据读零写、碰撞只禁新增默认。设置支持编辑/清除/重置；动作检可信准入、owner meta、hydration、实际唯一conversation及当前选择，复制仅正规需登录URL，不创建share。独立owned attempt/synchronous engine订阅永久退休中间选择变化、旧finally及3500ms timer不影响新attempt；反馈不挡指针。

Root原126PASS、新28旧source真实14FAIL/14PASS；终态独立154PASS，contract283/arch50/lint/type/build全0，独审确定P2已关闭。四旧test完整prefix/九locale整体逆变换及旧值/914保护/Root8精确；新增测试仅修告警目标、动作时路由和类型擦除夹具，历史失败保留。完整test4017PASS/5此前SET35已观察case标题FAIL/0SKIP，209.92s；隔离Playwright桌面+手机22PASS/0FAIL/4原SKIP，22.2s，真实设置持久化及剪贴板各有截图，两门库存exact恢复。正常认证Computer Use仍受既有浏览器错误页URL策略限制，未冒充完成。继续SET37刷新早期错误诊断、SET38六语言实际设置缺译；Goal active，Skills/连接器排除。

## SET36 源码阶段放行（2026-10-15）

Root独立原source运行原126项全PASS；修订后的新增28项14FAIL/14PASS，126项CLI过滤未跑，缺失map演进、设置行和真实Clipboard行为构成RED。四现test完整旧prefix保持，改动仅新增测试；源码实现范围仍为既定13现文件，其余914保护，四test冻结不再编辑。新反馈目标避免无关project alert，pending route与selection一致但不声称独立隔离hydrating/meta两守卫。原整批welcome路由单次波动未归因，负控在无功能旧source上PASS不证明实现。

## SET36 复制当前任务链接（2026-10-15；D0，先tests-only）

基线Web 97a6d9694cf9e52d54c50d516fac7cde2889bcf1，939 tracked clean；runtime_audit唯一writer，最终13现source/4现test/914保护/Root8。先仅四现test可追加，927其余字节保护。Root方案/docs/独审/原source RED/Git/资源与正常激活。

Computer Use真实参考页有复制任务链接及“当任务打开时”提示，当前缺失。扩现shortcut map与Card/AppFrame动作边界，不建模块/API/分享/依赖；默认primary+Shift+L，旧三默认与全部保存值不改。schema原三仍required/strict，仅新增copyTaskLink输入可缺省、输出统一四项；旧map读零写且raw缓存引用稳定，新默认撞旧binding则仅新增项留空，显式reset才重置。只新增精确primary+Shift+L且无Alt的valid例外，原primary+L及其它保留组合仍拒绝。

按键处理沿原输入/弹窗/repeat/IME/defaultPrevented防护。复制前action-time检实际chatHref同源再取path，或sessionScope精确projectpath；单conversation query等于current engine activeId，!hydrating、可见thread及owner snapshot/session.created提供的thread.meta，空占位不复制。preview须明确且仍非空；正式需可信admitted subject/generation及marker一致，marker不能授权。构造仅origin/path/conversation的正规登录任务URL，删除设置hash与其它query，不创建公共share。copy独立owned action/ref防在途重复；主体/代际/路由/当前selection退休同步隐藏反馈，非合作迟到不复活；缺Clipboard/reject显示失败，只有真实resolve且仍current才显示成功。可用现shell CSS新增小token化状态，原几何/flow不变。

原四测试全文prefix保护，仅追加marked blocks；先Root原source真实RED验证缺row/任务复制/旧map演进等业务断言，再授source。覆盖direct/project正规URL正控、旧三field/碰撞/坏数据/stable reference/零读写、edit/clear/reset/失败、primary+L负控、空任务/未准入/换代/错路由/重复query/输入弹窗/repeatIME零调用、Clipboard失败与迟到，share client零调用；原断言不减。E2E追加现governance真实isolatedChromium设置持久化和可行Clipboard路径，不替代正常认证Browser；worker纯门、Rootfull/E2E串行且库存exact恢复。Goal active，Skills/连接器排除；SET35完整3988PASS6已观测FAIL/20E2EPASS4原SKIP保留。

## SET35 实际设置日文缺译已接收，SET36继续（2026-10-15）

现ja.ts只新增十四个实际调用设置key，删唯一块精确恢复原93843bytes；旧值/931保护含全tests及其它locale/Root7全核，独审无确定P1/P2。Root实际执行模块确认Ja1703→1717/1800（95.3889%），包含共享英文fallback，不冒称日语完整；i18n99PASS2FAIL，原MCP硬编码与同一覆盖循环现暴露ko1672/1800不足，未改算法/阈值/其它locale。contract283/architecture50/lint/type/build全0。

完整test3988PASS/6此前已观察case标题的FAIL/0SKIP，214.52s，scheduled日期case已通过；Playwright20PASS/0FAIL/4原SKIP，20.9s，两门库存exact恢复。正常认证Browser仍未验；接续SET36补参考快捷键的复制当前任务链接，禁止空任务/退役页面复制与误报成功，不创建公开分享。Goal active，Skills/连接器业务排除。

## SET35 十四个实际设置日文提示（2026-10-15；D0，仅现locale）

基线Web 3f97368ef38c9cea4c88d53ad29e61b83a8716eb，939 tracked clean；runtime_audit唯一writer仅现src/i18n/ja.ts，931保护/Root7。Root设计/docs/独审/Git/资源与实际回归；全部tests与其它locale/产品逻辑字节保护。

只添加十四个有实际调用点的设置日文key：灰菜单资产/电话/钱包，个性化读取失败/冲突，快捷键取消录制/冲突/帮助/非法组合/保存失败/语音不可用，任务发送标题/排队说明/添加队列。保现中文语义与全部原日文值，不触碰技能/连接器文案、不补无调用点personalizationSaveFailed、不改覆盖算法或95%阈值。新块边界标记，去除后须完整逆恢复原ja.ts。

既有OVERLAYS.ja实际运行key集为1703/1800，其中包含共享英文回退，不能冒称1703条均为日文。十四项独立有用户价值；实施后测真实key集，当前实际1717/1800（95.3889%）；原覆盖循环随后暴露ko1672/1800不足，未修改其它locale或门阈值。纯文案不新增镜像测试；worker现i18n/contract/architecture/lint/type/build，Root完整test/E2E串行并核资源恢复。正常认证Browser未验，Goal active，Skills/连接器业务排除。

## SET34 到期日期时区测试已接收，SET35继续（2026-10-15）

唯一现测试仅修时区依赖的错误UTC正则和不实几何标题；独立Intl按所选时区校验当地2026-09-30 23:59:59与毫秒999，不调用被测转换函数。原日期必填/按钮/保存/timezone断言和其余33例保护；逆修精确恢复原46937bytes。932保护/Root6逐哈希精确，独审无确定P1/P2，lint/type为0。

Root同一冻结文件在两个独立Node过程TZ=Asia/Shanghai和America/Los_Angeles各34PASS0FAIL0SKIP。全product source未变，不重复SET31完整source门，正常认证Browser未验；继续SET35十四个实际使用的日文设置缺译，再做整套回归。Goal active，Skills/连接器业务排除。

## SET34 到期日期测试按实际时区验日末（2026-10-15；D0，仅现测试）

基线Web fd627496a6f860c7ed3e1afef51c65fbc3bcca57，939 tracked clean；runtime_audit唯一writer仅现tests/ui/kokoro-scheduled-surface.test.tsx，932保护/Root6。Root设计/docs/独审/Git/实际复核；全product source与其它全部测试字节保护。

原case取Intl实际环境timezone，却把expiresAt写死为负offset才成立的10月1日凌晨UTC regex；Shanghai正确的09月30日15:59:59.999Z被误报。只修该case标题（不再声称未测的短viewport几何）和expiresAt预期：保全部dateRequired/disabled/enabled/onSave timezone及原UI操作；正则改string类型后，独立Intl.DateTimeFormat en-CA、显式timezone/h23 formatToParts核提交UTC instant在当地为2026-09-30 23:59:59，并验UTC毫秒999。不调用被测转换生成预期，不改source、时区mock、timeout/skip或扩正则。新增断言块标记，逆去块并还原两准许替换后须逐字恢复全原test。

同一现有测试文件以两个独立Node过程TZ=Asia/Shanghai与America/Los_Angeles运行，证明正负offset下日期必填和当地日末约束；无新重复case/持久化或资源。worker可跑本地unit/lint/type纯门，Root冻结后独立实跑两时区；原native/source门保持SET33/31证据，后继SET35实际日文缺译后再执行一次整套回归。Goal active，正常Browser未验，Skills/连接器排除。

## SET33 两条原生测试就绪修正已接收，SET34继续（2026-10-15）

仅现native helper默认false参数，两初始withdraw调用开启cold到达/reload新增到达前置，全部使用原remaining预算；不等status、不排除runtime、不改count/safety/mock/timeout/cleanup或SET32诊断。6块逆删除恢复原317426bytes，1writer/931保护/Root7，全product source字节保护，独审无确定P1/P2，lint/type/architecture50全部0。

Root真实原生R175/R177均PASS（2PASS0FAIL79过滤未跑），41.17s，库存exact恢复；各自两runtime arrival在baseline前，focus至commit/watchdog之间无新Browser runtime事件，全部原精确owner/safe-shell/recovery断言通过。R177重新登录后的runtime请求是合法恢复，不误报复活；Node观察非内部dispatch、跨层ambiguous/计数不普遍证明document generation界限仍在，不宣全native稳定或正常Browser完成。产品源未动，不重复SET31完整source门；继续SET34到期日期测试按实际时区修正及SET35实际设置日文缺译，Goal active，Skills/连接器排除。

## SET33 两条原生withdraw测试的就绪前置（2026-10-15；D0，仅现测试）

基线Web d7f5d5d41ce4740de219480ccd6d7bf7d9166d40，939 tracked clean；runtime_audit唯一writer仅现native测试，931保护/Root7。Root资源/Git/docs/独审/正常运行；全部product source及原计数/安全assert/timeout/mock/cleanup仍保护。

依据SET32真实R175 baseline早于proxy runtime arrival、Browser已有pre-focus runtime事件，及R177 arrival早于baseline且原assert通过的对照；独审放行阶段性readiness设计，不据此认定全native产品根因。仅requireStableAuthenticatedWorkspace增加默认false的明确runtimeArrivalBarrier参数，两初始anonymous_handoff_runtime与no_interstitial_runtime调用显式开启，R177 recovery与其余全部调用默认关闭。原冷DOM就绪后，沿原remaining deadline先等至少一个runtime proxy arrival，再在reload前同步记录当前runtime arrival数；reload后等新增arrival才宣布ready。只等到达，不等成功status（404合法），不增加deadline或固定sleep，不从owner计数中排除runtime。

新增SET33-BEGIN/END块逆删除必须精确恢复SET32原完整native测试bytes，原SET32观察器/事件字段不改，全部旧业务assert逐字保留。worker只跑lint/type/architecture无资源门；Root独立inverse/审查后真实R175+R177原case实跑，显式verbose/silent=false，库存恢复。此计数门只针对观测到的单cold阶段竞态，不普遍证明document generation；多cold并发可能混计的界限保留，实际复跑后才判断成效。全Goal active，正常Browser未验，Skills/连接器排除。

## SET32 原生顺序诊断已接收，继续就绪门修正（2026-10-15）

仅现native测试22具名新增块，去除后精确恢复原310179bytes；1writer/931保护/Root7、全product source与原assert/helper/count/timeout/mock/cleanup字节保护，独审无确定P1/P2，lint/type/architecture50均0。显式env仅R175/R177输出闭集事件，最多512普通+1截断；Node观察非Browser内部dispatch，跨层始终ambiguous。

Root真实过滤原生2case：1PASS/1FAIL(R175原owner12≠11)/79过滤未跑，40.30s；显式verbose/silent=false再R177为1PASS/80过滤未跑，37.76s，全部库存exact恢复。Vitest Agent reporter默认passed-only隐藏通过日志，非R177未执行。R175 baseline8767.273ms后proxy runtime8774.590ms到达，Browser runtime8713.823ms已观察于baseline前；R177 proxy到达在baseline前且原精确断言通过。仅支持已观察就绪竞态，不精确配对跨层请求、不证明全native产品根因。

后继仅两初始withdraw case可选cold+reload到达门，沿原剩余deadline，先冷请求已到proxy再reload，记录pre-reload count后等待新增arrival；不等成功响应（合法404）、不改原计数/安全/期限。计数仍不普遍证明document generation，多cold并发界限保留。全源无变化故不重复SET31full/build/E2E；正常Browser未验，Goal active，Skills/连接器排除。

## SET32 原生登录请求顺序诊断（2026-10-15；D0，仅现测试）

基线Web 52b535789b93ebac740db7aa8e5296c82b6622b6，939 tracked clean；runtime_audit唯一writer仅tests/system/oidc-rp-next-http.integration.test.ts，931保护/Root7。Root设计/docs/独审/资源/Git与正常实例。现runtime修补已接收，终态20focused/3987PASS7旧FAIL/Playwright20PASS4原SKIP；不能据此认定R175/R177旧native多请求根因。

仅测试显式KOKORO_TEST_NATIVE_ORDER=1时为R175/R177启用单调Node观察器；原helper/reload/readiness/baseline/计数/安全shell断言/timeout/mock/资源清理全部不改。记录helper reload前后/ready、baseline/focus、Browser runtime与session probe事件、proxy arrival/reply和合法handoff commit/watchdog。Browser层用request对象关联自身response/failure，proxy层同闭包关联自身reply；跨层无共享请求ID时不伪造关联，非唯一一律ambiguous。Node接收事件时刻不是Browser内部dispatch时刻。所有新增块边界标记，删除后必须逐字恢复原完整测试文件；不得改product source或添加等待门。

只在测试进程输出closed category、sequence、相对elapsed ms、status、phase及stage；不得记录原URL/query/header/body/cookie/token/异常全文。无正式API/contract/owner/授权变化，不能用诊断记录替代原生实际断言。

唯一目的用真实隔离R175/R177请求顺序区分reload合法请求迟到和额外请求；不减原runtime计数、不放宽timeout/断言，不先加入barrier。Root先验完整inverse/931保护/Root7，worker只跑lint/type/architecture等无资源门，Root串行独占原生资源验证并核对库存恢复。测试若失败则如实保留，并据实际事件判断下一修补。正常认证Browser未验；Goal active，Skills/连接器排除。

## SET31 runtime请求与投影退休已接收，SET32继续（2026-10-15）

现有useRuntimeManifest仅本地preview/attempt closed scope：layout cleanup真实abort，queued dispatch、JSON前后、payload/error提交都检查退休；模式切换render同步回对应默认，旧live或旧retry不复活、不覆盖新结果。原helpers/schema/options/public返回/URL/query/Accept及AppGate/native计数精确保留，原9测试完整7759bytes prefix未改。Root原source实际10FAIL10PASS20；终态20focused/283contract/50arch/lint/type/build全0，独审无确定P1/P2；2writer/930保护/Root7精确。

完整test3987PASS/7此前具名FAIL/0SKIP，212.28s；正规隔离Playwright20PASS/0FAIL/4原SKIP，21.6s，库存exact恢复。此修补不证明runtime请求有期限，也不证明R175/R177旧原生计数根因；正常认证Browser仍未验。继续SET32仅诊断native请求先后，保留原helper/readiness/断言/timeout/mock；整Goal active，Skills/连接器业务排除。

## SET31 唯一hook source已准入（2026-10-15；Root真实RED）

Root独立验tests-only4faa3d065e1bfc3cfde260116f689551a67d7acf60d22ce7cfc723efa6bdabe5，931保护/Root7精确，原9完整7759bytes prefix19b81358保留。原source实际10FAIL10PASS20，1.67s，是queued dispatch/退休late response与JSON/error/旧A覆盖B/旧live在preview保留等真实断言，原9与合法settled卸载正控PASS；后继尚未到达assert明列保留。现只授src/system/use-runtime-manifest.ts，tests frozen3ba53ed8；原options/retry/schema/URL/merge helpers与AppGate/R175/R177原native计数保护，局部preview/attempt scope退役不复活旧投影，不能把unit修补冒称原native多请求原因。终态独审/全门/正式激活后继续下一诊断，Goal active。

## SET31 runtime请求退休（2026-10-15；D0，先tests-only）

基线Web dc26502bfa47ba0c22422623118b455d46644be0，939 tracked clean；runtime_audit唯一writer，1既有hook/1既有test/930最终保护/Root7，先仅tests其余931保护。Root设计/docs/独审/资源/Git/正常激活/CUA。AppGate及原生R175/R177全部源码/oracle保护；不扩大trusted admission接口，不把hook负控冒称原生多请求根因。

现effect将fetch排到microtask，cleanup只abort，dispatch前和response/payload/error提交均无退休检查。只在现useRuntimeManifest持有同一owned request生命周期，取消前未dispatch则零调用，已dispatch非合作迟到不能提交manifest/source/retrying，旧response与旧reject不可覆盖新attempt。保持当前options/retry/public返回形态、正式URL/query/schema及所有merge/navigation/theme/brand边界。以现preview+attempt为局部呈现scope；新scope先显示该模式默认manifest与loading/preview，live→preview→live不借旧live投影冒称当前已完成。不得另建hook/framework/helper公共层或改AppGate。

沿原同源 /api/system/runtime-manifest、原product_id/locale/surface_id和Accept header，System仍是正式呈现事实owner，认证仍由Product session负责。无新授权、contract/HTTP错误/status/query或owner服务变更，取消只退休本hook拥有的请求。System可选呈现不可阻塞核心Chat。

先原9测试完整baseline；只追加真正生命周期case并完整保留原测试bytes：effect排队后同act卸载/转preview零dispatch、已发非合作late响应或JSON/错误退休不落地、live→preview→live新B不被旧A/旧reject覆盖，新live未完成不冒用旧manifest，以及合法settled请求退休无额外调用。Root原source实际RED后才授source，failure需业务断言而非setup/timeouts。R175/R177有runtime1→2且其余owner稳定的实际观察，但reload helper未等runtime到达baseline，仍可能是合法reload request；count/timeout不放宽，不排除runtime，不claim已分类。终态原9逆核、独审、pure/full/build/E2E与资源库存恢复，正常认证Browser另待人工恢复，Goal active。

## SET30 不可用说明已接收，SET31继续（2026-10-15）

七个灰菜单在搜索/列表旁显示短说明并关联useId；production账户用FieldDescription说明更改邮箱/登录方式/删除账户三操作不可用，三按钮关联实例ID，preview不显示/不关联。未启用禁用功能；原nav数组/过滤/焦点/顺序及姓名/复制ID/devices/logout/dialog逻辑完整inverse，12source逐字逆恢复，920保护含全部tests，Root7；两key九语言仅新增，原locale值精确保留。窄于48rem导航说明仅sr-only，不声称所有宽度视觉可见。独审无确定P1/P2，原focused81/contract283/architecture50/lint/type/build0；i18n99PASS2旧FAIL。

终态全test3973PASS/10此前具名FAIL/0SKIP，208.59s；正规隔离Playwright20PASS/0FAIL/4原SKIP，20.1s，资源库存exact恢复。i18n/Skills/MCP/scheduled/native旧门未闭环；正常认证Browser未验，这些工程checks不冒称全部设置真实旅程完成。接续SET31现runtime owned dispatch/commit retirement负控，保护AppGate与R175/R177计数；整Goal active、Skills/连接器业务排除。

## SET30 未接通菜单与账户操作说明（2026-10-15；正式D0）

基线Web 0ab7bfaedf7425332049f5f867bcec79fccd285c，939 tracked clean；runtime_audit唯一writer，12既有source/920保护/Root7。所有tests原字节保护；Root设计、docs、独审、资源、Git、正常激活/CUA。实际Manus菜单已有对应本地入口，七个placeholder及三账户按钮仍按能力不可用，不引入owner/contract/API/deps或新source。

现导航在搜索/列表旁显示简短不可用说明，useId实例ID供七个placeholder aria-describedby；保持原nav数组/顺序/过滤/选项/焦点/非操作状态和pointer-events语义。只新增具名note CSS；窄屏3.25rem图标rail不得被长段说明挤满，说明仍可被辅助技术读取。Account复用既有FieldDescription呈现production三操作未提供说明，实例ID关联邮箱/登录方式/删除三个按钮；preview展示、姓名编辑/恢复、copyUserId、devices、logout及弹窗原逻辑保持。

两个新增纯本地化key settings.unavailableNavigation、settings.accountActionsUnavailable；中文zh位于messages.ts的zh对象，八语言overlay各自翻译，只可追加这两项，原locale数据逐字保护。说明不表明接通新服务，也不重新启用或请求任何禁用能力；团队仍是当前部署租户的成员管理，不冒称创建团队。

低影响呈现改动，不新增或弱化tests；保原全tests与能力边界，现导航/账户聚焦验证、locale/contract/architecture/lint/type/build，Root完整unit/E2E与库存恢复后才验收。正常认证Browser仍等待原error页人工恢复，工程Playwright不冒称该journey；Skills/连接器业务排除，整Goal active。

## SET29 侧栏余额可信生命周期已接收，SET30继续（2026-10-15）

可信ProjectReadBoundary沿原AppFrame/rail/shell/account传入；live admitted/nonblank subject/safe非负generation与marker一致才读取，marker不授权限。scope包含preview/admitted/subject/generation/actor，同主体重核/换代同步隐藏、layout真取消、uniquecontroller守非合作迟到及A-B-A；原preview/BigInt/失败—、admin/menu/signout/通知完整原子树保持。4source+1既有test/927保护/Root7，原73全文逆核，17新增真实负控：原source Root14FAIL76PASS90，终态90PASS；一处new suffix this:Storage类型标注擦除还原原RED hash，无oracle更改。独审无确定P1/P2，contract283/architecture50/lint/type/build0。

完整test3975PASS/8此前具名FAIL/0SKIP，205.57s；隔离正规Playwright20PASS/0FAIL/4原SKIP，20.5s，库存exact恢复。原生登录/UI/i18n遗留全门未闭环，正常认证Browser仍未验；本项不是正常用户端视觉或余额服务性能证明。现正式源激活后续SET30补未接通说明、SET31 runtime请求退休分类；Skills/连接器业务排除，整设置Goal active。

## SET29 source已准入（2026-10-15；Root真实RED）

Root独立验证tests-only冻结manifest c2f375cccd9255c9ebe64271791b01bbf921cf788ec8f95b0aefca6c40e43742；931保护与Root7精确，原rail测试逆核完整恢复ad232a44，仅可信参数fixture与附加分隔换行。原source全文件实际14FAIL/76PASS/90，5.65s，全部原73仍PASS，失败是断言不是setup/timeout；迟到/新7等后续断言在RED尚未全部到达。现仅授4既有source，tests字节冻结919eeb4f；不授任何admin/signout/其他client。实施后Root独审、focused/pure/full/build/E2E、正常源码激活继续，Goal不按此切片结束。

## SET29 侧栏账户余额可信读取（2026-10-15；D0，先tests-only）

Web基线2d31cd502db44b5b0ad74e52321cba755624896f，939 tracked clean；runtime_audit唯一writer本片4既有source+1既有rail测试，927最终保护/Root7；先仅测试准入，其余931字节保护。Root管设计/docs/Git/资源/正式激活/CUA，Skills/连接器业务排除。

现账户余额只看preview与local auth-index marker；同主体probe撤回admission/换generation时marker保留，旧余额可继续显示、pending结果可落地。沿现ProjectReadBoundary透传AppFrame railProps→WorkspaceRail现spread→shell→account，不借conversationReads injected fallback或解析opaque identity，不增hook/framework/source/API。live要求admitted===true、非空subject、安全非负generation，marker只是额外失败/变化guard且必须与可信subject一致；preview沿既有路径。显式局部scope纳入preview/admitted/subject/generation/actor，render同步隐藏并永久退役旧投影，layout取消旧请求，controller/闭合scope守迟到结果，A→B→A不复活。

Web只调用原browserBillingClient.summary(signal)→同源→正式BFF/Billing；服务器权限/契约/金额/checkout/依赖/generated不变。本片是读取资格与本地投影生命周期，不是新授权或业务余额事实。admin-access/menu/signout原子树与其他读取不改。

Web不持久化余额；原formatCredits BigInt、missing-account/失败显示—、卸载取消、preview和marker撤回原语义保留。有效可信boundary只准许读取，不从marker伪造subject。原所有rail行为保护，无schema/数据库/Redis/资金写。

原rail全文件测试先基线；既有R255 fixtures仅明确可信参数，原大金额/失败/A-B/marker删除/卸载oracle精确inverse保持，不改global renderRail默认资格。新增真实负控：同subject撤准入同步隐藏42/零read、pending换generation abort+迟到不落、readmit仅新7、A-B-A不复活、无boundary/空subject零read、现shell链实际透传。Root在原source跑RED后才授4source；终态原fixture逆核、独审、contract/architecture/lint/type/full/build/E2E与库存exact恢复。正常认证Browser及原生runtime登录稳定性仍另未决，整设置Goal active。

## SET28 Web阅读轴修补已接收，SET29接续（2026-10-15）

现Web thread viewport统一隐藏滚动条稳定槽，原10.59375px双侧漂移消除；只1CSS具名selector+property，逆核恢复原7518ab84源码，931保护/Root7与全部测试/阈值/业务oracle原字节。overflow/shared/mobile primitive及滚动逻辑保持，可见滚动条拖动入口消失；独审无确定P1/P2，contract283/architecture50/type通过，V2 lint/build通过。

完整test3959PASS/7此前具名FAIL/0SKIP，201.99s；此前UI/i18n与原生登录完整门未闭环。正规隔离Playwright20PASS/0FAIL/4SKIP，20s：现原responsive精确阅读轴全矩阵、长Markdown/尾部/第二轮与logout/stream/HITL原完整业务断言均PASS，资源库存exact恢复。首隔离脚本absolute-path漏覆盖只跑到旧baseRED，已修canonical相对路径与复制哈希校验后V2真实PASS，非V1产品失败。仅现工程Chromium，正常认证Browser/多引擎/辅助技术未验；后继SET29沿现可信boundary修侧栏余额，原native观察边界另分类，完整设置Goal active、Skills/连接器排除。

## SET28 Web阅读轴滚动槽修补（2026-10-15；正式D0）

正式Web基线7e062cd5e69847bfb34181b6674cb998c4cc50f1，939 tracked clean。runtime_audit唯一writer仅app-frame-main.module.css；931保护/Root7。Root设计/docs/Git/资源/正常激活/CUA。既有精确E2E已多次真实RED，无新tests-only或新增镜像测试；全部tests/阈值/mock/skip/等待保持字节。

Root真实390px DOM测量：内容左右26.59375/363.40625，Composer16/374，双侧thin scrollbar稳定槽各约11px造成10.59375对称漂移。仅现Web专属.main[data-desktop-web=true][data-web-view=thread] viewport slot规则新增scrollbar-width:none，保overflow-y:auto；共享/mobile viewport与组件逻辑原字节。该呈现沿现autoscrolling已有隐藏条模式，统一非自动状态去槽，wheel/touch/键盘/程序滚动与自动定位保持，取消可见滚动条拖动。无猜测11px offset、JS测量框架或公开布局控制。独立候选审查确认最窄；Root隔离原两失败case全矩阵/长Markdown/尾部/第二轮18.0s全部PASS，非正常认证Browser证明。

本片无API/权限/owner/依赖/新源文件/生成变化，所有请求与状态控制保留；仅Web现有阅读视图样式。Skills/连接器与设置行为排除。

无数据事实/持久化/状态机变化；仅阅读区视觉宽度。旧48rem cap、各宽度/rail布局与精确<=1px业务oracle保持。当前证据覆盖工程现Chromium门，不冒称额外浏览器通过。

源码只具名scope选择器一property与必要注释；冻结1writer/931保护/Root7独审，Root实际原geometry/longthread及正常stream/HITL完整E2E、规定contract/architecture/lint/type/full/build，库存精确恢复后接入同PR。既有native登录完整门稳定性与正常认证设置journey另未决；侧栏余额可信generation后继，整个设置Goal仍active。

## SET27 个性化未接通入口正式接收（2026-10-15）

个人资料/知识line tabs、AI导入及记忆导入入口已呈现；知识及导入按钮真实disabled/无handler，上方本地化说明用实例useId关联，不展示假知识空列表、导入流程或成功。四字段/保存/冲突/未知写恢复原子树逐字保留；source仅现Card与具名CSS，九locale单key。Root原源最终缺知识入口1FAIL/68SKIP再次复现，终态117专项PASS；12writer/920保护/Root7、原69测试两替换/两附加assert及locale/CSS逆核，独审无确定P1/P2，contract283/architecture50/lint/type/build通过。首轮zh键位置失败已修并保留日志。

完整test3959PASS/7此前具名FAIL/0SKIP，202.44s；六持续UI/i18n与原生R177仍失败，其他native本波通过不证明完整门稳定。正规隔离Playwright18PASS/2阅读轴FAIL/4SKIP，35.1s；库存exact恢复。正常认证Browser及个性化窄屏视觉未验证。后继SET28用Root已在隔离副本证明的Web-only样式修复现阅读轴，原精确业务oracle不改；侧栏余额信任另续，技能/连接器排除，完整设置Goal继续active。

## SET27 两项入口断言Root复现，具名源码准入（2026-10-15）

原69项基线通过，需求允许的两条不存在→disabled断言更新后，Root真实1FAIL/68PASS，缺知识tab；导入按钮断言未到达，不虚称已复现两项。两行逆变换恢复原测试全文，931保护/Root7逐hash保持。现授runtime_audit仅D0具名Card/CSS/九locale一key及同case必要说明/AI导入disabled检查，原四字段持久化和其余68case全部保护。终态12/920/Root7冻结独审、Root复验/完整门待，正常浏览器仍未验证，整个设置Goal继续active。

## SET27 个性化未接通入口（2026-10-15；正式D0）

Web基线91fb1aee87df9e6dc0acadcdda4db5375623a13a，939 tracked clean；runtime_audit现Web唯一writer，12具名路径/920保护/Root7。Root设计/文档/Git/资源/运行/CUA。独立候选审查无确定P1/P2；原SET26已接收，本轮只个人资料呈现，不混入余额/支付/阅读轴。

Root实际Manus个性化页有个人资料/知识、从其他AI导入与导入记忆入口。现四字段已有真实owner，继续沿usePersonalization的可信身份、blur保存、冲突/未知写恢复。仅扩现PersonalizationCard及现语义CSS，复用Tabs line呈现：个人资料是唯一有效内容，知识trigger真实disabled，AI导入和导入记忆按钮真实disabled、无handler/file input/clipboard/network或假modal。明确本地化说明知识与记忆导入暂未接通，不造知识空列表或已保存事实。现头部说明已存在，不重复新增。现CSS只具名个性化class/对应注释，不格式化公共外观。

无新增API/contract/owner/依赖/源文件/业务调用；知识与导入只可见禁用，不请求服务。四字段继续现正式profile读取与保存，不能误断言整个面板零请求。hook/client/schema与其他设置/source字节保护。

没有知识/记忆导入持久化事实；不可展示假空、假导入成功或步骤。九locale唯一新增settings.personalizationMemoryUnavailable，中文“知识与记忆导入暂未接通。”；复用personalProfile/knowledge/importFromAi/importMemory标题，现中文匯入字形与其他旧keys/value保护。旧knowledgeHint/importMemoryDescription暗示可操作，不无条件显示。

先仅settings-modal现测试，旧个人资料case的两项“知识tab/匯入按钮不存在”断言经明确需求改变为真实disabled（最小精确两行逆变换可还原）；原case四字段与preview保存全部oracle/mock字节保护，其余全部测试保护。新增说明检查可放同case或窄新增后缀；不镜像组件细节或堆低价值测试。先实际RED由Root复现，再授源码/CSS与九locale。终态冻稿、独审、Root专项及规定完整门，不等同正常IAM/CUA页面已验证。Skills/连接器排除，完整设置Goal继续active。

## SET26 用量与套餐可信读取正式接收（2026-10-15）

两页及独立Panel明确preview/可信subject/generation/admitted，render同步隐藏旧余额/目录，layout退役owned请求；Pricing局部scope/client投影、明确loading/error/unavailable/empty/ready与手动单发重试。正式plans自有真实reader、单总10s、parent取消/迟到body清理及立即释放锁，caller预算并行；不改checkout整段、BigInt/ledger旧行为、全局QueryStore或BillingClient。首冻真实readerP2由Root两项RED复现后窄修，独审已关闭，无新增确定P1/P2。

Root逐hash核17writer/914保护/Root8、原151逆恢复/九locale单键/checkout字节，最终测试在原a918源码仍11真实FAIL，终态四文件178PASS；contract283/architecture50/lint/type/build通过。Web无format:check脚本，不虚称该门运行。完整test3956PASS/10FAIL/0SKIP，200.11s：六持续旧UI/i18n失败及四已历史复现的原生登录测试失败；native稳定性仍未闭环，不归因于并发或本轮已修。

正规隔离Playwright18PASS/2FAIL/4SKIP，35.6s；两390px阅读轴断言仍失败，原阈值/业务oracle保留。两个owned门PG/Redis库存exact恢复。正常IAM账户/团队/分享浏览器旅程仍待人工恢复既有错误页；上述组件与替身E2E不能代替。整个设置Goal继续active，后继个性化未接通知识/导入入口明确禁用，侧栏余额generation另续，Skills/连接器排除。

## SET26 final review P2 correction pending (2026-10-15)

First freeze 4279a3dc has 171 focused PASS, but independent review found real locked Response body cancellation unverified and broken. That freeze is not accepted. runtime_audit first adds two real-stream negative controls only to existing pricing tests, preserving the 171 existing cases; Root reproduces before narrow plans reader ownership correction. Same 17 writer / 914 protected / Root8, checkout and other clients protected. Full/E2E and normal activation await corrected freeze. Settings Goal remains active.

## SET26 真实RED后具名源码准入（2026-10-15）

Root 固定Node22对冻结四测试独立复现11FAIL/151PASS，原四完整prefix、927个tests-only保护路径和Root8哈希保持，无collection或测试自身timeout假失败。真实oracle为same-subject admission/generation旧投影、未准入仍读、目录preview/live/client旧值、退休无abort、单10s fetch/body仍pending及实际Settings两分支未透传。后续retry/late断言在原源码尚未全部到达，终态必须完整跑过。

现授runtime_audit唯一writer沿既定17路径/914保护/Root8，四现source/九locale/四tests；仅旧测试明确trustedfixture补全和原actor竞态可信subject同步，全部语义oracle保护。三设计现方案、checkout整段原字节与GenericQueryStore/BillingClient/Skills/连接器边界保持。Root文档/Git/资源/正常运行独占；终态freeze/独审/Root复验与全部门禁、正常浏览器旅程仍待，不冒完整Goal结束。

## SET26 用量与套餐可信读取（2026-10-15；正式D0，先tests-only）

正式Web基线a9183585ab403797f79b522aedb120de562a64e9、939 tracked clean。仅现Web Billing/Pricing/settings消费接缝，runtime_audit唯一writer，17具名路径/914保护/Root8；Root独占设计/docs/Git/资源/正常运行/CUA。候选独审无确定阻断P1/P2。Skills/连接器、owner契约/SQL/generated/依赖、checkout源码与全局QueryStore保护；无新源文件/模块/owner。

当前Billing只有auth-index actor且Settings未传可信boundary，same-subject退役/新generation仍可能展示旧余额；Pricing固定billing/plans跨preview/live共享缓存，旧data先于error，plans无browser期限。目标两面明确preview/readBoundary，live缺/撤销admitted或可信subject/generation则暂停解释、不读、不重试、不页读、隐藏旧值；scope含preview/admitted/subject/generation并绑定client，现actor/index异常及变化保作附加guard，不作授权。render同步隐藏不匹配投影，layout退役清timer并abort，旧tuple不得复活；standalone Panel也透传一致资格。

保Billing精确BigInt、summary/ledger独立成败、missing-account、cursor/dedup/防重复、显式retry及paging，原BillingClient不扩大。Pricing扩现文件局部scope/client投影，删除此目录useResource/全局key消费，胜于改通用store或引无清晰取消owner的shared cache；其他query消费者原字节保。目录loading/error/unavailable/真empty/ready、显式retry；错误不能被旧data掩盖，preview值不得入live。caller每attempt单绝对10s覆盖非合作注入，退休/timeout abort并退役，late不能覆新retry；formal plans自身10s覆盖headers/body/schema，两预算并行不串阶段，不能宣取消非合作peer。

Settings两分支与两个Panel均传preview/boundary；没有其他生产Panel caller。sidebar独立余额generation缺口列后继，本片不冒称修全部余额。

仅既有PricingClient.plans加可选AbortSignal及准确timeout/aborted failure reason，现同源GET/no-store/严格schema/503 not_configured/金额wire保持；每call一个绝对10s race，signal转owned fetch，取消body可用时执行，headers/body/schema无phase预算重置或自动retry。checkout整体原字节保护，当前UI永久disabled购买且0checkout/redirect，owner capability不因目录非空而成立。可信scope只本地投影/生命周期，不把subject/generation/actor写wire，不复制BFF/Billing契约。

Web无新增持久化owner/schema；原owner摘要/流水/目录与金额wire保持。新scope/client投影只在各已挂载页面内存，不跨preview/live或被撤销generation复用；auth-index不是授权事实。暂停不造0/empty/missing-account，失败不造套餐。唯一locale新key九语言settings.billingRequiresIdentity：zh“登录状态确认后才能加载用量和套餐。”，既有read retry/error文案保持。

tests-only仅四具名现测试。旧case必要时仅补明确trusted props到原helper/call，actor A→B竞态同时更新可信subject为B，保旧迟到、金额、missing-account、checkout、分页全部语义oracle。Settings mock只准具名Billing/Pricing读fixture补全来验证真实分支透传，原其他mock/oracle保护；不得preview:true替代真实client资格。先四项旧基线与新actual RED冻稿Root复现后，另授source/locale。后继17/914/8终态独审/Root专项与正规完整门禁，源测试不是正常IAM/CUA旅程。完整设置Goal active。

## SET25 终态源码接收与回归事实（2026-10-15）

模型偏好失败不污染原raw/cache或误报saved，显式保存重试当前草稿；目录有loading/error/真实空、单10s caller预算、显式retry及layout/epoch退役。原chat深链保留，Manus General模型入口未新增；Genericstore/client/Skills/连接器无变化。13writer/919保护/Root7及原61完整prefix、九locale五key、五处E2E逆变换Root独核，独审无确定P1/P2。Root在原源码再次真实2FAIL/65SKIP，终态专项138PASS；contract283/architecture50/lint/type/build通过。

完整test3933PASS/6既有FAIL/0SKIP（日本语言覆盖、MCP文案、Skills import三、定时日期），本轮native认证组通过，不代表全套波动已修。正规隔离Playwright18PASS/2FAIL/4SKIP，35.3s；原networkidle边界六例现四业务PASS（rail logout、stream、approve/reject），另两个真实进入390px阅读轴断言发现偏移，布局尚未修；不把此前未触达断言冒称旧几何失败已证实。PG/Redis库存exact恢复，正常IAM/browser账户旅程仍待人工恢复被策略拒绝的错误页。本片源代码接收不等于完整设置Goal完成，后继接可信用量/订阅scope、目录期限与恢复。

## SET25 浏览器测试就绪边界窄准入（2026-10-15）

仅现tests/e2e/web-governance.spec.ts原65/107/267/405/470五个初始/app goto覆盖六例：networkidle改DOMContentLoaded后准确Chat input可见/启用/可编辑web断言。原229及其余goto保持。已有实际六desktop等待超时证据及只读独审无确定P1/P2；官方Playwright建议测试以web断言判断ready。原logout POST/issuer、reading轴/长markdown/stream/HITL所有业务oracle、mock、skip、timeout、route保持，R137观察器仍先于首次发送。不能以输入就绪冒称业务通过，也不宣定位具体网络请求根因。无Product源码/fixture/权限改动；沿runtime_audit同一writer，SET25扩为13writer/919保护/Root7，仅本项追加范围，其余原边界保持。最终正规E2E运行仍待验。

## SET25 模型偏好源码准入（2026-10-15）

Root 对已冻结新增测试独立重现两项真实断言失败：存储写入失败污染模型读取缓存，目录请求拒绝缺少明确错误反馈。原61项完整测试前缀、931个tests-only保护路径及Root7准确保持。现授runtime_audit唯一writer，沿既定12路径/920保护/Root7实施本页五个locale key、准确保存结果及单尝试10s目录caller预算/手动重试。无新General模型入口，不改变通用store、client、Skills或连接器；Root独占文档、Git、资源和正常运行。终态冻结/独审/Root复验、完整门禁与正常接入仍待执行，整个设置Goal active。

## SET25 原有模型偏好深链可靠性（2026-10-15；正式D0，先tests-only）

Web既有chat-prefs/ChatPreferencesSection/旧chat深链局部修补；正式基线6921a1cbffd723fc37c4cc64342bb3a6f89369a1，939 tracked clean，12writer/920保护/Root7绑定。唯一writer runtime_audit，Root设计/文档/Git/资源/运行/CUA；候选独审无确定P1/P2。Manus General实为任务发送偏好，现TaskDelivery已对应，不加General模型/左栏入口，更正旧卡注释。无新源文件/模块/owner/依赖/CSS，通用store/client/API/generated/Skills/连接器保护。

SET25/P1：现chat深链不假saved、不假空。允许12文件仅两source、九locale五key与modal原61项完整byte prefix后新增case；Root7自有。新keys settings.modelPreferenceNotSaved/modelCatalogLoading/modelCatalogFailed/modelCatalogEmpty/modelCatalogRetry；save retry复用settings.retryPreferenceSave。先原source真key-scoped写/cache失败与目录reject两RED，Root复现后source。GREEN覆盖保存retry/null、后继reader、目录状态、10s非合作/late retry/preview layout/unmount。公共mock/旧oracle保持，冻结12/920/7独审和Root专项后正规contract/arch/lint/type/build/full/E2E；旧失败保留，正常CUA另待HTTP页恢复。完整设置Goal active。

## SET24 账户退出修补正式接收（2026-10-15；完整设置Goal继续）

AccountCard调用方具名单10s/AbortSignal/race、同步双击单发、完整preview/admitted/subject/generation退役与导航guard已实现。请求拒绝/超时后明确“无法确认退出”，恢复原按钮以显式重试，不假称仍登录/已回滚/自动重试。正规503 issuer handoff成功清timer并保持busy，Product auth client原字节保持；profile读取失败不阻退出。九语言仅一新key；旧50项完整prefix与921保护、Root7由Root/独审逐hash核，无确定P1/P2。

原source终态测试真实缺logout专属alert FAIL已由Root复现；终态Root三文件132PASS。contract283/architecture50/lint/type/build通过，i18n99PASS/2同此前FAIL。正确配置full3927PASS/6FAIL/0SKIP：ja覆盖、MCP硬编码、Skills三项和排程日期一项；此前native认证波动本轮通过，不能据单次称稳定性问题已修。隔离正常Playwright14PASS/6同名此前desktop timeout/4SKIP，非Account设置真实浏览器验证。两门owned资源库存exact恢复。正常账户退出/CUA仍待既有HTTP页人工恢复，不能由组件或替身链代替。

本片接入现功能PR14，本地沿现Next dev重编译；后继SET25仅已有chat模型深链保存失败反馈与目录加载/重试，正式新base后D0/tests-only，非新增General模型入口。Skills/连接器排除，整个设置Goal继续active。

SET24阶段准入：原source首个拒绝case由writer与Root各实际1FAIL/60SKIP，缺logout专属无法确认alert、无profile/setup假RED；原50prefix/931保护/Root7 exact。当前授runtime_audit仅D0具名AccountCard与九locale一键及同一新测试后缀补正，Product auth client源保持。失败后的按钮恢复断言在原RED缺alert之后未到达，不冒已测。终态冻结/独审/Root正规门待。

## SET24 账户退出失败恢复（2026-10-15；正式D0，先tests-only）

Web现有AccountCard退出交互的局部修补；基线03fc794403116f93c318eeec3534ae0d199cb690，939 tracked clean。Root绑定921原保护，唯一writer runtime_audit；Root独占三设计/CURRENT/相邻INDEX与Git/资源/运行/浏览器，storage_platform_audit只读审查。Skills/连接器、Product auth client源码、API/contract/generated/lock/依赖/CSS及其他owner排除。独立D0审查无确定P1/P2。

任务SET24/P1：账户logout失败不恢复。允许writer11现路径：AccountCard、九locale各追加一键、settings-modal原50项完整prefix后新增测试；禁止新文件/模块或改旧oracle。先实际第一具名拒绝RED，Root复现后授source；新夹具隔离profile读，logout专属alert，避免profile错误假RED。GREEN覆盖明确重试/同步双击单发、10s非合作、身份/permission/preview/unmount退役、真实client迟到CSRF/503导航、安全成功handoff。之后冻结11/921/Root7、独审、Root专项复验与正规contract/architecture/lint/type/build/full/E2E；旧失败不放宽，正常CUA另验。当前source尚未授写。完整设置Goal保持active，本片通过后继续后继。

## SET23 通用偏好失败反馈源码接收（2026-10-15）

两Provider独立保存失败状态；当前选择即时生效，General对应行明确未保存/刷新可恢复，显式重试当前值成功只清自身错误。关闭重开Modal保Provider失败，真正重挂按持久值恢复。九locale各两新键，无新API/store/deps/CSS，旧key/值、SSR/system/协商/IAMlang保持。Root独核382f7196冻结13 writer/919原保护/7 Root、旧47case完整prefix与九locale逆变换；终态独审无确定P1/P2。

最终稳定三case在原293源码/938保护副本实际3missing-alert FAIL，再冻结modal50/hydration47由Root独立97PASS。contract283/architecture50、lint/type/build通过；i18n99PASS2FAIL在原base同门实际复现，阈值不放宽。新增测试关闭需观察实际onClose状态、语言行用实际英文label的两窄修已登记，首轮测试定位/调度失败日志保留。

正确配置full：3911PASS/11FAIL/0SKIP；原293全939原字节同配置full3910PASS/9FAIL。六既有UI/i18n失败保持，R175本轮双方同12≠11，R177已有原base复现；本轮final原生proxy三CSRF/signin503与原base另外两IAM relay/login启动失败不同，具体类别尚待诊断，不能写成全部同名旧失败或并发原因已证实。两版同过滤原生七项均7PASS/79SKIP，只证明具名隔离条件，非完整门绿。RP API导入图不经过本片Provider/Appearance路径，未发现直接改动因果证据，原生完整门稳定性作为现需求未闭环风险保留。

隔离正常Playwright14PASS/6此前相同desktop timeout/4SKIP，非正常设置浏览器旅程。所有实际测试PG数据库/Redis键集合exact恢复，共享服务保持。现接收此具名源码至同一功能分支/PR，后继正常Web激活和浏览器验证仍待；紧接SET24退出失败后的永久busy修补，完整Goal active，Skills/连接器排除。

SET23新增测试定位窄修准入：仅新case在已选English后取语言行combobox采用实际原en label“Interface language”，避免与模型等其他combobox歧义；不改旧locale/DOM/47prefix及重试行为断言。新case错误定位日志保留，最终测试需再对原293复现缺alert RED。

SET23新增测试生命周期窄修准入：现Modal正常useOverlayClose延迟回调，DOM dialog消失尚不代表Harness的onClose已提交。仅新增SET23 Harness的reopen按钮aria-expanded={open}及该新case waitFor(false)后重开，观察真实父状态；原47prefix、三个首次missing-alert断言及原业务语义不变，不改产品关闭逻辑/延迟，不用任意sleep。终态重新冻结，并将最终测试在原293 source副本复现真RED，保首次RED历史。

## SET23 Root真实RED已复现，具名source准入（2026-10-15）

Root独核tests-only2562b4ba：原47case完整prefix逐字、931保护与7Root文档hash保持，独立固定Node22实际3FAIL/47SKIP均缺失accessible alert，真实dark/en立即生效与旧light/zh存储断言先通过，无setup/collection假RED。现授runtime_audit唯一writer仅src/ui/theme/theme-context.tsx、src/i18n/context.tsx、src/ui/settings/sections/appearance-card.tsx及九现locale文件追加两键；原三RED case/hash保持。原其余919 tracked保护（939减13writer减7Root）及旧键/SSR/system/协商/IAMlang全部保持；不授CSS/contract/generated/deps/其他source/Git/资源。现三设计策略有效，源码终态freeze/独审/Root复验与完整门仍待；正常设置Goal active。

## SET23 通用语言与主题保存失败反馈（2026-10-15；D0通过，tests-only）

归属Web现有浏览器偏好Provider和General AppearanceCard，是现文件局部修补，不新增模块、API、owner、依赖或存储框架。正式基线293ac84d7b2b6562b73e46c56436aadc4c1c2e3b，939 tracked clean已绑定；原主题/语言即时生效，setItem失败无提示，不能说整体不可用。候选独审无确定P1/P2。

runtime_audit沿现角色为唯一实现writer；当前仅tests/ui/settings-modal.test.tsx追加真实Provider/Storage失败三case，旧prefix/oracle保持。先实测三个RED为缺失alert断言，再Root复现；尚未授source。后继source严格三现Provider/AppearanceCard与九语言，其余926原tracked保护，Root另独占三设计/CURRENT及docs/INDEX、src/i18n/INDEX、src/ui/settings/INDEX共7。Root保Git/index/资源/正常服务/CUA，worker只纯测试，不启动资源、安装依赖或改Git。完整设置Goal active，Skills/连接器排除。

准入验证：真实dark radio与语言combobox键盘选English；写拒绝仍dark/en即时、原light/zh存储不变且两alert；Modal关闭重开保失败；重试仅清对应、写当前值、新挂恢复；无重试新挂回旧值。冻结逐hash及独审后复验相关provider/i18n/UI、contract/architecture/lint/type/build、完整test/E2E，失败记录不放宽oracle。正常浏览器仍待HTTP旧标签恢复，不以preview/fixture冒真实用户旅程。

## SET21/22 Data/Help 源码接收与运行接续（2026-10-15）

正式消费BFF eec3244645d5129407147774ecb07e03848420c4/public15.3.0/146，canonical全文SHA256694251d4f4c1bcc9a79ae4fd2d4c050c87a0a8af39bea0a9f0bed3a4dcae5ad5。Data/Help可选择；Data同页三段与三管理行，仅本人任务分享具备正式读取/停止分享，其余容量明确不可用。Help只导航本产品实际账户/数据说明。createShare/revokeShare均单有界预算、正规share_id ACK，未知停止结果须完整重读再明确继续；身份变化退役旧操作。其他菜单与权限保持，Skills/连接器业务源码未修改。

Root独立复现原266四核心行为4FAIL/50SKIP/54，冻结后152专项PASS；9locale旧键逆变换和47旧scoped生成正文保持，原Next五业务case逐字保持。77 writer与855原保护字节、7 Root文档原后缀及正规owner Gitblob独核，独审无确定P1/P2。纯contract283/architecture50、lint/typecheck/build通过。首冻Next把500错认ready；V2严格401仍未ready。Root捕获实际middleware依赖解析失败，V3仅隔离两个scratch依赖链接、取Next正式helpers，严格401/预算/七oracle不放宽，产品与依赖声明未改；原路径真实Next七例7PASS/13.65s（真实Next/Redis与替身BFF，非正常IAM/PG用户旅程）。

Root正确配置完整pnpm test：3912PASS/7FAIL/0SKIP；七项均此前已有失败（Skills创建三、语言覆盖及MCP文案、定时日期、R177登录handoff同12≠11），不宣全门绿。首轮漏旧Redis环境的16FAIL/154SKIP输出保留，补环境重跑没有改断言。隔离原配置Playwright桌面/移动：14PASS/6FAIL/4SKIP，六项与此前相同桌面preview超时；不是正常设置旅程。各轮实际PG库名/测试Redis键集合前后完全恢复，无清理共享资源。正常组合即将接入本片；账户保存/刷新/重登、团队和分享的正常浏览器操作仍待验，完整设置Goal active。

SET21分享浏览器接缝准入澄清：现 engine/client.ts 仅 createShare/revokeShare 两方法可共用具名有界分享调用，createShare 增可选 AbortSignal，原 POST {}、idempotency key/value、路径编码和 flat ShareReceipt 保持。两分享操作各浏览器单10s覆盖 fetch/headers/body/strict ACK，停止分享外部单10s同时涵盖写与完整重读；不扩大 generic postJson、其他会话/SSE/Move 方法或 ShareButton 源，不新文件/框架/依赖。现 client-artifact-share 测试可沿这两个方法补具名 deadline/abort/坏ACK负控，原 oracle 保持。现 lint/type 通过是阶段输出，终态仍须重新冻结和复验。

SET21终态检查窄准入：tests/architecture/governance.test.ts 仅将原 contract script 期待值 prepend 正规 shared-tasks check，与已批准 package 注册一致，原所有其他规则/语义断言保持。新 Help 菜单行为 case 的 h1 必须使用既有 zh settings.helpTitle“获取帮助”，不改旧 locale 值；最初该新case误期望“帮助”的50PASS/1FAIL日志保留。Root以最终稳定两测试hash在原266重现RED，不拿错误标题测试作产品缺陷。

## SET21/22 修正菜单操作后的原源码 RED（2026-10-15）

Root 已将稳定的两份行为测试置于原266源码私有副本，其他902原 tracked 字节逐 hash 保持。固定 Node22 实际51项47PASS/4断言FAIL，exit1：正式 share_id 撤销回执被拒、旧 ok:true 被接受、Data/Help 可选择 tab 尚不存在。测试使用真实 settings-tab 控件及 Enter，不再以错误 role=button 断言导航；最初日志原样保留，不能当作准确交互依据。终态 GREEN 仍待完整实现冻结。Root 另独占三份相邻 INDEX 的本片职责追加，原内容保持；writer 保护集合需排除这三 INDEX 与原四 Root 文档。正常服务保持，完整 Goal active。

SET21消费接缝窄准入：tests/engine/fakes.ts仅revokeShare stub采用同文件createShare既有share_id，其他fake oracle/方法不动；src/ui/settings/settings-modal.tsx仅把已有selectTab callback传入SettingsPanelContent，panel/Help沿具名props回调导航，禁止裸TabsTrigger或DOM模拟点击/新框架。前条tests/engine/client.test.ts经实际核没有revokeShare（ok:true属于rename），不需要修改，原rename oracle保持。现真实导航是Radix tab；两先冻Data/Help tests修正为真实role=tab及键盘选择并保全部内容断言，Root将在原266源码私有副本重现修正后的真实RED；旧不准确button交互日志保留，不替代正确菜单证据。

SET21必要窄准入补充：src/dev/preview-transport.ts只revokeShare方法从旧ok:true返回既有createShare相同的明确preview share_id，修正SessionClient类型约束；不引API/持久事实/新fixture或改其他preview能力。tests/engine/client.test.ts只旧revokeShare合法fixture及receipt断言同步正式share_id，新增旧ok:true反例可沿该case；原其余client oracle保留。两路径由runtime_audit唯一writer，纳终态freeze，不授其他领域。已授server读取的BodyInit类型修补属于既定source路径，纯类型/实际字节预算语义保持；测试ByRoleOptions移除不支持exact属性不改变准确字符串name断言。

## SET-21/22 Root真实RED已复现，具名source准入（2026-10-15）

Root固定Node22对两冻结原入口测试实际复现4FAIL/47PASS/51（exit1）：formal share_id回执被拒、旧ok:true被接受、Data/Help不可选。898保护原路径逐hash保持，只有两测试与四Root docs变化。runtime_audit现为本仓唯一源码writer，准入下方既定SET21/22所有具名source/正常generated/locale/测试范围，不另建owner/framework/依赖/可编辑manifest。正式eec3244645d5129407147774ecb07e03848420c4/public15.3/146全文694251d4f4c1bcc9a79ae4fd2d4c050c87a0a8af39bea0a9f0bed3a4dcae5ad5原字节经单正规snapshot及正常生成消费；旧能力形状/语义oracle保持。Root设计/docs/INDEX/Git/资源/正常服务/CUA仍独占。

以当前Manus同页Data三段及三管理行为准，Help本产品真实说明，不做伪提交。单预算/严格wire/六字段最终session/unknown写锁及完整重读后明确继续、preview零API和scope同步退役沿三设计。worker可写具名真实Next HTTP测试但不自行运行需要资源的integration/完整资源测试；纯contract/architecture/lint/type/build及focused可跑。最终freeze exactwriter/hash/原904保护与准确日志/exit，Root独审复验/实际Next HTTP后提交，正常浏览器另验；整体Goal保持active。

## SET-21/22 正式 owner 已到达，现授具名 tests-only（2026-10-15）

BFF eec3244645d5129407147774ecb07e03848420c4已正式提交/推送至现功能分支，public15.3.0/146全文SHA256 694251d4f4c1bcc9a79ae4fd2d4c050c87a0a8af39bea0a9f0bed3a4dcae5ad5。Root冻审、83专项/build、实际HTTP→PG事实链/150ms锁超时及同pool恢复/EXPLAIN、自有资源收尾通过；旧全门失败保留。Web唯一writer runtime_audit此刻仅准修改tests/engine/client-artifact-share.test.ts和tests/ui/settings-modal.test.tsx：正规share_id DELETE ACK应成功、旧ok:true拒绝，Data/Help菜单应可选择且同页合法内容。只用现实际client/modal入口，不能import未存在模块制造collection错误；其余900源码/生成/合同保持，Root四docs另计。不启动资源或改Git。Root复现冻结真实断言RED后再授下方原既定source/正式生成与其余测试集；当前不写源码或消费候选。

Data按Root当前Manus实际CUA同页三段/三管理行，Help沿本产品真实说明。只有任务分享管理可用，其余能力disabled；正常浏览器等待旧HTTP标签人工恢复，独立实现继续。下方“尚未授tests”等段为历史，完整Goal active，Skills/连接器排除。

SET21/22参考页面澄清（Root实际CUA）：Manus Data为同页依次“已分享任务”“已分享文件”“已归档任务”三段，不是页内三个tab；其下授权应用、云浏览器数据、已购买域名各有管理入口。Web只新增Data/Help两导航tab，Data内容沿同页三段及三管理行。现只任务分享具备真实owner，其他段保不可用说明/禁用管理，不制造“暂无”的假空事实。Help为侧栏底部本产品帮助入口，不能复用Manus客服。

## SET-21/22-Web Data/Help任务卡（2026-10-15；D0独审通过，尚未授源码）

storage_platform_audit绑定26695df四文只读独审无确定P1/P2；server从正规oidcRpConfig fixed tenant与HttpOnly subject核cursor，browser不新增tenant字段。仍未授tests或source，必须等待BFF正式发行。

正式基线26695df038ea5a5d5f45e652c8bef789f0271db0/904 tracked clean，Root保存原hash；SET20正常服务已精确启动该Web，fresh16scope/真实凭据表单链通过，CUA旧data断线页仍待人工恢复。BFF唯一writer实现本人分享GET，正式15.3 commit/digest前Web不消费；本阶段四D0由Root写，runtime_audit只读核接缝，storage_platform_audit后继独审。完整设置Goal active，非技能/连接器范围继续。

| 任务 / 文件集 | 后继具名范围（不是当前源码授权） |
| --- | --- |
| SET21 source | 新app/api/account/shared-tasks/route.ts、lib/server/shared-tasks.ts、lib/server/session-share.ts、lib/shared-tasks.schema.ts、lib/shared-tasks-json.ts、ui/settings/shared-tasks-client.ts、use-shared-tasks.ts、sections/data-management-section.tsx；新源只已有目录。 |
| SET22 source | 新sections/help-section.tsx；沿真实本产品说明，禁假客服/发消息/外部Manus客服。 |
| 现source | settings-types/navigation/header/panel-content、sections/index、settings-modal.module.css只两新tab；engine/client只revokeShare正式ShareReceipt与可选signal/预算支持；app/api/session/[...path]/route.ts只exact share提前分派。ShareButton源/非share generic/Team/账户/Skills保持。九locale只append具名Data/Help键，旧键值不改。 |
| 机器 | 新scripts/generate-bff-shared-tasks-client.mjs、openapi-ts.bff-shared-tasks.config.ts、src/generated/bff-shared-tasks正常生成；正规单src/generated/bff-public-openapi.yaml原字节；现scripts/generate-bff-team-client.mjs、generate-bff-account-sessions-client.mjs、generate-bff-account-profile-client.mjs、generate-bff-agent-failure.mjs/三openapi-ts.bff-Team/account-sessions/profile config及既有generated正常出处变更。没有新可编辑public manifest/schema。正式owner提交后记录新pin/digest再另授。 |
| 测试 | 新contract/bff-shared-tasks-public.test.ts、lib/shared-tasks-schema.test.ts、system/shared-tasks-product-route.test.ts、system/session-share-product-route.test.ts、ui/shared-tasks-client.test.ts、ui/use-shared-tasks.test.tsx、ui/data-management-section.test.tsx、ui/help-section.test.tsx；现engine/client-artifact-share仅正规ACK修fixture+负控、ui/share-button仅合法fixture并保原行为，ui/settings-modal/系统Next HTTP追加两tab/精确route；现其他session-route两测试只加share分支并保非share。 |
| shared whole出处 | contract/api-contract.test.ts与现bff-Team/account-sessions/profile/agent-failure/project-create/project-resource/library-file/library-artifact/skills-mcp public测试仅正式pin/version/count及新外层逆门，原能力oracle保持；package仅具名生成/contract/test注册，不加deps/lock。 |
| 依赖 / 验收 | 当前只D0，等独审及正式owner再tests-only真RED→Root复現→source另授。固定Node22/pnpm11纯门/真实Next HTTP/冻结独审/Roothash与实际PG/正常CUA分开；任何旧门失败保留。Root docs/INDEX/Git/资源，worker不自行扩大文件集或启动共享服务。 |

具体cursor/两10s/HTTP origin/EOF/六字段退役/完整重读后显式继续以三设计一致顶部为准。ACK无session_id，绑定请求上下文而不虚构字段级目标校验；opaque旧ID/title保真。只有新分享列表可用，其他Data区域disabled并说明未提供，不假空。正常正向分享需真实任务/合法执行链，受控PG链不冒正常UI。

## SET-20-Web 团队可靠恢复任务卡（2026-10-15；V2源码已接收，正常集成进行中）

基线3ed206c26dd42df8b979c3b1cba8e9649e1c5a97、901tracked clean；原字节Root保存var/dev/set20-web-baseline.json。TECH/API/DATA文首明确单owner、六现mutation/九operation、single budget/ACK binding/EOF/身份退役/unknown写栅栏。Root仍独占docs/INDEX/Git与真实资源；storage_platform_audit已绑定三设计只读独审无确定P1/P2。四具名测试先真实RED28FAIL/55PASS，原52oracle另实际PASS；Root固定Node22/pnpm11独立复现相同28FAIL/55PASS后授runtime_audit同一卡精确源文件实现，不以旧32PASS冒新反例已覆盖。

| 范围 | 候选允许 |
| --- | --- |
| 现源 | src/team/client.ts、schema.ts；src/app/api/team/[...path]/route.ts；src/ui/team/team-panel.tsx与team-panel.module.css；src/ui/settings/settings-panel-content.tsx仅Team分支props；src/ui/auth/product-auth-client.ts仅endProductSession可选signal/退役check，其他原调用保持 |
| 新普通源 | src/ui/team/use-team-settings.ts（权限读取/写恢复/作用域状态）；src/team/json.ts（Team raw codec） |
| locale | 现九i18n文件只append本片Team反馈键，旧全部键值/Skill连接器不动 |
| 现测试 | tests/team/client.test.ts；tests/ui/team-panel.test.tsx；tests/system/team-product-route.test.ts；tests/ui/product-auth-client.test.ts；tests/ui/settings-modal.test.tsx仅Team实props与原菜单不变；tests/system/product-bff-next-http.integration.test.ts仅真实Team EOF/scheme/missing Origin负控，fixture资源由Root运行；tests/team/permissions.test.ts若必要新增完整权限分页场景但不改角色语义 |
| 新测试 | tests/ui/use-team-settings.test.tsx仅直接有意义的unknown锁/生命周期/同步双写/有界权限读负控，可选择以现component覆盖而不新文件；不新资源runner |
| 门 / 保护 | Root旧三tests32PASS留存；先真实RED后source；固定Node22/pnpm11，normalcontract/architecture/lint/type/build、精确freeze+901保护。Root实际全测/资源/E2E/CUA统一，未授worker Git/进程/数据库/浏览器、其他repo/dependency/framework/public合同修改。必要越界先报Root。 |

Root正常SET19已按正式Web3ed/BFFa88/IAMc64运行，fresh login及精确16scope核验；首次启动配置失败已纠正并保留日志。CUA旧tab为禁止data错误页，安全策略拒reload/goto，已请用户手动恢复HTTP；不换browser/伪造UI结果，只有浏览器门待回复，独立Team修补继续。


SET20 V2冻结25writer（22既有/3新）及875原字节保护经Root独立逐hash/范围/原设计后缀核；首冻独审指出默认follow，唯一client/test窄修redirect:error、真实2FAIL→39clientPASS；V2其余23writer和875保护不变，复审无剩余确定P1/P2。首冻7专项172PASS及Root独立172PASS；原52业务oracle另独立PASS，fixture例外只正规ACK/Origin/在线身份/signal。normal contract282/architecture50、lint/type/build已通过，V2lint/type通过；Root最终V2七专项174PASS，最终build exit0；完整normal仍有失败，不宣全绿。

Root实际Next HTTP原四项和新增Team EOF/explicitOrigin共5PASS。首轮全部500输出保留；固定工具PATH后私有诊断及正规原文件均5PASS，未独立确定首轮500原因，不修改正规fixture/oracle。Root额外自有双HTTP端口原生GET307/308在首冻实际接受foreign末端响应，2真实FAIL；V2后同样原生GET两例PASS且foreign目标零请求。原生POST307/308因Node22 detachedArrayBuffer不能证明follow，与作者mock策略负控准确区分。正常团队浏览器journey仍待旧断线标签人工恢复，未伪造通过。

Root完整normal首轮3833PASS/8FAIL，复轮3830PASS/11FAIL：六既有UI/翻译/Skills失败、既有R177以及登录/仪表/运行清单的波动原输出均保留。续期单例1PASS，当前五系统波动项隔离分轮3PASS+2PASS，原3ed私有副本同五项5PASS；不声称全仓成功或确定首轮失败根因。Playwright14PASS/6此前同名桌面超时/4SKIP；Redis测试库原key集合与PostgreSQL库名集合精确恢复。源码验收接收，正常发行/runtime/browser仍按Root后继门继续，整体Goal active。

## SET-19 Web 源码及真实 Next HTTP 已接收（2026-10-15；正常浏览器待验）

冻结0f1644e6的64writer路径/833原保护与875基线由Root独立逐hash核，formal BFF a88/public15.2/145全文3214e32d与Git blob精确相同；storage_platform_audit终态独审无剩余确定P1/P2。九locale仅append9姓名键；八原contract与api-contract原业务断言逆向重建恢复基线；Team/设备原生成正文保持，依赖/锁/SQL/Skills连接器功能不改。Root继续更新CURRENT及三设计实际状态/INDEX/ACCEPTANCE，故Root文档另计，不宣称与冻结旧doc hash等值。

作者纯门175专项PASS、50architecturePASS、282contractPASS与四正常生成检查通过，lint/type/build exit0；Root正常真实Next HTTP四项PASS（含原文重复key与明确canonical Origin、无登录401及零BFF）。正常完整测试正确复用既有Redis9后202files/3759PASS/7FAIL/0SKIP；其中六个失败已在原正常台账，R177匿名handoff的12/11断言又在原保留checkout同条件独立复现、相同诊断，非本片新失败。首轮漏显式Redis地址的16FAIL/154SKIP记录保留，不冒合格资源门。测试退出后Redis9原0key与10个数据库名称集合精确恢复。

正常Playwright候选隔离copy运行14PASS/6FAIL/4SKIP，六个desktop preview/navigation timeout与上一轮具名失败一致，尚未解决；不以它们冒全E2E绿。首copy的Turbopack symlink越root启动失败保留；只测试副本root改共同父目录后重跑，正式next.config原字节保持。真实用户姓名保存/刷新/重新登录由Root正式集成fresh16scope后验，不能由上述组件/fixture绿替代。整套设置Goal仍active，Team/Data/Help待后继。

## SET-19-Web 本人姓名保存任务卡（2026-10-15；D0独审通过，源码准入）

正常contract新增的唯一whole-artifact断言失败已定位为现`contract/api-contract.test.ts:719–720`旧15.1/SHA；Root补准入仅该两值同步15.2/3214e32d，原Scheduler shape、负控、描述和其余字节保持，不把新增失败记作旧债。401可能出现在owner ACK后的最终session退役，因此UI按unknown锁写并权威重读，成功后仍需显式review选择。429必须有合法1..86400 Retry-After，其他状态出现该header拒绝；两端原预算和closed响应规则保持。

基线08125f9baacc53db22255379b3f79d8e8a30febd，875tracked原字节Root保存；原checkout clean。现正常账户name只读，userinfo GET、设备管理已验收。正式BFF已commit/push a88e710d2201342200017f44c2bc34325937b5d0，public15.2.0/145，canonical全文SHA256 3214e32d273fbc514db1c1f2307f7855b623f1f613fb1da710cc51d23c41f453；IAM c64/internal0.13正式前置保持。BFF V2独审、Root108项及真实十四HTTP请求/数据库/资源收尾通过，不代表Web已完成。Root三设计已明确长旧名保真与最终完整session等值栅栏、显式保存和unknown重读；storage_platform_audit只读D0独审无确定P1/P2，runtime_audit现获下表唯一源码权限，不重复总体设计。

| 项 | 范围与完成条件 |
| --- | --- |
| 目标 / 分工 | 本人name真实保存→权威GET→刷新/重登；runtime_audit后继唯一源码writer，storage_platform_audit独审，Root docs/INDEX/Git/正常集成/真实CUA。 Skills/连接器排除，其他账户敏感写不纳本片。 |
| 新普通源 | src/lib/server/account-profile-update.ts；src/lib/account-profile-update.schema.ts（generated-derived closed shape及本片raw JSON codec）；src/ui/settings/account-profile-update-client.ts；src/ui/settings/use-account-profile-editor.ts。无新业务目录/模块/框架。 |
| 现源 | app/api/account/profile/route.ts增加PATCH/精确Allow；lib/account-profile.schema.ts仅原name16384保真；lib/server/account-profile.ts与ui/settings/account-profile-client.ts仅256KiB/final-session/raw读的必要接线；ui/settings/use-account-profile.ts提供同scope权威reload结果；sections/account-card.tsx与settings-sections.module.css仅live编辑/显式保存/反馈，preview保持；lib/server/oidc-provider.ts仅第16scope append。 |
| 机器 / 正规生成 | 唯一src/generated/bff-public-openapi.yaml取正式BFF15.2 Git blob；新增scripts/generate-bff-account-profile-client.mjs、openapi-ts.bff-account-profile.config.ts、src/generated/bff-account-profile/**正常产物。原scripts/generate-bff-account-sessions-client.mjs、generate-bff-team-client.mjs、generate-bff-agent-failure.mjs仅新完整commit/digest及正常旧产物再生成，old shape/fingerprint保持；package.json仅新generate/check接线。 |
| i18n / 测试 | 九locale仅新增姓名editor文案，不改Skills/连接器键；现tests/app/account-profile.test.ts、tests/ui/account-profile-client.test.ts、tests/ui/account-card.test.tsx及tests/architecture/governance.test.ts必要行为/注册；新增tests/server/account-profile-update.test.ts、tests/ui/account-profile-update-client.test.ts、tests/ui/use-account-profile-editor.test.tsx、tests/contract/bff-account-profile-public.test.ts；现tests/system/product-bff-next-http.integration.test.ts增加具名Next HTTP PATCH用例。其他必要路径先报Root，旧语义oracle保持。 |
| 门 / 保护 | BFF正式发行＋三D0独审后才准写；真实RED→GREEN，固定Node22.22.2/pnpm11.25，正常生成/contract/architecture/lint/type/build及适当全门，freeze exact paths/hash与原875保护；Root冻结独审及真实资源/CUA。依赖锁/SQL/其他repo/正常服务/Git不授worker，旧全仓失败不冒绿。 |

Root额外准入现tests/contract/bff-{account-sessions,team,project-create,library-file,project-resource,library-artifact,agent-failure,skills-mcp}-public.test.ts仅唯一完整artifact出处commit/digest/version/count及其精确assert同步；原各能力shape/fingerprint/语义负控保持，混合Skills文件不改业务字段或功能。现tests/server/oidc-provider.test.ts仅16有序scope及旧15/13/10等负控，保原15前缀精确证明。该必要消费者出处更新不授Skills/连接器实现权限。

## SET-18 正常 DELETE 空流修补与真实设备撤销验收（2026-10-14）

Root 已按正式 gitlinks 正常启动 SET-18，并取得十五项有序 scope 的真实新 code grant；真实浏览器登录及本人设备列表读取成功。退出其他会话实际被 Web 返回 400 account_session_invalid_request，目标仍在权威列表，不能称撤销成功；较晚旧 cookie 的 401 可能来自 access token 自然过期，已明确撤回其撤销证明用途。

原因已核本仓 Next Node adapter：无正文的 DELETE 仍可带 EOF-only Request stream。现具名 adapter 在原十秒总预算内读取并证明 EOF，继续拒绝任何非零字节、非零 Content-Length、Transfer-Encoding 和不合法 Origin；不转发正文，不修改 owner 合同、身份检查或数据库。两 EOF 正控和悬挂输入反例在原实现 3FAIL/43PASS；修补后具名文件 46PASS，七个设备相关文件 124PASS，完整 lint/typecheck/production build 成功；两源码 hash 独审无确定 P1/P2。

Web修补10027a1ba7cd7477b5012a1124a7a98d35cf4aea由Root3386153eff8eac2797f3203848cd073b8de27894精确集成，正常 owned launcher fresh install/build/ready、selected-owner guard及十五项 scope 登录通过。实际 CUA 当前会话无移除入口，确认退出独立正规 code-grant 登录后得到真实 ACK，权威列表由两个其他会话变为一个，bootstrap与当前会话保持。被退出 cookie 随后访问设备列表与 Product identity均401；距该新登录95.66秒，小于正式300秒access寿命，排除自然到期。独立HTTP列表样本241.66ms、退出后拒绝57.6/28.45ms；均为单次本地请求，非性能基准。截图/私有收据保存在本地。仅验收这条设备链路，账户编辑/团队写入/真实完成通知/付款等仍未齐备，整套设置不称完成。

## SET-18 登录设备源码已接收（2026-10-14；正常运行待验）

正式前置为 IAM `284bfd8fea91d57dae18fa2b7c772d75c7b6dcd9` / internal `0.12.0`，BFF `53996400e4100ed5940b104f0dce139d44fec383` / public `15.1.0` / 144 operations，唯一 canonical SHA256 `5972f7be07a0117d8ee036fa4e742da7942b3c864d009c2847e70e69112a747d`。58 个实现、生成与测试路径已冻结，经独立审查和 Root 逐字节复核；独审没有剩余确定 P1/P2。设备入口采用既有账户行，位于登录方式之后、删除账户之前；当前会话无移除操作，其他会话需确认并取得真实 ACK 后重读。

新增两条同源 account/sessions route、严格 schema、server adapter、独立 client/hook/dialog；按原十三 scope 顺序追加 account-session read/revoke。请求具有单次总期限、响应大小限制、取消、最终身份复核及严格合同绑定。未知 DELETE 设独立写栅栏，仅成功首屏读取清除；分页或读取失败不能恢复写资格。单一 BFF artifact 由正式 Git 对象原字节接收，三套窄生成共享出处，原 Team/Agent 字段保持。九种语言只追加设备键；没有 Skills/连接器业务变更。

具名设备/账户/OIDC 七文件 120PASS；正常 contract 含三生成检查 280PASS、architecture 50PASS，lint/typecheck/build 成功。Root 使用既有真实测试资源和正式浏览器依赖执行正常全测：198 文件，3686PASS/9FAIL/0SKIP；旧源码相同环境完整对照为 193 文件，3605PASS/9FAIL/0SKIP。八个失败 case 在旧完整对照也失败，包括测试生成的 Next instrumentation 日志检查；不能据此断言失败原因已确定。候选另有桌面登录视觉超时，单独同文件四项通过；原全测失败保留，不放宽断言，也不称全仓绿。测试资源按起点核对并清理自有数据。

正常 `pnpm test:e2e` 为 24 项：14PASS/6FAIL/4SKIP；六个桌面 case 均在现预览 fixture 的 `/app` navigation/networkidle 超时，原因未独立归因，不能称这些失败已修复或整仓 E2E 通过。预览退出后只恢复工具生成的 Next types 引用，不修改测试 oracle。

当前正常运行仍为 SET-17；fresh code grant、两个真实登录会话、浏览器列表/撤销与旧会话在线拒绝尚待 Root 成对集成验证。真实 Session 创建/到期时间可展示，未知浏览器、位置和最后活跃时间不伪造。本条不表示设备用户旅程或整套设置已完成。

## SET-17 交易预禁用与团队入口正式验收（2026-10-14）

正式运行代码 Web `50b291bf50e65cfcc169784848d2b69a91e80dae`、Root `a123e21718ebea0b78b2f7edadc8035be76a9b39`。Root只替换自有隔离运行，正规owner pins/fresh install/build/ready和匿名login302均通过。computer use正式登录后，团队标签与标题均为团队，真实Owner成员和角色表单可读；Account升级仍打开200空目录。直接旧pay URL显示不可用、实际disabled按钮、不显示未经验证orderId/paid；返回链接实际回到/app并加载工作区。首个Team等待locator误求投影未展示的邮箱，保留观察失败，实际成员Owner终态可见，不当产品失败。未邀请/购买/创建团队或修改偏好。

升级操作到空态约576ms，含工具与观察开销、单样本，不作为后端基准；非空目录预禁用由受控组件测试证明，当前未seed商品，因此不冒真实非空商品CUA。零checkout/支付POST由source与具名测试支持，未声称浏览器另有网络抓包。完整设置Goal继续active，账户登录设备仍需IAM安全会话契约与正式消费者；支付、模型通知等完整链路继续未验。下方为该浏览器验收前源码记录。

## SET-17 交易预禁用与团队入口源码（2026-10-14，阶段历史）

局部切片基线 `08fd6a57516c4688dd63f4ab4f4c65105717d0c2`：现定价面板首次非空目录即disabled，移除checkout handler/redirect/事后失败状态，真实目录金额与全部读态保留；原直接pay页只显示不可用，不把URL当订单，不发模拟支付/合成paid，返回工作区。mock-pay同源adapter保配置、Origin与ProductSession守卫，所有环境准入后503，旧development支付relay已退役。Team导航复用现团队标签，成员/角色/邀请权限保留，不冒充创建团队。

11 worker路径与三设计精确冻结经独立审查和Root逐hash/变更集合核对，无新增确定P1/P2。真实RED保留首次disabled、直接pay、dev/test adapter四失败与Team语义一失败；GREEN Root独立7具名文件91PASS，architecture/contract24文件328PASS，writer最终lint/typegen/tsc/build均0。没有Skills/连接器、i18n、契约生成/SQL/锁/依赖或资金数据修改；受控非空PLAN测试不是实际商品发布。全量22FAIL历史日志保留，未重复全测，不称全设置通过。Root正式运行和computer use目录/Team/直接入口验收仍待此源码提交后完成，完整设置Goal继续active。

## SET-16 正式本地浏览器偏好验收（2026-10-14）

代码固定 `dfb7ab5857f00ae73a9e68eb3a5d65129f2529f9`，Root正式运行代码基线 `915947bd8cb8f2ce3aa043c6355a0b0e0d15e59d`。42路径冻结经Root逐hash核对和独立审查，无新增确定P1/P2；Root独立10具名engine/UI文件合计398PASS，实际Next HTTPS两负控2PASS/3过滤，writer最终lint/type/build通过。私有冻结manifest曾错记347聚焦日志的命令集合，原文件保留、更正另记；347实际8文件含settings-modal/AppFrame，不含Root另验的machine/event-reducer，不能混用计数与命令。

实际computer use已完成正规登录及通用页声音开关保存反馈→全页刷新仍开启→显式启用本页声音后locked提示消失；保持本页两分钟以上后仍显示开启且无locked提示，但没有据此宣称已观察到auth重验请求。两个营销开关真实disabledfalse，原四个可见关闭偏好已恢复。保存与显式启用操作分别约476ms/346ms，包含工具开销，非后端基准。浏览器OS通知许可未授予，正式模型任务完成后的实际系统通知/提示音仍受Agent/Billing授权硬门阻塞；不能据音频解锁或unit证据称听到了真实完成提示音。

全量22FAIL原日志与首次strict-ready失败保留，未重跑全量/完整axe/visual。Skills/连接器无功能变更，完整设置Goal仍active；下方候选与待验记录均为该验收前的阶段历史。

## SET-16 通用通知与声音候选（2026-10-14，待Root冻结独审/浏览器验收）

冻结V1放行撤回：独审确认正常每120秒/返回可见的同主体重验会因 readBoundary generation 错误退役任务锚与音频；Root已在三设计统一稳定资源身份与短期投递门，恢复单一 writer 做现有文件局部修复及具名回归。Root独立8文件335PASS仍未覆盖此生产生命周期。两proxy负控旧源码PASS而V1候选曾500；Root独立审计定位cold-start fixture误把500当ready，授权改为正规/iam/jwks===200。不把全测22失败统称旧失败，实际候选仍待Root独审/启动。

V2生命周期修复候选：先有3FAIL/20PASS真实RED（同主体重验漏完成、错误退役音频、旧unlock关闭后发有效context），后按稳定rawsubject+engine/scope资源和layout admission门修复。正规engine lease负责真正dispose清锚，StrictMode不新增重复资源owner；coupled subject+engine swap只退役旧engine，保留新合法owner head。Settings异步许可仍gen-bound，声音owner稳定subject，每gesture独立attempt fence；同主体重验保已有badge/audio，真实主体/preview/engine/scope清理，退休旧waiting投影不重新登记。V1 manifest及原logs完整保留，V2精确manifest另交；8文件347PASS，最终lint/next typegen/tsc/production build终态exit0。proxy fixture仅正规/iam/jwks===200 readiness变更，顺序冷启动两个负控2PASS/3filtered；首跑与build同期suite readiness未就绪亦保留失败log，不声称Redis因果。V1全测22FAIL未重跑，no-referrer旧baseline可复现，proxy新增失败有cold-start readiness因果并完成实际负控复验；未放行真实候选或实际模型通知。

| 项 | 决定 |
| --- | --- |
| 目标/优先级 | P1：真实任务信号接线、可靠主体偏好、手势音频与不可用营销行；全设置Goal仍active |
| 仓/基线 | Web feat/settings-interface，D0基线5ba1030ee5e095cbf47464991cbef50b2f68eca9，起始clean；路径见主控私有任务卡 |
| 角色 | Root三设计/提交/运行集成；billing_scheduler_audit唯一实现writer；storage_platform_audit只读设计/源码独审；runtime_audit只读正式执行先决条件审计 |
| 允许范围 | engine task-notification/type/machine；notifications偏好及两投递文件；shell任务订阅与原awaiting hook/store清理；AppFrame与Appearance/Communication现组件、只appearance分支readBoundary；General专用i18n和具名测试/相邻INDEX、三设计及本记录 |
| 排除 | Skills/连接器功能与测试、契约/generated/SQL/锁/依赖/服务、任务投递模式、支付/余额；不并行写其它仓 |
| 依赖/未决 | 三设计SET16同决策、原固定正式任务协议；真实模型执行被Agent/Billing授权硬门阻塞。实际通知许可与声音需浏览器能力/明确手势，不能用fake完成任务 |
| 验证/交付 | 先真实失败反例，再具名行为门；完整lint/type/architecture/contract/build，已知全测旧失败保留；worker不Git提交，交精确SHA冻结及日志，Root独审后提交/pin/正式浏览器验收 |

实现候选已接通唯一正规engine observer：本页exact receipt或validated active owner head（合法nullable watermark）锚定未来live waiting/completed；历史run.created不授资格，snapshot已有pause/终态不投递，只有status=completed成功，cancelled/failed/dispatch_failed/EOF无完成声。逐事件直接订阅保持batch，重放去重；真实资源身份退役使迟到receipt/snapshot不能重授资格，同主体read generation重验保留原通知资格，终态owner快照退休旧锚。subject分区偏好不迁移旧global，setItem成功才广播/确认，失败可见；营销disabledfalse并说明暂无owner服务。Notification与Audio资源只由本页关闭，Audio create/resume同步手势启动且resume预算3s，刷新/挂起/退役须显式再次启用，无历史补播；awaiting原badge/title保留，原系统投递双轨删除。Skills/连接器及所有owner事实不变。

V1证据（不是V2完整验收）：两个原实现行为反例2FAIL（存储失败吞没、营销行仍enabled）后GREEN；8具名engine/UI文件334PASS，其后音频非running resume补充与最后adapter窄变更4文件38PASS，有单独终态日志。architecture+contract24files328PASS，两正规generator check通过；Node22.22.2 lint、next typegen/tsc、production build终态exit0，精确命令/日志/冻结由私有manifest交接。未安装依赖、未改SQL/契约/锁、未操作业务服务/DB/OS许可。

一次全测3410PASS/22FAIL/154SKIP，不能称全量通过。旧日志比对多出两个proxy负控500与一个personal no-referrer HTTP超时，同时旧两个UI失败不再出现；Root已在immutable旧源码复现no-referrer超时，两proxy负控旧源码PASS，V2仅修正proxy fixture readiness后两个负控顺序实际PASS，不改变HTTP契约/assert/timeout；不能把22失败一概盖为旧失败。其余确切失败case与suite-hook异常见私有set16-all-tests.log/failure-audit JSON，保留资源/visual/i18n/Skills证据，不扩改受禁止功能。

本候选尚未Git提交或启动服务。当前正常组合只Web/IAM/BFF/Billing，实际模型任务受正式Agent/Billing授权门阻塞；Root浏览器偏好保存→刷新、unsupported/disabled营销、音频手势/被拒等用户证据以及未来正常live任务完成→离开页面→一次通知/声音均待验。unit与生产build不替代这些实际验收，不称全设置Goal完成或已后台订阅。没有新网络/SQL/generated需求，原固定契约不变。此前快捷键已由Root2a3dee7固定并实际编辑/刷新/触发、恢复默认验收，下列旧“待Root”记录为历史。

## SET-SHORTCUTS：可靠快捷键候选（待Root审查与真实浏览器集成）

现有快捷键新增保存失败反馈、冲突验证（含原始录制事件证明的旧符号/新fallback别名）、录制隔离、文本/dialog/repeat/IME负控、Mac与Ctrl平台提示，以及disabled语音行。存储键和用户配置保留。两个真实反例（吞写失败、重复绑定）RED后修复，专用组件/存储/实际Sidebar消费者回归通过；完整门禁输出及精确冻结由主控接收。尚未代表当前运行候选，需Root审查/提交/精确集成与浏览器编辑→刷新→触发证据后验收。

## SET-13 团队完整权限消费候选（2026-10-13，待实际组合验收）

固定BFF已审不可变22a476ea59624b806e8d0013e069efdd6bd26595、public15.0.0、canonical SHA256 5f6b1178cb878718090ba65d6b0d563185078624af0d3d46a01e568af87264a4。唯一snapshot来自owner Git blob原字节，两generator正常write/check；Team派生只新增两permission字段，其余14文件不变，Agent failure仅三个provenance字段变化。原14.7正式BFF相对于旧Web pin已含另一开发者的安装identity私有契约差异，完整snapshot正规继承，不手工裁owner字段；本片没有修改技能或连接器功能源码。

真实Response内置owner/admin/member解析与platform/skill完整权限超集两个新增反例在旧schema2FAIL/12PASS，现严格补两域后client/permissions/Team UI/adapter四文件36PASS；未知域、非法动作、空数组五类仍拒绝。新whole-artifact计数初次契约1FAIL/277PASS，因正式owner已有142项（旧Web141）；仅修正固定snapshot inventory计数后两生成检查与完整contract278PASS，architecture50PASS，lint/typecheck/production build均通过。一次全测为3356PASS/21FAIL/154SKIP，含缺Redis/代理资源、既存i18n/页面及技能相关失败，保留日志；计数修复后仅复跑已变化契约，不冒全测通过。浏览器实际团队目录/邀请与全量E2E、axe/视觉门尚未完成，Skills/MCP交另一开发者不扩改。

本public15.0.0 breaking仅自有开发/v1配对候选，未切main/日常/生产；不是新增权限或IAM授权更改，也不代表新团队创建/切换或Admin适配。Root下一步固定Web/BFF精确gitlink并实际验证。

## SET-09 积分卡片主题修正与设置浏览器验收（2026-10-13）

实际浏览器在已提交Web12f881e、IAMa63bcd0、Root81e616c2候选中完成正式登录、本人姓名/邮箱/ID读取、ID复制成功反馈、issuer确认退出与重新登录恢复；个性化四字段在前一Web020a5ea候选中经真实BFF保存且刷新恢复，设置侧栏真实focus-visible有2px outline。这些只证明对应路径，不代表完整设置、Chat、计费或设备管理已经接通。

本次CUA复现账户积分卡片在深色主题中固定浅背景与继承浅字冲突；现账户和嵌入计费卡片改用既有secondary/foreground/border语义token，不改API、余额、套餐、数据或Skills/MCP。修正后完整architecture50/50与production build（含TypeScript）exit0；仅CSS与记录变化，未重复此前同基线业务/contract测试，固定Web82b5ba6的正式组合已通过真实浏览器登录→账户→浅色→账户→自动主题恢复→账户：账户积分卡片实际深/浅文字对比度分别13.41/15.96，姓名/邮箱/ID均真实读回；只证明该卡片及主题切换，不冒嵌入计费读取/完整视觉验收。缺失真实余额仍不伪造为零。

## SET-07 正式 Next 内部 URL 与浏览器 authority 修正（2026-10-13）

Root实际候选组合登录后，账户资料被account_profile_forbidden拒绝：Next内部Request URL的bind hostname与正规浏览器Host不同。旧额外url.origin全等判断把内部bind hostname误当浏览器authority；不是IAM资料或登录失败。本片用已存在matchesCanonicalWebRequest核正规Host与可选Origin，同时保留URL协议与配置一致、path/query/body原校验，不添加hostname alias或更改launcher。

新增真实Request构造差异回归在旧实现1FAIL/46PASS，最小修正后47PASS；非正规Host、非正规Origin及协议不一致五项负控均403且零session/owner I/O。Root冻结复跑账户server/client/card与modal共112PASS，完整lint、production build（含TypeScript）exit0；变更两文件ESLint、tsc --noEmit --incremental false与diff-check均exit0。实际浏览器需在固定新提交的隔离组合复验，不将unit fixture称为CUA通过。

## SET-08 设置键盘焦点恢复（2026-10-13）

设置侧栏 focus-visible 改用真实 2px outline，并删除 active tab 清除焦点阴影的覆盖规则；鼠标交互仍由浏览器 focus-visible 判定。修复既存 CSS 门禁及键盘所选项无可见焦点的问题，不放宽架构测试。完整 architecture 50/50、原 settings modal 42/42 与 production build 通过；真实键盘浏览器验收仍待。

## SET-07 账户本人资料读取候选（2026-10-13）

同设置功能分支feat/settings-interface，基线6871519；功能候选尚未切换日常运行环境。沿Root已定三设计D0，仅Web新增只读GET /api/account/profile；唯一oidcRpConfig含tenant、Product session及verifyProductIdentity经BFF /v1/me在线准入后，经BFF /iam/oauth2/userinfo读取。白名单subject/name/email/email_verified，缺可选字段null；sub匹配且最终同id/generation/subject session复验后才返回。私有no-store、canonical host/origin、无query/body、禁止redirect、5s总race覆盖初始store/准入/fetch/body/最终store、16KiB上限、取消与迟到body清理。不改Auth.js/session owner/IAM/BFF API/SQL/generated/锁。

账户旧源码真实交互RED1FAIL（有效boundary与真实资料fixture下姓名仍—），实现后同断言GREEN。live绑定既有readBoundary，身份代际变化同步隐藏旧资料并取消、失败可重试，姓名受控只读；即使有真实邮箱也不启用假邮箱写/验证码，计划积分不伪造，登录方式不可用，真实ID复制失败可见且迟到结果不跨身份。preview仍独立。Node22.22.2最新4文件106PASS（server41/client15/card8/原modal42）；此前连SET-05三文件7文件152PASS，后仅增加两条server期限/redirect测试。最终变更源码/测试ESLint、tsc --noEmit --incremental false与diff-check均exit0。完整contract/architecture/test/build/e2e本片未跑，由Root集中执行；真实登录浏览器由Root验收，不能以mock owner响应冒称真实IAM组合通过。整套设置目标仍未完成。

Root 冻结后复跑账户、个性化与原 modal 共七文件 154/154 PASS；完整 lint、Next typegen＋typecheck、契约 278/278 及两生成校验、production build 均 exit0。独立只读审查未发现剩余 P1/P2。全测与架构既存失败仍按 SET-05 记录；尚未执行 test:e2e 或真实登录浏览器验收，不把本片静态及 mocked owner 测试当作实际服务闭环。

## SET-05 个性化可靠保存候选（2026-10-13）

基线 main12acfc6b，独立 feat/settings-interface checkout；功能分支候选，尚未切换日常运行环境。四字段仍走既有 BFF CAS，无服务端/Skills/MCP/数据库/lock/generated 变更。首次读取失败禁编辑且零PUT；成功读取后可持续编辑，失焦写串行；旧ACK不覆盖新草稿；冲突/未知结果保草稿、只允许重读后明确采用服务器或以新revision保存。复用既有readBoundary取消并退役旧身份/卸载请求，不新建认证探测。服务器ACK必须四字段匹配且revision精确expected+1才显示成功。

四个关键交互反例在旧源码真实RED（locale fixture纠正后4FAIL），实现后新card10项/client5项＋原settings-modal42项共57PASS。Node22.22.2直接已有vitest入口；变更文件ESLint0、直接tsc --noEmit0。Prettier使用已安装的Platform formatter（Web未安装formatter），只格式化本片5个文件。首次pnpm exec意外触发已有workspace依赖link检查，输出Already up to date；之后只直接Node运行现有工具，锁文件与原main工作树未变。尚未运行完整contract/architecture/test/build、Next typegen或真实API/浏览器；这些由主控独立验收。该局部候选不代表整套设置完成。

独审两P2补充：旧client非法snapshot/跳revision/挂起fetch/慢body反例真实6FAIL7PASS；现在snapshot必须非负safe integer且null iff revision0，PUT ACK精确expected+1，非法expected_revision不发送。独立schema/error/request各守单一职责；每request私有controller与10s总deadline覆盖fetch和body，最大64KiB响应，超时不取消编辑session；慢body和迟到response均取消清理。最终4文件74PASS（card10/client20/hook2/modal42），包含总预算不随header重置、超时GET重试、未知PUT先重读再明确CAS、身份取消与迟到清理；最终全部变更源码/测试ESLint0、tsc --noEmit0。没有重跑完整门或服务端/浏览器验收，不冒称上线。

码点与翻译复核：四字段按Unicode码点计数（128/256/2000/8000），移除原生UTF-16 maxLength，由编辑hook拒绝超限；补充四字段超BMP边界与客户端响应校验。新增五条恢复文案为全部八个非中文上线语言提供独立翻译，不依赖共享英文fallback。Node22.22.2聚焦4文件90PASS（card22/client24/hook2/modal42），变更源码/测试ESLint与tsc --noEmit --incremental false均exit0。i18n resolve为26PASS/1FAIL：日语1617/1708=94.6721%未达95%；只读HEAD基线同门已失败（日语1612/1703=94.6565%，其余六语言1581/1703=92.8362%）。本片新增五key使分子分母各增五，未引入该覆盖率失败，也未降低门禁或扩改既存未译key。真实API/浏览器及全设置验收仍由Root负责。

主控复核：契约278/278及两生成检查通过，完整lint、Next typegen+TypeScript、production build均exit0；本片client/card/hook48项与既有modal42项分别通过。独审已关闭snapshot、总期限、Unicode三个P2，未发现剩余P1/P2。架构门49/50，失败为HEAD已存在的settings-modal outline移除；首轮全测3261通过、23失败、154跳过，涉及未配置Redis/缺少浏览器、已证实既存的i18n缺口，以及尚未单独归因的UI失败，不宣称全仓通过。正式登录fixture的scope登记不匹配正由IAM修复；真实API及computer use验收仍待完成，test:e2e未执行。此记录只证明当前功能候选的静态/局部门禁，不代表整套设置完成。

## MCP 目录与精确详情独立交付（2026-10-18）

沿已有owner query/category/cursor与精确GET：目录搜索不再过滤首屏数组冒全量，筛选/续页与首屏seed分开；保留已确认行、显式重试、主体/准入代际退休旧请求。Custom API续页只属于当前head，详情按精确locator读取并订阅原聚合写失活。目录OAuth发出ticket仍保详情，关闭/换窗退休等待；active重连仅来自实际OAuth绑定，不从保存配置推断已连接。

JSON导入仅提示当前owner支持的HTTP格式，不预填命令，窄短视口保留操作。既有API/权限/存储/命令owner不变，无新网关、Schema或依赖。Create未知原命令恢复和正常MCP配对仍另验，不将页面可见或fixture成功称真实工具执行、完整Manus一比一或整个目标完成。

## Skills 来源可用性与未知更新恢复交付（2026-10-18）

安装source_status不等于installed/enabled：卡片保留owner实际值，不可用来源禁止新启用/试用，已启用安装仍可停用，详情/历史包阅读及显式更新保留。详情使用exact installation鲜读事实，向父组件交还相同series/revision/source/installation locator的当前选择；不以旧卡可用性或enabled覆盖鲜读；仅同一次详情打开内的显式启停ACK可临时覆盖该次读，池操作及关闭/重开后的迟到ACK不得写新详情。不成为执行授权。

正常已登录页面对照实际800×600阅读器：Manus圆角12px、header高60px、起侧16px及上/下20/12px；本地原圆角16px、起侧20px及上/下10/10px。本片只修这些已测几何，保留既有操作预留、文件树与响应式；不同视口/包内容和动作差异仍不称整页1:1。

未知更新仍保原key/body及ACK与GET之别；新增二次确认的“停止等待”只清当前actor、admitted边界和同一unknown快照的本地恢复意图，不撤销owner写、不合成ACK、不自动新请求。存在active等待或已知ACK时拒绝清除；确认后失活原列表并回读，后续仍由owner pin CAS决定。正常样本未改、未调用模型/工具/扣费；隔离组件证明与正常完整产品旅程分别记录，未把工作树其它模块或刷新改动并入。

## 首次匿名设置导航独立交付（2026-10-18）

沿既有签名return_to/MAC/state、同源固定IAM OIDC，不改认证协议、cookie、权限、刷新或存储。SSR确认没有可用会话时，只返回独立无数据导航组件；浏览器捕获完整白名单设置hash并一次replace到/login，无脚本保留校验过的path/query链接。未知hash不成为开放重定向，已有AppGate/身份判定及故障关闭保留。

本提交只包含导航所需独立增量，不夹带工作树内的刷新状态、调度、资料库或设置业务改动；完整mixed组合与此HEAD-only交付分别验证。正常已有会话保留，不改变现有登录配置或主动登出。首次匿名回调的真实Next/Chromium/Redis与受控IAM/BFF证据只证明该边界，不冒正常真实账号全旅程或整个Skills/MCP已完成。

## 正常双项 JSON 与未知结果恢复（2026-10-17）

基线06d312d，本片没有App业务代码变更。正常Settings两项文档的第二项transport非法，一次POST400；硬刷新GET200只有既有16条revoked MCP、两条API，无候选名。400响应体随刷新退役，未冒已核错误码；源码完整解析在事务前，正常观察不替代PG中途回滚证明。

合法双项一次POST201保存两条不同server/connector。持有成功响应导致客户端unknown：首读Fetch body为base64，工具解码错误延误，后续failRequest已是expired ID，故不称成功注入ConnectionClosed。独立正常窗口fresh GET200见18条/新增两pending disabled；原窗口仍unknown、没有自动重发。关开JSON窗口保RAM原文（界面不回显），显式同key/body字节重试单POST201保同两ID、无重复。

真实发现owner恢复仍replayed=false，不算通过；Platform定向修复已有源码/真实PG证据，正常重载待许可，App不猜标记或放宽断言。随后两样本正常断开，硬刷新18条仅新增两revoked disabled，原16条各ID/名称/状态/版本和两API保持。配置保留，没有永久删除、Prepare、外部端点、模型/工具/积分操作。两个自有窗口回收，Fetch清空/Network关闭、原始headers/key清除；脱敏收据仅Root ignored。

本轮文档检查通过，不机械重跑3k App测试，不冒32项全部边界、真实OAuth/过期刷新或完整MCP/Skills完成；远端及Root index/gitlink继续暂停。

## 项目Skills安装：正常unknown、刷新及项目隔离（2026-10-17）

基线App079f3ed / BFF a804b0f / Platform408953a，正常BFF27117/Platform27118未重启。通过正式侧栏创建一个专用且后续复用的“QA Skills recovery 20261017”项目（project_f80ada35-d900-4cef-98f5-95edff0ca305，POST200）；真实空安装/默认两GET200后，从正式官方来源选择既有E/5，不新增技能/发布者。新项目和一条停用安装保留供后续验收，不删除数据。

安装POST在真实200响应阶段仅断开浏览器ACK；UI保原key/body、锁新增和默认选择。关/开后GET200已见真实安装b68d749f-25b3-45fc-89b9-6f2442a5bafd、enabled=true，但unknown仍保留；来源页产生的4个ListHubSkills/ListSkills POST是只读RPC，项目mutation为0，不把所有POST混称写。显式恢复仅一次完全同key/body安装POST200，receipt change=installed、replayed=true、同安装ID/installed_at/updated_at；首个响应体未留存，event_id只在重放回执中观察。

随后显式停用PUT200，真实文档刷新后再打开面板，两GET200完整响应证明仅1条E/5安装、原ID/installed_at保持、enabled=false且default=[]，刷新无项目写。原QA项目独立GET200仍是原2条安装，其source/enabled/updated_at保持，未改原项目安装；个人安装池本片未核。本片共创建项目1次、安装2次（同key重放）、停用1次；无消息/模型/Tool/Billing或DELETE、配置/权限/Schema变更。Fetch patterns清空、Network关闭、原始headers/key清除、自有63回收，54保留；证据仅ignored。

开始时旧QA页面曾瞬时显示不可用并自行恢复，重试按钮已消失、点击未发生；此前失败响应未捕获，不推测根因或声称该闪动修复。新建入口是hover/focus揭示，键盘Tab进入后可操作；此前按隐藏role查询未命中不算业务失败。仅真实验收/文档，无新增代码/测试，未跑单元/contract/E2E/build。unknown跨文档重载、换账号/撤权及全部来源/执行/MCP仍OPEN，不能以ACK后刷新冒unknown持久恢复。远端及Root index/gitlink继续暂停。

## 项目Skills更新：正常unknown与旧版本竞争（2026-10-17）

正常3310 App7fe6b99（本轮另有纯颜色修复，后提交c49fb21）、Admin a428c09、BFF a804b0f、Platform408953a。沿既有QA系列通过正常Admin发布revision E/5，source_ref=skill:90e57896-3c16-49f5-903e-9b1d170879a9，catalog/official，正常publish POST200。复用已有D ZIP字节，本片验证精确版本选择与恢复，不验证包内容或Agent行为差异。发布前后没有改A/B/C/D状态或新建提供方、权限、积分、配置与服务进程。

两个独立窗口均先真实读到原D/4及available_update E，并打开相同D→E确认。主窗口仅在精确update POST已返回200的Fetch非Document响应阶段断开接收，界面保原命令并锁后续写。关/开后真实GET200显示E/5但unknown仍保留，零自动写；显式重试只有1次完全同key/body POST200，receipt.replayed=true且带event_id，随后fresh read结清，updated_at未再次变化。首个丢失响应未留body，不声称直接比较过两次event_id。旧窗口以不同key发送仍基于D的同目标更新，正式412 skill_installation_precondition_failed/retryable=false，没有覆盖E或伪成功。

412沿既定fresh-binding语义保留unknown，不据错误状态推断旧命令回滚；原已有测试明确保护该行为，本片未为消除提示放宽状态机。旧窗口显式结束前显示“不会撤销已提交操作”的确认，确认后只GET并显示E，零写。该次list的Network响应200但浏览器随后ERR_ABORTED，CDP未保留响应体，按证据缺口记录，不重发写；主窗口最终独立关/开取得完整两GET200，实际default=[]、两安装均停用、原installation ID/series/installed_at及另一安装updated_at保持，精确E/5生效。

项目共3个update POST（2个不同key，含1次原意图重放）；另捕获1次正常/auth/session POST，不冒所有请求只含业务写。捕获无message/execute/run、DELETE或其它项目写，网络无丢页/截断。原始网络对象/key已清除，Fetch patterns清空、Network关闭；自有第二窗口和Admin窗口关闭，QA54保留。截图/去敏回执仅ignored，未发模型/Tool/收费请求，不升级正常执行或整体Skills完成状态。

本轮Skills只做真实验收与文档，无新增生产实现/测试，未重跑其全量单元/契约/E2E/build。颜色修复c49fb21提交前另重跑Node22 css-quality/composer/shared-thread 86 PASS、tsc/lint/diffcheck0，这些不替代版本整链证据。后继仍有安装unknown、换主体/重载、全部来源caller、执行链和MCP等未验项；远端CI/push/PR/merge及Root index/gitlink继续暂停，goal active。

## 聊天中性文字色继承（2026-10-17，局部修复）

基线7fe6b99。用户当前反馈优先，暂停项目版本E更新验收；3342临时组件预览已停止，未重新启动。改在3310原真实会话与已登录Manus完成任务只读对照，发现skin已定义foreground=#1a1a1a，但未声明color，正文继承body预先计算的#0f1729，和控件中性黑不一致。在原skin边界补一条color:var(--foreground)，不在各业务组件复制颜色；暗色继续消费本身的foreground，不改错误语义、布局、请求或消息。

真实浏览器同一断言先false（15,23,41）后true（26,26,26）；390/1280宽度正文色一致、无横向溢出、历史与空草稿保持，窗口恢复。原项目会话E2E增加一条公开计算样式断言，未新增case/suite；未执行完整E2E或build。Node22.22.2下css-quality/composer/shared-thread共86 PASS、tsc --noEmit及lint均exit0。初跑误带不存在的thread文件只执行2套71项，且后续pnpm落Node24；该结果不替代上述显式Node22重验。截图和安全摘要仅ignored，未发模型/消息、改权限/积分或重启正常服务。

这只修正文颜色继承，不冒整个舒适度/所有页面或Agent执行链完成；远端和Root index/gitlink继续暂停。该UI切片结束时，项目E是既有QA系列revision5草稿，包已验证、发布未确认，安装仍D/4且停用、默认[]；后继正常版本验收单独记录，不以当时草稿冒已发布。

## 项目Skills未知回执：正常入口两旅程（2026-10-17）

基线fbcc105，无生产源码或测试修改。正常3310既有QA项目/既有revision D安装，先真实启用，再保存默认[D]；只对该PUT的Fetch非Document响应在已见服务端200后断开浏览器接收，未伪造成功或跳过权限。UI明确unknown并锁住后续写；关闭/重开后真实GET200已显示默认[D]，仍保留原命令，不从新事实推断ACK。显式重试仅一次PUT200，key与body逐字相同，unknown结清；默认选用状态下停用/移除按钮均不可用（仅UI保护证据，不冒服务端并发保证）。

真实清空默认保存200后，对停用PUT同样在200回执阶段丢包；重开真实列表200显示enabled=false，但unknown仍保留、零自动PUT。显式恢复一次原key/body PUT200后结清。最终再关/开，GET selection=[]、两项安装停用、D仍原installation ID/source_ref/revision4；初次停用后与重放后的updated_at相等。总6次项目PUT、4个不同逻辑command key，含2次显式同key重放；零DELETE，捕获网络无message/execute/run POST，未上传/创建/删除技能、未发送模型或收费请求。

恢复目标状态不等于零写：启用/停用和默认保存实际修改过事实，并保留各自命令回执。scope仅同一actor/Project关闭重开和这两种unknown结果，未覆盖浏览器重载持久恢复、换主体、正常CAS竞争、安装/版本更新未知结果或真实Agent/IAM撤权/执行。网络观察无丢页/截断，原始截图与仅含key/body摘要的receipt留ignored；精确Fetch拦截已清空，Network关闭，QA窗口保留，用户窗口未改。

未跑pnpm单元/契约/E2E/build：本轮仅已有生产实现的真实验收和文字记录，无新代码或mock。未重启正常服务、改配置/角色/积分，远端CI/push/PR/merge及Root index/gitlink继续暂停。正式计费用量上限保证仍未发布，System/Agent/Billing跨仓契约方案已询问设计确认，不用模型目录cap或假grant放行执行；完整目标保持OPEN。

## 项目与新建输入区贴边、长草稿挤压（2026-10-17，局部修复）

基线131585f。沿已批准Manus/ChatGPT舒适、克制方向，在真实3310 QA项目及已登录Manus项目顶部对照。发现Frame仍将welcome（也含项目概览）的textarea左内边距强制为2px；项目容器另将form高度固定120，虽input内联125px仍被flex压为50，长草稿提前出现内部滚动。真实修前comfortableInset=false、fullyGrown=false。

删除两处Frame textarea覆盖及其冗余form内边距；Composer维护16px文字内边距、桌面24px行高与216px增高上限，项目只保120px最小高度。原同宽编辑区、独立底部定位、权限/请求/草稿/发送状态不变，无新组件/依赖/契约。真实同段120字草稿在双方436.5px编辑区下均增至191px；本地输入121px=scrollHeight，原为50/125。正常QA九次1280→1068→1067→960→769→768→767→390→1280窗口检查均无横溢，草稿/焦点保持、文字内边距16且自然增高；已清空临时草稿、恢复视口。首页另实测768×120及16px文字内边距。没有发送消息或模型请求，参考临时草稿也已清空。

只扩原项目会话E2E中的长草稿/内边距/自动增高断言，不新增case/suite；完整自动E2E与build本片未跑，不将真实只读窗口检查冒充完整提交旅程。最终定向 `vitest run tests/ui/composer.test.tsx tests/ui/kokoro-project-workspace.test.tsx tests/architecture` 133 PASS，`pnpm lint` 与 `pnpm typecheck` 均exit0；后端Agent未配置仍为独立未闭环问题，不以视觉隐藏错误。远端CI/push/PR/merge及Root index/gitlink继续暂停。

## 真实聊天舒适度与输入缩放（2026-10-17，局部）

基线471a7e1。用户要求Manus/ChatGPT般舒服、克制的聊天界面，沿真实原会话及独立已登录Manus已完成任务只读对照，不再用组件测试页冒产品效果。参考2026-10-17 https://manus.im/app/xR2wFOL9238kc7A9Z4CFik ，中文/浅色；1280×720及1103×764 form768×120、input50、gap12、radius22，390×720 form358×120/input50、字号15（桌面16），line24。旧本地form约95高、中宽707宽；父壳层叠加gutter/压缩高度导致差异，真实DOM基线pass=false。

Frame只摆放footer/header；删除其跨层thread宽高/内边距覆盖，Composer用既有emptyWorkspace投影data-layout并自持conversation样式，项目归属不等于概览（projectWorkspace=true且非empty也走conversation）。项目概览保workspace独立布局；真实QA宽436.5/高120未变。Thread自己持40顶部/16外gutter与768列内16padding，正文16/24。conversation键盘focus从2px外阴影改为1px高对比边框、微阴影；指针聚焦轻边线，高对比仍2pxHighlight outline；不移除可访问焦点，不改网络/模型/权限。

真实100字草稿宽→窄原height73/scrollHeight121而未到上限，证实旧resize只在draft变更触发；保原输入/程序草稿更新，增加仅观察自身clientWidth变化的ResizeObserver，不随draft重建、先更新width、忽略纯高度通知、卸载disconnect。原unit先RED observe0，最终输入/删除、宽度往返、高度通知忽略与清理均承接。原UI case加四种workspace/conversation分型（先RED无data-layout），原E2E case补宽高/草稿缩放断言，均未新增case/suite或CSS字符串锁。

Node22.22.2五个现suite158 PASS，tsc --noEmit、pnpm lint退出0；真实原会话五步1280→390→768×500→1103→1280，输入73→121→97→73→73，草稿100字/焦点保持/无横溢，之后清空未发送。最终三尺寸form宽高/input高度/字号与参考同值；保存同1103×764前后与参考截图并实看本地最终，内容/侧栏数据不同不做全页像素相等声称。真实键盘focus为1px边线；forced-colors outline2px/offset2、shadow none。只读review无确定P0–P2；完整E2E、全量3k和Next构建本片未跑，前轮预览冷编译缺口仍OPEN。无新测试服务、正常服务重启、登录/模型/积分/权限/持久业务写；原会话历史不变，临时草稿/媒体/视口恢复。执行链仍未联调，不将样式完成冒模型可用；远端及Root index/gitlink继续暂停。

架构初跑2 FAIL/48 PASS的原因是旧forced-colors guard把媒体块恰好两条规则当契约；合法conversation无shadow规则被误报。已复用原atRuleBlock限定同一媒体块，仍验证完整shell的2px Highlight/offset2/no-shadow、只豁免同块一个精确input声明，原十项负控和跨文件拒绝全保留；未做文件白名单或丢断言。修正后architecture50 PASS、lint0，只读复核无新增确定P0–P2；不让旧字符串锁倒逼样式，也不掩盖真实焦点缺失。

## 聊天提交后空白：修复滚动所有权（2026-10-17，局部）

基线89e0e6e。用户原会话只读核对：历史/问题仍在DOM；独立无请求的真实ConversationThread复现提交后scrollTop271.5、人工spacer529，最新问题和短历史全部被live助手顶部锚点推出视口。对照官方vercel/chatbot components/chat/messages.tsx与hooks/use-scroll-to-bottom.tsx，采用现shadcn原生贴底/读者主动滚动语义，不搬第二套hook/transport。删除live/scaffold两处scrollAnchor及原先仅补偿该spacer的几何effect/observer/工具；不改消息事实、AG-UI、恢复、HITL、产物或错误归属。

原suite用两条原生行为回归承接短历史生命周期、长历史主动上滚/追加不抢/回最新后增长；删除10条手工造spacer的实现测试，两个旧live-anchor断言改为历史失败及当前反馈各唯一，不删其业务保护。首次回归实际RED：submitting scrollTop344而期望0。正常服务配置未改：当前BFF进程执行开关实测false，Agent未配置报错仍是真实独立执行链缺口；不假装前端滚动修复已让模型可运行。

停写后Node22.22.2：六个现suite 275 PASS、architecture50 PASS，pnpm exec tsc --noEmit及pnpm lint退出0；早期shell自动切Node24的结果保留但不代替目标Node22。真实生产组件独立Vite渲染（非后台整链、无请求派发）1280/390/768三视口共24组状态，最新问题可见、短历史保持、人工spacer为0；长内容读到1537后提交/增量均保持1537，回最新恢复贴底，另五批增量长文底差≤1px，主动上滚后657不被增量拉走。原正常会话六项ID与空草稿保持。前后同1280×720/DPR2截图核对，未将受控fixture称为真实模型成功。只读review无新增确定P0–P2；本片不重跑全量3k、整套契约/E2E/Next构建，不冒整页/全产品完成。无正常服务重启、配置/角色/积分/模型改动；远端及Root index/gitlink继续暂停。

## 动态缩放与组件职责补验（2026-10-17，局部修复）

基线68505ac。正常Manus/本地项目1280→375→1280往返26步发现窗口恰好768px本地提前隐藏300px侧栏，内容全宽误入项目双列；参考768仍侧栏300、主区468单列，767才隐藏侧栏。修复只在既有shell constraints、use-mobile/细指针观察与SSR CSS，不向项目workspace增加分支。独审另指出max767遗漏小数CSS区间；原case扩767.5↔768实际RED，最终订阅和snapshot均读width<768的matches，与CSS同谓词，不依赖取整innerWidth。

同次真实技能面板快速1280×800→375×500，旧共享Dialog duration-200隐含transition all 0.2s，实际宽565.94/top负12.5而参考即时356.25×475。只在primitive加transition-none，保原进出keyframes/timing，不在每个业务面板写resize监听/定时器。正常最终26步输入及焦点保持、无页面横溢、编辑区宽与参考同值；另5步1920/1600/1280往返居中与宽度上限同参考。九组已打开技能面板宽/短高往返，首批尺寸均在屏内、与参考同值，搜索与焦点保持。正常390px粗指针模拟抽屉可打开且焦点在内，跨768退休，返回390不误重开；这是桌面浏览器触摸模拟，不冒真机。全部只读面板及临时输入后清空，无消息/模型/工具/积分/权限/业务写。

最终停写10份代码/测试源码同字节候选：pnpm exec vitest run十个现suite 320 PASS，pnpm test:architecture 50 PASS，pnpm lint、候选pnpm typecheck、pnpm build --webpack与构建后typecheck均0。原case承接往返/旧抽屉退休、草稿/焦点、Dialog首帧边界，不新增case/suite、CSS字符串锁或私有实现断言。原Sidebar primitive只设innerWidth的两个fixture在snapshot改读MQL后失败，现模拟实际媒体条件、保原行为断言；未放宽业务断言。独审10/10冻结，补齐小数区间后无新增确定P0–P2。

自动E2E不是全通过：隔离开发预览项目主路径desktop 1 PASS/3.1s（含动态及面板检查），随后mobile在page.goto冷编译超时，尚未进入其行为步骤；日志保留既有/api/admin-access Webpack编译TypeError。一次有界重跑desktop也在goto超时，后续中止并关闭自有预览，未放宽超时、加skip、拦截权限请求或修改正常环境绕过。手机自动项目提交流程仍OPEN；正常只读触摸模拟不能替代它。未重跑3k全纯测试、全部system/contract或整套E2E，无wire变动。自有候选资源回收，正常App/Admin/BFF/Platform不重启，临时视口/触摸设置复原，QA窗口保留；远端及Root index/gitlink继续暂停。此片不等于全部页面、所有缩放倍率或逐帧零闪动验收。

## 项目中宽断点与编辑区：五组真实双图补验（2026-10-17）

基线d41cd48。用户再次要求两边实际截图对照，沿正常已登录参考项目与本地QA项目，中文/浅色、顶部、侧栏同300、无卡片悬停，保存1280/1103/1068/1067/761×800五组成对原图并实际查看并排图，核DOM/计算样式。确认此前只测宽/窄端点遗漏中宽：参考workspace 767单列、768双列，本地错误960；旧编辑区固定减320也与中宽真实269–320右列不一致。现文档/编辑区共用网格与内边距，宽度实测580/436.5/419/719/713与参考同值，五组无页面横溢；正常输入可用、清空后不发消息。编辑区整行不挡右列，仅实际编辑器子节点接收指针；无JSX/业务/依赖/契约/Schema变动。

只扩原项目会话E2E的临界点/实际几何断言，不新增case/suite；旧不支持的zh-CN fixture换为正式zh，旧返回标题按已批准真实Recent更新，保原发送→项目会话→导航→返回→不进入直接列表的全部流程。正确fixture旧CSS真实RED（预期双列、实为单列）；最终同字节候选项目桌面/手机2 PASS/4.9s，现workspace单元27 PASS，清理自有浏览器产物后lint、typecheck与独立Next16 Webpack生产build均0。两运行路径源码冻结与候选匹配，独立只读复核无确定P0–P2。只做相关验证，未机械重跑3k纯测试、全system或整套E2E。

初次冷编译超时、早期fixture中文定位不匹配、Webpack热更新未载新CSS、错误地以生产模式跑仅开发预览的尝试均未计通过；生成的Playwright报告混进候选lint曾失败，移走自有产物后干净重跑，无新增ignore或放宽断言。保留原诊断，不将这些尝试当产品回归已通过。正常开发输出与进程未重启；所有构建/预览仅自有候选，原图、收据、日志ignored，临时视口恢复、QA窗口保留。远端CI/push/PR/merge与Root index/gitlink仍暂停。

仍非整页一比一：真实项目资料、云服务/模型及项目触发器能力不同；参考中宽不可见免责声明折行占位多16px，本片未补假字段/任意margin。字体、菜单、完整交互与其他模块按对应状态后继对照，完整Skills/MCP与运行链仍OPEN。

## 项目版本更新正常验收与确认焦点（2026-10-17）

沿2476928及正常BFF a804b0f/Platform408953a/Admin a428c09，通过原3310/manage后台给既有官方验收系列创建revision3(C)、revision4(D)，各自真实ZIP上传/完成/验证/发布，不改原A/B状态。项目从实际官方来源安装C后显式停用；发布D后安装行全部原字节保持C，更新确认→取消零更新请求；再次明确确认仅一次POST update200，保同installation ID、series、installed_at、enabled=false、acquisition=hub，包摘要严格为D。刷新后D/停用保持，原另一个安装与默认[]、6条原消息、3条历史user exact引用均不变。新测试安装保留停用，未永久删除、发送消息/模型或触发扣费，也未改权限/配置/Schema/正常服务。

真实取消确认框后焦点原落BODY；只在Section持实际操作按钮与父面板引用，卡片传currentTarget，取消/Escape回可用原按钮，已提交退休/停用时回仍打开父面板，父面板关闭不抢焦点。无全局服务、定时器或请求/unknown状态变更。扩原生命周期case，取消零POST/Escape零DELETE、成功回退及原全部安装/选择/更新/移除断言保持，无新增case/suite；实际RED1 FAIL/26 PASS→27 PASS。正常浏览器同一移除确认只取消/Escape，焦点由BODY变回原按钮，第二次Escape回技能入口，零DELETE。

主方892份源码停写同字节独立candidate全门exit0：contract281、architecture50、纯3103 PASS（167文件）、lint/typecheck、Next16 Webpack生产build/post-typecheck；前后892/892摘要匹配，独立只读复核无确定P0–P2。原jsdom导航提醒保留。自有candidate与克隆依赖已回收，正常开发输出未覆盖。首次测试编辑因相对路径错误未执行，原27项baseline通过；不当作RED，后续具名失败才是回归证据。最后仅追加本文验收记录。

正常unknown/replay与CAS竞争、本次D特定Agent冻结执行、完整来源八类和MCP仍未验；旧历史引用保持不等于发送过C/D任务。整套system、自动浏览器E2E、默认Turbopack build本片未跑；不称完整Skills或Manus一比一。远端CI/push/PR/merge与Root index/gitlink继续暂停，既有窗口保留。

## 项目概览与技能空态双图对照（2026-10-17，局部验收）

基线5db534a。使用已登录Manus同一项目与本地真实项目，中文/浅色，保存1280×800概览、真实空技能弹窗及761×764概览的成对原图，并实际查看未遮罩并排图；测量DOM/计算样式，不以旧截图或测试预期决定布局。宽屏右列320/gap44、窄屏左右24、独立底部编辑区120/底距32、默认侧栏300；滚动文档与编辑区分离，最近会话组件保原loading/error/retry。指令下方入口复用原编辑器；技能真实空态居中且不显示无效0/16保存栏，有安装/选择/待保存改动仍保默认操作。新增共享添加菜单组件，不新增传输/权限/依赖或业务写。使用实际已加载SVG，原字节来源摘要只留ignored。

真实RED后原三suite220 PASS；最终892份源码停写冻结，在主方独立同字节candidate完成contract281、architecture50、完整纯测试3103 PASS（167文件）、lint/typecheck、Next16 Webpack生产build及post-typecheck，全exit0，前后892/892摘要匹配。原suite净增1条行为case，扩既有空态断言，不新增suite；旧jsdom导航提醒保留。独立只读复核无确定P0–P2。正常3310实测空态添加→个人来源读取→返回、关闭与搜索键盘2px焦点；未安装或保存。参考/本地临时视口均恢复，原QA项目窗口保留，自有candidate/依赖回收。

剩余差异明确保留：参考筛选/更多菜单、云服务/模型选择未接通；不从视觉猜Official Essential/Pro后端映射，不造数据/按钮。项目名、日期、账号、会话数为各自真实数据；Kokoro显式项目默认是已批准业务差异。初次刷新后立即程序点击未打开，随后真实点击正常，尚不能宣称首击/页面切换全程无感。390px为桌面模拟，不冒物理移动端键盘。整套system、自动浏览器E2E及默认Turbopack build本片未跑；完整执行/并发/unknown和全页一比一仍未验。正常服务未重启、未改Schema/账号/权限/积分/模型配置，远端CI/push/PR/merge和Root index/gitlink继续暂停。

## Project Skills 独立面板（2026-10-17，本地组件验收）

在7cce46a上，workspace只组装技能入口；独立section、安装卡片、来源选择器、请求hook和CSS分别维护。真实项目安装与默认选择分开，个人/官方来源只使用正式exact ref；原名称callback、假Skill Builder卡、聚合弹窗技能状态和序号定位CSS已删除，旧名称路径直接404。同主体重核保留未知原意图，换账号/项目退休；不自动重发，ACK后只回读。默认项先显式取消并保存才可停用/移除；更新保安装ID，不自动升级。

实际旧行为RED后修复；沿原suite替换两条假卡用例，净增四条行为用例，无新suite。完整纯测试3102 PASS、contract281 PASS、architecture50 PASS、lint/typecheck及隔离Next16 Webpack生产build通过；原jsdom导航提醒保留。独立静态复核未发现确定P0–P2。按Manus当前项目空态只读测量800×680、标题18/24、搜索208×32；同字节显式空预览核1280×720及390×844布局、无横溢和Enter/Tab/Escape焦点。预览默认Turbopack因隔离目录依赖symlink边界退出，Webpack预览通过；自有预览/构建目录和进程已回收，正常开发输出未覆盖。

全门后仅规范新组件排版，随后原三suite406 PASS、lint/typecheck与同字节隔离Webpack生产build再次通过。上述不代表正常项目数据/登录/执行整链验收；整套system、默认Turbopack build和正式产品浏览器E2E未运行。正常Schema/服务配对、Agent冻结执行与Admin current配对仍待续。正常服务、配置、权限、积分与模型调用未动，远端及Root index/gitlink继续暂停。

## Project Skills 传输组件（2026-10-17，本地验证，正常产品待接）

在基线0bdfaea上，安装 adapter 从 catch-all 移到独立 server 文件，同一实现显式 personal/project 目标；个人路径/回执保持。项目默认 selection 的 schema/client/server adapter 分开，仅消费固定 BFF a804b0f/Public16；有序最多16个唯一installation ID、显式[]清空、原key/body、ACK项目与顺序绑定、总10秒/有界字节/fatal UTF-8/取消，无自动重试或self/projects别名。没有新依赖、owner API、表或Schema变更。

实际RED：Project安装错类型ACK、selection错项目ACK被旧generic代理当200；现为502。selection错误消息的非法UTF-8原被规范化404，现拒502。原两个client/proxy文件聚焦316 PASS；沿原HTTP文件扩1条真实网络到受控合同fixture，3 PASS（session为mock，非真实BFF/IAM）。复用原suite，新增11条case，不是新增3k测试。完整纯测试3098 PASS、contract281 PASS、architecture50 PASS、lint/typecheck通过；同字节独立candidate Next16 Webpack生产build通过，自有目录已删除、正常开发输出未覆盖。既有jsdom导航提醒保留；整套system、默认Turbopack和浏览器E2E本片未运行。独立只读复核未发现确定P0–P2。

本片只完成面板所需的传输组件，不称已完成项目功能。后继直接拆出真实Project Skills面板/hook：安装与默认选择分开、未知命令跨同主体重核只显式原意图恢复、ACK后只回读；删除workspace聚合弹窗的名称假卡及onSetProjectSkillEnabled旧入口。正常Schema/服务配对、Agent冻结执行、Admin current配对和正常浏览器整链仍待后继。正常服务/配置/账号/权限/积分未动；远端CI/push/PR/merge与Root gitlink继续暂停。

## S4d Composer 项目技能继承（2026-10-17，本地组件候选）

沿现engine／execution adapter／Skill试用hook分工，项目省略继承、显式[]不选、exact refs覆盖；新建/切换/生命周期退休恢复作用域默认，用户清除仍为[]，未知重试保首发完整意图。strict消息回读接收owner冻结refs，不新增页面状态、服务或依赖。唯一snapshot固定BFF a804b0f/Public16，Team15生成文件保持，Agent failure仅更新provenance。

实际RED3失败→聚焦267 PASS；原rail209 PASS、最终完整纯测试3088 PASS，contract281 PASS、architecture50 PASS，相关四路由242 PASS（含受控HTTP，不冒正常IAM/owner组合）；lint/typecheck通过。隔离Next16 Webpack生产build通过，原开发.next未覆盖、自有构建目录已删除；默认Turbopack build、整套system与浏览器E2E本片未运行。构建揭示并最窄修正两处为测试暴露的自定义Route export和IAM POST可选context；测试改走正式HTTP出口，既有拒绝断言/鉴权逻辑保持，未忽略构建类型错误。

项目安装/默认选择面板仍待独立组件接线，旧名称入口未在App正常激活新模型；正常跨仓Schema/服务配对、Agent真实执行与浏览器验收未完成。无正常账号/权限/积分/模型配置变更，无远端CI/push/PR/merge或Root gitlink更新。

## 2026-10-17 来源 S3 固定消费（源码候选，正常配对待续）

沿05d9504固定BFF `e60ff311075b01f1d0ca58f1cebc47080dbc3ea1` 的唯一Public15.0.0/139 operations，完整canonical SHA256 `e3f70ab1111295d1df10775853ff9c20bf85ea466da32996a73d37a8b16d54c0`。仅公开skill.list owner_type增加hub/device/unknown；本仓没有运行时调用该公开list，网站ListSkills/ListHubSkills/GetSkill、publisher分类和分享五类schema均保持原字节，不为配对凭空增加UI producer或扩大所有来源词表。

唯一snapshot从owner committed blob原字节替换；既有Team/Agent-failure生成器正规write，Team15派生文件原字节不变，Agent-failure只变三provenance值，roles/12 tuples不变。八个whole-public测试更新同一pin，原Skills用例补公开八类与分享五类分开；没有新case/suite。实际RED为旧snapshot下2 FAIL/7 PASS；替换后同文件9 PASS。Admin按同一owner独立配对，不读取其源码或数据。停写12/12非文档冻结匹配，独立只读复核无确定P0–P2。主方在880份当时源码逐字节相等的独立candidate执行完整contract/architecture/lint/typecheck/default test/build/post-typecheck，全部exit0：contract280 PASS、architecture50 PASS、默认181files/3288 PASS/0 SKIP（180.83s），build28.82s；无新增case/suite。依赖使用本机APFS克隆、测试与Next构建均限2workers，未安装依赖或改lockfile；正常.next/登录/服务保持，candidate验证后源码仍相等并已回收。原jsdom navigation提示保留，不冒真实导航验收；既有测试文件未修改区域的格式差异不顺手扩散重排。

本片无UI或网络行为变化，未重跑浏览器/E2E、正常产品会话或真实PG/Redis组合；前述门禁不冒正常owner新列/配对成功。正常新来源Schema启用和项目选择/精确安装/Run冻结另验，不能把治理快照当公开列表UI已实现。

## 2026-10-16 连接器 Settings 实测与卡片表面（局部验收完成）

基线086c840。沿当前正常3310与Manus已登录参考，只读固定相同1600×900/733×764：宽屏dialog1280×810、内容768、标题24/30、搜索200×32，紧凑dialog380×580、搜索178×32，浏览/创建86/64×32及8px gap均已一致；不是按旧截图猜。插件主页管理/创建在同一右上x1418/1512、y8；两侧栏按用户批准宽度有20px差异，不借插件任务改回侧栏。真实目录此刻为空，不能拿参考有推广/提供方时的搜索y226与本地空目录y88直接当同态差异，更未补造目录/推广数据。

实际发现的卡片差异是共享provider/card样式溢入Settings：原normal近白底+11%黑边，hover2%底+20%边；参考透明底+6%边、hover4%底且边不变。只在data-settings-layout范围，以既有foreground语义token混合6%边及4%hover，不改尺寸、状态、Provider卡或网络；正常渲染失败基线已固定，HMR后透明/6%/4%及378×76实测GREEN。未增加CSS源码字符串/固定颜色单元测试或业务用例。停写三路径冻结后CSS Prettier/diff/lint/type0，现app-frame-rail定向 **186 PASS / 17.36s**（runner17.81s）；同字节独立candidate build0（16.53s）、既有public-shell **6 PASS / 5.0s**（runner5.50s）、post-type0（2.74s）；独审3/3冻结SHA匹配，无确定P0–P2。仅CSS上下文覆盖，不再机械重复无独有证据的3288项默认JS/契约/架构测试，最近全源门仍明确绑定086c840，不把它冒本片重跑。Next现锁定实现读取CIRCLE_NODE_TOTAL=3后cpus=2，只有本轮进程环境设置；build页面数据/生成与测试均实证2workers，无永久机器配置或业务代码改动。

浏览器还核Settings连接器→技能→连接器两侧backendNodeId均保持不变；本地搜索Tab到浏览连接器，子目录关闭后保原Settings且焦点回Browse。紧凑子目录696.34375×680也与参考一致；修后733×764仍380×580/348×76卡片且scrollWidth=clientWidth=380，390×844时dialog380×580位于x5/y132，无横溢。截图只采稳定后的显式clip；初次tab截图与早期CDP图受缩放/动画影响，已排除，不据此调整样式。上述只证明明确几何/焦点锚点与卡片表面，不冒全部页面/权限/到期状态、目录非空或完整Skills/MCP完成；八来源、项目真实安装、refresh/执行准入等未决保持。无业务写、模型/角色/积分/凭据/远端/Rootgitlink变化。

## 2026-10-16 GitHub 导入 HTTP5xx 的结果未知分类（局部验收完成）

基线38a1186。本轮完整目标审计后，独立只读复核找到可达P2：BFF已创建draft，后续checkpoint不可用或响应绑定失败可返回503/502；App严格client将合法错误构造成http reason，旧flow却展示确定failed，而不是unknown。现只把非preview的HTTP5xx纳入unknown，原selector/各stage key/body、显式原请求重试与actor/取消围栏不变；不清意图、不自动重发、不改后端/契约/Schema。

先扩原11个flow用例中的现有参数及读回/CAS/重核分支：旧源码实际4FAIL/7PASS（import/publish/install与draft后read）；HTTP502/503、网络未知后，关闭/同actor重核不清意图、不能换仓库、恢复复用原body/key。preview502仍failed且可再读；Import404继续保原意图，不能因HTTP404就推断未建draft。候选两文件57PASS，scoped ESLint/diff0；停写四路径冻结后源门contract280/architecture50/lint/type/diff0，181files **3288 PASS / 0 SKIP / 189.23s**（runner189.69s）。独立同字节candidate production build0（17.14s）、现development public-shell E2E **6 PASS**（runner6.39s）、post-type0（5.02s）；独审4/4冻结SHA匹配，原P2关闭，无新增确定P0–P2。无新case/suite；公共壳E2E不是已登录GitHub故障注入。测试限制2workers，临时测试/预览树已退出、3324无监听；正常App3310/BFF/Platform健康200，不触碰正常App构建目录。初两次命令误在Root与将Platform Vitest2参数用于App Vitest4，均未收集测试；改用本App入口与maxWorkers2后才记录有效RED，不把启动错误当缺陷证据。

最初推演GitHub仓库404可直接重新选择不成立：source GET404实际映射502，而aggregate Import404也可来自draft创建后步骤。已撤回该实施建议，不新增unsafe reset。完整安全换源恢复若需owner阶段证明仍是后继；本片只修当前表示不确定结果。尚未跑正常产品故障注入，不冒受控flow为真实HTTP/PG或正常GitHub写入旅程；无模型/权限/积分/远端/Rootgitlink变动，完整goal继续OPEN。

## 2026-10-16 Skills 下载正常产品补验（无源码变化）

App 源码21a1fc5、BFF b4292b6、正常 Platform 行为0581429。正常3310当前开发账号从“我的技能”打开已有active安装详情，点击下载：正式 installation download receipt200，再由现同源会话绑定流返回application/zip200，浏览器实际保存446字节ZIP；未保留opaque下载token URL。归档CRC检查通过，仅SKILL.md，其UTF-8字节与此前同源正式package读取的同一所选文本逐字节相等，不执行包内容。

这只补真实单根文件下载旅程，不冒嵌套包/过期链接/未知下载错误或整个Skills能力验收；已安装状态保持，无新安装/启用/角色/积分/模型调用。截图/ZIP/脱敏摘要仅现ignored证据目录，临时tab50及Network已关闭。本文档变更只做diff/局部链接检查，不重复运行App业务门禁；最近业务代码全门仍绑定cd78cb9。MCP到期与刷新新设计待确认，八类来源/项目安装及完整goal保持OPEN，远端/Rootgitlink不动。

## 2026-10-16 分享页正常成功链与真实非零滚动（补验）

业务源码cd78cb9、正常BFF c6bb5d3/Platform0581429。此前未找到可复用分享URL并非必须扩权：正式源证明Skill Share只存固定revision locator，resolve/summary/package仍逐次按当前调用者资格读，不授匿名/跨tenant或creator替代权限。本轮经原UI对已有测试资源显式获取链接，不导出登录凭据、改ACL或直写数据库；链接保留未执行不可恢复撤销。

有效settings-intent样本正式POST201→summary/package200，回执source_ref与摘要/包一致，decimal revision相同，真实SKILL.md正文可读；已有安装真实显示已添加且禁用添加按钮，无install/enable写。390×480稳定dialog370.5、页面无横溢，实际内容scroll范围324并以原生滚到324；自然下一次120s重核auth3→4/resolve2→3/summary2→3/package4→6后仍scrollTop324、正文在、同一Dialog backend。没有注入focus/visibility或关闭周期；整页刷新后相同标题和真实安装状态保持。此补上真实非零滚动，不再只有受控240px证据；非默认嵌套路径仍只受控fixture（真实包只SKILL.md）。

来源页UI显示已复制，但Tab clipboard bridge读空，未把它当系统剪贴板正确性证明；仅从已观察到的正式201取得同源locator进入分享页。另发现已撤回revision2仍Create201/Resolve200却Summary404，原安装确为withdrawn/disabled：BFF把本人可预览当可分享，现正沿原route修复活动版本资格，不放宽owner的撤回拒绝。上述成功链绑定旧正常BFF，不冒新候选已激活/全产品完成。截图/网络窄投影仅ignored，46/47/48与临时视口/Network均清理，无新增常驻服务、模型/资金/角色操作。完整目标及远端CI/push/PR/merge、Root index/gitlink暂停保持。

## 2026-10-16 Skills 分享页重核生命周期（局部源码验收完成）

沿基线7221780，将原分享页 actor/share 的展示身份与每代私有事实分开。先扩原8用例中的3项（不增case/suite）：旧源码实际 **3 FAIL / 5 PASS**，分别为generation-only未abort写、A→B未回读就返回A复活旧摘要、同actor重核保旧summary。现同actor/share保持同Dialog与reader，summary/installation/失败反馈/ACK随admission、generation、读重试即时清理；fresh resolve与summary精确source_ref相等才展示，fresh包仍核实际UID/decimal revision/目录字节，失败在原Dialog重试。换actor/share通过原identity key清reader意图，不给A→B→A复活事实。

原unknown安装intent独立保identity/source/series/key；新代不自动重发，只有显式点击且fresh实际安装事实允许才复用原key。旧代读、ACK及finally都按token永久失效，已退役写signal取消，不借旧ACK清新意图；每代布局cleanup拥有写取消，旧读cleanup仅取消自己的controller，避免误取消后继写。没有新Schema/wire/owner/认证旁路或依赖。首useMemo空对象被exhaustive-deps指出依赖不被消费，改为显式identity/admitted/generation/attempt token；exactOptionalPropertyTypes保持，用条件spread而不是放宽sharedSummary类型。测试误用返回按钮译名已按现真实文案纠正，不当产品RED。现scoped lint/type与8定向通过。独审发现同subject保留但会话unavailable时原手动probe.retry丢失的P2，已在原reader用例实际RED后补pending错误、requestPending忙状态和当前token下的probe.retry，summary重试仍走admitted/attempt；复核该P2关闭且无新增确定P0–P2。最终停写四路径源门contract280/architecture50/lint/type/diff0，181files **3288 PASS / 0 SKIP / 187.24s**（runner187.67s）；独立同字节candidate production build0、现development public-shell E2E **6 PASS / 6.05s runner**、post-type0。独审4/4冻结SHA匹配，无新增确定P0–P2；不将公共壳E2E冒已登录分享包成功验收。

正常3310沿现登录入口回到明确不存在的share，真实读取失败仍同一Dialog：鼠标Retry产生GET1→2、Tab落Retry后Enter产生第3GET，显式alert/retry保留、页面1280无横溢；截图仅ignored，自建45已关闭。没有创建分享或安装/模型/资金/权限写入。真实环境尚未找到本轮可复用的既有技能分享URL；不为阅读验收创建新的私有技能分享访问。非默认文件/240px滚动、summary失败、generation-only、迟到ACK和跨actor均为受控UI与严格实际client证据，不冒正常已登录分享happy path。原完整Skills/MCP/Admin/八来源/项目安装/手册及远端组合继续OPEN，远程CI/push/PR/merge、Root index/gitlink保持暂停。

## 2026-10-16 Skills Reader 同主体重核位置（局部验收完成）

基线25da417。上一片观察的回退由正式重核输入可复现：同actor generation/admitted改变以及父级pending的skill=null触发同一identity reset，reader/path/folders一起被清；随后 fresh目录又强制SKILL.md。沿现Settings父级重核用例补真正非默认文件、旧事实退出、分页失败后显式重试恢复，实际RED为reader按钮消失。现在Settings以已有source＋精确locator固定Dialog实例；viewTarget和generation事实token分开，前者只保展示意图，后者仍同步清metadata/install/manifest/text/下载反馈并取消旧读。换主体、换资源或关闭仍清意图，A→B→A不复活；无新接口/Schema/凭据、认证降级或停周期。

fresh目录中仍存在的原路径才恢复，失去路径回SKILL.md并清位置；原已检查包/精确安装pin与外部UID分流保持。readerCursor使用ref、按viewTarget的layout生命周期清理；不修改useMemo返回值。最初memo可变候选被ESLint immutability拒绝，改为ref后未关闭规则。文档scroll在fresh正文布局时还原，新增原用例240→0实际RED后恢复；这是受控DOM滚动状态证据，当前正常安装正文很短，非零真实浏览器滚动尚缺样本。

原安装pin/下载forbidden分支复用两次重核：先挂起新代文件读，再退休/abort并由后一代读取，最后让无视取消的旧响应迟到，确认不能覆盖正文，展开和原文件保持。Settings原A→B→A、下载拒绝、同文件零重读、显式返回再开重置断言保留；pending reader仅通用标题/占位，无旧正文/下载动作，避免重复DialogDescription ID。现7定向通过、scoped lint/type通过，无新测试case/suite。最终五路径停写源门contract280/architecture50/lint/type/diff0，181files **3288 PASS / 0 SKIP / 198.18s**（runner198.62s）；独立同字节candidate production build0、现development public-shell E2E **6 PASS / 6.13s runner**、post-type0。正常3310 reader在同一文档自然经过两次120s重核：auth读取2→4、精确安装package读取2→6，reader仍打开且Dialog backend895不变；未关闭重核、注入session或保留可操作旧正文。真实短文无非零滚动范围，240px恢复与嵌套路径仍仅受控DOM证据，不冒全真机验收。只读复核未见新增确定P0–P2。

分享页须独立后继：当前summary/installation仅按actor＋share ID匹配，不按generation/准入隔离，因此同主体重核通常仍留旧summary；fresh resolve/summary失败才转main提示并卸载详情。读effect缺generation依赖，不能泛称每次重核均卸载。后继应稳定actor/id展示、立即清各代事实并隔离旧ACK，原unknown安装key独立保留、只显式恢复。本片不冒已解决分享入口。测试自有Next及worker已正常退出，候选3324已释放，自建44已关闭，原App开发服务/其他正常owner保留，无额外常驻服务；原完整Skills/MCP/手册及远端交付目标仍OPEN。

## 2026-10-16 Skills 包文件导航对照（局部验证完成）

基线 a74cb41，正常 Manus 技能包 reader 与本地当前安装 B 对照：桌面文件行原 16px/24px/41.59px，参考 13px/19.5px/27.5px；目录原全部展开，参考初始关闭，选文件保展开。现改为空展开集合，保 owner 目录/精确 revision 请求；本人管理 reader 删除重复树渲染，复用原纯 `SkillPackageFiles`。桌面同865×764下真实 SKILL.md 行 x47.5/y183/w171/h27.5、图标x73.5/文字x93.5，与参考一致。

紧凑文件菜单原撑至 reader 底部，现为240px内容尺寸菜单；标题带原69px现60px，文件选择后收起（含当前文件、零额外GET）。键盘实测发现收起后焦点掉BODY，已补还给文件入口，并沿现安装 pin/下载错误参数用例增加断言，无新case/suite。文件菜单的Escape保持既有Dialog行为，参考实际Escape退出整个详情，不臆造只关菜单。865/673/672/390/375在实际CSS过渡完成后保当前B正文、无页面横溢；前一即时resize采样处于过渡中，不作最终布局证据。390最终dialog宽370.5、375宽356.25，标题带均60px。

现真实本地两安装仅有SKILL.md，嵌套目录通过同一现有安装用例验证默认关闭、逐级打开不读、精确路径读、切回保展开/重新进入重置；不伪造正常嵌套包。首新增fixture未排序被既有严格wire拒绝，纠正fixture后实际RED为默认展开；菜单选择/焦点分别实际RED后GREEN。阶段typecheck查出新测试误用Testing Library exact选项，改为锚定name正则后重新冻结完整门，不放宽断言。最终Node22 contract280/architecture50/lint/type均0，181文件 **3288 PASS / 0 SKIP / 185.45s**；同字节独立候选production build0、development public-shell E2E **6 PASS / 6.0s**、post-type0。独立只读审查冻结7/7 SHA且无新增确定P0–P2。正常当前安装B最终键盘文件菜单→Tab有2px焦点轮廓→Enter收起且回焦入口，截图/几何ignored，自建两标签关闭，参考视口及连接器页恢复。不以公开壳E2E冒已登录业务证据；既存非统一格式基线不在此重排。

另观察到正常reader会自行退回详情；静态链可证明同actor重核先撤准入/递增generation、父级pending清skill、详情identity reset清reader/path/folders，fresh目录又强制SKILL.md。周期120s与focus/visibility都可触发，但未取得两次实际回退的触发事件时间线，尚不锁定为其中某一种。该既存UX缺口不计入本片已修复：下一片拆展示意图与fresh事实，仍立即取消旧读、清私有正文并重验pin/目录，不放宽认证或停重核。后端、权限、数据、资金、模型及远端不变，完整目标仍未完成。

## 2026-10-16 Settings Skills Explore 冻结终验

18路径同一停写基线：Node22 diff/scoped settings CSS format/contract/architecture/lint/typecheck exit0；contract280、architecture50，181files3288 PASS/0SKIP/182.11s。独立候选18文件同hash production build0；原Playwright自动管理development preview3325，桌面/移动现公共壳E2E6 PASS/8.4s，posttype0。只新增上述两项行为回归，不新增suite。类型阶段误用Testing Library的exact选项已移除（ByRole字符串本身精确匹配），关闭用例等待既有220ms动画的URL交接；原jsdom跨文档导航/颜色诊断未屏蔽。

完整Prettier格式不是本owner现manifest门，本轮核过受影响文件的HEAD，除settings CSS外已有未格式化基线；不为本需求重排整份历史文件，也不宣称全量format通过。新增两测试块定向格式化；静态独审18/18冻结hash匹配、含全部15生产路径，所发现的compact返回和等值scope P2均关闭。主方真实正常3310：Explore canonical hash及刷新恢复、箭头回root/All和焦点、同Dialog、手动个人后回All、compact More再选技能、分类选择/宽窄切换/打开菜单时焦点、真实查询空态清空和详情Escape返回已验。六viewport搜索锚点相同；行111及封面60×80/字体/操作按DOM样式核验，参考与本地实际条目不同，不把数据差异伪造成相同图。生产构建与development UI验收分别记，不称production私有UI实测。

本轮未写后端/Schema/契约、未执行模型/工具/计费/权限操作，未改变未知命令/actor围栏或新增业务默认。只观察到本轮Manus Skills正常读取，不称每页API均完成。八类来源事实producer、项目技能安装执行、原生OAuth长授权/刷新及整体Admin/手册/逐仓PR和Root组合仍OPEN；远程CI/push/PR/merge与Root暂存/gitlink继续暂停。

## 2026-10-16 Settings Skills Explore 交互与布局（本地终验中）

基线 App a7cf9c66。正常 Manus 参考为 /app/skills#settings/skills/explore，2026-10-16、zh/light/DPR2；865 搜索原低63px、行高原约150px，现按81px标题带、32px搜索、111px行及60×80封面收敛；390紧凑标题不占带。六宽度对照同时发现宽容器755时参考显示九类横排，而451/348宽用菜单；改实际容器/本地化标签测量，不以固定viewport猜测。分类变换保留选择和焦点（含打开菜单时放宽），不触发新目录意图。

Explore 原只有组件布尔值，刷新回安装页；现 Modal 唯一拥有 Skills 子视图及受控 scope，AppFrame 既有 hash writer replace，popstate/hashchange恢复，My Skills仍personal，内部箭头与导航再选明确root/All。不重挂Settings/身份或未决命令holder；同actor重核与换actor私有退休沿原边界。独审先发现 compact 返回入口和等值初始 scope 两项风险，已实测参考 More→技能回根并沿本地现入口承接，scope改受控而非加reset token。原业务身份/网络/Schema/后端/积分/模型不变。

新分类测试首轮 mock ResizeObserver配置不可重定义是测试夹具错误，修正后实际RED为缺宽屏编程按钮；hash实际RED仍personal。两项扩现有rail suite，不新增suite；已定向GREEN，完整冻结门、隔离candidate build与现公共壳E2E待最终收据，不把阶段验证冒终验。正常浏览器已验Explore刷新、箭头All和焦点、窄屏More返回All、分类选择/宽窄焦点与目录空态。原始截图/几何与网络只保ignored；本轮观察到的Manus ListSkills ownerType/type/added/enabled彼此独立，仅脱敏规格，不宣称全站API或新Hub/Device来源producer完成。

## 2026-10-16 Settings/MCP 布局实测修复（局部验收进行中）

基线 `6beec84`，复用现有 Settings 与 MCP feature，不新建页面、状态 owner、依赖或测试 suite。正常 Manus `/app/skills#settings/connectors` 与本地 `/app/plugins#/account/settings/mcp` 在同 light/zh/DPR2、865×764 下实测：原 toolbar 早16px、搜索281px而非200px、标签晚20px。根因是 feature 顶部8px/搜索320px、通用 embedded header 的48px底距，以及 shell/feature 重复 padding。feature 独占 desktop24/mobile8的顶部与12px底距；移除 shell 的两处mcpBody padding和unused class，专属选择器不依赖CSS chunk顺序。紧凑dialog改为参考380px/98vw envelope，卡片名称14px/500、说明13px/16px最多两行、76px卡高；不伪造目录/封面或连接。

正常服务HMR后，865工具栏、200px搜索、19.5px标签/列表基线与参考同值；390×844搜索x21/y357/w178/h32、标签x21/y401/w348/h19.5同值，375及767/768两侧搜索rect也相等，375/390无页面横溢。真实当前两API投影搜索保一项、无匹配空态、清空恢复；键盘搜索Tab到Browse、Enter打开目录、Escape回设置保焦点；整文档刷新保设置hash，Skills分区再切回仍是同一Dialog与真实列表。首次去除静态shadow遮住Tailwind ring已被本轮实测抓到，在原CSS补专属focus-visible轮廓后复核solid2px/offset2，不把中间失败当通过。截图/几何原始记录仅ignored；部分高层截图受浏览器面板缩放影响，另用Page.captureScreenshot固定CSS视口，未用缩放噪声冒像素对照。参考临时emulation已恢复。

此只闭合当前连接器设置的布局锚点和上述交互，不代表所有Settings/Manus视觉、远程provider、运行权限或整体目标完成。无后端写、秘密/角色/资金/模型操作；远端及Rootindex/gitlink保持暂停。最终停写冻结验证：Node22 scoped CSS格式、contract、architecture、lint、typecheck均exit0；完整181files **3286 PASS / 0 SKIP / 188.11s**，未新增任何测试；既有独立同字节candidate production build0、development public-shell桌面/移动E2E **6 PASS / 7.8s**、posttype0。首阶段3286PASS192.99s仅阶段记录，最终以本次停写后结果为准；现有jsdom navigation/颜色诊断保留。只读静态复核含焦点增量无确定新增P0–P2，正常原始视口/标签已收尾，未以公共壳E2E冒正式已登录连接器交互证据。

## 2026-10-16 Skills 显式更新：正常产品旅程验收

固定业务源码 App `d40c839`、BFF `615b16a`、Platform `11cb760`。用户批准本地短暂重启后，正常 Product Session→Web 同源→BFF→Platform→Storage/现有 PostgreSQL 完成自有 private 样本安装 v1→v2：确认前无 POST，确认后仅一次 strict 两 pin/原幂等 key 的 update，200 ACK→安装 GET 200→列表 GET 200；没有 Remove/Install。独立正常登录回读证明 installation ID、series、installed_at、enabled=true 均保持，目标严格等于原 `available_update`，余额仍 1,000 积分/held=0/流水1条且内容未变。没有直库写、凭据注入、模型发送或重复充值。

键盘 Enter 完成后焦点返回搜索，更新按钮消失且正常开关恢复；硬刷新仍为新状态。详情使用既有 GetSkill 的 series 查询，返回版本必须与所选安装 B 的不可变 UID 一致才放行示例；不要把 series 查询 UID 冒称 B 的 UID。实际新版示例启用、旧例子未混入；390px 窄屏最终详情 x=9.75/width=370.5、页面 scrollWidth=clientWidth=390，新版示例可交给 Composer，名称和文本到位，但未发送任务。尺寸初次在 0.2s resize 过渡中大于视口，稳定后已回到上述范围；这不是整站逐帧/物理触屏或窄屏第二次更新写入的验收。自有草稿/视口/网络观察/临时标签均已清理。

范围：本轮证明真实 happy path、原身份/启用态保留、刷新与新版示例交接；unknown/并发/disabled=false 的风险证据分别沿现 pure flow/client/真实隔离 PostgreSQL，不把它们冒成已做正常浏览器故障注入。机器 profile 的 `runtime_verified=false` 未重新发行，不扩大为全 operation runtime 认证。完整 Skills/Admin/MCP、正式 Agent/Billing 执行与远端 PR/gitlink 合并仍未完成。

## 2026-10-16 Skills 显式安装更新候选（正常产品链待验）

App 沿 BFF `615b16a` / public 14.8 / 139 operations 的原字节 snapshot 和既有两生成器接入唯一 update。安装池显示 owner 的 `available_update`，显式核对旧/新 pin 后更新同一安装，不拼 Remove/Install、不自动追目录最新版。actor-owned holder 保留同 actor 重核期间的原命令及幂等 key，失准入/代际更换撤销旧读取和旧回调；412 不当成回滚证明，未知结果只显式恢复原命令，ACK-known 后只重读。真实 `enabled=false` 由 owner 保留，不被 UI 推断为启用。

首次挂载可直接打开更新；完成后回读并刷新目录/安装池，原按钮移除时键盘焦点返回搜索框。关闭/取消、StrictMode、unknown 后卸载及旧 action 不借新准入的回归均在现有 suites 或纯 flow 中，不恢复五套已移除 UI 测试。唯一 adapter 仍在线读取 Product Session；输入/返回继续严格绑定和有限字节/同一预算，修复继承的 stalled request body 不响应总 deadline 问题，无新网络协议、Schema、持久业务记录或依赖。

最终候选 Node 22 `pnpm check` exit 0：contract 278、architecture 50、180 files / 3110 tests、lint/typecheck/build 通过；5 个定向文件 320 PASS；独立公开壳层/preview 项目会话 E2E 桌面和窄屏 4 PASS，随后正规 typecheck 再生 Next route 类型，未手改生成物。焦点用例先有效 RED（落 body）再修复，unknown cleanup 用例强化为 lost ACK 后卸载；独立只读复核未见新增确定 P0–P2。一次 typecheck 因测试误用 Testing Library 的 `exact` 选项失败，已用精确名称正则修正，未放宽焦点或请求断言。

用户已批准 Platform/BFF 的本地短暂重启；两 owner 候选各自沿原 feature 分支 fast-forward 并加载，原配置在内存复用，健康/就绪各 200，无依赖/Schema/登录配置或数据写。App 正常入口尚待装载此候选并完成原安装 A→B、enabled/identity/installed_at、详情/试用 pin 及刷新验收；健康检查和受控 fixture 不当业务 ACK。Agent/Billing、Admin 当前消费基线与正常管理员生命周期仍有独立后继，远程 CI/push/PR/merge 继续暂停。

## 2026-10-16 登录故障静默恢复（局部交互修复）

删除 `RuntimeSessionUnavailable` 及其全页/悬浮诊断卡片；临时故障不冒充匿名、不切 preview，也不要求用户反复点击 Retry。初始服务端 admission 异常保持数据空壳，按 1s/3s 两次 RSC refresh 重验，不整文档 reload；浏览器探针沿原有可信读取/续期链做有界快恢复，成功或卸载清理定时器。既有可见页两分钟重核和 focus/online 恢复保留，因此不是整个文档生命周期只重试两次。只有真实 anonymous 决定才进入现有固定登录流程。

已核验 actor 的临时故障保留原有挂载展示和冻结意图，但现有 generation/admitted 围栏继续撤销所保护的 Project/Skills 读写。首次未确认时仍不挂载私有 Runtime；屏幕阅读器得到重连状态，无可见错误浮层。未改 token、OIDC 回调、凭据、IAM 允许列表、owner 契约或后端数据。

既有 4 个真实 Next HTTP 用例不再强制错误卡片/手动 Retry：改验自动恢复，并保留无私有 I/O、请求去重、10 秒取消与 socket 关闭、迟到匿名尾丢弃、同文档草稿保留和唯一登录路径。4 项定向真实 HTTP PASS，现有 4 UI 文件 134 PASS；未新增 UI 套件。包含在途 Skills 更新代码的组合工作树 Node 22 `pnpm check` 最终 exit 0（contract 278、architecture 50、180 files / 3110 tests，lint/typecheck/build 通过）；此前 4 项旧交互断言失败已据新需求重写，不记为既存失败。独立公开壳层/preview 项目会话 E2E 桌面与窄屏 4 PASS，不把 preview 或受控 HTTP fixture 称为正常 owner 全链。

本片不关闭个人安装原子更新、Agent/Billing 或全页面 Manus 一比一验收；远程 CI、push/PR/merge 继续暂停。正常入口的浏览器验收独立记录，不把组合候选编译通过当成实际装载证据。

## 2026-10-16 Skills 目录定时重核验收

同 actor 正常重核保留搜索、筛选和精确详情 locator/模态壳，私有目录、详情与动作仍按代际退役。旧安装回调不借新 signal，未知安装重试保持原 source/key；确定拒绝可释放意图。未知分享跨重核仍要求明确新意图，导入重核清只读/已确认展示而保留未知恢复命令；详情追加页失败在模态内可见。

本次源候选 Node 22.22.2 `pnpm check`：contract 278、architecture 50、179 files / 3074 tests、lint/typecheck/build 全通过；隔离 3324 `pnpm test:e2e` 桌面/窄屏 4 PASS（preview，不是 owner 执行）。现有 AppFrame 与纯 flow 用例覆盖 11 个新增风险场景；搜索 DOM 重置、4 项 review 问题均先有效 RED 后修复，未恢复已移除的五套 UI 测试。独立静态复核无剩余确定 P0–P2。源码 `a9f4e64` 经正常 Product Session 的真实定时重核 GREEN：`/api/auth/session` 200/authenticated=true，随后目录/安装/GetSkill 新读均200；搜索与详情打开意图保留，前后位置及尺寸一致（1200×800视口，详情800×380）。关闭后焦点回新卡片标题、搜索仍保留。这是本目录前后状态/新回读的证据，不是每一帧或全页面无闪证明。

个人安装原子更新与 Agent 正式运行仍未完成；实际旧试用 POST 为 `503 agent_not_configured`，这两项不因本轮 UI 修复转为已验收。远程 CI、PR/push/merge 保持暂停，当前工作只在既有分支本地累计。

## R257 本人 Connection 读取与加载保护验收（2026-10-06）

固定 BFF 6d46ec8 / public 8.0.0 / OpenAPI 8d5b452b；本人页改读 /self/mcp/connections，不再混 Server 目录。复用已有可信 subject/generation/admitted，重核同步撤旧页、换 client 退役游标；合法191 ID/响应早退取消、有限读取保持。重复当前或历史 next_cursor 提前进入错误态，不进入永久 loading，不自动重试。Root77585 两有效失败反例原字节保留；最终 b0d5466a 53路径冻结、独审1663f3d9无新增已证P0–P2。

Root29002 显式Node22.22.2 lint/typecheck/build exit0，7 focused UI/adapter 文件459PASS/0；此前23032 contract275/0、architecture50/0绑定本次未变化输入，未称全量 pnpm check/E2E/axe/视觉通过。正常IAM/Web/BFF/Platform硬刷新真实 /api/hub/self/mcp/connections200、private no-store、connections=[]，最终一个标题/中性空态、翻页禁用，无持续工作区 loading；证据Root var/dev/r255-preserve/r257-mcp-cursor-final-live.json/png，自有tab11已close，user7/8保持。只验本人空读，不称创建、授权、启停、撤销、invoke或全CRUD闭环。

后台BFF ac3cd1d的新资格投影尚未正常切换，IAM有数据演进/Web strict me/当前管理员入口及管理操作独立后继；三原D0/OIDC混合修改保持，不夹本提交。

## R256 会话标题与工具按钮独立命中（2026-10-06）

Root冻结后明确Node22.22.2复跑lint/typecheck/3现UI文件167断言/build，原句柄37970实际exit0；首次wrapper漏打印句柄未作为exit证据，确认原build结束后独立重跑本次终态。未跑全量system/test:e2e/axe/视觉预算，不替代以上原页面用户证据。

仅现 workspace-rail-items.module.css 的 conversation 选择器：title 与三工具由 flex 分配真实不重叠区域，不改目录树/路由/数据/权限。工具 position:relative 留正常流并绑定自身 ::after，保桌面32px/窄屏44px；初 static 候选被独审指出手机伪元素定位风险后仅改此关键词。最终源码SHA e8c2dc8517e75c86242f1fda2b96c4b09b2e9a362eda2811f22a19d47555eab1。

Root原用户tab7正常IAM/BFF两次复现：717px专案会话title宽260，中心误中rename，普通click打开改名/URL不变；Escape未写。修后同页title宽128/工具44，click进入原conv_ffd7…及真实历史；Direct R243两原标记仍在。rename/Escape、move菜单/Escape、delete确认取消各自正确，无持久写；390四centerhit全true，1200四centerhit全true/工具32、title→Tab焦点rename，短窗口scroll113.5→204→0，刷新真实历史恢复且rename0/Direct常驻。恢复原视口，无新标签/模型或资金调用。r256-rail-{red,mobile-green,desktop-green,green-receipt}.json和final.png在Root现ignored证据目录。

独审 f18ab3bf 未见新增已证P0/P1/P2，反向删除新增块重建原d6a7dea7 exact；原三D0/OIDC mixed逐项哈希保护。物理触屏、完整CRUD/长分页/跨actor滚动恢复与全页面仍待验，不把本title修复算全侧栏完成。后台现无正式/admin路由或人类管理员准入，Settings跳转需IAM资格→BFF→Web，不能按邮箱/组织owner/登录态造管理员。

### R255 用户原标签后补实证（2026-10-06）

原tab7现已恢复同步：不注入cookie/preview，实际管理页原h1+h2=2且error可见，同时两个servers响应200（4de46d06/23f3d070）；CDP response body不可取，无法据此确定是旧schema/缓存/HMR哪个原因。保留error截图/metadata。正常reload当前源码并自动恢复既有settings hash后，原同tab1标题/正常空态/error0，两个真实servers200（2a7d008c/d1d78292）。这证明当前原页面读取呈现恢复，不代表Server→本人Connection/创建授权调用缺口已修。

所有Root临时页9/10均已close，原user7/8保留，viewport/touch override已清；原tab最终截图connectors-user-original-final.png/JSON。先前“原tab超时/故障未同次复现”是前置观察记录，由本后补证续接，不能删旧错误或断言后台所有能力通过。辅助与完整70组计数保持。当前T-P02按既有Platform3.2.0本人projection→BFF固定artifact消费接续，不新造目录模型。

## R255 连接器嵌入标题修复与真实业务缺口（2026-10-06）

Root正常IAM/BFF/Platform浏览器 /app/plugins→管理连接器：当前 /api/hub/self/mcp/servers 200，真实空列表；原截图的error未在同次请求复现，不能倒推未启动。现正式client→Web同源→BFF generated→Platform Prisma读取，无失败转空fallback；静态connector目录卡片不代表实际连接。

Web现mcp-content传已有embedded，mcp-projection-read按embedded省重复h2；独立面保标题，读/空态/错误/重试/分页未改。现settings新增辅助case有效RED两个标题→GREEN；真实浏览器管理页标题数量1，原正常空态仍可见。首辅助typecheck因新增TestingLibrary误用exact失败，改为锚定名称正则而不放宽数量；Root明确Node22.22.2重跑2文件69/0/exit0，lint/typecheck/build全部exit0；辅助门不替代实际连接授权/调用。

未完成：当前展示Server全局声明，不是Platform 3.2.0本人connections；BFF/Web未消费connections，非GET MCP正式503，Platform旧register RPC Unimplemented，静态名牌不是授权/handshake/invoke。后继沿当前owner artifact→BFF→Web补正式用户路径，不直写owner库/造成功/复活旧preview命令。全链仍OPEN；只读证据Root var/dev/r255-preserve/r255-connectors-current-failure-review.md。九既有服务已实际探测200，不等于创建/启用/模型或工具E2E通过。

## R255 本次左栏留白与重核展开意图（2026-10-06）

> **已于 2026-10-15 退役。** 项目已改为平铺概览入口，任务列表独立；下列 folder 展开/新建意图记录仅保留为历史取证，不再是当前实现或验收基线。当前 rail 只保留可观察的导航与数据分区测试，不用源码行数、CSS 字符串或已删除交互阻断修复。
> 本轮同时退役耦合过多的 `app-frame.smoke.test.tsx`、源码扫描 `no-hardcoded-ui.test.ts`、行数约束 `workspace-rail-split.test.mjs`，以及把登录状态、像素几何、截图附件和内部 DOM 细节混在一起的 `web-governance.spec.ts`；保留的 rail、项目、欢迎页、编辑器、技能导入与 i18n 测试仅断言用户可观察的点击、焦点、文案解析及数据分区。Playwright 仅保留公开壳层的可达性与无横向溢出检查；覆盖率百分比或翻译 key 数量不作为发布阻断。

Web bf04df7 基线，现4生产路径与现workspace-rail测试窄修：空folder branch桌面43.52→26.80px；非数据folderIntentIdentity按已验证subject隔离，与read generation分离。同主体pending仍撤准入/卸载私有分支，恢复保展开；换subject/null清意图，原未提供稳定key的受控退役case保持。无新存储/API/认证例外。

Root正常3310既有IAM/BFF实际：修前两folder展开，后捕获session GET200时已收起；修后实际重核GET200后两folder仍展开/Direct常驻/原同ID两历史marker。具体timer/focus触发未分别归因。1200×460最终非空P+空Q scroll0→204→0，Direct底346.55<footer356.80，无横溢；本轮早段Direct→P→Direct正规移动同ID已恢复，后段外部数据变为P1/Direct1，未替用户再变更。空态/真实会话均可读；原user标签同步超时，不冒其已刷新。物理触屏、长期分页/异常、全CRUD、撤准入期间scroll位置恢复仍未验/未修，不以保展开冒scroll恢复。

Root辅助验证：新增恢复case有效RED1/2PASS→冻结3UI文件167/0/exit0；lint/typecheck/build均exit0。独审/提交记录由Root现task承接；原三D0/OIDC mixed保持。正常九服务18PID alive、登记实际9探针200/fixture=false；无重复启动/PG或Redis reset/正常资金或模型调用。本片是用户侧栏子路径验收，不关闭70组或全研发上线。证据Root var/dev/r255-preserve/sidebar-intent-*与sidebar-new-*。

## R255 未开户正常状态与错误隔离（2026-10-06）

15现生产路径+1现UI测试，freeze报告d33e64be/final独审eadda7dd。contract/billing.ts消费正规严格404 billing_account_not_found错误体（meta/header request_id一致）；billing/client.ts复用原唯一10秒/16MiB/fatalUTF8/abort读取链，非404失败保持早抛。summary/ledger独立missing_account，不画假0/空流水/Retry，不在GET开户；另一面的真实异常与原actor/分页控制保持。九语言现键，无新文件/依赖/generated/API/资金写。

Root真实IAM用户正常3310积分页硬刷新：两“尚未开通积分账户”status，Retry0/假0为0，无永久loading。正常owner确实暂无本人credit account，本片不是开户或授权赠送/预占/结算/释放/模型费用闭环。原44例全部保留+新增26例=本UI70/0；Root最终冻结98文件1782/0/exit0，lint/typecheck0、contract275/0、architecture50/0、正常build0仅辅助工程。未跑全量system fixture/全页Playwright/axe/视觉/bundle，不用这些数量冒全产品通过。原563行测试完整/四mixed/uv/registry保持；观察失败和当前风险在Root同任务及测试台账。

## R255 左栏触屏滑动与文件夹信息密度（2026-10-06）

原正常 Web66e6f76 + protected四mixed。唯一生产路径 src/components/blocks/workspace-rail/workspace-rail-items.module.css，最终SHA93009a203dec9ac624983742405edd7ef7733c32d307a9423bd24b61f9c4171f：draggable行none→pan-y，desktop manipulation/HTML5/Space-Arrow-Escape接线不变；原nested toolbar定位所属folder行，仅重复视觉标题隐藏，nav aria-label及全部反馈/分页/创建排序保持。无新API/数据/框架/组件。

Root正常3310真实IAM用户浏览器：390×640 coarse/touch模拟，项目行起滑原0→0而资料库0→171.5；修后原同手势0→171.5、会话行反向171.5→101.5。最终CSS硬刷新后两folder展开项目起滑0→234.5、44px四按钮center hit全true、真实排序菜单可达；不是物理触屏验收。Desktop1200×460 wheel0→262→0，宽276/scrollWidth276，Direct底346.80<固定footer356.80；两分支自身空态、children77.92→43.52px且只一次project名，keyboard P收起不动Q/Space grab Escape释放。回Direct既有两历史marker及两行不丢，最终硬刷新无工作区loading。只读/list/sort/导航，无新消息/持久CRUD/模型/资金写。

Root最终冻结98文件1782辅助断言/0失败/exit0、正常build exit0；此前lint/typecheck0、contract275/0、architecture50/0，CSS最终真实页面另验。最终只读独审2227f645；这些不代替完整CRUD/70组。原用户IAB tab7 debugger同步超时，未冒其已刷新；多次HMR后旧disclosure locator、mobile中心命中既有rename overlay、错误/ready探针均保留为观察失败，据实际DOM/readyz纠正。实际正常9root/listener alive+既有probe200，原registry/uv/四mixed及其他候选保持。证据Root var/dev/r255-preserve/sidebar-billing-browser-final.json、sidebar-final-desktop.png、sidebar-billing-final-frozen-regression.log；用户IAB未操作。

## R255 用户侧栏树与滚动已修（2026-10-06）

Web基线df609a0；仅现workspace-rail-navigation.tsx一处folder class、items CSS与rail CSS，未改数据/API/身份/scope/Move/拖拽/宽栏cookie。Root正常3310既有IAM真实复现：项目children横排超内容列（scrollWidth455/276），1200×460主content hidden使wheel700仍top0且Direct裁切。现项目纵向树/同元素padding、各列表自然高、唯一content纵向滚动/横向约束，header/footer固定；compact同样滚动。另退役违背R254的空Direct旧隐藏规则，不重造业务。

实际浏览器GREEN：两空项目子列表位于自身header下/反馈可见；1200×460最终top253、Direct bottom346.68<固定footer356.8、原QA点击与4条历史保持；上下滚回0，700×460 fine-pointer top0→265后回宽hard-refresh仍展开/Direct2/loadingfalse；1200×320图标栏top0→170最后项目可达；键盘disclosure不导航，252px栏宽等动画后content228/scroll228，恢复300。项目概览→外部会话列表始终在，但概览另有会话GET404，不算Project完整成功。0 owner数据写/模型推理/资金调用，无服务重启或PG/Redis reset；用户IAB未动。

Root Node22辅助门：lint0/typecheck0、contract275/0、architecture50/0；最终现5UI文件146/0且actual exit0、最终CSS build0。独审最终e0829f2b，三source冻结准确。两前置locator/对dialog错误假设与过早动画测量保留，不伪装产品失败/静态E2E。真实0Direct、触屏Sheet/长分页/故障注入、全量test与所有页面test:e2e、axe/视觉/bundle未验；普通2Direct不证明空账号业务闭环。原三mixed设计文档与OIDC/Root uv/gitlinks/registry保护，70组11/8/14/36/1不变。原任务/QA台账与ignored sidebar-scroll-*证据续接，无新计划中心。

## R255 06:12：无 owner 的旧 Agent preset 消费者退役已接收

基线 Web main aaf577d；17生产/7测试/9语言/3integration既有文件，无新依赖、模块、接口、SQL、存储key或旧数据兼容。Web不再请求旧agents目录/生产preset字段；模型/Skill/mode/AG-UI/Todo/subagents与独立连接setup保持，公开MessageCreate.agent/generated保持。唯一model-only strict，含旧agent的对象整体回默认，不迁移其中model。

Root真实正常3310/IAM既有session：工作区hard-refresh、Settings对话偏好、Settings硬刷新均旧/api/session/agents请求0，models200、原4条QA历史/Direct列表保持、loadingfalse，旧preset控件0。真实models是空数组，只有跟随默认选项；同值点击未触发保存，不宣称实际模型切换/保存、可用推理或资金E2E。没有cookie注入/正常模型或资金调用；Root自有浏览器关闭、用户IAB未动。

有效RED：原Settings合法模型选存后仍调用旧目录；AppFrame首次空欢迎页模型控件不显示是fixture前置错误，沿原合法presentation创建意图纠正而不改产品规则。首宽回归566/1漏旧AGENTS fixture；次567断言全通过但真实exit1的Radix卸载跨realm异常保留，通过新增组owned cleanup/0ms真实macrotask修清，未ignoreUnhandled/fakeTimers/吞错。最终Root65531同567/0且exit0/types/lint0；61505正式Node22非system153files2663/0、133.21s/exit0；27321contract275/0、architecture50/0、build0。源码36hash保持，独审2d1d234c无新增确定P0/P1/P2。三D0仅自有前缀暂存，原mixed正文/原OIDC mixed不纳入此片。

这是旧消费者退役的源码与真实读取刷新验收，不关闭完整Agent、Model或70用户组；独立connection setup404、正常Billing未启/正规资金链、文件单Asset删除缺协议仍OPEN。完整system suite、Playwright全量、axe/移动视觉/bundle本片未跑；567/2663是辅助工程证据，不能冒完整用户上线。Root ignored0612-web-preset-*及最终报告记录实际失败与结果。

## R255 05:22：宽屏侧栏偏好刷新真实反例已修（完整能力仍OPEN）

基线main ad918391；唯一layout hook首次cookie读取完成标记从effect setup移到有效microtask callback，保SSR初树、StrictMode清理和mounted导航不重读，compact不覆盖宽屏cookie。source SHA c809ea186 / test cfb8fde2；原四mixed未纳入本片。

Root正常3310真实IAM既有会话：1200展开→cookie=true→硬刷新仍52px且cookie=true有效RED；源HMR后展开/收起两方向硬刷新恢复，700临时展开cookie不变→回1200并刷新保持展开、原会话正文与外部列表在、loading=false；自有Playwright页已关闭，IAB未动。证据 /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/var/dev/r255-preserve/0522-normal-browser-journey.json 与0522-normal-rail-restored.png；不是preview/mock模型用户完成声明。

辅助组件StrictMode首轮5例2有效FAIL+1fixture INVALID（未当产品缺陷）→合法稳定ComponentType后5例3PASS/2FAIL→Root完整rail+smoke173/0，窄eslint与直接tsc均exit0，独审两hash无已证新增P0/P1/P2。未跑完整build/e2e/axe/bundle/独立SSR hydrate门，不以173替代全用户验收。

同正常中文manifest403已由Root正规System同Site CAS仅追加zh-CN（version1→2、幂等回读200/public不变），实际页面manifest200，zh/en仍拒绝。但live projection navigation=[]、flags仅chat，侧栏高级模块入口仍缺；此配置偏差、agents404和Billing503/收费Agent完整链均OPEN。正常资金/模型/schema/reset/服务重启0，Site配置一次正规业务变更如实记录；70用户组计数不增加。

## R255 04:40 项目重进双时序回归（不是产品根因修复）

原欢迎页立即503/200、同key/body和A/B草稿断言完整保留，仅finally清理fetch替身；另加独立deferred ACK阶段诊断。Root Node22.22.2执行全部tests/ui+tests/engine：73文件1426PASS/0，快ACK114ms、deferred153ms；本文件eslint和直接tsc均0。独审d3f5e2b绑定test7b2abfda、navigationf98e06fd无已证P0/P1/P2。

该宽集不是历史未保存完整命令的16文件同序复跑；旧461/1间歇失败证据保留，不以deferred时序绿抵销，不声称根因已修或正常浏览器验收。原四mixed/source/用户数据保护；全test/build/Playwright/axe/移动视觉未执行。

## R255 04:19 Root：深链回退失败的无限加载窄修

现 use-app-frame-navigation.ts 使已结束水合的 error（路由错位或无正文）优先成为既有错误终态，loading/error互斥；保持原URL、Retry原会话、权限/engine及同路由已有正文局部错误。仅现导航与app-frame.smoke新增反例，无新框架/页面/协议。Root真实AppFrame+SessionEngine UI fixture先1 FAIL（974行spinner不退出，前置状态成立），修后该case和既有项目重进case定向2 PASS；此辅助夹具不是正常浏览器或owner E2E。

Root宽回归16文件461 PASS/1 FAIL，失败为既有项目创建未知结果重进（1590行路径仍/），定向复跑通过但原因尚未证实，保留待核不冒全回归绿色。两路径eslint及tsc --noEmit --incremental false均exit0，contract274/0、architecture50/0；独审f73e6a4f绑定两freeze，零已证P0/P1/P2。非空错路由分支只静态核对，未行为通过。全量test/build/Playwright/axe/移动视觉本轮未跑；正常浏览器控制超时，当前用户实际加载根因与完整T-C01仍待实测，70组PASS不增加。

证据Root ignored var/dev/r255-preserve/0419-web-loading-{red,green,focused,lint,types,contract,architecture}.log与freeze/json。原四mixed及761非批准路径保持；正常八服务未重启，无PG/Redis/资金/模型操作。源码交付不代表用户页面已闭环。

## R255 02:44 Root 接收：nullable next 消费者源码切片

本次固定 BFF 本地发布 artifact 45e67f0/public8.0.0/SHA2560802a31f9469a17cd8fc8b78e6d2326e0571bc93f3ac8d19811a42a1b185df95；24批准现文件、零新文件/层。wire十required、next必有nullable、输入optional recurrence anchor；live保null/list与calendar不编日期，preview生命周期保持。Team15生成文件byte-equal，failure仅两provenance更新；五原文档suffix及原system修改保护。

Root先旧source/snapshot实际RED148项139pass/9fail，再冻结源码Node22.22.2独立复跑：两generated check、contract274/0、architecture、lint、typecheck、153非system文件2657/0、build均exit0。独审99cc868e绑定freeze63e5ba58零P0/P1/P2；最终仅此CURRENT事实前缀在审查后追加，源码/测试保持freeze。Next16官方原生dev/build输出隔离，八原normal进程不重启；不写共享PG/Redis、不主动模型/资金调用。

这些是工程辅助，不关闭T-P02正常页面组：normal BFF旧进程与旧排程schema未激活、持续next更新尚未闭合。现浏览器控制三次focus超时无DOM/像素，不记产品FAIL/PASS；正式weekly创建/确认/暂停/恢复/刷新/时区/执行仍待真实E2E。原全量system、Playwright、axe、移动/视觉/bundle及provider旅程本波未运行；70组11/8/14/36/1不增加PASS。证据 Root ignored var/dev/r255-preserve/0244-web-*；本地artifact不冒remote release。

## T-P02.R255-WEB-NEXT：本地消费者源码候选（2026-10-05；待 Root 独审/normal E2E）

固定前置为 BFF local immutable artifact：commit `45e67f0e783fb4bcdb086665a09b7c3c5fadbb6f`（源码父提交 `e603bd55`）、canonical `contract/openapi/v1/openapi.yaml`、Git blob `1b42d49388ca26eaaef7371daf23cbf1158d5fe6`、public `8.0.0`、全文 SHA256 `0802a31f9469a17cd8fc8b78e6d2326e0571bc93f3ac8d19811a42a1b185df95`。Root 本地交接 commit 为 `ef2d306`；该 artifact 尚未 remote push、registry 发布或 normal BFF/schema 激活，因此这里只记录本地发布接收与消费者候选，不冒称线上或当前正常服务已经生效。Web 冻结基线为 `97a79d45f93a6007fb0f37002372fd503cd0d373`。

当前已从 immutable owner blob 精确固定 whole-public snapshot并机械更新8个 public pin；Node `22.22.2` 下两条现 generator 正规 write/check，failure仅两项 provenance变化，Team15逐字不变。现 ScheduledTask schema要求 owner十个 required字段、nullable next与optional anchor；live mapper保null，calendar key窄扩接受null。editor、renderer、route、样式均未改，create/PATCH继续省略未由用户表达的anchor且从不发送旧next。

Root 对旧实现已取得有效 RED；本地四 focused 文件现148项全通过。五文档只更新本任务顶部前缀，原 mixed suffix继续逐字保。当前 normal BFF未重载、normal schema仍旧，局部排程表重建请求仍待用户答复；本轮未触PG/Redis/env/服务/browser/system fixture/Git。辅助 contract/client/jsdom 门不等于真实HTTP或用户E2E，正常页面的新建weekly、owner确认、暂停null、恢复与hard refresh链仍OPEN，不增加70组用户PASS。

---

## T-B03.R255-WEB-CREDIT：当前消费者源码候选（待Root集成与真实用户验收）

当前切片只消费个人可用余额/预占及owner journal，不再读by-model或推导Free、每日赠送、quota、低余额阈值。固定BFF `97a99d35c8c78e7ca6e1370fd16ba5d670766095` / public `8.0.0` / OpenAPI全文SHA256 `33971eaa8b43e8aa85a8eef8c3b99e42f0999fe3136dc129705beb7e8bb0e2f4`，owner正式blob原字节复制，现两个generator正规派生；不双读旧wallet。

现 `/api/session/billing/summary` 与 `/api/session/billing/ledger` 复用可信session adapter。strict closed账户/流水data保十进制字符串、BigInt显示尺度10^6与owner UTC Z瞬时点（按用户locale/本地日历展示），disabled展示owner只读值；404/503是error而非零余额。每读10秒总预算覆盖headers/body/parse、真实abort及reader释放；mounted panel独立loading/error/ready，刷新撤旧投影，分页单flight、显式同cursor重试、null终页、重复cursor拒循环与journal去重。现主体marker仅退役结果，不赋权限、不建第二store。

Account与rail popover未知套餐均占位，保身份/订阅入口及原布局；preview仅显式fixture，不是live失败fallback。此节覆盖下方历史消费者状态，原mixed正文不修改。三面D0已批准、D1行为反例已由Root复跑；当前生产/测试候选待Root工程复验、独审与提交。真实Billing账户200、余额/流水翻页/刷新/跨主体浏览器验收尚未执行，正常503退出loading不证明资金旅程完成；70组台账不虚增。

---

## R254 专案文件夹与常驻普通会话（2026-10-05；源码交付，页面待验）

现侧栏每个专案可独立展开所属持久会话，普通会话区常驻；展开与概览选择分开，正文仍一份当前 engine。列表组职责在既有 workspace-rail-session-list.tsx，Shell 只组合；没有新关系实体、后端协议或目录框架。Move 只允许真实可见会话叶的匹配回执导航，退役读取不复用旧首页请求，撤准入清旧展开/删除意图；重名展开动作可辨。

Root 最终句柄30884：contract273/20、architecture50/4、全辅助2619/153（排除 tests/system/**）、lint/typecheck/build及diff检查全0。独审23冻结路径0P0/P1/P2，末尾单空行由Root字节核对后复跑；原四mixed正文保留。系统fixture和真实浏览器E2E未执行，不用辅助绿报页面完成。

原3310仍旧运行副本，尚未发布本片；当前真实项目/普通会话CRUD、Move、刷新、撤权、窄屏和登录链保持待验。Root完整70组11通过/6失败/14待复测/38未验/1支付后置不变；上方交付事实覆盖下方历史“源码候选/未实施”，不抹掉历史失败。

## R251 Web唯一Skills V2消费者（2026-10-05；源码候选待Root验收）

固定BFF正式local main `f3c64d90f4a6fd7083252ff3d1646c5ad1dee292`，唯一public `8.0.0` /v1，canonical SHA256 `278fc0a60516617d41c754b7957fadbcc77f9b6132fa9f1a8af9409464319d0f`。现snapshot复制owner原字节，两既有generator正常write/check，failure仅三provenance字段变，Team9图与15派生文件byte-equal。现hub/schema六字段Validate只接受zip-v2，旧V1仅拒绝负控，不新增parser union、UI/client/flow/adapter或ZIP解析。

Root独立真实Response RED2fail/10pass已确认；作者现五Skills测试53pass仅辅助安全网，含V2接受/V1拒绝与UI拒绝后零Publish/零假刷新。真实选包→扫描→Validate→Publish→Install/启停/移除→刷新仍由Root正式组合验，当前原3310未更新，不声明页面完成。三D0原mixed后缀和system混合文件保护；完整工程冻结收据由Root接审，以下历史pin不作为当前消费者来源。

## R247 项目会话侧栏空态修复（2026-10-05）

项目合法空清单此前侧栏返回 null。现使用已有文案与 role=status 呈现 settled-empty，保留搜索/direct/loading/error/scope/路由行为。Root真实Next/Chromium先取得有效RED1fail；修复后同完整系统文件77通过/0失败/0跳过（原74+此前2刷新诊断+本次1），101.439秒，source/Redis保持。manifest /var/folders/gn/wbk8wfbd047_wvwkwtyn331r0000gn/T/kokoro-r247-web-project-empty-green-full-2t9j5kfb/manifest.json，log bbce5266c54aa5205dac380462002741bc166df5089e0036418a78cdaa6244a2。Root重跑两个文件ESLint、Next typegen/TypeScript成功；第一次pnpm包装器版本不符在执行前退出，改用仓内固定工具入口，未放宽版本门。独审531200a1窄片无确定阻塞。

本地main交付3路径；四mixed原字节保留（测试Git对象独立交付，不覆盖工作树）。受控IAM/BFF辅助归因，不冒当前3310启用或正式持久owner/完整用户验收；Skills401、Library503、缺三owner组合与原刷新间歇失败仍OPEN。

## R244 Project 改名源码交付切片（2026-10-05）

本片承接已批准R242三D0，固定BFF main `886a25a1c0158dbf71eb4b3b72522508b1c9a8f5` / public7.2.0 / canonical digest `bf64f0c66bea31a62285d64366686f3097bba21259b6c652977d28185097ed73`，正常两个generator消费。不含数据库、Billing许可、会话写入或旧实现兼容层。新增现项目菜单的shadcn Dialog/Input/Button、唯一immutable PATCH、10秒headers/body/abort总预算、ACK后canonical GET与list、主体/路由代际和取消/显式retry/GET-only恢复；既有renameContext内存token防旧关闭抢新scope焦点。九上线语言项目改名文案已显式覆盖。

Root冻结完整候选研发门89903实际全通过：contract263、architecture50、lint/typecheck、165 files/2488 tests（含现74 OIDC system）和build。manifest `/var/folders/gn/wbk8wfbd047_wvwkwtyn331r0000gn/T/kokoro-r243-web-rename-engineering-localized-185ixsi4/manifest.json`，log SHA256 `a574725e035dfbb1fe3e3444758a4b9a80bc369e727a8ca57721fedf3d13e7a1`，ordinary source与Redis keyset保持。原contract旧pin与ko缺译FAIL历史保留；修正只正规exact pin和七locale词典，不降95%或删除断言。Root另41237真实Next/Chromium/Redis取消→归焦→键盘重开→唯一写→canonicalB/list→成功归焦→刷新通过，12045相邻95/0。独审报告232093fc仅源码确定P0/P1/P2=0，非用户PASS。

本地源码Git交付与当前用户运行是两个状态：原3310不重启、不清数据，正式BFF持久owner与当前预览完整项目改名/CRUD、跨scope焦点交错、多语言实际UI、axe/visual/bundle仍需验收。独立Playwright test:e2e尚未本片执行；受控owner系统不替代真实owner/provider/费用。formal既有三D0及system四mixed任务外内容保留，不把当前混合工作树当clean Git checkout；Root随后全门实际结果另录。main完整SHA与精确44路径/四mixed/index证据由Root收据记录，不把父Web5e096364冒本片提交。

该片不关闭完整项目CRUD、Settings、正式外部模型与积分体系或原用户loading根因；其后续均沿Root同task/progress/test-cases。下方旧状态为历史快照。

## R156 Web 受控测试切片发布（2026-10-03；`b09ec815…` 已推送，用户原页仍失败）

Web main 已发布并推送 commit `b09ec8156f2853b8908b6e8d3accc27473597ad7`，Root 进程 14958 确认实际 `HEAD=origin/main` 且工作树 clean。发布的五路径中三个测试文件与进程 81876 完整工程门所验冻结内容逐字节相同；该上一轮同源门为 contract 256、architecture 50、lint、typecheck、164 files / 2360 tests / 0 skip 与 Next build 全通过，Redis 15 当轮终态为 `DBSIZE=0`，独立审查 `ffba…` 为 0 项发现。本轮只另执行了 Node22 定向 ESLint，Root 进程 28485 exit 0；没有重跑 2360 项，故不把 14958 或 28485 冒称新的完整工程门。

这是测试源码的发布，不是用户 E2E 恢复：原用户 `conv_ffd7` 仍为 P0，尚未取得其 hydration、DOM、session 或实际刷新结果；历史 pending-refresh signout 500 根因仍未知。Web Move consumer 尚未迁移，本切片没有 Product 生产源码变化，也未触发正式运行组合验证。

---

## R155 Web 测试资源终态回收（2026-10-03；完整工程门通过，用户原页仍失败）

真实资源 RED 先证明两处 fixture-owned Redis 遗漏：IAM relay 68 个业务断言通过但终态报告动态 origin 的 `oidc_state count=3`；Product Session store 8 个业务断言通过但跨 origin 损坏 alias 留下一个 tombstone。测试现按 exact origin/prefix 与启动前 baseline 只回收本 fixture 新增事实，不删除 baseline 或其它 owner 数据；IAM 在停 owned child 后统一回收 CSRF/OIDC state/Product Session delta，并用三类长生命周期 sentinel 证明 baseline 保留后再精确删除 sentinel；Product 跨 origin case 同时删除自己的 record/tombstone。终态资源清理与资源扫描各自设有 2 秒总界；用例内对自有损坏 alias 的直接精确删除仍由该用例 `finally` 负责。清理错误不阻止终态 delta oracle，也不被吞掉。独立只读审 `b26be7…` 的两个 P2（sentinel TTL 与 Product cleanup 总期限/错误汇总）已收口。

Root 最新冻结 `67a4…` / `3edb…` 与 R153 启动器候选一起执行完整 `pnpm check`，原进程 81876 自然 exit 0（106.39s）：contract 256、architecture 50、lint、typecheck、164 files / 2360 tests / 0 skip、Next build；门后五个候选 hash 不变，Redis 15 实际 `DBSIZE=0`。此前 Webpack/programmatic cold-reload 对照及 programmatic 53-system 门仍只证明受控测试启动器与工作流，资源终态门不扩大为正式全 owner E2E。

当前用户原 `conv_ffd7` 仍是 P0：新截图与完整 inventory 控制继续超时，没有取得该页 hydration、DOM、session 请求或实际手动刷新结果，Root也没有重启服务或创建新标签。本轮不证明用户首屏恢复。历史 pending-refresh signout 500 的根因仍未确定；未复现不等于修复，也不能把本限定工程门称为全业务闭环。

---

## R153 Next dev 启动器对照门（2026-10-03；测试候选未发布，用户原页仍失败）

OIDC 真实系统 fixture 现有封闭测试开关 `KOKORO_TEST_NEXT_DEV_ENGINE=webpack|programmatic`：未设置时保持原 `next dev --webpack`，未知值在创建 fixture 或资源前失败；programmatic 分支只在临时 fixture 生成 custom server，并把临时 `turbopack.root` 指向 fixture 与 owner `node_modules` symlink 的共同父目录。生产源码、正式配置、认证行为、请求数、业务断言和 12/45 秒预算均未改变。

Root 实际执行同一 R147 cold/reload oracle：Webpack 进程 38725 为 1 pass / 52 名称过滤（21.98s），programmatic Turbopack 进程 43049 为 1 pass / 52 名称过滤（7.07s）；programmatic 完整 OIDC system file 进程 21527 为 53 pass / 0 skip（55.45s）。Node22 定向 ESLint/typecheck 进程 96779 通过；测试 hash 门后不变，Redis 15、源码 hash 与临时 fixture 清理均保持。该证据没有运行本轮完整 2360-test `pnpm check`，也不是正式全 owner E2E。

两启动方式通过只排除受控 fixture 中“programmatic Turbopack 必然无法完成该 cold/reload 流程”，不证明当前用户 `conv_ffd7/tab21` 已恢复；原页控制仍 timeout，缺少 DOM/session/hydration 证据。历史 pending-refresh signout 500 来源仍未知，本轮未复现不等于根治。本测试候选尚未发布。

---

## R151 工作区偏好存储拒绝恢复与有界诊断（2026-10-03；源码、系统与完整工程门通过，用户原页仍待验）

主题与语言 Provider 现在只把 `localStorage` 当浏览器偏好：读取 `kokoro.theme` 被拒绝时回到既有系统主题，读取 `kokoro.locale` 被拒绝时继续按 runtime/browser locale 协商；写入被拒绝时保留本次内存选择，不让 `SecurityError` 中止水合。认证索引、Product Session 与 AppGate 仍 fail closed，本切片没有把认证事实降级为内存 fallback，也没有改网络、contract、配置或 timeout。现运行副本已应用 `src/i18n/context.tsx` 与 `src/ui/theme/theme-context.tsx` 的冻结实现。

Root 真实 Chromium/Next 测试先观察到三个受控 storage 拒绝节点全部失败，随后三个节点 GREEN；补充的真实 Settings setter 路径证明 Theme/Locale 写失败时内存切换立即可见、reload 回既有 fallback。有限 focus 重入节点排除了受控 fixture 中“有限 focus 导致 session generation 永远饥饿”的假说。Root 最终 `pnpm check` 进程 99026 自然 exit 0：contract 256、architecture 50、lint、typecheck、164 files / 2360 tests / 0 skip、Next build；Root 进程 12865 的完整 OIDC system file 为 53 pass / 0 skip（80.69s）。安全诊断只在 JSON parse 失败时记录闭集 caller、输入类别、有界长度/hash 与数字行号，不记录原文、raw stack、cookie、body、query 或私有路径，也不吞异常或自动重试。

这些门证明当前受控存储拒绝与 fixture 行为，不证明用户原 tab21 已恢复：现有证据仍只有截图与 Codex/CDP control timeout，没有该页面的 DOM、session、heartbeat 或 timer 测量。历史 pending-refresh signout 500 的 `Unexpected end of JSON input` 来源仍未知；最终通过未复现不等于根治。BFF public 7.1 producer 已发布为 `284b…`，Web 当前 pin/consumer 尚未迁移，本切片未消费或改写该契约。

---

## R144 会话删除 ACK gate（2026-10-03；限定实现与完整工程门冻结，实际发布以 HEAD/Root gitlink 为准）

Web 会话删除现以 exact scope、单一在途 intent 和严格 `Promise<boolean>` 驱动。client 同时要求 HTTP 200、现 strict receipt schema 解析成功及 `status === "deleted"`；10 秒超时、404、503、网络/解析错误与 unknown 均不提交本地删除或自动重放。ACK 前 Conversation、active、draft、thread、Run 与列表保持；成功后只删除原 target，若用户已切到另一 active 则不 reset 新页面。BFF 继续独占 durable cancel，Web 不发第二 cancel。

历史证据链保留：最初真实 RED 两节点均先因 fixture 未打开会话/GET query 形状而未到 DELETE；修正合法 snapshot fixture 后，RED 实际观察到 DELETE 缺 exact scope，以及 503 时草稿/对话框丢失与提前刷新。首次完整 check 又因异步 HTTP handler 设置的 release callback 被 TypeScript 收窄为 `never` 而失败，后以同文件动态读取 helper 修正，未改行为断言。

Root 最终 `pnpm check` 原进程 86341 自然 exit 0（121.298s）：contract 256、architecture 50、lint、typecheck、164 files / 2354 tests / 0 skip、build，含 OIDC 47 与 IAM relay 68；manifest SHA-256 `98dc3faf5800297a00deea686d649d34a5cc38374279b571e3a6c8e9418596ea`，日志 SHA-256 `0cad62400bb4211269d193f03e80cdc0a3f2f0a495f2bc16e58cdad4848224ca`。这证明当前限定源码/fixture/工程门，不是所有 owner 或用户目标闭环。Project exact scope与 same-engine active 切换后的晚 ACK 尚缺完整 real-UI，当前 IAB 与真实 BFF/Agent owner 整链未验；实际提交与发布状态以本仓 HEAD 和 Root gitlink 为准。

---

## R141 会话列表有界读取（2026-10-03；限定系统切片与工程门通过，待 Git）

`listSessions` 现以单一 10 秒预算覆盖 `fetch`、成功 JSON body 与错误 JSON body 的完整读取；超时终止真实请求并沿既有 network failure 进入人工 Retry，不建立自动重试。桌面 rail 只在已加载成功、无错误且确实为空时隐藏 direct 空列表；loading、错误和 Retry 保持可见。

Root 的严格 direct-list RED 进程 47705 为 2 fail；冻结实现后进程 94936 两个 R141 节点通过，进程 14725 的完整 OIDC system file 为 45 pass / 0 skip，manifest 标识前缀 `5d01351f`、日志标识前缀 `46460d24`。随后完整工程门进程 15328 已通过 contract 256、architecture 50、lint、typecheck，并到达 2351 pass / 1 fail / 0 skip；唯一失败是旧 `page-clients` 精确 fetch options 断言未包含新 AbortSignal，现已按实际调用迁移，当时仍待 Root 最终完整复验与 build。

Root 最新完整 `pnpm check` 进程 96991 自然 exit 0（127.231s）：contract 256、architecture 50、lint、typecheck、164 files / 2352 tests / 0 skip 与 build 全通过，包含 OIDC 45 与 IAM relay 68；manifest SHA-256 `448bdb142b2a24e7b9bb57652ac0509149d8368aa2c7f5222a7ec1c4b8718711`，日志 SHA-256 `61f7bec6e517538d6a705a2ae6eac6e4059e8d0bcd65c3d2cd1eb54efed47dde`。此前进程 92828 曾在既有 pending-refresh signout 节点出现 HTTP 500 / `next_runtime_error`；其后完整 OIDC 45 与最新全门通过只证明当前复验成功，未定位该间歇失败根因，稳定性调查仍未关闭，本文不宣称已修复。

本切片只证明 fixture 覆盖的会话列表未结束 body、503、显式 Retry 与恢复行为；不证明 snapshot、分页、其它 GET、全部真实 owner 或当前用户 IAB 已闭环。候选尚待 Root Git。

---

## R139 Product Session 有界恢复（2026-10-03；Root 工程与限定系统验证通过，待 Git）

当前候选把 `/api/auth/session` 收敛为共享、10 秒有界且可真实 abort 的探针：只有 HTTP 200 的显式 `authenticated:false` 才进入匿名登录，可信非空 subject 才进入 live；503、网络、超时、坏响应与 storage 故障均 fail closed 到可访问 Retry。已认证重核验故障保留 Chat 树与旧 subject，同时立即撤销 Project reads；身份变化清 Web 自有 Conversation 索引并硬刷新，不把新主体采纳到旧 engine。同 subject 第二文档通过非授权性质的 UI marker 保留原标签页索引与草稿。

Root 在冻结候选上完成四个真实 Next+Chromium 系统行为：pending 超时后人工 Retry 恢复、503 不误跳登录、真实匿名 200 进入正常登录、同 subject 第二文档不清首标签页 Conversation index/draft。完整 `pnpm check` 原进程 84601 自然 exit 0（116.853s）：contract 256、architecture 50、lint、typecheck、164 files / 2350 tests / 0 skip、build 全通过；其中 OIDC 43 与 IAM relay 68 个真实系统节点均执行通过。manifest SHA-256 `5cb35e18feb23049cc137e6a6d80f90380446c50020c8f39f8c7cb5dfd46225e`。

该候选尚未由 Root Git/发布，当前 live 副本未更新；用户 IAB 仍有 7 个窗口未关闭。本次 BFF fixture 证明限定会话边界，不证明所有真实 owner、模型/provider、Billing 或用户整链闭环。跨 actor draft、marker 多文档并发、list/snapshot 截止恢复仍是后继验收项。

---

## R137-E117 当前状态（2026-10-03；public7 consumer 与特定 UI 切片已验证，待 Root Git）

Web 已从基线 `ddd38c5bdc1eab01f802e1fc993f7b597d707a64` 完成 BFF public `7.0.0` 单轨 consumer 候选：固定 owner main `a68cbe55cde709f9b21f3d5803bfbd3ca5d14e2b` canonical SHA-256 `76d524d731b10d1cd4b16db4dae957701bf5c5d82a3cd915a42bc57617746ebe`，正规 generator write/check，接入 required nullable selected execution process、锚定分页、safe Todo/activity、同水位续流、410 有界重取与真实 abort/generation 隔离。Browser 仍只走 Web 同源 BFF；无新 owner、数据库、缓存或依赖。

Root 在最终冻结候选上实际执行 Node22 `pnpm check`，原进程 47729 自然 exit 0（78.359s）：contract 256、architecture 50、lint/typecheck、2346 tests（0 skip）与 Next build 全通过；manifest `/var/folders/gn/wbk8wfbd047_wvwkwtyn331r0000gn/T/kokoro-r137-final-check-ah0clun_/manifest.json` SHA-256 `431c51b480c843646d1a2e42358ed0e4bc8e3100b718135ff7db710e05998943`，753 个受保护源文件不变。E113→E117 的 lint 与旧 raw HITL 断言失败链保留在任务记录，未以放宽门禁清零。

Root 另以本地 preview 真实页面执行 R137 六个桌面/移动 Playwright 节点，原子进程 56896 自然 exit 0、6/6 pass：正文在 safe process 存在时保持单一 streaming、TEXT START 到首 token 无空白、HITL approve/reject 后展开同一工具活动可见 Completed/Failed，并留成功截图；manifest SHA-256 `f491c5c548db9320ed822e08cca95b297284e420ca9b549f8b34b2d1b0e4df3d`。这是 preview 页面交互证据，不是正式 IAM、真实 provider、Billing、真实 BFF HTTP 或全部 Web7 用户能力闭环。候选尚未由 Root 提交/发布；旧 raw core schema/type/reducer/projection/cancel 清理仍属下一窄切片，不能称 D0 全部技术债归零。未决协议/产品问题为 0；最终 Git、资源与发布验收仍由 Root 独占。下方 R135-D0 是已执行的历史设计门，不再描述当前源码版本。

---
## R135-WEB7-D0（历史设计门） 当前状态（2026-10-03；四文档方案候选）

Web main 基线 `ddd38c5bdc1eab01f802e1fc993f7b597d707a64` 起始 clean；当前源码/pin/generated 仍消费 BFF public `6.0.0`。目标 BFF 已正式发布 main `a68cbe55cde709f9b21f3d5803bfbd3ca5d14e2b` / public `7.0.0` / canonical SHA-256 `76d524d731b10d1cd4b16db4dae957701bf5c5d82a3cd915a42bc57617746ebe`。R135 本阶段只有 `docs/TECHNICAL_DESIGN.md`、`docs/API_CONTRACT.md`、`docs/DATA_MODEL.md`、`docs/CURRENT.md` 新前缀；Root 独占审查、Git/index/commit、资源与最终验收。

三面设计门已对齐且未决产品/协议/数据问题为 0：BFF/Agent owner 不变，Browser 唯一同源 BFF；snapshot selected process 与 head 独立，A terminal+B queued 保 A 到 B START；Todo null 与空数组不同；安全 activity 保首次顺序、后续全值替换且不虚构 kind/phase 图；同 anchor 全页耗尽/验证后才从 W 续流；400/401/403/404/429/503 fail closed，process 410 丢全部旧页并有界新 snapshot；scope/dispose/new hydrate 真实 abort+generation 隔离所有迟到结果。无新数据库、持久缓存、owner、依赖、样式重设计或兼容轨。

TECH R135 已给出 §8 放置表、现 machine 扩展与条件性私有 `src/engine/hydrate-process.ts` 比较、精确 tests/source/pin/generated 文件集和 RED/GREEN 门。默认采用现文件最小扩展；只有 tests-first RED 证明 machine 职责需要拆分时才由 Root 放行该具名 plain file。删除范围仅旧 raw tool/subagent shape/alias、process=head 推导和内存 non-text merge；合法正文、Vercel 映射、HITL、Delivery、optimistic admission、failure 与连接 refcount 均保护。

本轮未改 source/tests/机器 pin/generated/lockfile/Root docs，未运行 pnpm、浏览器、数据库、Redis、共享服务或 Git；文档候选不构成行为 RED、GREEN、生成成功或真实 owner/browser 证据。后继必须由 Root 先审 D0，再另授 tests-first RED；不得直接进入实现。四文档 hash、suffix byte 保护和 diff check 由本次冻结报告给出，交付后唯一 Web writer 停写。

---
## R102 Home提示语义验收（2026-10-02，Root已验，发布结果见Git）

基线main b49797b1e8ee659b7593429aa09e9455a3ad5485；四现content/i18n source及三test切片。简报/设计/游戏使用各自专用草稿、已有意图描述与intent；网站及More文章/数据/代码保留。点击仅填draft并聚焦，不创建项目/消息、不发送或计费。九locale均解析新key，不新增CSS/API/状态源/依赖。

- E37 Root原28466真实RED11fail/142pass；冻结GREEN Root原84433完整pnpm check exit0：249contract/50architecture/163files2328tests、lint/typecheck/build。日志/tmp/kokoro-r101-root-home-final-check.log，独立/tmp/kokoro-r101-home-final-review.md P0/P1/P2均0；无format脚本（N/A）。
- 本次Root原7822新聚焦复验exit0：153pass/3files/7.93s，/tmp/kokoro-r102-root-home-focused.log。七候选+share八hash匹配，748外围基线保持，旧已删除CSS sentinel不恢复。Root唯一Git owner，按七切片路径和本CURRENT精确提交。
- 仅本仓限定纯门通过。新提交/远端发布/Root gitlink与provenance以实际Git证据为准；Home真实浏览器T-U01、完整W2及积分/其他能力仍未闭环，纯门不能替代。

## R99 Home交互真实性切片（2026-10-02，Root已验收，发布结果见Git）

基线main85403f340b6565aeb11d9aa6f90ea7d2ff906fe6；本切片仅正式Home提示填入draft/intent并聚焦、零自动submit/项目创建/计费；无Billing投影不显示Free/升级状态，preview样例明确隔离。全部Workspace Header只读品牌，删假1.6档位、本地tier state/radio及唯一消费CSS；真实Composer/System模型链不改，不保留双行为路径。

- Root原93588真实RED：7fail/135pass/142total。原owner最终聚焦142/142；Root原21275 Node22完整pnpm check实际exit0：249contract/50architecture/163files2320tests、lint/typecheck/build通过，/tmp/kokoro-r99-root-web-home-check.log。752 tracked门前门后hash相同，已批准CSS删除按manifest记录。
- 独立Sol7路径Spec/quality审查0P0/P1/P2，/tmp/kokoro-r99-web-home-final-review.md；三旧假行为assert迁移已批准，其余项目/分享/credits/owner断言保持。
- 这是限定切片，不是完整Home、真实浏览器、两轮W2或积分闭环。Root新查到既有Home语义mapping：简报→文章、设计→数据分析、游戏→通用脚本；后继在原测试ID T-U01修复，不把本切片纯门当这些映射正确或全产品上线。

## R95 Root候选：终态连接准入与HTTP测试诊断（2026-10-02）

Web正式基线main a6c651b1c22a86cacfe282486193d743fca3ca3a。本节记录发布前候选与源码验收，不表示真实浏览器或完整产品已通过；提交/发布结果以本仓Git和Root同task/progress实际记录为准。

- engine两个冻结候选：machine0928eaa5 / engine.test f45cd3f610。Root实际RED134项1失败/133通过（终态quiet owner快照后残留reconnecting、第二submit未发POST），修复保liveAdvanced/session/generation/active successor/null失败约束；仅无successor且未晚到live的权威终态读关闭旧流并恢复connected，不放宽canSubmitMessage。
- 既有OIDC测试诊断候选8cb206b0：started与refresh HTTP提前终态race，复用安全responseDiagnostic、固定异常类别、one-shot并核一实际refresh请求；原tombstone/409/零stale revoke/退出状态和finally断言保留，无timeout/skip/重试变化。原writer39/39只为交付证据；Root后继完整门结果见下，独立最终审仍待收取。
- 原Root完整门58933失败（2312通过/1欢迎页项目路由失败）和单worker55271失败（2312通过/1 OIDC30s超时）保留。Root完整app-frame95与原OIDC单例1pass/38名称过滤skip不代替整门；生产路径未据此盲改。日志与完整hash由Root同task/progress/test-cases记录。
- Root当前原配置Node22完整pnpm check29612已实际exit0：249contract/50architecture、163files2313tests、lint/typecheck/build通过；/tmp/kokoro-r95-root-web-final-check.log。仓库无format脚本，diff-check0，不冒称执行不存在命令。源与三个production/test冻结，只有本CURRENT与engine INDEX补当前证据与职责；独立最终审0P0/P1/P2已收取（/tmp/kokoro-r95-web-final-review.md）；精确提交与Root组合发布结果见Git及Root同task/progress。真两轮W2、作品/刷新/他人拒绝与Billing仍后继，不能将纯门当真实运行通过。

## R93 Root消费验收（2026-10-02）

Root在a52a623+冻结public6切片实际重跑Node22 pnpm check，原81297终态exit0：249contract、50architecture、163文件2309测试，lint/typecheck/build通过；日志/tmp/kokoro-r93-root-web-public6-check.log。独立Sol0P0/P1/P2、17授权/735外围与owner canonical原字节确认，报告/tmp/kokoro-r93-web-public6-review.md。仅固定BFF bb610ea/public6消费者，不修改UI或生命周期；Root组合/gitlink与真实浏览器尚待复验，不能声称用户旅程完成。

## R91-WEB-PUBLIC6 当前状态（2026-10-02；正规生成 GREEN，待 Root 验收）

- Web HEAD 基线 `a52a6230e4f8e54f95b1f0322adbf1f187aacaae`；BFF owner 已发布 commit `bb610ea7262574772e1d8c309a6e03171d07d0a3`、OpenAPI `6.0.0`、canonical SHA-256 `75ef9f7a3b28018d9c7a3ca5899f75afe561dd40b794e7f71b0e3d078b29c129`。
- 精确17路径内已把 owner canonical 原始字节固定到 `src/generated/bff-public-openapi.yaml`，更新既有两 generator 的 pin，并正规生成 `src/generated/bff-agent-failure.ts`；Team15 正规 write 后全部 byte-equal。未改 runtime source、依赖、SQL 或生命周期三文件。
- public6 集合语义：省略/空 scope=全部 admitted owner 可见 active Conversation；显式 direct=`project_ref IS NULL`；非空 project_ref=exact owned Project；direct+project_ref 在 lookup 前 `invalid_scope`/400；filter 变化丢弃旧 cursor。
- runtime 当前已经显式发送 direct 或 project_ref，同源 adapter relay query；本轮没有新 collection 参数或 consumer6 runtime 改动。Safe12、ChatMessage fingerprint、Team9、R76 Scheduled create graph与其他 operation assertions 必须保留。
- Node22 focused old-snapshot RED 已确认：8 files 全部收集，136 tests 中 123 passed / 13 failed；失败仅为 exact pin/派生 provenance 与新增 public6 listSessions graph。Root 同基线复跑后放行。worker 正规 generation write/check exit0，focused 8 files / 136 tests 全通过；随后完整 `pnpm check` exit0：contract 249、architecture 50、全测试 163 files / 2309 tests、lint、typecheck与build通过。日志 `/tmp/kokoro-r92-web-public6-generation.log`、`/tmp/kokoro-r92-web-public6-focused-green.log`、`/tmp/kokoro-r92-web-public6-full-check.log`。
- R90 lifecycle commit `a52a6230e4f8e54f95b1f0322adbf1f187aacaae` 已在基线但不属于本 W01 交付；其三冻结文件保持原 hash。真实浏览器/owner组合、Root独立复验、Git/index/commit 尚未执行。

---

## R90 Root验收：committed-effect会话引擎生命周期（2026-10-02）

基线main5e538f69；原WIN01三路径冻结，Root实际tests-only RED原12482 exit1（2failed/91filtered，/tmp/kokoro-r90-root-web-aborted-render-red.log）证实aborted/delayed commit在render提前创建storage/snapshot/SSE/cache。effect内同步factory+retain并发布本hook局部lease；render仅匹配已committed scope/mode实例或null，不peek全局零owner缓存。保token/refcount、Strict/双owner/幂等cleanup、injected caller-owned、scope遮旧与最后owner释放。

Root fresh Node22.22.2 pnpm check原47394实际终态exit0：246contract、50architecture、2306tests，lint/typecheck/build通过；/tmp/kokoro-r90-root-web-full-check.log。独立Sol最终0P0/P1/P2，原P1已闭（/tmp/kokoro-r90-web-final-review.md）；3hash在Root门后匹配。worker生命周期7/AppFrame95为补充，Root完整门重新覆盖。仓库无format脚本，本轮git diff --check0，未声称运行不存在命令。

仅生命周期组件/源码切片通过，不证明W2根因、真实登录/模型两轮/刷新/作品/积分全链；仍固定BFFpublic5，后继正规public6 consumer再Root真实旅程。Root接管本三源码/测试与此CURRENT精确提交，其余tracked byte-equal，未启服务/共享资源/改用户数据。

## R85 Root：Plugins本地假成功已删除（2026-10-02）

基线main52fdd8e。原WIN01只改现Plugins组件及测试：删除added Set/toggle、Add/Remove/data-added/checkmark，保发现信息、搜索、分页、轮播、空态、管理与现创建入口；未改CSS、engine、依赖、SQL或任何契约。Root真实RED2fail/8pass→独立Sol两文件0P0/P1/P2→Root完整Node22 pnpm check实际原52371终态exit0，日志/tmp/kokoro-r85-root-web-truth-full-check.log。RED测试全文冻结，750外围tracked文件在补此CURRENT/仓INDEX前字节完全相同。

此片仅删除伪连接状态：static目录不是owner当前连接，现创建入口MCP mutation、能力选择/授权/执行链仍未闭环；W2精确product-send-click失败仍未定位，不将此门当实际模型或费用通过。Root负责4路径提交，worker已停写。

## R83 Root：发送可用性源码切片已验收（2026-10-02）

基线 main a118ac8a76dc2e41a49511b739c31d5742ff510a。原WIN01八source/test冻结，独立Sol0P0/P1/P2，Root8hash/精确变更集匹配。原真实DOM RED1pass2fail保留：submitting/unavailable发送错误enabled；修后engine统一canSubmitMessage供snapshot/submit，Composer内容可见与disabled分开，保draft/Stop/connected streaming steer/FIFO。无wire/SQL/依赖/CSS或新状态机。Root仅补相邻engine/composer INDEX与此当前证据，旧正文保留。

Root fresh Node22 pnpm check原90572终态exit0：246contract、50architecture、2298test均0fail/0skip，lint/typecheck/build0；日志/tmp/kokoro-r83-web-root-full-check-confirmed.log。首跑check构建结束后shell只读status变量导致收尾exit1，原日志保留而非冒充0，完整重跑显式确认exit。此为源码/组件门，不是真实IAM/BFF/模型/文件/费用浏览器全链；R81 W2失败尚待新已发布组合复跑，不假定此片就是根因。Root精确提交，worker停写。

## R80 正式 consent 过期恢复源码组件已验收（2026-10-02）

基线 main96b6ac2331893a9093d088a0b7f82b8fbb9c2e26。原WIN01先只追加126行现Next集成测试，Root真实Next+Redis corrected RED3pass1fail64filteredskip；HTML过期403而非正式空303/login。route局部GREEN后Root全68与完整2298测试发现finalproxy覆写no-referrer，保该真实失败/断言，精确POST路径proxy补策略。

最终三source/test冻结，独立Sol两轮0P0/P1/P2。Root真实Next+共享Redis独有origin+Chromium fixture68pass0fail0skip20.99s（/tmp/kokoro-web-r80-consent-root-full-next-final.log）；Root完整Node22 pnpm check exit0：246contract/50architecture/2298unit0fail0skip，lint/typecheck/build0（/tmp/kokoro-web-r80-consent-root-full-check-final.log）。原Next/BFFfixture句柄终态并由afterAll回收临时目录/独有CSRF键，不reset共享状态。

HTML失效只空303固定/login+精确Path清CSRF cookie，不重放旧签名query、不造连接/重试页；JSON403、Origin/query/issuer/form/decision检查、GETDEL、Redis异常503与owner状态语义保持。finalproxy仅exact consent POST加更严格no-referrer，不影响其他路径/方法/CSP。原所有旧测试断言零删除/修改。

这是真实Web/Redis/Chromium组件门，upstream IAM/BFF为该既有fixture替身，不称真实IAM owner、账户完整登录、模型两轮/刷新/文件或Billing费用链已通过。下一实际旅程需已发布clean六owner/Root exactpins，完整Wave0–7仍未闭环。Root仅提交本三代码/测试+此当前证据前缀，旧全文原字节如下。

## R80 项目关联独立任务源码验收候选（2026-10-02）

Root 当前验收基线 main dc330a99332be28bb74a4fa2d2196ba8425f9dc5；BFF479d4e8/public5.0.0 固定契约保持。R79五D0通过独立Astra；R80原15source/tests先真实RED66pass8fail→78GREEN。首次独立source审发现whole surface卸载后旧回执reload的P2，原writer再真实RED31pass2fail→聚焦33/定向83GREEN；两文件窄修后独立Astra复审0P0/P1/P2。Root fresh完整Node22 pnpm check实际exit0：246contract/50architecture/2294unit0fail0skip及lint/typecheck/build0，日志/tmp/kokoro-web-r80-p2-root-full-check.log。修前Root2290以下证据不替代本次新hash。

完整候选为五D0+十source+五tests，P2新freeze b6dc3bf6；其余18候选及732外文件保护，合同/pin/generated/SQL/依赖未变。create/record严格可选project_id、PATCH排除、Project深链编码、personal/project/invalid上下文、实例/卸载迟回执隔离、404保草稿、未知结果原命令重试均由测试承接。不建第二editor/store、不造optimistic任务、不宣称列表按Project过滤。

这是源码组件门，不是真实BFF/浏览器或整个用户/费用旅程验收。consent过期HTML裸JSON的独立P1仍后继两文件切片；实际W2 product-post尚待重新定位，完整Wave0–7和正式积分链未闭环。Root负责最终index审查/提交，旧文档正文保留如下。

## R79-WEB-PROJECT-D0：五文档方案候选（2026-10-02；待 Root 独立门审）

基线/当前 Web main `dc330a99332be28bb74a4fa2d2196ba8425f9dc5`，起始clean。Root沿同一R79任务卡批准仅docs/TECHNICAL_DESIGN.md、API_CONTRACT.md、DATA_MODEL.md、CURRENT.md与INDEX.md新前缀，WIN01唯一Web writer；Root独占Git/index/commit、资源、独立Astra审和放行。本阶段source/tests/generated/pin/依赖/SQL未改，无新目录/计划中心/ADR。

R78只读确认缺口：record/create未声明project_id、Draft/Record/client遗漏映射，create.partial派生PATCH须排除关联；Project卡丢创建上下文，location缺项目身份，editor缺上下文/记录实例key。Root已采纳现独立Scheduled surface：精确项目深链→同现editor，query只浏览器上下文，body exact project_id，collection POST无query，personal不带关联；invalid不trim/fallback，PATCH禁止改归属。上下文/记录元组key及存活守卫覆盖close/error/reload、切换清editing/prompt/opener；404保草稿不reload/optimistic，success才GET个人owner全集，不宣称项目过滤。

### 三面当前目标与精确后继范围

- TECH R79：两可行位置比较，采用独立surface，淘汰第二Project liveeditor；列现10source＋5test绝对路径/职责、仅原正式已知Project href断言迁移、旧行为保护与后继门。
- API R79：固定已发布BFF479d4e8/public5.0.0/3ce25a31；关联创建/record窄消费、PATCH排除、无query POST、typed404/命令身份与实例边界；不新public契约或改ownerblob。
- DATA R79：无Web持久化owner/schema/事务/缓存，创建上下文/Draft/Record/editor/intent/读取仅当前URL或内存投影；不写关系store、不改变Chat scope。
- INDEX R79：仅当前阶段和同一设计/现入口导航，不建立第二任务表。

本轮实际验证只包括五文件diff范围、五份原全文suffix逐字节与起始hash保持、其余tracked字节保护、owner committed blob/consumer精确一致、index/untracked与git diff --check。最终精确bytes/SHA与检查证据交付 `/tmp/kokoro-web-r79-project-d0-freeze.json`。本段先写方案事实，冻结工具记录实际结果，不伪造lint/typecheck/test/build数量。

### 未执行与未决项

尚未执行项目行为RED、pnpm check、pnpm test:e2e、真实BFF/浏览器/模型/Storage旅程；本轮仅文档授权，无源码写权，故这些命令未运行。R77组件门仍属已发布P5，不代表R79关联UI通过。Root报告原W2句柄14891已exit1/product-post且cleanup完整；此为Root独立旅程事实，不由本worker复验，也不是本D0功能证据。

三份目标方案已对齐，但D0仍待Root独立Astra审通过，不自授通过/代码权。无本片新owner/contract/schema未决；剩余门审、真实RED与原15文件GREEN、完整门、真实owner/browser/e2e及Git发布由Root放行/验收。Root另授后WIN01沿同一任务卡实施，不重复创建计划。冻结交接后停写。

---

## R77 Root 验收：固定 public5 消费组件通过

Root 接收17文件冻结66fa8c3b161db991d8dcb34a5194ee39d78f6c21ee5523fcdbac2d578c8fa134，Astra最终freeze独立0P0/P1/P2；17hash实核、735保护保持。fresh Node22完整pnpm check exit0：244contract/50architecture/2275unit，0fail/0skip，lint/typecheck/build0；日志 /tmp/kokoro-web-r77-root-full-check.log。owner479d4e8/public5.0.0/3ce25a31精确原字节消费；Team15保持，safe12/fingerprint、原R74三P1源码/测试未变。

Root 接管17文件提交与后继Root gitlink更新；这是固定消费者组件，不是浏览器/IAM/模型/文件或积分整链。project_id关联UI仍后继切片，未冒称可用；原0collect与真实RED13保留。

## R76-WEB-PUBLIC5：固定消费者候选冻结（2026-10-02）

Web 起始且当前 main `28672f330df11cd55f7ff3f89f269acc3fe908cf`，起始 clean、当前17个授权文件未提交；WIN01唯一writer，Root独占Git/index/commit、基础设施与最终验收。沿Root同一R76任务卡和既有D0生成路径，不新增计划、目录或产品能力。

固定BFF已发布 main `479d4e8b0aeb438d2ec9cb3d4472130fc1a29972` committed canonical public5.0.0，YAML SHA-256 `3ce25a31d326a358d6e1d3c8ee33b5e07dbc34da13ee0933b3b5edf31531918b`。两generator正规 --write/--check通过；Team九操作与15生成文件保持起始字节，failure仅3 provenance字段变化，两roles/safe12 tuple及ChatMessage fingerprint `0ef4d13e0f9e383830e2d1cb65a391cb6fad67985bf3bc9dd3beeb0682beb41b`不变。

### 实际验证与保护

- tests-only真实RED：全部19文件collect，contract244项231pass/13fail/0skip；9项旧pin/provenance和4项新增owner创建graph失败。随后正规生成GREEN244。此前新EOF import语法错误的0collect日志保留，不算行为RED。
- Node v22.22.2 / pnpm11.25.0，本工作树 `pnpm check` 句柄46248已完成exit0：两generator --check；contract19文件244通过；architecture4文件50通过；lint零warning；typecheck exit0；test163文件2275通过/0失败/0跳过（44.34s）；build exit0。完整日志 `/tmp/kokoro-web-r76-full-check.log`。本段为门禁后仅文档证据更新，未改变受验源码。
- 752 tracked中仅17授权路径变化，其他735逐字节相同；七pin测试及两generator仅机械固定输入迁移，failure另两处版本展示label更新；原api-contract全文保持，仅EOF新增4个owner graph断言。四D0与contract README仅本轮前缀变化、旧全文保持。R74聊天、snapshot/水位、FIFO/并发receipt、failed control源码和行为断言、Scheduled运行源码、UI/routes/CSS/依赖全部原字节保留。index及untracked为空。
- 精确17路径、bytes/SHA、735保护及旧正文证据见 `/tmp/kokoro-web-r76-public5-green-freeze.json`、`/tmp/kokoro-web-r76-scope-protection.json`；起始752 hashes `/tmp/kokoro-web-r76-baseline.json`；真实RED `/tmp/kokoro-web-r76-public5-actual-red.json`。owner语义保护 `/tmp/kokoro-web-r76-owner-semantic-protection.json` 证明仅CreateScheduledTaskRequest schema变化，Chat/Team operation对象不变。
- gpt-5.6-sol只读审查绑定本轮17路径：0 P0/P1/P2；未写文件、Git、运行测试或资源。最终CURRENT仅替换此前阶段性状态；Root独立审查、主仓重验和提交仍待执行。

### 未运行与后续owner

public5 Scheduled create closed body移除enabled/status、五required及optional exact project_id。现独立create已发五必填且不发removed字段，本片不改运行source；Web Draft/client/live项目关联创建仍未实现，auto_approve仍按UI必填收窄，不声称完整映射所有owner可选输入。项目能力后续由Root另授范围。

未运行pnpm test:e2e、浏览器/真实IAM/System/Ollama/Agent/Storage/Billing整链或SQL schema；没有启动、重启、清理共享资源，没有Git/index操作。源码/fixture门不替代真实旅程。候选待Root审验/集成/提交，WIN01冻结交接后停写。

---

## R75 Root 独立验收：public4 会话与审批消费者源码

Root 在本工作树 fresh `pnpm check` Node22 exit0：contract240、architecture50、unit2271pass/0fail/0skip、lint/typecheck/build0，日志 `/tmp/kokoro-web-r75-root-full-check.log`。原 Astra 逐项重审 R74 冻结68path、5授权delta、747保护及九冻结块，0P0/P1/P2；原三个P1已关闭。Root 接收完整切片准备提交，当前仍固定已发布 BFF3c08a422/public4/digest5561450b，不提前消费未发布public5。首次R70纯GREEN后的三P1记录保留；源码及测试验收不代表真实IAM→模型→刷新→文件→积分整链。实际浏览器/资源由Root后继独立验收，WIN01已停止写入。

## R74-WEB：三项 P1 修复候选冻结（2026-10-02）

当前 Web 基线仍 main / `06a1c86612d9557d83081bcb67e8fc539ae7eacb`，未提交。R70 候选曾被 Root Astra 检出三项 P1，因此下方 R70 GREEN 与初审不是本轮最终验收；本前缀记录其统一修复，旧正文与 D0 原字节保留。Root 独占 Git/index/commit、服务与真实组合验收，WIN01 仅为已授权 slice 的 writer。

### 本轮修复与精确范围

- terminal RR 出现有效 successor head 时，以完整 canonical snapshot、opaque watermark 和 interaction baseline 原子接管；旧 stream 的 callbacks/buffer 经 adapter generation 失效，新 stream 使用 snapshot 水位。新 head 接管不被仅 delivery 推进的旧 cursor 阻止；live-advanced 成果按 exact Conversation/Artifact 二元身份合并。snapshot 不复活已观察 terminal；RR 在途 terminal evidence 只活在相应 read 窗口。没有 opaque 大小比较。
- 每个 create closure 冻结自己的 optimistic ID，三个 receipt helper call 均显式传入该 ID。pending echoes 不参与 core 的内容猜测，SSE-first receipt 只删除对应 echo 并保留 canonical owner row；正常/逆序/同内容并发与 RR 在途的未 ACK/已 ACK admission 均覆盖，同会话 snapshot 接管不废弃仍有效的 admission generation。
- resume 明确处理 pending/succeeded admission 与 failed durable receipt。failed 释放 lock、显示白名单 stable error（未知码统一 control_failed）、GET owner facts；不自动 POST、新 key/body、消费卡片或虚构 terminal。intent/attempt/session/run/pause/hydrate guards 阻止旧回执或慢 read 影响新 pause、Stop、同键显式重试。只有真实 owner pause/collection 变化才失效旧意图，旧 interaction revision 的 read 不回退已知 baseline。
- RR 保留已确认普通 tool/thinking/subagent 事实；只携带这些 process projection 的 exact event-ID 去重集合，不携带旧 lastSeq、text/interaction 的 dedupe 身份。后水位重放不重复 subagent/process，canonical 全文仍由 fresh snapshot 建立，不重造第二 HITL 协议。
- 本轮只改既有 source 两文件 machine.ts/event-reducer.ts、engine.test.ts/event-reducer.test.ts，以及本 CURRENT 前缀。新测试 EOF 追加 24 条（engine 21、helper 3），原 2247 条保留。Root 批准的旧断言例外只有 engine 原第2281行：旧 stream closed＋新 stream open/原精确 watermark；另仅为旧 helper call 增加 usr_1 显式参数。其余旧测试前缀恢复这些两项机械例外后与 R74 起始字节一致。
- fixed BFF public4.0.0 owner `3c08a422f3a6aa3cf204c308716cfa64f6d61bb2` / YAML SHA `5561450bd02e978bace1d4850c262aea645bad8fdf4ec46fd0cfffb6765c8ef6` 未改；本轮未写 pin/generated/contracts/依赖/其余文档。无新文件/目录、index 空、Git 提交仍归 Root。

### 当前实际证据

Node v22.22.2 / pnpm11.25.0，本主工作树最终 fresh `pnpm check` 句柄95042已终态 **exit0**：

| 门禁 | 实际结果 |
| --- | --- |
| 两 generator --check | 通过，Team15固定 owner pin 与 failure artifact 无变化 |
| pnpm contract | 19文件 / 240通过 / 0失败 |
| pnpm test:architecture | 4文件 / 50通过 / 0失败 |
| pnpm lint | exit0，零warning |
| pnpm typecheck | next typegen + tsc exit0 |
| pnpm test | 163文件 / 2271通过 / 0失败 / 0跳过，43.23s |
| pnpm build | exit0，编译、类型、静态页通过 |
| 定向 engine + event-reducer | 138通过 / 0失败 / 0跳过 |

最终完整日志 `/tmp/kokoro-web-r74-full-check-final.log`；起始752 tracked hashes `/tmp/kokoro-web-r74-baseline.json`，scope/旧断言保护 `/tmp/kokoro-web-r74-scope-protection.json`，新候选 manifest `/tmp/kokoro-web-r74-public4-green-freeze.json`。同一68条既有 dirty 路径仍沿 R70 授权，此次相对 R74 起点只有上述5条变化，其他747条 byte-equal；CURRENT 只前插证据。

保留真实 RED/失败过程：RR初次3RED；三目标合集 raw 12fail/1pass（其中逆序用例先漏计 fixture 原 user，修正仅本次 EOF 新期待，不归为产品缺陷）；Stop/旧revision/live-delivery竞态3RED；ordinary tool丢失1RED；subagent重放重复1RED。首次完整门2259pass/1fail只因上述已批准旧 stream 断言冲突，第二轮2270 GREEN是最终 subagent修复前证据，不冒充最终源码。全部 logs/JSON 保留在 /tmp 同前缀下。

独立 gpt-5.6-sol 原生只读审查两次发现 liveAdvanced 阻止接管及过程重放重复，均补真实 HTTP/SSE 负例修复；最终 source 绑定 machine SHA `f95791e9a32f2e6542c74ad5766c2397f16ba167294f46a9185520ee380dcbb5` / event-reducer SHA `1a9b76a61a40d2bdd819c8041db870b497718f21978101392b8cc4622b7ca3ce`，未发现剩余 P0/P1/P2。它未写文件、Git、服务或运行测试；最终全门由主 writer 实际重跑。Root Astra 的新 freeze 独立重审仍待执行。

### 尚未完成与后续 owner

状态为候选冻结、待 Root 独立审查/主仓重验/提交；不是已集成验收。未启动/重启共享服务、数据库、Redis、ObjectStore、provider 或浏览器，未运行 pnpm test:e2e；真实 IAM 登录、多轮、整组 HITL、Stop、Storage/模型/计费/刷新组合仍由 Root 验收。HTTP/SSE fixture 与组件门不证明这些用户整链。后续 owner：Root，WIN01 交接后停写。

---

## R70-01 WEB public4 完整 GREEN 候选冻结（2026-10-02）

当前 Web 基线仍 main / `06a1c86612d9557d83081bcb67e8fc539ae7eacb`，未提交；Root 独占 Git/index/commit 与最终集成验收。WIN01 唯一 writer 已沿 R65 精确 source/tests/pin/generated 授权实现，下方 R65 D0 的“未实施”只属于其历史阶段，R65 原前缀与旧正文保留原字节。

### 当前实现与授权保护

- 固定已发布 BFF public4.0.0，owner `3c08a422f3a6aa3cf204c308716cfa64f6d61bb2`；YAML SHA-256 `5561450bd02e978bace1d4850c262aea645bad8fdf4ec46fd0cfffb6765c8ef6`。按现两个 generator 正规 `--write` 与 `--check`，Team15基线 byte-equal，failure仅 provenance改变，12tuple与语义fingerprint保持。
- receipt/queued/START、execution_head四态、完整pause与五decision、required pause locator、strict revision/presence/privacy、ACK保卡、durable resuming、native consumption/new pause、FIFO/reload/GC410/Stop及连接正交已实施。snapshot-only直接展示完整groups/items，不注历史、不制造工具args；普通日志、Message全文/身份、safe12失败、Artifact二元身份、Direct/Project scope与pre-receipt原键恢复保留。
- 已删除旧 active_run/顶层pending、旧awaiting CUSTOM/逐工具暂停生命周期、旧decision alias/public body session_id、乐观rejected/清卡与旧reattaching execution phase；生产没有public3 fallback/双读/第二协议。opaque cursor只有传递、相等/变化检查，无大小排序。
- Root窄扩展是既有通知hook与三个success fixture包装例外，详见TECH R70；waiting通知真实3RED→3GREEN，resuming清可操作badge且owner卡片仍保留。fakes及两deferred ACK只按现同源adapter解包，错误envelope与冻结行为断言完全保持。
- R66/R69九个冻结追加块逐字匹配（仅上述success wrapper例外），proof `/tmp/kokoro-web-r70-frozen-assertions-check.json`；旧测试只迁breaking语义，未删/skip/放宽安全、迟回执、游标或identity断言。完整测试仍保起始2193例，并增加R66 41、R69 2、R70 11，共2247。
- 实际68条dirty路径均有授权映射：Root先前67条加既已在R65测试集内的 `tests/engine/event-reducer.test.ts` 旧phase机械迁移；没有新文件/目录。逐路径绝对位置、授权与SHA见 `/tmp/kokoro-web-r70-path-authorizations.json`，最终冻结manifest见 `/tmp/kokoro-web-r70-public4-green-freeze.json`。

### 实际验证（不是整条用户链证据）

Node `v22.22.2` / pnpm `11.25.0`，本主工作树 fresh `pnpm check` **exit0**，句柄71129已终态：

| 命令 | 实际结果 |
| --- | --- |
| 两项 contract generator `--check` | 通过；Team15 byte-equal、owner YAML exact pin |
| `pnpm contract` | 19文件 / 240通过 / 0失败 |
| `pnpm test:architecture` | 4文件 / 50通过 / 0失败 |
| `pnpm lint` | exit0，零warning |
| `pnpm typecheck` | next typegen + tsc exit0 |
| `pnpm test` | 163文件 / 2247通过 / 0失败 / 0跳过，45.16s |
| `pnpm build` | exit0，Next编译/类型/静态页通过 |
| `git diff --check`、路径/冻结/旧body保护 | 通过；index空、无untracked，待Root实际重验 |

最终完整日志 `/tmp/kokoro-web-r70-full-check-final.log`。中间98旧语义失败、通知3RED、terminal两RED保留；首次完整门因删dead phase后5个旧测试类型失败，第二次2246pass/1fail因START插入后fixture游标仍在第一位置，现明确START=CURSOR_3/terminal=CURSOR_7且原断言不变。失败不抹去、不靠放宽门禁清零。

独立 gpt-5.6-sol 只读审查基于变化中工作树：head单调、interaction terminal、unknown原意图重试、opaque排序、future admission迟ACK及terminal evidence窗口均已修，最终无剩余P0/P1/P2。撤回的“无head关闭可能丢未来B”设想已核对正式owner atHead/head RR语义，不改变冻结关闭行为；既有FIFO断言与新迟admission负例均通过。

### 尚未验收与后续 owner

本片没有启动/重启服务、PG/Redis/MinIO/ClamAV、浏览器、真实IAM登录、Ollama/provider、真实Storage上传、正式多轮/计费组合，也未运行 `pnpm test:e2e`。未验原因是Root独占资源与组合验收；纯fixture/组件GREEN不证明用户整链、部署或Wave0–7完成。

当前状态：候选已冻结待 Root 审查、实际同门、提交及真实登录/模型/Storage/browser组合验收；后续owner为Root。WIN01交接后停写，不新增小卡或自行扩展范围。

---

## R65-WEB-PUBLIC4-D0：已发布 BFF 消费设计待审（仅四文档）

当前Web基线 main / 06a1c86612d9557d83081bcb67e8fc539ae7eacb，任务开始working tree clean。BFF已正式发布 main 3c08a422f3a6aa3cf204c308716cfa64f6d61bb2且clean；其contract/openapi/v1/openapi.yaml public4.0.0 / SHA-256 5561450bd02e978bace1d4850c262aea645bad8fdf4ec46fd0cfffb6765c8ef6，本窗口已读取并核对实际SHA。Root BFF最终81真实PG/Redis/HTTP通过是owner组件证据，见owner CURRENT与Root R65卡，不是Web或整个用户链验收。

### 当前态、目标态与授权边界

- 当前Web src/generated/bff-public-openapi.yaml仍public3.0.0，owner293dfe7638e5dea0df2bee6dfdd8483b53fc9df6 / SHA acd92ed2fa3e84032e824e1462d67a007c4a94a7e79b7bda8fd5a66f9d51cd3b；source/tests仍旧active_run、顶层pending、逐工具HITL，未repin/generated，不假装兼容public4。
- R65仅授权docs/TECHNICAL_DESIGN.md、API_CONTRACT.md、DATA_MODEL.md、CURRENT.md新增当前前缀；旧正文逐字节保护。WIN01唯一doc writer，Root独占index/commit、资源、审查与发布；不写source/tests/脚本/pin/generated/依赖/其他台账。
- 三面目标是同一个完整public4用户切片：严格head四态/授权RR水位、queued专属decimal metadata不进Agent lastSeq、整组pause/五decision/required revision/ref、ACK非消耗、durable accepted/unknown→resuming、FIFO Run terminal不早断会话、合法control body无session_id。
- 不重设计UI、不造第二协议/owner摘要或public3fallback；复用现卡片与组件/token。正常工具活动、Message全文/identity、安全失败十二元组、Artifact二元身份、Stop/连接分离、Direct/Project scope、pre-receipt retry保留。terminal retry/Agent P3B/真实账务等不是这份D0已实现内容。
- 精确后继source/tests/pin/generated及删除/RED矩阵由TECH R65列举；API引用已发布machine，DATA明确无持久化owner。特别纳入agui-events.ts的queued metadata分支、client/transport的full-state基线/cursor校验顺序，避免只改mapper仍拒queued或坏revision先推进cursor。
- 所有source/pin/生成及原冲突测试语义迁移待Root独立D0审、tests-only真实RED与精确续授权；不是本轮即时写权。无新计划中心。

### 当前证据与未完成

本窗口实际进行：Root/目标仓说明与三面阅读、Git clean/commit核对、owner YAML SHA核对、Web全tracked起始hash、四doc前缀写入后的原body byte-equal/其他tracked保护/git diff --check。四whole SHA、prefix byte offset与旧body SHA随交付报告冻结，不在本文自引用其whole hash。

初次前缀写入命令因shell引号错误exit1，未到文件写入；改用literal here-doc后四body校验通过，原错误不计为测试失败或绿色证据。

本阶段未执行vitest/contract/generator/typecheck/build/e2e，未启动Web、浏览器、PostgreSQL、Redis、真实登录或模型；doc-only写权不覆盖这些验证。Root既有Web2193 tests/preview14pass4skip属于旧消费者历史证据，不能用于public4 GREEN。未完成：D0独立审、consumer RED、source/pin/生成、单仓完整门及Root fresh正规双轮/刷新/整组HITL/Stop验收；后续owner为Root放行、WIN01实施。Root总Wave0–7目标继续，不能用本doc切片缩小或宣称全链完成。

下方各阶段原正文byte-equal保留历史；其“当前/未实施/已完成”时间限定于原阶段，R65相关消费状态以本前缀为准。

---

## R58 Root 积分显示与未知事实验收（2026-10-01）

本切片统一既已发布的10^6 micros/credit显示单位，不是加价倍率、现金兑换率或账务writer。金额文字沿BigInt字符串移位，embedded余额/流水不经Number/Intl舍入；非法金额、缺套餐和缺免费额度显示未知，只有明确Free/零额度事实才显示对应值。低余额阈值、计价、扣费、wire及adapter未修改。

Root Node22.22.2：79定点全过（1.14s）；完整163files2193tests全部通过（48.03s），Next build exit0。日志/tmp/kokoro-web-r56-root-precision-green.log、/tmp/kokoro-web-r57-root-full-test.log、/tmp/kokoro-web-r57-root-build.log。五文件冻结独立源码审0P0/P1/P2，R52/R54新断言保持、原期望仅机械迁移。Root完整contract224/224、architecture50/50、lint/typecheck均exit0（/tmp/kokoro-web-r58-root-static.log）；本段不代替真实浏览器/正式钱包/计费用户链，BFF钱包契约与owner v2 HTTP仍后继。

## R44 Root 当前完整验收（2026-10-01）

main343aea36冻结30path在Root前后逐hash完全匹配，独立审0P0/0P1/0P2。Root Node22.22.2完整pnpm check exit0：contract224/224、architecture50/50、163文件2136tests全部通过，lint/typecheck/Next build通过；full测试44.78s，日志/tmp/kokoro-web-project-r44-root-full-check.log。原RP500/welcome两次full失败日志保留，不因本次通过推定间歇问题永久消失。Root隔离3387 preview治理Playwright14pass/4条件skip，11.1s，/tmp/kokoro-web-project-r44-root-preview-e2e.log；已停止自身listener、报告移/tmp。这是preview响应式/阅读轴/Composer/a11y门，不是正规IAM登录、真实模型多轮/项目/账务的E2E证据。本片只验收Project读取与身份边界源码，不称完整产品闭环。后继采用完整accepted源码组合，不绕exact-source守卫。下方候选及RED记录保留历史。

# WEB-PROJECT-READ-R42：独立审查指令/历史 P1，先 RED（2026-10-01）

基线仍 main343aea36f15f0ed5b7b9f41a599c066b510b066a。Root 独立审查确认原 use-app-frame-project 指令/历史第二 GET 与迟到 PATCH
绕过新身份 boundary/schema/取消/deadline；同 projectRef 重核 A→B/同 subject 时旧投影未清。这一 P1 尚未修，原 198 pass 不覆盖它。
仅授权四文档补当前前缀与 tests/ui/kokoro-project-workspace.test.tsx 追加真实 AppFrame 两个 negative；源码继续冻结。
固定 public3.0.0 owner 已发布 revision wire（id/instruction/updated_at/actor_name/current，data.items/RequestMeta），不发明历史字段。
后继复用 validated Project.instruction，删除第二 detail GET 与双 shape fallback；历史/PATCH 同代际与 bounded I/O，保留编辑/历史/资源功能。

原 Rail HEAD 的 expect 行数是52；此前 manifest61计入已接受的首次 RED 9行，两种基线应区分。HEAD原字节与首次RED完整前缀都保留，
本阶段交付 corrected metadata 明确 HEAD52/acceptedRED61；不因计数修正改测试断言。单行 signout 安全诊断已独立交付 eb5224a2，状态200不变。
本阶段纯 UI 回归实际 **2 fail / 18 pass**：第一例健康时 detail GET=2/history GET=1/PATCH=1，撤销 admitted 后旧指令/历史未清；第二例旧 detail signals=[null,true]、history=[null]，迟到 GET 写回旧投影。日志 /tmp/kokoro-project-read-r42-win01-instructions-red.log。
本阶段没有资源/浏览器/服务/Git写入；Root 复现 RED、授权精准 GREEN 并独立完整门后再验收。下方 R40 是历史候选证据，不构成 P1 放行。
Root 第二次完整 default test 实际 **3 fail / 2133 pass，42.25s**，日志 /tmp/kokoro-web-project-r42-root-full-test-r2.log；其中两项是本片 RED 的较早测试字节，最终局部两 RED 证据以上述 instructions-red.log 为准。第三项原欢迎页创建重入导航期望 /app/project/project_welcome-a、实际 '/'；本阶段只读追踪，无第二次 POST/callback/navigation 分段证据，具体根因待 Root 后继定点调查，原断言与源码均不改。本次 RP pending-refresh signout 通过，不抹去第一次 full 的500；完整门仍未通过，build未到达。

## R43 Root 精准授权后的 GREEN 候选（2026-10-01）

Root 三面门已读通过并真实复现冻结 workspace **2 failed/18 passed，2.65s**，日志 /tmp/kokoro-web-project-r43-root-boundary-red.log；
授权七现源码，WIN01 唯一 writer。现删除正式第二 detail GET/fallback/合成 revision，history/PATCH 接同身份边界和完整 body 10秒取消；
编辑器/历史/saving/error/selection 按 context 隔离，旧 ACK/finally 不写新 identity UI；preview、资源、创建/草稿/Chat 保持。
纯 list/detail hook 默认不额外 history I/O，由真实 projectWorkspace 显式启用；首次回归因此暴露6个旧读取次数/权限回归，保留原断言后修正装配。
最终 Node22 定点九文件 **204/204，17.47s**，含真实2新增 RED 转绿、原18 workspace与原81 smoke/资源/创建/身份/Rail；
契约+架构 **274/274，13.95s**，全仓 lint（零warning）、直接 tsc --noEmit --incremental false、两项 generated --check 全 exit0。
证据 /tmp/kokoro-project-read-r43-win01-{targeted-final,static-tests,lint-final,types-final,generated}.log。
欢迎页原导航/A-B草稿/同键重试断言本次未修改且通过，但之前 Root full 失败的分段根因仍未证明，不以本次定点抹去风险；
RP 原full500亦保留。源码/测试历史字节锁未放宽，Root后继 full/build/独立审/browser 后才验收；worker无Git/资源/服务/浏览器操作。


# WEB-PROJECT-READ-R40：WIN01 精准 GREEN 待 Root 验收（2026-10-01）

基线 main343aea36f15f0ed5b7b9f41a599c066b510b066a。Root 批准 D0 且复现原 RED 1fail/7pass 后授权唯一 writer；
原 Rail 8 条测试全部保留，追加正式读取生命周期测试。现 candidate 接固定 BFF public3.0.0 artifact 的已有 hub GET，
采用唯一共享 Project schema、只读 client/hook、canonical Rail 与名称/时间；旧创建 schema 删除且创建行为保持。
每次 session 核验先撤销 Project 读、清空/取消并换代，含同 subject；Chat 不重挂；A→B/不同身份/迟到回执隔离，
合法[] 独立空态，401/403 与 detail404 禁重试，坏 shape/网络失败无假空或 preview fallback，deadline 覆盖 body 并释放资源。
创建 ACK 后重新 GET、不插临时行；原幂等/草稿一次承接/会话 scope/rename 保持。

Node22 最终定点八文件 **198/198** 通过；固定 generated 检查、完整 contract **224/224** 与 architecture **50/50**、lint（零 warning）、直接 tsc --noEmit --incremental false 全 exit0。证据 /tmp/kokoro-project-read-r40-win01-{targeted-final,static-final}.json 与 final-gates.log。
真实额外 RED：非协作 fetch 取消后 deadline timer 未释放、列表401后重试仍启用；均在保留断言后修复；详情401/403保留旧集合的 2RED 也已修复。
源码候选未提交，Root 独立复验/完整门/登录浏览器仍待执行；未启动共享服务、PG/Redis/provider 或浏览器。
没有修改 Billing 数字/阈值、机器 pin/generated、依赖、CSS、Chat engine 协议、其他 owner 或 Root 台账；原正文继续逐字保留。

## WEB-PROJECT-READ-D0-R39：正式项目集合/详情读取设计候选（2026-10-01）

原 WIN01 获准仅为 TECHNICAL_DESIGN/API_CONTRACT/DATA_MODEL/CURRENT 四文档追加当前 D0 前缀，原正文逐字保留。
Web main343aea36f15f0ed5b7b9f41a599c066b510b066a 开始 clean；没有修改源码、测试、generated、依赖或 Git，未启动测试/浏览器/服务。
真实缺口：AppFrame 没有正式 Project list consumer；rail-shell 仍以当前 projectHref/通用名称投影，ProjectIdentity 仍用品牌/相对时间文案。
现会话 scope/代际、创建幂等/草稿 handoff、shadcn rail 保持，不借本片改 CSS/footer/Billing 单位或阈值。

已只读核对 BFF listProjects/getProject 及 ProjectListResponse/ProjectResponse：public3.0.0，固定 owner
293dfe7638e5dea0df2bee6dfdd8483b53fc9df6、整契约 SHA-256 acd92ed2fa3e84032e824e1462d67a007c4a94a7e79b7bda8fd5a66f9d51cd3b；
Web snapshot/固定 owner blob/当前 BFF main759bfe0a8c521946cae31a74b6426f43b063bae1 契约原字节相同，未更新 pin，BFF 八 dirty 不接收。
List 当前无 cursor/limit/next_cursor，采用一次正式 GET，不发明分页。路径为现 /api/hub/projects[/id] → BFF /v1/projects[/id]。

候选采用现目录普通 shared Project schema/read client/独立读取 hook，不把集合与 detail 塞入创建 hook；正式名称仅来自 canonical id/name。
loading/error/empty、取消/乱序、旧用户清理及 no-store/deadline 在三面中一致定义。另实读 /api/auth/session 已返回 subject，
但现 useSessionProbe 仅保留布尔 mode；后继必须沿单 AppGate 提供 Project-only 读取代际/admitted，不重挂 Chat 或发明 auth wire。
此内部装配、schema 迁移/删除、精确后继文件集及旧身份负例仍待 Root 审查；四文档候选不构成已通过文档门或实现授权。

下一最小片：Root 审四 D0 后授现 tests/ui/app-frame-rail.test.tsx 先复现两 canonical 项目未展示的消费 RED，再分阶段授权共享 schema/client/read-state。
创建草稿/会话过滤/身份探针/owner pin 的原断言必须保留，正式登录浏览器与完整门由 Root 后继执行。下方为既有历史证据，不能证明本 Project read 已完成。

## R35 首页虚构积分展示已移除（局部验收）

Root frozen三路径hash全同，真实旧component+新tests RED **5fail/14pass**，candidate finally恢复；现三路径GREEN全门exit0：contract219/architecture50、lint/typecheck0、default **2109pass（180.24s）**、build0。独立Sol0P0/0P1/0P2；证据 /tmp/kokoro-web-home-credit-r35-root-evidence.json 与 /tmp/kokoro-web-home-credit-r35-root-red.log。删除无条件1000/Free/每日300 popover；首页现shadcn Button直开正式credits settings，缺callbackdisabled；其他升级/项目/分享/模型行为保留。7组dead CSS零引用并删除，原91行有效规则逐byte保持，Root仅收掉新EOF空行使diff门0。

本轮没改credit比例/threshold/API/请求/账户数据，没有浏览器或正式Billing结果。1Credit=1e6单位已定，旧10000展示与嵌入Number/4位精度等待Billing单位artifact与消费者整片切换；未来首页余额必须来自正式summary，不以删除样例称余额已接线。此验收只该局部交互；完整能力/Wave0–7尚在推进。

## WIN01-R31：IME 候选确认不误提交（2026-10-01）

基线 main 30055e8947b1df679785c3bff43c358291ba84ba。现 AppFrame actions 在 isComposing 外显式拒绝 keyCode=229 的 Enter；直接及项目会话两例验证零 submit/create、草稿/URL/创建上下文保留，普通 Enter 随后精确一次发送，现 Shift+Enter 用例保持。不改 UI 框架、API/generated/计费/session 或新文件。

Root 首轮定点81通过，但完整门真实 **2104 passed/1 failed**（项目上下文挂载 microtask 尚未清意图，按键前置断言抢跑）；保留 /tmp/kokoro-r31-web-root-full.log，build 未到达。原 writer 只为新测试加严格 waitFor storage+capsule 就绪，不修改生产或放宽结果。独立复审0P0/P1/P2。

Root 最终 Node22.22.2 fresh pnpm check：contract **219/219**、architecture **50/50**、默认 **2105/2105**、lint/typecheck/build/diff-check 全退出0，日志 /tmp/kokoro-r31-web-root-full-r2.log；两 frozen hashes 前后一致。本片真实浏览器 IME/正式IAM/真实模型及收费组合未运行，当前3310离线，不声称聊天全路径闭环。只提交本两文件与本CURRENT，保留其他owner候选。

## Root R27 idle-terminal 切片验收（2026-10-01）

基线c83f1b4；8文件rereview manifest 7ae902e1保持8/8 hash。Root在本仓固定Node22/pnpm11.25完整`pnpm check` exit0：contract219、architecture50、163files/2103tests全部通过、lint/typecheck/build成功；日志 `/tmp/kokoro-web-idle-terminal-r26-rereview-root-check.log`。独立复审0P0/0P1/0P2，initial hydrate/receipt-first P1已以4RED→5GREEN补齐。只修浏览器订阅生命周期：owner idle/settled零SSE、exact receipt与owner active决定单流；active EOF写闸/Stop/410 late身份保障不退。尚未在现3310实际浏览器验收；BFF queued snapshot及Agent审批新契约依赖不在此局部完成声明。Root负责精确8路径提交及同步已提交源码，未改provider/数据库/部署。

## R26 Root 源码验收（2026-10-01）

最终28路径 manifest51c56c6d已Root逐hash/范围复核；fresh Node22完整pnpm check exit0，contract219/219、architecture50/50、Vitest2096/2096、lint/typecheck/build通过，日志 /tmp/kokoro-web-connection-r26-root-check-final.log。独立审查原2P1和迟到receipt P2全部关闭，最终0P0/0P1/0P2。Root准备精确提交源码及同步自身运行副本；真实浏览器连接恢复、当前旧后端429原因与其他owner缺口仍需验证，不宣称组合发布/九owner闭环。

## WEB-IDLE-TERMINAL-P1-R26：历史终态 SSE 生命周期返修（2026-10-01；源码候选）

Root 在已验 Web `c83f1b4013` 同步运行副本后真实观察：历史 completed conversation 的 snapshot 正常，events 连续
`200 text/event-stream` 后 EOF，Web 每 2 秒进入 reconnecting，generic Run error 为 0。静态链已确认 BFF 当前 route 与文档都规定
terminal ledger head 合法关闭 SSE，而 Web hydrate 对任何非 null snapshot 无条件开流、transport 又把 EOF 作为 active 断连重试。

本片仅在现 engine 生命周期收紧订阅：settled snapshot 零 SSE 且保持 connected/可继续 submit；snapshot active 或本页 exact receipt
继续开流，active EOF 写闸、Stop、terminal frame、410 recovery 与 R26 late-receipt 两时序保持。BFF 尚未发布 queued reload identity，
该缺口留给 owner 后继，不从 pending Message 猜测。

本片 RED 先稳定复现 settled snapshot 仍开 SSE 的 3 个断言失败（`/tmp/kokoro-web-idle-terminal-r26-red.log`）；最小
engine/UI GREEN 为 161/161（`/tmp/kokoro-web-idle-terminal-r26-targeted-green2.log`）。首次完整门真实暴露旧
`machine.test.ts` 参数化 terminal failed snapshot 仍要求流的 12 个矛盾断言（2086/2098，
`/tmp/kokoro-web-idle-terminal-r26-worker-check.log`），经 Root 精确扩围后改为保 failure tuple、connected 且零 SSE。
随后 Node22 fresh `pnpm check`：contract 219/219、architecture 50/50、Vitest 2098/2098，lint、typecheck、build 均通过，
日志 `/tmp/kokoro-web-idle-terminal-r26-worker-check-final.log`。以上仍是 worker 源码候选证据，待 Root 独立审查、复跑和真实浏览器旅程；
不据此宣称旧 BFF queued reload 缺口或九 owner 组合闭环。

Root 对上述候选独立复审又发现 initial hydrate/submit 竞态：create receipt 先于 snapshot 返回时会提前开流，随后 snapshot 覆盖
optimistic user 并可能二次开流，receipt run 已由 snapshot 终态收口时还会错误保持 streaming。返修将 initial receipt 纳入同一
deferred 顺序，先恢复 owner snapshot/canonical user，再区分 exact terminal、active identity 或旧 settled 视图，最后至多开一个流。
参数化 RED 为 completed/failed 历史 × snapshot 含/不含 receipt run terminal 共 4/4 失败，日志
`/tmp/kokoro-web-idle-terminal-r26-rereview-red.log`；最小修复及 receipt-first active 覆盖为 5/5，日志
`/tmp/kokoro-web-idle-terminal-r26-rereview-green2.log`。返修后 Node22 fresh `pnpm check`：contract 219/219、architecture
50/50、Vitest 2103/2103，lint、typecheck、build 均通过，日志
`/tmp/kokoro-web-idle-terminal-r26-rereview-check.log`；仍待 Root 独立审查、复跑和 live 旅程。

## WEB-CONNECTION-R26：Root 拒收后的局部返修（2026-10-01；源码候选）

Root 已逐 28 文件 hash 并以 Node22 重跑 R25 候选：contract 219/219、architecture 50/50、Vitest 2088/2088、lint/typecheck/build
均通过；独立复审仍发现两项 P1，因此候选未提交、未同步运行。R26 同原 29 路径收紧：非 connected 窗口拒新 message/resume POST，
保草稿/staging/Stop/cancel；reattach timer 只落本地 connection timeout 并保 active identity，等待 owner snapshot/event 收口。首次
snapshot、pre-receipt 与 unattributed terminal 的可见性同时回归，不能把 `canRetryPendingSubmission` 当成全部 machine error 的展示条件。

本节不改变已确认的 HTTP 429 证据，也不推断具体容量/lease 根因。R26 动态 RED 已覆盖 disconnected submit/resume/retry、410
并发回调、切会话迟到结果、reattach timeout 与 direct initial snapshot；新增 pre-receipt snapshot 替换保留 exact optimistic user 的
RED 为 1 failed/78 skipped（`/tmp/kokoro-web-connection-r26-red-preserve-intent.log`）。定点 GREEN 为 5 files、230/230
（`/tmp/kokoro-web-connection-r26-green.log`），Node22 typecheck exit 0（`/tmp/kokoro-web-connection-r26-typecheck.log`）。最终 writer
以 Node 22.22.2 执行一次完整 `pnpm check`，actual exit 0：contract 219/219、generated checks、architecture 50/50、lint、typecheck、
Vitest 2094/2094 与 production build 全部通过（`/tmp/kokoro-web-connection-r26-full-check.log`）。28 个实际修改文件的冻结 manifest
为 `/tmp/kokoro-web-connection-r26-worker-manifest.json`；仍待 Root 独立 hash/diff/复审/完整门与运行浏览器验证，当前不冒充真实组合已发布。

Root 随后完成 28/28 hash、独立复审与 Node22 全门，原两项 P1 已关闭；最终 P2 竞态返修仅触及 `machine.ts`、其 engine 测试与本台账。
当 410 recovery 的 owner snapshot 返回 null 时，engine 现在会放弃原 pending submission：若 accepted receipt 已暂存，立即对其 exact
session/run 发一次 best-effort cancel；若 receipt 尚未返回，则登记 exact idempotency key/session，由同一 create promise 的 late receipt
消费并取消。两条路径都不复活旧 stream、不污染 fallback thread，也不新增 message POST。两时序 RED 为 2 failed/79 skipped，GREEN
为 2 passed/79 skipped（`/tmp/kokoro-web-connection-r26-late-receipt-{red,green}.log`）；完整 engine 81/81 与 typecheck 通过。最终 writer
Node 22.22.2 `pnpm check` actual exit 0：contract 219/219、architecture 50/50、lint、typecheck、Vitest 2096/2096、production build
全通过（`/tmp/kokoro-web-connection-r26-late-receipt-full-check.log`）。更新后的 28 文件 manifest 仍位于
`/tmp/kokoro-web-connection-r26-worker-manifest.json`；本追加竞态修复待 Root 再次独立复审/全门/浏览器，未自行提交或同步运行。

## WEB-CONNECTION-P1-R25：post-hydration 连接状态已与 Run terminal 分离（2026-10-01；候选待 Root 验收）

基线 main `6e3858f37e44d1e169adeae789d14806d2ccf2f4` clean。本候选已把 transport 的 transient reconnect/connected 与 hard
`network|http|parse` 传播为 engine 页面内存 connection state；已观察的 events **429/application-json** 现在属于 connection
unavailable，不再把 machine 推为 Run error。AppFrame 保留历史/partial 正文、settled copy、exact/unattributed owner terminal、active
identity、Stop 与未获 receipt 的同键恢复，只新增紧凑连接状态和 snapshot-first“重新连接”，零 user POST、零伪 retry、零
`data-message-id="run-error"`。非法 frame/legacy envelope 仍 fail closed，无协议 fallback。429 的具体容量/lease 原因仍未知，未放宽
限流，也未读取或展示 raw body/cookie/token/SSE payload。

Node 22.22.2 TDD 实证：首轮定点 RED `/tmp/kokoro-web-connection-p1-r25-red.log` 为 4 files、7 failed/157 passed；实现后定点
`/tmp/kokoro-web-connection-p1-r25-green.log` 为 4 files、164/164，UI/terminal 保真补充
`/tmp/kokoro-web-connection-p1-r25-ui-green.log` 为 2 files、135/135，typecheck exit 0。完整
`/tmp/kokoro-web-connection-p1-r25-check.log` exit 0：contract 219/219、generated checks 通过、architecture 50/50、lint、
typecheck、全量 Vitest 2088/2088、Next build 均通过。覆盖旧失败+后来成功+429、active partial transient、parse fail closed、
snapshot-first 无 POST、pre-receipt/无身份 terminal/initial snapshot 保留、410 recovery failure、窄屏/focus/ARIA/forced-colors。
未启动服务、数据库、provider 或浏览器；Root 仍需独立 hash/diff/完整门与同步环境 desktop/mobile/reload 复验，候选不冒充真实组合已验收。

## WEB-CONNECTION-D0：Root 设计门与实际网络证据（2026-10-01）

Root 核验四份文档 4/4 hash、授权范围与 ed496fd 基线，三设计一致；Node22 fresh `pnpm contract` **219/219**、两个生成物 check exit0，日志 `/tmp/kokoro-web-connection-d0-root-r25-contract.log`。D0 不代表源码实现完成。

随后 Root 在临时 IAB tab17 实际复现：snapshot 200，events 多次 200/text-event-stream 后出现 **429/application-json**，request-id `1981e7ed-e435-4b34-b552-ffe54ddffe2d`；DOM 仍有 1 个 exact failure footer，同时新增 1 个线程级 run-error。直接触发类别为 HTTP hard failure，不是新 owner terminal；没有读取响应正文、cookie、token 或 SSE payload。当前仓 routes/agent.ts 有连接容量 429 分支，但运行后端是旧副本，本次没有读取具体 error code，故容量耗尽的具体原因仍待 owner 组合验证，不能推断为通用请求速率限制。billing summary 503、agents 404、runtime-manifest 404 是另行记录的组合缺口。tab17 已关闭，不留额外连接/进程，不改用户数据或页面。

## WEB-CONNECTION-D0：post-hydration connection 状态设计门（2026-10-01；待 Root 审查）

基线 Web main `ed496fd53621bfbf28b7a73780f7559e12bedc8a` clean。本 D0 只修改 TECHNICAL_DESIGN、API_CONTRACT、
DATA_MODEL 与 CURRENT：snapshot 成功后的 AG-UI stream/replay availability 必须从 Run terminal 分离。owner exact footer、真实无身份
generic、pre-receipt 原 key/body 恢复与 initial snapshot error 全部保留；post-hydration transient/hard connection 状态不得生成
`run-error`、篡改正文/copy/active identity/Stop 或重新 POST user。显式恢复固定为 snapshot-first + owner watermark 续流，坏 frame
继续 fail closed，无 legacy/fixture/第二协议 fallback。

触发链已静态定位：历史 failed run 后存在更晚 completed assistant 时，水合会保留 exact `runFailuresById` 而 `runStatus` 非 failed；
随后 stream hard error 把 engine machine 推入 `error`，现 AppFrame 把任意该状态映射为 Thread `hasFailed`，于是
`unattributedFailure=null` 仍生成 `data-message-id="run-error"` 的通用 Run 文案。普通 fetch 断线/EOF 在 transport 内按 cursor 重连，
不会直接走这条 hard-error 路径；可能的 hard 子类包括非 expired HTTP、非 SSE、严格 frame parse 或 cursor recovery snapshot 失败。
Root 尚未安全取得真实请求的 status/content-type/error category，因此 503/502/429、旧 BFF contract drift 等都只是风险，不是已确认根因。

运行证据边界：Root 将 committed 466 个 `src` 同步到自有 3310 Next 副本（9 个更新、无新文件，backend 未更新），在 IAB tab16
desktop、390px 与 reload 观察到 known failed run 的同 article 唯一 footer、两处 copy、工具/textarea 边框0与键盘 focus 3px；但更晚
正文轮之后出现独立线程级 generic，reload 初始仅 known footer，稍后 generic 再出现，其父项为 `data-message-id=run-error`、不在
assistant article、无 `data-run-failure`、无 retry。截图 `/tmp/kokoro-web-r24-{desktop-reload,mobile}.jpg`，tab16 已关闭。
该证据证明错误放置，不证明具体上游响应，也不等于 provider、积分或九 owner 组合验收。

Root 后续脱敏观察中，snapshot 当前为200，events 连续多次为200且 content-type 是 `text/event-stream`，期间只看到真实 owner
failed footer，generic 尚未复现；因此仍没有可归责的 hard stream 子类。同期 billing summary 503、agents 404 与 runtime-manifest 404
属于旧组合各自缺口，不能混同为 events failure。观察只记录 status/content-type/request-id，不读取 token、cookie 或 SSE payload。
README 仍称 AgUiChatTransport 未实现/使用 legacy SSE，属于后继文档同步问题，本 D0 不越过四文件范围修改。

四文档已统一 owner、纯内存状态、无 wire/持久化变化、最小后继文件范围与 9 项 RED：旧失败+后来成功+hard error、active partial
transient、parse hard error reconnect、pre-receipt、unattributed owner error、initial snapshot、410 replay recovery、mobile/focus/ARIA、
坏帧 fail closed。D0 未写源码/测试/contract/generated/i18n/route，未运行 lint/typecheck/test/build、服务、provider、数据库或浏览器；
待 Root 冻结审查后才放行单一 Web writer 代码阶段。

## WEB-FAILURE-P1-R24：Root 代码门验收（2026-10-01）

Root frozen20/20 hash与范围复核、独立复审原3个P1关闭/P0=0/P1=0。Node22.22.2 fresh `pnpm check` exit0：contract219/219、architecture50/50、tests2079/2079、lint/typecheck/production build通过；日志 `/tmp/kokoro-web-failure-p1-root-r24-check-r2.log`。上一轮Root2076绿色仍被业务审查拒收，保留历史，不用测试绿掩盖缺陷。

验收仅本片exact run failure/footer、稳定group anchor、明确live identity、process-only失败不重复与settled copy可见；不新增正式retry/queued，不吞失败或删除正文。尚未同步用户3310，浏览器desktop/mobile/focus/reload、provider/积分及全九owner组合仍待验。下面源码候选与worker验证为历史交付记录，非当前Root状态。

## WEB-FAILURE-PLACEMENT-P1：exact run footer 源码候选（2026-10-01；待 Root 验收）

基线为 D0 commit `2cb03500b05dfaddbd9296614f8dc8552e022581`。本候选删除 terminal placement 对旧 `runError` 单槽与
尾项/空正文猜测的依赖，改以页面内存 `runFailuresById[failedRunId]` 统一 snapshot/live。每个 exact failed run 只在同 run 最后一个
assistant group 显示一次 compact footer；empty/partial/full 正文、过程、settled copy、重复 owner user 消息与真实 terminal failure
全部保留。相同 run completed 只清同 key，其他 run/new user 不误挂或清除；无 run id generic 继续独立安全可见。

terminal Agent（含 `retryable=true`）、dispatch 与 generic footer 均没有重发动作；未获 create receipt 的 frozen intent 仍保留原
key/body 恢复，余额/套餐动作保持线程级，未声明 public 3.0 不存在的 retry/queued。无新模块、文件、wire、generated、i18n、route、
依赖、SQL、Redis 或 browser storage。

TDD 第一轮 9 矩阵真实 RED 为10失败/175通过，随后获授权 core/UI 目标176/176、扩展 engine旧断言119/119及合并目标385/385
通过；另发现 settled copy CSS 仍为 `display:none`，先取得1失败/55跳过再改为可见，随后1通过/55跳过。日志分别为
`/tmp/kokoro-web-failure-placement-p1-{red,target-green,engine-green,target-final,copy-red,copy-green}.log`。Node24首次typecheck因五处
旧engine test仍读已删除字段而exit2，Root批准只迁三现测试后，Node22.22.2 typecheck exit0；正式完整门结果由本片后续记录，不沿用
D0的2074或Node24结果。最终 writer 在 Node22.22.2 只运行一次完整 `pnpm check`，actual exit0：contract219/219、
architecture50/50、163文件2076/2076、lint/typecheck/production build全部通过；日志
`/tmp/kokoro-web-failure-placement-p1-full-check.log`。未运行服务、provider、数据库、浏览器或Playwright；源码仍待Root冻结审查、
独立完整门与真实desktop/mobile/focus/reload复验，当前不宣称视觉或跨owner闭环。

R24 独立 review 的 3 个 P1 返修已纳入同一候选：live turn 只认 engine 当前 `runId`（receipt 后）或 snapshot
`activeRunId`（reload fallback），不会让尾部 replay 的旧失败轮抢走 live anchor；同 run 被 user 分隔的多个 assistant group 使用首条
message identity 形成稳定且唯一的 anchor，只在最后一组放一次 footer；仅 thinking/tool step 的失败 run 只投影一个保留过程与 footer 的
turn。R24 mutation RED 为 5 失败/62 通过；最终精确回归为 6/6 通过（其余136按 name filter 跳过），日志
`/tmp/kokoro-web-failure-p1-r24-{red,focused-green}.log`。中间合并目标曾出现 1 个与本片无关的欢迎页专案导航断言失败（388通过，
`/tmp/kokoro-web-failure-p1-r24-target-green.log`），本片未改导航也不宣称已修；随后唯一一次最终 Node22.22.2 `pnpm check`
actual exit0：contract219/219、architecture50/50、163文件2079/2079、lint/typecheck/production build全部通过，日志
`/tmp/kokoro-web-failure-p1-r24-full-check.log`。Root 的旧 d2b live 同步只验证 ghost 工具边框为0、键盘 focus ring 为3px；当时独立红失败仍是
未同步 P1 的画面，copy 点击后 CUA clipboard readback 为空，不能作为 exact 全文复制或本 R24 画面验收。R24 未启动服务、provider、数据库、
浏览器或 Playwright，待 Root 冻结审查、独立完整门、同步后 desktop/mobile/focus/reload 复验。

## WEB-FAILURE-PLACEMENT-D0：四文档设计门（2026-10-01；待 Root 审查）

基线 Web main `d2b717501349c8d8c43c13c7682e218f999297e3` clean。本 D0 只对齐 TECHNICAL_DESIGN、API_CONTRACT、
DATA_MODEL 与 CURRENT：目标以 exact `failedRunId` 建页面内存 run failure 索引，把 empty/partial/full 的真实 terminal failure
放入对应 assistant turn 的 compact footer；正文、复制、重复 owner user 消息和真实 failure 全保留。snapshot/live/reload 使用同一
run identity，后续 run 不继承或移动旧失败；无 exact run 的 generic 仍独立可见，不以消息文本、尾项或空正文猜归属。

本设计继续使用 public 3.0 与现 strict safe tuples，不改 wire/generated/owner。已 terminal 的 Agent/dispatch/generic 没有 retry
动作；仅未获 create receipt 的冻结意图可用原 key/body 恢复，不能以新 user submit 伪装 retry，也不声明 queued。Web 无数据库，
目标状态仅为浏览器页面生命周期内存，reload 从 BFF owner snapshot 重建。

本轮没有修改源码/测试/API生成物/主题，没有运行测试、build、服务、provider或浏览器，也没有提交。Root 先审放置表、最小后继
文件集和 empty/partial/full/completed/多轮历史/stream/live reload/mobile/focus RED 矩阵，再决定是否授权单 writer 代码切片。
先前 Root 的 contract219、architecture50、tests2074、lint/typecheck/build exit0 属于已提交 UI5/OIDC1 基线，不是本 D0 实现
或新画面证据；3310 source 虽已同步但 CDP 观察超时，当前不宣称浏览器视觉验收。

## WEB-FOOTER-COMPOSER / OIDC-FIXTURE-R21：Root 独立验收（2026-10-01）

Root核UI5冻结与OIDC第6路径hash一致，独立审查本片P0/P1=0。Root完整 `pnpm check` exit0：contract **219/219**、architecture **50/50**、完整测试 **2074/2074**、lint/typecheck/build成功，日志 `/tmp/kokoro-web-footer-oidc-r21-root-check-r2.log`。此前2072/1失败保留：authorize无Location时旧helper会GET首页，不证明callback500；本fixture校验relative target、先验authorize、受控首坏阶段诊断及断连终态barrier。未提高timeout/改生产auth。

仅验收settled逐轮真实正文复制/streaming隐藏完整复制、ghost静态框删除并保留焦点，以及fixture精确路径/生命周期；分成UI5与OIDC1两个提交。既存readiness raw诊断不在本片清理，后续安全债务明确保留；不把测试修复宣称生产间歇认证根因已解决。用户3310尚未同步，本片不证明新后台组合或九owner真实模型/browser闭环。下方历史worker证据保留。

# Kokoro User Web 当前状态

## WEB-FOOTER-COMPOSER-R20：轮级复制与前置工具外观候选（2026-10-01）

基线 main `9204bfe6139e496df5ebd99e4ceab9fb31fab5a7`。本片只调整既有 `AssistantTurn` 消息 footer 与 Composer
CSS：每个已有正文且落定的助手轮均提供复制动作，复制该轮聚合文本，不再依赖只属于首轮的任务标题；live streaming
轮不提前提供“复制完整回答”。桌面 Composer 的前置 ghost 工具保留既有 2rem 命中区、hover、共享 Button 的
`focus-visible` 与 forced-colors 保障，但移除静态 border/outline；独立环境静态控件的 outline 保持不变。

Node 22.22.2 定点 TDD 首先得到 footer 2失败/57跳过、Composer 1失败/61跳过；最小实现后分别为
2通过/57跳过、1通过/61跳过。writer fresh `pnpm check` exit0：contract 219/219、architecture 50/50、
lint/typecheck通过、163文件2073/2073、production build通过；日志
`/tmp/kokoro-web-{footer-r20-red,composer-r20-red,footer-r20-green,composer-r20-green,footer-composer-r20-check}.log`。
本片不改 failure/failedRunId 归属、不隐藏或去重真实消息、不新增 queued/retry wire，也未运行服务、provider、浏览器或
Playwright；Root仍须独立复验后方可验收。

## WEB-COMPOSER-P0：同步提交接纳与停止入口（2026-10-01；本片源码与 preview 门已验）

`SessionEngine.submit` 现在同步返回是否接纳本次浏览器意图；空白、已释放、恢复水位期间或仍在等待 create receipt 的提交返回
false，AppFrame 因而保留草稿、创建意图与当前 URL，且不产生额外 POST。真正接纳的首发与现有运行中输入仍沿原路径发送并清空草稿。
运行中停止入口不再因草稿非空消失；发送与停止是两个独立按钮，停止不提交或清空草稿。本片不新增 queued、terminal retry、
网络端点或持久事实，也不改变当前运行中 create-message 行为的 owner 语义。初始定点 RED 为4失败/200通过；扩展矩阵后定点
207/207。Root首轮fresh完整门的contract219、architecture50、lint/typecheck均通过，但全test为2069通过/1失败：后置stream
error用例同时收到共享list失败Alert。该用例现使用独立成功ListClient并在finally恢复spy，不隐藏生产list错误、不放宽唯一thread
Alert/no-retry断言；整AppFrame文件75/75、fresh全test2070/2070通过。build与真实浏览器仍由Root最终复验。

Root最终冻结复验：完整 `pnpm check` exit0，contract219/219、architecture50/50、lint/typecheck0、163文件2070/2070（38.72s）、build0；日志 `/tmp/kokoro-web-composer-p0-root-check-r2.log`。独立最终12hash审查P0/P1=0，原文件外无tracked变化。Root首次全测2069/1因测试无关共享list错误导致两个Alert，已用本用例独立成功ListClient及finally恢复隔离；未放宽唯一thread Alert/no retry断言，首次失败日志保留。此前writer OIDC500仅历史失败，本次fresh完整OIDC38通过，未改或放宽其实现。

Root隔离preview端口34120现Playwright门14通过/4既定设备分工跳过（10.1s）、exit0；后置typecheck0，34120已退出，用户3310 PID65590未动。日志 `/tmp/kokoro-web-composer-p0-root-e2e.log`、`...-root-post-e2e-typecheck.log`，报告在 `/tmp/kokoro-web-composer-p0-root-playwright-report`。这不是实际IAM/真实模型/积分/用户3310端到端；不声称正式queued/原user retry/Thread整体视觉完成。

## WEB-EMPTY-STATUS：移除未发布的专案 run 状态推断（2026-10-01；源码门已验）

专案会话清单只投影 BFF 已发布的 `id/title`；Web 不再从空标题、当前会话或本地 machine phase 合成 `queued/running/waiting/completed/failed`。删除 producer 与未消费的状态类型，不留兼容字段。本片不新增 durable queued wire，不改变 Conversation、Message、HITL、取消或 terminal retry 语义。

Node22 真正聚焦 RED→GREEN；Root 冻结源码复验两 UI 文件 90/90、完整测试 2065/2065、contract 219/219、architecture 50/50、lint/typecheck/build exit0。隔离端口34118 的现 preview Chromium 门 14通过/4既定条件跳过（13.5秒），后置typecheck0；不是实际 IAM/模型/用户3310端到端。独立四路径审查0/0/0，Root仅更新本段实测证据。自有浏览器服务已退出，报告保存在 `/tmp/kokoro-web-empty-status-{playwright-report,test-results}`；用户3310未重启、运行副本尚未切换。日志 `/tmp/kokoro-web-empty-status-root-*.log`。

## WEB-PROJECT-FLOW：合法空页解析与状态优先级源码已验（2026-10-01）

基线main e17c039；18文件窄片，BFF public3 SessionListResponse required string|null准确消费，view显式null→undefined，preview/fixtures同shape；项目conversation loading/error先于welcome。不建optional/nullish兼容，不改同源adapter、scope、SQL、failure artifact或用户数据。

Root实际RED9失败/113通过；首完整门旧2fixture缺cursor导致contract1失败/218通过；随后AppFrame完整2失败/2062通过，定点3通过却整文件仍2失败/70通过。根因是恢复用例没有独立list成功fixture且共享pageListClient/in-flight；仅这两用例使用稳定独立ListClient，finally恢复spy，不增加timeout/重试/reset或放宽原snapshot/URL断言。整文件72/72后fresh完整check exit0：contract219、architecture50、全test2064/163文件、lint/typecheck/build通过；preview Playwright14通过/4既定项目跳过（13.7s），后置typecheck exit0且生成路径自动恢复。日志 `/tmp/kokoro-web-project-flow-{red,check,check-r2,check-r3,check-r4,check-r5,frame-all,frame-r5,e2e,final-typecheck}.log` 保留全部失败。

独立源码审查18hash最终0/0/0，TECH旧文件计数由Root同步为9test/fixture。受管3310 PID65590/parent65119未重启：仅四个本片精确变更，旧chat/preview failure片字节未混入；backup/manifest `/tmp/kokoro-web-project-runtime-{backup,sync.json}`。真实tab6展开侧栏已显示会话清单而不是加载失败；截图 `/tmp/kokoro-web-project-flow-user-page.jpg`。34117已退出，无PG/Redis/模型调用/用户数据修改。

用户当前截图仍显示原问题重复两条、完整回答旁的失败/重试反馈；该界面未验为正确，不能把本片称ChatGPT风格/正规retry/全部闭环。后继优先真实同会话执行串行队列与原user attempt模型，随后按用户确认的ChatGPT简洁反馈风格落地；不靠隐藏错误/过滤历史消息伪造完成。

## WEB-BFF-PUBLIC3：public 3.0.0 consumer 源码已验（2026-10-01）

基线Web main `9c428bf8cfdbdafae1d0cc0c3ed807fa8defa591`。当前源码已把旧public 2.0 pin替换为BFF owner commit
`293dfe7638e5dea0df2bee6dfdd8483b53fc9df6` 已发布的 public `3.0.0` 原字节，SHA-256
`acd92ed2fa3e84032e824e1462d67a007c4a94a7e79b7bda8fd5a66f9d51cd3b`。ChatMessage 正式只有
`user | assistant` 两角色，与现 Web runtime 一致；本片不恢复system，不改变failure 12 tuple、任何operation、取消或Share语义。

Root已对七个现public contract tests取得真实RED（35通过/12失败，旧digest/system/generator语义失败且无导入错误；日志
`/tmp/kokoro-web-public3-red.log`）。当前源码随后复制owner committed原字节到唯一snapshot，更新两个现generator固定值，
执行两次获授权的`--write`再生failure artifact与Team输出；Team15与`/tmp/kokoro-web-public3-baseline.json`逐字节全不变。
Web无SQL持久owner，本片不改schema、runtime业务源码或用户数据；Agent 4 / BFF 3.1 retry尚未发布，不提前开放terminal mutation。
Root fresh `pnpm check` exit0：contract219、architecture50、全tests2055（41.02s）及lint/typecheck/build通过；完整preview Playwright14通过/4项目分工跳过（14.1s）。独立16hash终审P0/P1/P2=0/0/0；owner committed blob equality与Team15 equality由Root再核PASS。日志 `/tmp/kokoro-web-public3-check.log`、`/tmp/kokoro-web-public3-e2e.log`。真实IAM/BFF/Agent/provider/credit组合与3310激活仍待验，未热切或改数据；Root全仓标准仍137失败，main-only因受保护未提交变更FAIL（所有local/remote/head均main），不宣称全仓clean。下方 WEB-FAILURE3 只作为public 2.0历史记录保留。

## WEB-LONG-THREAD-VISUAL：列表排版源码与渲染回归已验（2026-10-01）

基线 main `42df17b`。真实 preview 长文截图及 computed style 复现普通列表 marker 为none；唯一生产改动是在现Thread
Markdown scope恢复普通UL disc/OL decimal，两者都以`[class~="contains-task-list"]`排除GFM checkbox任务列表，避免
CSS Module局部class哈希。不改共享margin/padding、Composer、消息事实、API、SQL、全局reset或依赖。

Root最终同源完整Playwright **14通过/4项目分工跳过（14.3s）**；Node22/pnpm11 `pnpm check` exit0，contract218、
architecture50、全test **2054通过（45.55s）**、lint/typecheck/build通过。1280x900/390x620覆盖实际溢出、真实wheel
脱离auto-follow、公开回到最新+smooth几何poll、尾部可见且不被Composer遮挡、同一阅读轴、无横溢和两轮全部三条28px
相邻gap。Root已查看长文/窄屏/双轮PNG。独立终审P0/P1/P2=0/0/0；日志
`/tmp/kokoro-long-thread-final-e2e-ol.log`、`/tmp/kokoro-long-thread-check-ol.log`。

RED和失败证据保留：普通marker真实none≠disc；GFM UL及OL guard分别14通过/1失败；R2测试直接scrollTop被auto-follow
恢复、R3误用opacity可见性、R4在smooth开始时测量，均只修测试语义，不改production滚动、不增timeout/阈值、不sleep。
对应`/tmp/kokoro-long-thread-{css-red,red,gfm-red,gfm-ol-red}.log`及`final-e2e-r2/r3/r4.log`。

Root仅把本片6行scoped marker及UL/OL排除精确同步受管3310，其他runtime字节保留，PID65590未重启，公共首页HTTP200；
备份与hash在`/tmp/kokoro-long-thread-runtime-sync.json`。独占34117测试进程已退出，不访问PG/Redis/provider、不改变用户数据。
这些preview回归不是当前用户tab或真实IAM/BFF/推理/计费组合验收；输入内方框及整个产品仍开放。
Root正式全仓静态门当前仍137条研发规范失败，不以本片Web green宣称全仓上线完成。

## WEB-COMPOSER-ACTION1：操作行真实浏览器修复（2026-10-01）

基线 main `8a2d771e5ed106f93473ac3d1b5efb793b9b32ab`。Root在独占34117 preview fixture实际填写/提交后观察到宽屏发送按钮留在左侧。
原因是VoiceActions从controls CSS Module引用不存在的trailingActions，而样式只在另一个Composer CSS Module；现把组内flex/color归回自身module，父布局只通过稳定voice-actions slot管理auto margin，并删除coarse触屏的反向reset。未改shadcn Textarea、消息/网络事实、API、SQL或依赖。

Root真实TDD：桌面640右缘偏移386.8125px断言RED；第一版desktop绿色后独立审查发现触屏漏门，Pixel7/640偏移372.421875px也得到RED，再删reset。最终完整Playwright实际13通过/3按项目分工跳过（11.3s），桌面10档390–1280、触屏390/640右缘<=1px，轴线/无overflow断言保留；30张桌面PNG、4张触屏PNG及computed附件只保存在/tmp。Root已查看全页/blur/键盘focus/多行及触屏640图，按钮组回到右侧。日志：`/tmp/kokoro-composer-action1-{red,touch-red,final-e2e}.log`。

Root最终Node22/pnpm11 `pnpm check` exit0：contract218、architecture49、全test2053（40.79s）、lint/typecheck/build通过，日志 `/tmp/kokoro-composer-action1-root-final-check.log`。首次check lint失败是本轮生成的playwright-report第三方trace assets被扫描（257错误/2773warning）；报告已迁到/tmp，后续CLI reporter=list，未放宽lint规则。独立终审P0/P1/P2=0/0/0。

这些截图只证明当前源码的独立preview UI，不证明真实IAM/BFF/模型计费整链，也不等于已核对用户3310页面。fixture中textarea实测border0/shadow none且未出现用户所述输入内方框；原内方框及整体对话体验仍待当前用户页面/截图验收。本片只修复已经复现的操作行错位，不宣布整个产品完成。

## WEB-FAILURE3 运行时候选待 Root 验收（2026-10-01）

基线 Web main `daaf45b`；BFF public 2.0 owner commit `ccb8e144`、OpenAPI SHA-256
`ba10f89baf0fdd8cd4da58947b0411da8c84294dfe77e278533aeda59a905773` 与机器生成的 12 个合法 safe
failure tuple 保持不变。本轮候选新增唯一 `contract/agent-failure.ts` runtime schema，并让 Message snapshot、verified Agent
`RUN_ERROR`、BFF-owned dispatch `RUN_ERROR` 分别通过严格 contract 进入 closed agent/dispatch/generic 内存失败投影；没有
fallback、unknown→internal_error、第二码表或第二网络协议。

snapshot/live/reload/Share 复用同一 safe profile 与十码本地化文案，不展示 producer message、`error_kind`、stack、本地 BFF
launch code 或 raw detail。dispatch 的任意精度十进制 sequence 保持 string `sourceSequence`，不进入 Agent numeric `lastSeq`；
未完成 tool 以安全固定文本收束，历史 run terminal 不覆盖当前 run。尾部 failed Message 只有在没有 active run、pending pause 或
更新 user 时才恢复；无 failure 时只形成 generic，而不是伪造 Agent profile。

所有 Agent/dispatch/generic owner terminal 在尚无正式 public retry command 的 2.0 契约下都没有 mutation action。
`EngineSnapshot.canRetryPendingSubmission` 只在 create-message 尚未取得 receipt、机器仍为 error、冻结意图属于当前 session 时为
true；恢复复用原 idempotency key 和完整冻结 body。credit 的补款/定价动作保留，其 retry 同样受该能力位约束；Share 恒为
false。正式 RUN_FINISHED cancelled 语义保持。

开发 preview 对未知 `!fail` code 在建立 session、title、user/history 前原子拒绝；已知 code 只选择 generated 的
non-retryable profile。BFF public 合法的无 failure system Message 仍是独立 consumer follow-up，本片继续 fail-closed，不把它
静默改写为 assistant。

TDD 已保留 capability 与 preview RED 日志：`/tmp/kokoro-web-failure3-green-worker-capability-red.log`、
`/tmp/kokoro-web-failure3-green-worker-appframe-red.log`、`/tmp/kokoro-web-failure3-green-worker-preview-red.log`。当前候选定点
12 文件实际 526/526 通过；Node 22.22.2 的完整 `pnpm check` exit 0：contract 217、architecture 49、全量 2049、lint、
typecheck 与 production build 全部通过，日志 `/tmp/kokoro-web-failure3-green-worker-full-check-r1.log`。Root 独立审查/复验、
真实组合与浏览器可见性在本段冻结时仍待执行，因此不声明本目标或整体产品完成。

## WEB-COMPACT-GEOMETRY 源码验收，真实视觉待验（2026-09-30）

Root 已在主工作树独立验证最终测试：HEAD 生产源码配最终测试真实 RED 为5失败/37通过，恢复候选源码后完整
`pnpm check` 实际 exit0：contract109、architecture49、全量1846（45.14s）、lint/typecheck/build。日志
`/tmp/kokoro-web-compact-geometry-root-red.log` 与 `/tmp/kokoro-web-compact-geometry-root-final-check.log`。
独立终审 P0/P1/P2=0/0/0；HITL 测试独立性 P2 已修并取得 mutation RED，不延期。源码与测试最终冻结哈希保持。
本次没有 fresh 浏览器视觉或完整 Playwright 证据，输入框内框和实际桌面/窄屏滚动仍未验收。

基线 `main 13b881d242b59d23e18c0b0cd4f5fcb266cb3d60`、clean。本片只改既有 ConversationThread 的短线程
滚动纠偏和现有 failure UI 测试：不再以恰好两项/末项高度猜 compact，而以全部真实滚动项（含成果/失败）的总跨度
及 content/viewport padding 判断真正 fit；只在 settled、非重连、非 HITL、详情未展开时清原生 spacer。
ResizeObserver 同时观察 viewport/content/items，单 rAF 合并，重复回调不重复 start；fit 后变长不跳尾，卸载完整清理。
未改 Composer、shared primitive、消息/失败/成果事实、API、SQL、依赖或运行副本。

Node22.22.2 测试先真实得到目标 RED：7 failed / 35 passed，覆盖三项短线程、长首项短末项、非有限/零 viewport、
成果总高、stream/reconnect/HITL、嵌入失败详情和 resize/cleanup；日志
`/tmp/kokoro-web-compact-geometry-red.log`。首个实现运行是 1 failed / 41 passed：成果用例的 spy 把原生
`scrollToEnd(top=0)`误当成`scrollToStart`；保留该失败事实后，断言收敛到 start 的真实语义——spacer 是否被清除，
没有删除成果反例。最终同一目标 42/42 通过，日志 `/tmp/kokoro-web-compact-geometry-green.log`；`pnpm lint` 与
`pnpm typecheck` 均实际 exit0，日志 `/tmp/kokoro-web-compact-geometry-{lint,typecheck}.log`。writer 未运行完整
`pnpm check`、Playwright、服务或浏览器；当前页面像素、输入框内框和全滚动体验仍待 Root 验收，不以 jsdom 几何冒充视觉完成。

独立审查发现原 HITL 用例同时设置 `isStreaming=true`，会先被 streaming guard 截断，未单独证明 HITL guard。
返修把该用例改为 settled + `hitlRunId`；临时只移除生产 HITL guard 后定点真实得到 1 failed / 1 passed /
40 skipped，再立即恢复生产文件原 SHA，日志 `/tmp/kokoro-web-compact-geometry-hitl-guard-red.log`。该返修不改生产源码；
最终目标门仍须在新测试 SHA 上重跑，不沿用返修前 Root 完整门。

## WEB-UNIFORM-TURN-GAP 源码候选，真实视觉待验（2026-09-30）

Root独立显式Node22.22.2/pnpm11.25完整 `pnpm check` exit0：contract109、architecture49、全量1836（41.01s）、lint/typecheck/build通过，日志 `/tmp/kokoro-web-uniform-turn-gap-root-node22-check.log`。四冻结hash重验一致，独立审查P0/P1/P2=0/0/0。首次自动shell误用Node24的检查已终止自有进程组并消费exit143，不列为门禁通过；首次worker目标文件的任务外导航超时日志保留，相同命令随后两次70/70。本片只验收源码：当前IAB用户tab6绑定仍20秒超时，fresh输入内框与完整视觉/滚动尚未验，完整Playwright未运行。

基线 `main 8205fa003d5ea269741df359d4d6881dd0f1e0f8`。本候选仅删除 AppFrame 对首个
`MessageScrollerItem` 的 `0.875rem/-0.875rem` margin 补丁；顶部留白继续由 viewport padding 拥有，全部相邻滚动项
继续使用 content 的统一 `1.75rem` gap。Thread 按 message ID 后缀改写间距的旧规则仍被禁止。Composer、消息内容与身份、
失败反馈/成果归组、HITL、共享 scroller 行为和机器契约均未修改。

Node22.22.2 精准测试先得到预期 RED：1失败/69通过，日志 `/tmp/kokoro-web-uniform-turn-gap-red.log`；删除首项补丁后
同一目标70/70通过，审查加固为禁止整个首项 selector 后仍为70/70，日志 `/tmp/kokoro-web-uniform-turn-gap-green.log`、
`/tmp/kokoro-web-uniform-turn-gap-review-green.log`；最终 `pnpm lint` exit0，日志 `/tmp/kokoro-web-uniform-turn-gap-final-lint.log`。
其间一次目标全文件复跑在既有新建专案导航等待处超时（69通过/1失败），立即同命令复跑70/70，原失败日志保留为
`/tmp/kokoro-web-uniform-turn-gap-final-target.log`，未改该行为或放宽断言。writer未运行完整check、build、服务或浏览器；
当前输入框内方框、实际轮间距和滚动位置仍待Root取得fresh页面证据，不把CSS源码断言称为视觉验收。

## WEB-EMPTY-FAILED-TURN 源码验收通过，fresh 视觉待验（2026-09-30）

Root 独立 Node22.22.2完整 `pnpm check` 实际exit0：contract109、architecture49、全量1836（40.87s）、lint/typecheck/build通过；日志 `/tmp/kokoro-web-empty-failed-turn-root-check.log`。Root用HEAD组件与候选tests真实复现RED2失败/30通过并finally恢复原候选，日志 `/tmp/kokoro-web-empty-failed-turn-root-red.log`；冻结四文件独立审查P0/P1/P2=0/0/0。这里只验收源码切片；当前浏览器读取/截图仍超时，输入框内方框和整体视觉仍未验，不宣称本片已闭环整个聊天体验。

基线 `main f9587ac9a008c7183b875e096be504fb5c0b69ef`。本候选仅在既有 `ConversationThread` 内把满足严格终态边界的
空失败 assistant 与原失败反馈放入同一 `MessageScrollerItem`，保留空 `article`、run identity、失败查询 hook、
`role=alert`、详情定位、普通重试及余额不足三动作；不以负 margin、CSS 隐藏或消息过滤消除间距。有正文/过程、旧失败、
孤立过程、流式/重连/HITL、可渲染成果或无持久化 assistant 时仍保留独立失败滚动项。Composer、CSS、共享 primitive、
owner 数据与机器契约未改。

Node22.22.2 精准测试先得到预期 RED：2失败/30通过，日志
`/tmp/kokoro-web-empty-failed-turn-red.log`；实现后目标文件32/32通过，日志
`/tmp/kokoro-web-empty-failed-turn-target.log`。`pnpm lint` 与 `pnpm typecheck` 均 exit0，日志分别为
`/tmp/kokoro-web-empty-failed-turn-lint.log`、`/tmp/kokoro-web-empty-failed-turn-typecheck.log`。writer未运行完整
check、build、服务或浏览器；当前 fresh 页面间距与输入框视觉仍待Root验收，不把纯测试结果称为整体聊天布局完成。

## WEB-FAILURE-FEEDBACK-FLAT 源码验收通过，真实视觉待验（2026-09-30）

Root在本仓显式Node22.22.2完整 `pnpm check` actual exit0：contract109、architecture49、全量1825（41.43s）、lint/typecheck/build通过；日志 `/tmp/kokoro-web-failure-feedback-root-check.log`。独立四文件冻结审查P0/P1/P2=0/0/0，Root核4/4SHA一致。Root另临时用HEAD CSS复现定点RED 1失败/20通过，并finally恢复候选，再定点GREEN21/21；日志 `/tmp/kokoro-web-failure-feedback-root-{red,target-green}.log`。未运行Playwright/fresh浏览器视觉；用户当前输入框方框仍待定位，不用本片代码验收代替整体UI闭环。

基线 `main 5b77798be7a407c3f0a82d47841f1e141021de02`。本候选仅在既有 Thread owner 内把普通失败与余额不足 Alert 从固定48rem圆角阴影卡收敛为 `fit-content`、`max-width: 100%` 的透明无边框内容块；局部解除共享标题的单行 clamp，使长标题可换行。`role=alert`、标题、详情、普通重试、计费三动作、键盘焦点、窄栏换行、重复用户、空失败助手轮及消息顺序均保留；Composer、shared Alert primitive、契约和运行数据未改。

Node22.22.2 精准测试先得到预期 RED：1失败/20通过，日志 `/tmp/kokoro-web-failure-feedback-worker-red.log`；实现后同一目标21/21通过，CSS architecture 14/14通过，`pnpm lint` 与 `pnpm typecheck` 最终均exit0，日志前缀 `/tmp/kokoro-web-failure-feedback-worker-`。首次 typecheck 暴露测试正则使用不匹配本仓target的 dotAll flag并exit2，已只收敛测试表达式后复跑通过。writer未运行全量、build、服务或浏览器；当前浏览器通道持续超时，失败反馈实际桌面/窄屏视觉及用户所见输入内框仍待Root fresh复验，不以源码与单测宣称整体UI完成。

## WEB-CHAT-CURRENT-FEEDBACK 源码门通过，页面视觉待验（2026-09-30）

Root在主工作树独立执行 Node22.22.2 `pnpm check`，actual exit0：contract109、architecture49、全量1823、lint/typecheck/build通过，日志 `/tmp/kokoro-web-chat-current-feedback-root-check.log`；独立四文件审查P0/P1/P2=0/0/0。精准Prettier当前四文件与其HEAD基线均exit1，未扩大格式化范围；`git diff --check`通过。当前受管3310 PID65590不重启，仅同步目标Thread CSS；浏览器通道仍超时，视觉与输入框用户反馈尚未验收，不以本段静态结果替代。

基线 `main 65e328755774080fc37a4d12d2b9f9b2e21a22bf`。本候选仅删除 Thread 按 message ID `:user` 后缀给所有命中
用户项施加 `2.75rem/-2.75rem` margin 与 `translateY` 的布局规则；该历史阶段仍保留 AppFrame 首项 margin，后续已由
本文件顶部 WEB-UNIFORM-TURN-GAP 收敛为 viewport 顶部留白与 content 统一 gap。消息内容、顺序、重复用户事实、空失败助手轮、
失败卡、滚动 primitive、Composer 与契约均未修改。

Node22.22.2 精准测试先得到预期 RED：1失败/69跳过，日志
`/tmp/kokoro-web-chat-current-feedback-red.log`；删除错误 scope 后同一目标为1通过/69跳过，日志
`/tmp/kokoro-web-chat-current-feedback-target-green.log`。AppFrame smoke、Conversation failure、Composer 与 CSS architecture
相关回归共163/163通过，日志 `/tmp/kokoro-web-chat-current-feedback-related-green.log`。当前 IAB 的焦点、导航与截图通道持续
超时，未取得 fresh desktop/mobile 视觉证据；旧截图和历史输入框矩阵不作为本候选页面验收，失败卡宽度与未知输入内框也未在
本片盲改。

## WEB-VISUAL-CURRENT-AUDIT Root 已验收（2026-09-30）

Root 最终 Node22.22.2 `pnpm check` actual exit0：contract109、architecture49、全量1822/lint/typecheck/build；日志 `/tmp/kokoro-web-visual-current-root-r3-check.log`。独立R3审查0/0/0、7/7冻结hash匹配。真实3310复验coarse/fine的focus/blur、390px与默认1280px、Shift+Enter两行54px不提交：textarea shadow none、无横溢；高对比textarea outline-style none且shell solid2px系统色替代保留。空deliveries Item=0，其他七个消息项全文逐项严格不变，包括重复user/历史空assistant/失败卡；不冒称完整产品链闭环。媒体、touch和viewport override已恢复，草稿清空；没有重启、模型调用或数据改写。最终矩阵 `/tmp/kokoro-web-visual-current-real-matrix-r2.json`；截图 `/tmp/kokoro-composer-current-desktop-after-r2.png`、`/tmp/kokoro-composer-coarse-mobile-after-r2.png`、`/tmp/kokoro-composer-forced-colors-after-r2.png`。下面候选/待验描述保留为当时阶段记录，由本段最终验收后继。

基线 `main bef68a0386a902bbe4747c5795d8222d1d91fa51`。Root 真实 touch emulation 已确认 coarse pointer 失焦 textarea 继承 primitive `shadow-xs`，桌面 fine pointer 的无阴影不覆盖此状态。本候选在 Composer 基础 `.input` 明确去阴影，保留共享 Textarea、普通模式单一 shell ring 及输入几何。ConversationThread 的成果 wrapper 现在仅在有打开动作、非 null 会话，且有成果或更多页时存在，与 DeliverySection 的可渲染边界一致；不再为返回 null 的成果区创建虚假滚动项。重复 user、空失败 assistant 和失败卡均保留，未过滤、去重或隐藏 owner 事实。

Node22.22.2 精准 RED 两文件为6失败/72通过：缺基础去阴影及empty/null wrapper边界；日志 `/tmp/kokoro-web-visual-current-red-r2.log`。首次保护断言误把 taskTitle 算成第三个用户同文案，已改为按真实 user messageId 断言后重跑 RED，不改生产行为。GREEN Composer/ConversationFailure/DeliveryCard/AppFrame 四文件151/151通过，日志 `/tmp/kokoro-web-visual-current-green.log`；`pnpm lint`、`pnpm typecheck` 均 exit0，日志分别为 `/tmp/kokoro-web-visual-current-lint.log`、`/tmp/kokoro-web-visual-current-typecheck.log`。Writer 不运行完整 check、浏览器、服务、模型或数据操作；完整门禁、运行副本同步和真实视觉复验由 Root 负责，尚不标为已验收。

Root 随后的完整 Node22 check 已实际通过 contract109、architecture37、1809 tests、lint/typecheck/build，但真实 forced-colors 聚焦态发现 textarea 透明 2px outline 与 shell outline 同时被系统色 Highlight 绘制；此前 shell-only 高对比记录不证明没有内框。本轮返修仅在 forced-colors media 中设置局部 `.input:focus-visible { outline: none; }`，以现有 shell 的系统色 2px outline/2px offset 作为唯一替代焦点，不设置 `forced-color-adjust`。新精准 RED 为1失败/78通过，日志 `/tmp/kokoro-web-visual-current-forced-red.log`；返修后四目标文件152/152通过，日志 `/tmp/kokoro-web-visual-current-forced-green.log`。彼时该返修后的完整 check 与真实高对比截图待 Root 执行，不沿用返修前完整门作为最终通过证据；后继 R2 结果见下段。

Root R2 后继真实页面已确认 forced-colors textarea outline-style 为 none、shell 为 solid 2px，coarse/fine 四态无输入阴影且消息 exact 不变；但 R2 完整 check 实际 exit1：contract109通过，architecture1失败/36通过，日志 `/tmp/kokoro-web-visual-current-root-r2-check.log`。原 architecture 门全局禁止所有 outline:none，未识别同 shell 替代焦点。本轮只扩既有 CSS quality 测试，精确支持 Composer 的两规则 forced-colors 移交契约，并仅移除该一条局部声明后继续执行剩余源的原禁止；未改 CSS 写法规避门禁，未整文件豁免。新增正例与11个突变/错误文件负例；精准 RED2失败/12通过，日志 `/tmp/kokoro-web-visual-current-focus-contract-red.log`；随后 architecture49与相关 UI152合计201/201通过，日志 `/tmp/kokoro-web-visual-current-focus-contract-green.log`；该 architecture 文件 ESLint exit0，日志 `/tmp/kokoro-web-visual-current-focus-contract-lint.log`。修后最终完整 check 仍由 Root 重跑，当前不标为已验收。

焦点提示由 `:focus-visible` 判断，文本控件在鼠标或程序聚焦后也可能匹配；本候选不声称只限键盘，也未改变主动聚焦与持续外环的行为。完整 failure/retry/重复 user 的 owner 修复仍是后继任务，本片不代表全部产品闭环。

## WEB-COMPOSER-SINGLE-FOCUS Root已验收

Root最终R2显式Node22.22.2完整 `pnpm check` actual exit0：contract109、architecture37、1800tests（44.86s）、lint/typecheck/build全部通过；日志 `/tmp/kokoro-web-single-focus-root-r2-final-check.log`。独立四文件审查P0/P1/P2=0/0/0。Root仅将exact HEAD baseline确认过的owned runtime单个CSS更新，无重启/模型/数据修改。真实IAB鼠标/Tab焦点单2px环、blur shadow none，textarea border0/no shadow，1280px composer x282/w768，390px x16/w358，无横向溢出；forced-colors实际active时shell系统色outline2px/offset2px、shadow none，随后恢复正常媒体/默认viewport。消息article全文数组严格相等。矩阵 `/tmp/kokoro-composer-single-focus-real-matrix.json`，截图 `/tmp/kokoro-composer-single-focus-{desktop,mobile,forced-colors}.jpg`。刷新后旧重复user仍可见；在本次视口切换后另出现通用failed提示，不改/隐藏，精确failure/retry与状态持久消费仍是后继owner任务，不把CSS验收称全能力闭环。

以 Web `30545c55625fb257ac17ce2199e8fa1000f3ecae` 为基线，当时实施候选仅把 Composer shell 的焦点样式从 ring 色边框加 `3px` halo 收敛为透明边框加单一 `2px var(--ring)` 外环；forced-colors 下同一 shell 使用唯一的 `2px solid Highlight` outline、`2px` offset并关闭shadow。保留 textarea 透明 outline、`:focus-visible`、布局几何、控件与 reduced-motion，不设置 `forced-color-adjust`。Root此前真实computed事实为白色card、`--ring=#1a1a1a6b`，旧halo为`rgba(26,26,26,.11749)`；该候选没有改全局配色，也不把该事实写成WCAG对比验收。Node `22.22.2` 普通单环先得到预期RED（57 passed / 1 failed），实现后58/58；Root随后对初候选完整 `pnpm check` 实测contract 109、architecture 37、全量1800、lint、typecheck与build均通过，但独立审查发现该初候选在forced-colors会因shadow受抑制而失去可见shell边界。高对比返修再次精准RED（57 passed / 1 failed）并GREEN（58/58），彼时最终完整门与真实浏览器复验待Root执行，结果见本节首段。本段不代表整体产品验收。

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


## WEB-PERSONAL-CODE（2026-09-30；历史实施切片）

基线 `main 49adb4bae88e45fc40489c2d297775e08a70faa4`；Web唯一writer，Root负责index/提交。
BFF `67755d16ff0f40ea02d71a6dad7108507a04766a` public原字节当时已固定，SHA-256
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

## WEB-PERSONAL-DOC-WRITE（2026-09-30；历史文档门）

基线 Web clean main `14a54b4b8da68b37d83a13402bc8abb87001574e`。本片唯一写集为
TECHNICAL_DESIGN/API_CONTRACT/DATA_MODEL/CURRENT；没有代码、generated、依赖/锁、Git index/commit、服务或数据操作。

当前事实：正式 Skills 两个入口共用 PersonalSkillsRead，只读本人 ACTIVE 列表/详情并提供已有发布流程，
无本人 installation consumer；旧 name/scope setSkillEnabled 不用于本次正式 API。snapshot 仍 pin BFF
`571b51de2057905c74c78ac966c8cf5ac11eca93`，SHA-256
`f49023882315a4f46e46e95595a02eaa7bb85475d5f46d2b945bc0555edb0c90`。

当时已核下一固定来源：BFF `67755d16ff0f40ea02d71a6dad7108507a04766a` public OpenAPI，SHA-256
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

## 2026-10-16 Skills 示例试用接线候选（正常业务验收待完成）

当前分支将真实安装 source 与目录 current version 分开；只有启用安装、详情示例与精确 revision 一致时才允许试用。外部目录保留 Direct、项目设置保留 Project，在新会话实际 ID 上设置既有 `selected_skill_source_refs`，输入区显示可移除技能名。未就绪/身份或版本不一致保留详情，不退化为文字冒成功；preview 仅文字。

已有 AppFrame/Composer/纯模型回归承接版本、route、actor/storage、Strict Mode、A→B→A 与 frozen retry 风险，未恢复已退役五套 Skills/Settings/MCP UI tests。App `34092c7` 已同步本地运行分支，正常产品 Session 与正式 API 新建仅本人可见的隔离技能：发布、安装及 owner 回读成功。真实浏览器已核 Direct 示例→可编辑提示词/可移除实名标签、项目设置示例→同项目新会话 URL；实际项目消息 POST 携精确安装 source，却返回 `503 agent_not_configured`，项目会话权威回读仍为空，积分与冻结额未变。因此未证明 Agent 接纳、消费或执行。

另发布隔离技能第二版、保留第一版安装，owner 回读确认 `available_update` 指向新版本；新版本详情加载完成后示例保持禁用，未自动升级。正式个人安装当前要求先移除旧版再装新版，App 又未消费可用更新；后续须经过 owner 契约/事务设计门，不在前端拼装隐式移除/重装冒原子更新。正常定时会话重核 200/authenticated 后已实际复现搜索清空和详情关闭；外层 key 含 admission/generation 的静态原因已定位，保持展示意图的修复待做。完整触屏/键盘与视觉对照仍待验。本节不代表 PR 已更新或已合并。


## 2026-10-16 Connector恢复错误消费者候选（未正常配对）

固定BFF d176e3d browser-private profile，正规生成并在同源/Hub核status/code/retryable；MCP六receipt/三typed原因不再被旧generic规则吞成parse，Custom API从只验envelope收紧为已知tuple，read拒receipt写错误。public14.8、原wire成功形状/准入/预算/key与UI状态机不变；已实际复现旧typed误拒/错tuple放行RED，完整工程验证与提交由Root有效计划记录。页面仍统一unknown提示，分类UX/正常Platform-BFF-App成对加载与真实浏览器验收未完成，不冒本片产品闭环。


## 2026-10-16 Connector恢复交互候选（未正常后端配对）

API/JSON/Register/共享Prepare在actor RAM保存固定profile严格核过的失败reason，expired/conflict/invalid及配置前置原因阻断原请求重派；processing/unknown/ownership-lost只用户显式恢复原key/body。创建与Prepare详情复用原alert/button/九语言，不按message猜、不新建或GET冒ACK；原生OAuth创建窗口typed原因受当前scope保护。两项命令重派与JSON误导提示均有实际RED→GREEN；最终工程/审查/commit由Root计划记录。没有receipt人工结清API或真实OAuth完成证据，其他详情编辑失败恢复仍待处理。


## 2026-10-16 Custom API 管理恢复候选

当前App工作树在3b25bc6基础上将API update/remove移出通用runAction，接稳定actor/client按profile的原命令管理。未知编辑只读、显式恢复原key/body/CAS，不允许换删除/新版本；正常关闭暂停等待，不冒回滚。列表缺资源仍可打开原意图；ACK清secret草稿，旧窗口不关闭新窗口。Hub显式caller key并核目标/修改字段/env安全描述，原wire和后端不改。

现有三suite316PASS，实际两产品缺陷RED（错目标ACK放行、编辑未知无恢复）及重复env ACK负控RED后修复；初始UI用错“保存更改”标签、后继取消按钮多匹配/完成微任务等待和错误构造参数测试fixture问题已纠正，未据此改产品契约。正常3310当前Session对自有零密钥API执行改名→列表刷新→精确详情回读→恢复原名→硬刷新持久保持，未删除/执行模型/工具/改资金。未知提交/缺行删除/过期/迟到ACK为受控组件与纯flow证据，不冒真实后端故障注入或全产品验收。最终相同业务/测试字节在Node22.22.2下contract280、architecture50、lint/typecheck退出0，默认181files/3250PASS/0skip/187.55s（2workers）；同字节原候选build0、现公共壳E2E桌面/窄屏6PASS/8.2s（1worker）、后继typecheck0。23路径冻结只读复核未见新增确定P0–P2，主方再次核hash；此结果仅本App候选，不称Platform历史format12失败或整体组合合并门已过。公共壳E2E只覆盖既有页面几何，不充当新管理故障或OAuth真实证据；没有新增suite/恢复五套退役UI。


## 2026-10-16 MCP 管理原请求候选

App57b510d后的本片把五项管理（server编辑/删除、connector编辑/启停/断开）移出runAction，接稳定actor/client按connector及private server绑定的typed原意图；现Prepare保独立槽并由单一构造器接必需互锁predicate，不新造通用registry/owner事实。管理未知保持原key/body/CAS且只读，新Prepare被拒；Prepare未知阻止修改，明确断开/删除仍可执行，只有ACK退休其精确Prepare。三现详情都有原请求状态、缺行入口和window/admission围栏；ACK清实际header草稿，非敏感输入保留至显式Done。Hub五方法删除隐式key生成并沿现单一matcher严格核目标、写入字段、安全header/OAuth描述和撤销/删除结果；原wire/生成物/后端不变。

错目标ACK、未知配置缺恢复及错误安全字段ACK均实际RED后修复；复用现Hub/rail/纯flow（加原schema回归）验证五项冻结恢复/互锁/同actor重核/actor退休/缺行删除/迟到provider ACK/实际header清理，无新suite。旧prefix测试改为caller key契约，原非敏感dirty编辑准入回归继续保留；曾误在Root调用vitest报无入口，未作产品RED，通过正确App目录取得实际RED。正常3310当前Session在自有无凭据loopback元数据fixture上Register/Prepare成功，改名→精确详情回读→恢复原名→正常断开→硬刷新已无样本，原两个API保留。仅initialize/通知与三个声明list各一次，无tools/call、模型、外部grant/凭据/资金或配置变更；未永久删除。未知/过期/缺行删除/启停故障为受控证据，不冒真实owner故障或整站1:1。临时tab/fixture已关闭；最终相同业务/测试字节Node22.22.2下contract280、architecture50、lint/typecheck0；默认181files/3262PASS/0skip/188.21s（2workers）；原同字节候选build0、公共壳桌面/窄屏6PASS/7.7s（1worker）、posttype0。19路径冻结只读复核未见新增确定P0–P2，主方复核hash；仅CURRENT结果段后补，业务/测试字节不变。新增12项独有风险行为而非新suite；原跨Document/色彩warning保留，公共壳E2E不冒新管理故障真实验收。Platform12个基线format历史失败、原生OAuth/create恢复/显式结清与整个文档恢复及全目标仍未闭环，不称整体合并就绪。

### 安装 pin 详情/正文/下载（2026-10-16，验收进行中）

基线 fb8bbb5。安装池显式走本人 installation 重核 metadata、exact package 与 download；目录仍 current，分享仍 exact share。已复现 RED：A 安装被 B metadata 覆盖、installation package 404；修复后定向通过。新 consumer 校验 source/decimal revision/文件目录/受控下载句柄，保持准入与取消围栏，不借 catalog 回退。停用安装显示“启用”，不伪装未安装；reader 内下载拒绝独立可见，不清正文。

正常同源 Admin 创建本轮“Kokoro pin consistency 20261016”两真实 ZIP 版本：先安装 A，再发布 current B；刷新安装仍 A，目录 B，二者下载哈希分别等于各自原 ZIP。停用后明确 update 到 B，保留停用，安装 reader/download 均为 B；Admin 可逆隔离 B 后 package 与下载拒绝，恢复同一 B 后原 reader 重试成功。正常当前样本保留已发布、安装 B 停用；未永久删除。无模型/计费/角色变更。原始截图、下载哈希和收据只在 Root ignored `var/dev/auth-p3-runtime/pairing-repair/pin-*`；`pin-disabled-A.png` 为开发 HMR 后摘要，不作停用 A 正文证明。

本片完整冻结门禁待下方补记；首轮全套3272通过发生于最终局部提示修改前，只是阶段证据。真实另一主体/撤回矩阵与完整 Manus 视觉、公开 v2 八类事实裁决、项目默认及正式执行、OAuth 创建恢复和远程 PR/Root main 汇总仍未闭环。Admin 临时开发进程与两自建浏览器标签已回收，正常共享服务保留。

最终冻结验证（同15路径，业务/测试字节停写后）：Node22 `pnpm contract`280 PASS、`pnpm test:architecture`50 PASS、`pnpm lint`/`pnpm typecheck`0；`pnpm test --maxWorkers=2`181 files / 3275 PASS / 0 SKIP / 182.03秒。独立同基线候选 `pnpm build`0，`KOKORO_E2E_PORT=3325 pnpm test:e2e tests/e2e/public-shell.spec.ts --workers=1`桌面/移动6 PASS / 8.3秒，随后typecheck0。全测一条既有 jsdom navigation 诊断、E2E颜色环境 warnings 非失败，不冒零诊断。独审15冻结hash一致且无确定新增P0–P2；这只证明本片，不替代正常跨主体/撤回、完整视觉或全目标。最终只追加本段文档，14其它路径保持冻结。远程未操作，Root index空；BFF d176e3d/Platform ac56a1f clean，Storage原35 dirty paths保留。

### 已撤回安装阅读与下载反馈（2026-10-16，验收进行中）

基线0c9452c，同BFF d176e3d/Platform ac56a1f。正常同源Admin只撤回此前自建的pin样本B；新App页继续读取停用B的metadata和SKILL.md，目录不展示该系列且不自动回退A，下载独立失败。此前reader把下载错误误说“详情不可用”，现独立区分严格HubClientError的不可重试403/skill_download_forbidden或404/skill_not_found与其他未完成；九语言只改下载提示，不清正文、不更换版本、不把错误文字当授权事实。正常最终提示“此技能当前未开放下载。”且原B标题/正文保留。未单独记录真实wire状态，不把UI推导冒精确HTTP取证；owner契约的403与404分支均具名回归。

原两分支真实RED后修复；403-only首候选没有匹配正常拒绝形态，核owner隐藏缺失规则、再补404回归先1FAIL后修复。沿既有rail suite扩展原用例，不新建UI套件。正常证据仅Root ignored pin-withdraw-normal.json及对应截图；当前样本源withdrawn、安装B/disabled，不再称其active。本轮Admin临时进程与自建tabs26/27已回收，正常共享服务保持；未永久删除、变更权限/凭据/积分或运行模型。完整门禁待冻结后补记；另一主体和完整目标仍OPEN。

冻结首轮全套181files/3277项中1FAIL：既有share exact-download回归仍期待旧的“详情不可用”，实际新下载错误已独立呈现；不是服务启动/内存失败。保留错误绑定拒绝与不回退断言，改为下载未完成提示并加原摘要仍在、旧详情错误不在的行为断言，无新suite。扩为14路径后重新冻结验收，不将首轮称通过。进程核对显示该全测临时Next及浏览器随测试结束已退出；3320/3324/3325/39216/39217当时均无listener，正常3310与共享依赖保留。

14路径最终停写验证：Node22下lint/typecheck退出0、contract280 PASS、architecture50 PASS；默认181files/3277 PASS/0SKIP/185.26s（2workers）。同基线独立候选build0、公共壳桌面/移动E2E6 PASS/8.1s（1worker）、posttype0。定向share+rail 2files/188 PASS；既有jsdom跨Document诊断与E2E颜色环境warning如实保留。只读增量复核14hash一致，无确定新增P0–P2；保留分享错误绑定与不回退断言。最终只补本结果段，另外13路径不变。

本轮按用途与父子/cwd核对进程：自有Admin已停止，首轮及最终测试临时Next/浏览器均结束，候选E2E退出后3320/3324/3325/39216/39217均无监听；App/IAM/BFF/Platform/Storage正式健康入口200。正常3310、受管服务、共享PG/Redis与桌面工具运行时保留，不因RSS大或PPID1终止；外部Clash零RSS僵尸不占本轮可回收内存，不连带结束父进程。串行跑完整测试、候选build与E2E，无重复预览常驻。本片不代表八类来源、跨主体矩阵、完整视觉或总目标完成，远程CI/PR/merge及Root暂存仍暂停。

### API／JSON创建窗口立即停止等待（2026-10-16，验收进行中）

基线0880ab6。只读查到表单取消只关闭窗口，稳定shell原请求仍等待ACK/超时；实际新增五项RED：两个表单各取消/卸载signal未abort，以及pre-aborted仍派发。改为窗口独立caller signal关联原flight，取消/卸载/真实准入退休立即停止等待，原unknown/key/body仍保存，显式恢复原命令；迟到ACK只确认原事实，后开窗口需显式完成，不换key、body或伪造回滚/结清。逻辑等价boundary对象重建不退休，原窗口清理不取消后继flight。复用既有两个suite，无新UI测试中心。首次lint指出memo对象突变，已改为ref持有窗口等待而非绕过规则；全门禁待下方真实记录。

正常3310复用当前Session从管理连接器分别打开API/JSON，在不提交情形下取消/API与Escape/JSON均返回原列表；只改临时草稿，未创建、删除、改角色/凭据/资金或运行模型。本次正常浏览器不证明在途故障取消，后者明确为deferred组件/命令证据；本轮自建tab28已关闭，截图/收据只ignored。项目技能默认仍为name-only写无回读/执行，已询问目标安装边界，本片不冒项目完整闭环或OAuth人工结清。

本片最终业务/测试冻结：Node22 lint/typecheck退出0，相关4files/291 PASS；contract280/architecture50，完整181files/3282 PASS/0SKIP/186.69s（2workers）。同基线候选build0、公共壳桌面移动E2E6 PASS/7.7s（1worker）、posttype0；既有跨Document与颜色warning保留。独审9路径未见确定新增P0–P2，主方核冻结hash并复审diff；本段仅文档追加，另外8路径保持原冻结。E2E后临时Next数量0，3320/3324/3325/39216/39217/39218均无listener，App/IAM/BFF/Platform/Storage健康200。远程CI/PR/merge、Root stage未动，原生OAuth真实提供方/人工结清、项目安装默认、八类来源及完整产品仍未闭环。


### 私有MCP详情重新授权（2026-10-16，验收进行中）

App36dacf0基线私有详情/配置只有Prepare，创建窗关闭后needs_oauth资源缺连接入口。现沿既有Reconnect wire补窗口独立消费者，pending/error+fresh needs_oauth显示连接，ready仍原Prepare；未结管理/Prepare不借OAuth绕过原命令恢复。单窗口在途单飞，exact绑定/CAS由当前owner读，关闭或准入退休abort/popup cleanup，迟到ACK只失活原actor、不导航/关闭后开窗。Reconnect成功只等待AS，详情保留并由callback通知重新读取owner事实。无新API/Schema、授权registry、秘密状态或自动重发。

原缺按钮3项实际RED→GREEN；又扩原迟到用例复现关窗后旧等待阻塞新窗，实际1FAIL后按scope清等待ref，新旧finally隔离。最终旧rail扩4项独有风险（详情/配置入口、关闭/重核两围栏），focused4 PASS，无新suite；先前测试fixture的未用形参lint和TestingLibrary多余exact选项及3个旧直挂组件缺新prop属测试接线修正，未据此放宽行为。完整冻结门禁、正常拒绝后重连与成功回验待后续结果。


正常3310当前Session已验：新自有loopback URL Register/Prepare200后关闭创建，不从原窗口授权；管理列表重新打开同一私有详情显示连接。第一次详情Reconnect200/89.584ms，AS明确拒绝，callback Complete200/49.691ms；只读owner为error/disabled、failed、pending/state/verifier清、credential count0，fixture无换token或声明调用。详情保留可再连接；切MCP配置后显式第二次Reconnect200/85.996ms，AS同意→Complete200/73.628ms，原配置Dialog保留且主按钮回试用，不将Reconnect ACK直接当成功。只读owner为active/enabled、approved、registered/ready、有digest、一个active credential。DCR仅1、authorize2/deny1/allow1/PKCE换token1，五项声明各1，无额外Prepare/工具/模型执行。

随后正式Disconnect200/58.622ms，UI无行，owner connector/credential均revoked、credential version2且同DB退役瞬时点，原两API保留，未永久删除。AS /consent独立标签由同浏览器自然共享原popup HttpOnly会话，未导出任何授权参数或秘密；原popup presentation仍未由inventory验证，不冒第三方提供方/到期刷新。截图与收据仅Root ignored private-oauth-detail-normal.json/private-oauth-config-reconnected.png。自有tabs35/36/37及fixture90210已回收，正常服务不重启。

七路径首冻结已只读复核无确定新增P0–P2、精确hash一致。Node22 lint/typecheck退出0、contract280 PASS/architecture50 PASS；首全测命令因当前Vitest4不支持minWorkers而未启动，改用支持的maxWorkers=2后181files/3286 PASS/0SKIP/183.27s。没有恢复退役UI套件；原jsdom跨Document诊断保留。同字节独立候选非preview生产build已退出0；显式preview候选build/公共壳E2E与posttype仍待最终结果，本段只文档追加，另六路径原冻结。完整八类来源、项目安装/选择、跨主体/Admin矩阵、长OAuth重核UX/剩余Manus视觉和整文档恢复仍OPEN；远程CI/PR/merge与Root index不动。


最终候选同业务/测试字节：production build退出0。第一次误将只支持development显式preview的公共壳E2E指向production start，得到2FAIL/1中断/3未运行；确认use-session-state的production禁止preview及既有Playwright webServer设计后停止该自有错误模式测试，preview进程由原finally回收，未改产品分支/断言。随后沿原Playwright管理的显式preview development server、3325独立端口、1worker重跑，桌面/移动6 PASS/8.3s、posttype退出0。该公共壳E2E只证明既有预览旅程/几何，不冒本片真实OAuth故障；后者为上方正常AS拒绝→显式重连→callback→fresh owner证据。既有颜色warning保留。仅追加本结果段，另外六路径仍原冻结；临时端口/进程回收与最终SHA由Root集成记录，未push/PR/merge。
