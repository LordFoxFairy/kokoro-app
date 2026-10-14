## SET26 body retirement correction (2026-10-15)

The plans optional AbortSignal and total 10s contract also retire the owned real body reader. Reading and decoding remain within that same budget; timeout and parent abort cancel the reader and release the lock. GET/no-store, schema, 503 mapping, money wire and the entire checkout transport stay unchanged. No additional body limit or header requirement.

## SET26 用量与套餐可信读取（2026-10-15；正式D0，先tests-only）

正式Web基线a9183585ab403797f79b522aedb120de562a64e9、939 tracked clean。仅现Web Billing/Pricing/settings消费接缝，runtime_audit唯一writer，17具名路径/914保护/Root8；Root独占设计/docs/Git/资源/正常运行/CUA。候选独审无确定阻断P1/P2。Skills/连接器、owner契约/SQL/generated/依赖、checkout源码与全局QueryStore保护；无新源文件/模块/owner。

仅既有PricingClient.plans加可选AbortSignal及准确timeout/aborted failure reason，现同源GET/no-store/严格schema/503 not_configured/金额wire保持；每call一个绝对10s race，signal转owned fetch，取消body可用时执行，headers/body/schema无phase预算重置或自动retry。checkout整体原字节保护，当前UI永久disabled购买且0checkout/redirect，owner capability不因目录非空而成立。可信scope只本地投影/生命周期，不把subject/generation/actor写wire，不复制BFF/Billing契约。

## SET25 浏览器测试就绪边界窄准入（2026-10-15）

仅现tests/e2e/web-governance.spec.ts原65/107/267/405/470五个初始/app goto覆盖六例：networkidle改DOMContentLoaded后准确Chat input可见/启用/可编辑web断言。原229及其余goto保持。已有实际六desktop等待超时证据及只读独审无确定P1/P2；官方Playwright建议测试以web断言判断ready。原logout POST/issuer、reading轴/长markdown/stream/HITL所有业务oracle、mock、skip、timeout、route保持，R137观察器仍先于首次发送。不能以输入就绪冒称业务通过，也不宣定位具体网络请求根因。无Product源码/fixture/权限改动；沿runtime_audit同一writer，SET25扩为13writer/919保护/Root7，仅本项追加范围，其余原边界保持。最终正规E2E运行仍待验。

## SET25 原有模型偏好深链可靠性（2026-10-15；正式D0，先tests-only）

Web既有chat-prefs/ChatPreferencesSection/旧chat深链局部修补；正式基线6921a1cbffd723fc37c4cc64342bb3a6f89369a1，939 tracked clean，12writer/920保护/Root7绑定。唯一writer runtime_audit，Root设计/文档/Git/资源/运行/CUA；候选独审无确定P1/P2。Manus General实为任务发送偏好，现TaskDelivery已对应，不加General模型/左栏入口，更正旧卡注释。无新源文件/模块/owner/依赖/CSS，通用store/client/API/generated/Skills/连接器保护。

无网络/API/owner/contract/generated/auth scope变更；现同源model list与ModelCandidate类型保持，listModels()不扩signal。单10s只截止UI观察，不表示底层请求已取消。writeChatModel从void改准确boolean仅本仓内部函数，唯一写caller消费成功，readChatModel/composer保持。目录Retry仅原GET，保存retry仅localStorage，无模型执行或BFF写。

## SET24 账户退出失败恢复（2026-10-15；正式D0，先tests-only）

Web现有AccountCard退出交互的局部修补；基线03fc794403116f93c318eeec3534ae0d199cb690，939 tracked clean。Root绑定921原保护，唯一writer runtime_audit；Root独占三设计/CURRENT/相邻INDEX与Git/资源/运行/浏览器，storage_platform_audit只读审查。Skills/连接器、Product auth client源码、API/contract/generated/lock/依赖/CSS及其他owner排除。独立D0审查无确定P1/P2。

不改传输或正式owner合同。现endProductSession(navigate,signal)完整保留：GET /api/auth/csrf、form POST /api/auth/signout、既有合法issuer URL与503 handoff。AccountCard只提供有界生命周期和导航护栏，无新scope/header/API/授权、CSRF绕过或host放宽。未确认结果不能自动POST重试或假成功跳首页；手动重试由用户明确点击。

## SET23 通用语言与主题保存失败反馈（2026-10-15；D0与Root真实RED通过，具名source准入）

归属Web现有浏览器偏好Provider和General AppearanceCard，是现文件局部修补，不新增模块、API、owner、依赖或存储框架。正式基线293ac84d7b2b6562b73e46c56436aadc4c1c2e3b，939 tracked clean已绑定；原主题/语言即时生效，setItem失败无提示，不能说整体不可用。候选独审无确定P1/P2。

本片无网络或机器contract变更，仅两现内部Context增加分别的persistenceFailed boolean。现setMode/setLocale签名与调用保持；只有显式当前选择或重试调用写原localStorage。成功仅清自身失败，其他Provider错误不变。alert及retry两文案键在九语言追加，旧键逐字保持。不改变账户、Team、Data、Skills/连接器请求或正式BFF15.3 pin。

SET21分享浏览器接缝准入澄清：现 engine/client.ts 仅 createShare/revokeShare 两方法可共用具名有界分享调用，createShare 增可选 AbortSignal，原 POST {}、idempotency key/value、路径编码和 flat ShareReceipt 保持。两分享操作各浏览器单10s覆盖 fetch/headers/body/strict ACK，停止分享外部单10s同时涵盖写与完整重读；不扩大 generic postJson、其他会话/SSE/Move 方法或 ShareButton 源，不新文件/框架/依赖。现 client-artifact-share 测试可沿这两个方法补具名 deadline/abort/坏ACK负控，原 oracle 保持。现 lint/type 通过是阶段输出，终态仍须重新冻结和复验。

SET21/22阶段更新：两冻结原client/modal入口由Root实际复现4FAIL/47PASS，現沿CURRENT具名source/正常正式生成实施；D0预算/身份/closed ACK/恢复和当前同页Data结构不变。历史tests-only文字不再表示当前无source权限。

SET21/22正式消费前置：BFF eec3244645d5129407147774ecb07e03848420c4，public15.3.0/146全文SHA256 694251d4f4c1bcc9a79ae4fd2d4c050c87a0a8af39bea0a9f0bed3a4dcae5ad5；当前只授CURRENT具名两现tests-only真RED，source/机器等待Root复现。旧15.2消费pin仅待正规整包原字节与正常窄生成更新，不手改生成。

SET21/22参考页面澄清（Root实际CUA）：Manus Data为同页依次“已分享任务”“已分享文件”“已归档任务”三段，不是页内三个tab；其下授权应用、云浏览器数据、已购买域名各有管理入口。Web只新增Data/Help两导航tab，Data内容沿同页三段及三管理行。现只任务分享具备真实owner，其他段保不可用说明/禁用管理，不制造“暂无”的假空事实。Help为侧栏底部本产品帮助入口，不能复用Manus客服。

## SET-21/22 browser-private Data/Help（2026-10-15；D0独审通过）

server以正规oidcRpConfig固定tenant及HttpOnly subject校验sht1；不接受browser/URL/body自报tenant。browser ProjectReadBoundary无tenant，只核subject与已由server验证的分页一致性。

新列表title保旧原string；同毫秒session_id顺序使用正式owner拟定的UTF8字节序（COLLATE "C"），不以JS UTF16或localeCompare猜序。正式发行前仍不消费该候选。

public唯一BFF，当前正式a88/15.2/145；拟15.3的GET /v1/account/shared-tasks在正式提交前不作为消费依据。后继单正规artifact+窄generated包含新GET和原createShare/revokeShare，旧能力shape/hash逆门不放宽。

GET /api/account/shared-tasks映射新public GET；query仅canonical limit1..100（本页固定100）/非空≤2048 cursor，拒未知/重复/坏percent/UTF8/body framing/encoding/Idempotency-Key；200恰{data:{items:[{session_id,title,shared_at,expires_at}],next_cursor}}，无meta/capability/URL。cursor须closed sht1实际tenant/subject/limit/末条anchor一致、next唯一、items安全排序且唯一；空页next=null。public错误closed error.code/message/retryable及status按正式机器，Web私有metadata/会话/响应校验错误独立且不伪称public。no-store/requestID只header，429 Retry-After沿正式可缺省/存在1..86400，其余无。

Share继续现/api/session/sessions/:id/share POST/DELETE，仅该exact路径入新有界支路；正规query scope/project_ref和Idempotency-Key保现语义，不加UUID/trim/ID长度猜测。POST真实{}、DELETE真实EOF（Node Next可能有空stream）。200原BFF closed data.share_id/meta.request_id严格原文+请求header绑定后投影原flat {share_id}；不存在session_id ACK字段，不能称ACK逐目标字段绑定。删除ok:true错误解析，无新停止分享endpoint。正规error envelope先闭集/请求ID验证后沿原flat错误，非法/未知响应502且视unknown；不透SQL/owner message。非share generic/SSE/Move行为保持。

单10s含params/body/session/上游/最终六字段栅栏，BFF响应和browser响应总≤1MiB、fatal UTF8/BOM/decoded重复key/深度32，browser redirect:error。mutation明确canonical Origin，GET允许无Origin或完全一致。无自动重试/新scope/client/credentials；preview、Help、禁用区域零API。

## SET-20 browser-private Team 可靠性（2026-10-15；V2冻结独审通过，Root集成验收中）

唯一正式合同仍为BFF a88/public15.2九个Team operation；本片不编辑snapshot/generated/public schema或IAM API。现/api/team/[...path]只映射现members/invitations/roles及六mutation；成功均200，closed data/meta字段与正式error envelope保持。caller actor/tenant永不从body读取，leave内部期望memberID只用于客户端ACK校验，不传输为身份字段。

canonical scheme/Host全部核，GET Origin缺省或完全相同，mutation Origin必须明确完全相同。无query的mutation同时拒bare?；未发布Idempotency-Key、content-encoding或body字段不接受。create/replace JSON原文≤16KiB、fatal UTF8/duplicate/closed；resend/cancel/remove/leave只允许实际EOF，在同一预算内验证为空，不转发fake空JSON。路径及page query沿原闭集，不新增接受/切团队/创建团队API。

server单10s从入口含params/body/session/BFF全响应及最终六session等值有效核；browser单10s、2MiB headers+body且主动取消不合作读取/迟到fetch。成功严格raw schema、200、no-store、meta/header request-id一致，正式4xx拒绝与未知网络/401最终身份变化/5xx/坏ACK区分；错误message不透未验证的原始upstream值。九操作429的Retry-After可缺省，存在时为^[1-9][0-9]{0,4}$即1..99999；503及其他未声明状态不接受该头，不套用姓名的必填或86400规则。server final-session退役即便owner已成功写仍401，客户端不能假未提交。

创建invitation ACK只新ID/pending；resend/cancel绑定请求invitationID；replace/remove绑定请求memberID，replace绑定完整角色集合；leave绑定已完整权限加载得到的actor memberID。首次权限加载查actor及全role有界20页/2000条、whole-read10s；未知写或ACK后刷新失败拒第二写，只有完整成功authority reload及显式决定可继续，More不提供该资格。subject/admission/generation/close/unmount退役结果及signout signal，无自动mutation retry或邮箱投递承诺。

## SET-19 browser-private 姓名PATCH（2026-10-15；源码已接收，正常浏览器待验）

现GET /api/account/profile保留userinfo读取。新PATCH同一路径只调用正式BFF a88e710d2201342200017f44c2bc34325937b5d0/public15.2.0 updateAccountProfile；唯一canonical全文SHA256 3214e32d273fbc514db1c1f2307f7855b623f1f613fb1da710cc51d23c41f453，唯一输入已按该正式Git对象更新，不创建第二份可编辑public schema。新增窄正常生成器消费唯一正式artifact，由generated派生严格input/ACK/error并在strip前校验原始JSON（含重复键/坏UTF8）。其余方法405/Allow GET,PATCH，不新增通用proxy。

PATCH严格同canonical scheme/Host、必须明确同Origin；无query/Idempotency-Key，唯一application/json，Content-Encoding仅缺省/identity，真实正文≤65536bytes。body恰{name,expected_name}；name1..100 UTF16、well-formed Unicode、无C0/C1和ECMAScript trim边界；expected_name恰正规userinfo原string≤16384 UTF16，不修剪/归一化/过滤旧值。name缺失/null不授予保存，不自报subject/tenant/client。仅HttpOnly session中的access经productBffHeaders提交BFF。

成功200严格{data:{subject,name}}，subject绑定同一可信session、name绑定提交原文；PATCH plain error严格{error:{code,message,retryable}}，private/no-store与合法x-request-id仅header，无meta、凭据或raw owner消息。BFF正规status/code/retryable tuple安全投影；本地400 account_profile_input_invalid、403 account_profile_forbidden、413 account_profile_request_too_large、401 session_invalid、502 account_profile_response_invalid、503 account_profile_unavailable，retryable只有429/503真。429必须有合法1..86400 Retry-After，其他状态出现该header拒绝。既有非PATCH方法405 account_profile_method_not_allowed保持原错误形状/private,no-store/Allow: GET,PATCH，不声称具备PATCH receipt。server/browser单10s，BFF headers+body总≤1MiB，最后same-session复核同一预算；未知写结果绝不自动retry或宣称未提交。

权威GET仍原5s与原四字段安全投影，只name放宽到原string≤16384 UTF16；响应总256KiB（含header与body）覆盖合法旧值JSON escaping，sub/email规则及userinfo其他字段剥离保持。GET和PATCH最终session的id/generation/subject/access/两个expiry逐项等值且未过期。PATCH ACK后的GET失败不构造本地profile；409、失去ACK、取消/超时/非法上游结果均需成功GET reconciliation后再由用户显式决定新PATCH。401可能由owner成功写入后的最终session退役产生，同样锁写、保草稿、权威重读，不把失败响应解释为数据库未写。

原十五OIDC scope严格有序追加iam:account-profile.write，16项只由fresh authorize获得，不改旧refresh/userinfo/ID token生命周期。正常scope资源与启动由Root在三owner正式提交后集成，不用旧运行假测试。Skills/连接器不变。

## SET-18 正文为空的 DELETE 输入核验（2026-10-14）

Account session DELETE 仍禁止业务正文、Transfer-Encoding、非零 Content-Length 和 idempotency-key。Next Node adapter 可为合法无正文请求提供非 null stream，故同源 adapter 在既有十秒总预算内验证 EOF；发现任何正文 byte 即拒绝，悬挂读取主动取消并释放 reader，未验证为空前不读取 session 或调用 BFF。空 stream 不构成新正文合同，不转发至 owner；其他 Host/Origin/path/ACK/final-session 约束保持。

## SET-18 browser-private 登录Session（2026-10-14；源码已接收，运行待验）

正式前置已接收：IAM284bfd8fea91d57dae18fa2b7c772d75c7b6dcd9/internal0.12/f6f3588d；BFF53996400e4100ed5940b104f0dce139d44fec383/public15.1.0/canonical与inventory144/SHA2565972f7be07a0117d8ee036fa4e742da7942b3c864d009c2847e70e69112a747d。Root沿SET18-Web任务卡授billing_scheduler_audit唯一源码writer；D0同一sessionID/generation/subject/access与session寿命最终复核规则保持。实现已冻结、独审并由Root接收，正常运行/browser尚未完成。Web实际OIDC_SCOPE按现原十三项严格顺序append账户read/revoke两scope，以正规fresh authorize取得；不得用旧refresh/machine提升。

独审后继规则：未知DELETE结果设独立reconciliationRequired写栅栏，hook与移除确认共同守卫；分页读取、分页失败或首屏读取失败不得清除，只有成功首屏relist核对权威目标状态后恢复合法写入。提示notice不是写资格。原分页/身份取消/正常ACK读回规则不变。

新同源GET /api/account/sessions只承接正式BFF GET /v1/account/sessions（limit1..100默认25、可选非空cursor≤2048）；DELETE /api/account/sessions/{sessionId}只承接正式BFF DELETE同sid，非空≤255且与正式owner约束一致，无query/body/Idempotency-Key。所有method/未知/重复参数/非法路径编码/非空body显式拒绝；其他method405并Allow。不与聊天/api/session混用，不新增IAM relay规则或通用URL。

GET校验部署侧canonical webOrigin的scheme/Host，Origin缺省或精确同canonical值；DELETE要求Origin必须存在且精确canonical webOrigin，同时Host/scheme匹配，不能用现sameOriginOk的missing-Origin允许路径。不信Forwarded/browser origin选owner。HttpOnly currentProductSession为cookie边界，沿productBffConfig/productBffHeaders只向固定BFF传单Bearer；缺配置503、匿名/过期401、不合Origin403、存储/准入不可确认503，subject来自session/BFF，不从body。

成功仅校验正式BFF15.1 generated closed response（current_session/sessions/created_at/expires_at，meta.request_id/next_cursor；撤销session_id/revoked:true与请求一致），零凭据、private/no-store、同一合法x-request-id。上游JSON/headers+body总1MiB/同request-id/no-store及状态code一致才输出，schema strip未知字段不可冒strict校验；错/多字段、current在other、重复ID/分页矛盾、错ACK、header绑定错误502。传输/timeout/不完整503，BFF正规拒绝沿正式closed error family，不透内部message/token。Web自有invalid_request400、forbidden_origin403、method_not_allowed405、session_required401、dependency_unavailable503、response_invalid502使用具名account_session前缀；同一error响应有安全message/request-id，不与public错误伪合并。

DELETE结果未知只提示重新list核目标active，不自动retry/宣成功；current409、foreign/不存在404、本人expired保留重复200/cleanup后404由IAM经BFF裁决。响应返回前再读取同一当前Websession（opaqueID+ProductSession generation+subject+accessExpiresAt/session expiresAt仍有效，含同一ID/subject的刷新或权限代际变化），identity退役返回401/503而非把迟到数据给新用户；该未知也不证明owner写回滚。

正式发行顺序：IAM0.12→BFF15.1不可变commit/digest→本仓正常narrow生成与完整出处更新；不从IAM源文件/未提交BFF复制类型，不放宽Team/Agent/Skills/MCP原schema。新scope只能正规provisioning与fresh authorize，不能修改旧refresh或用machine/admin替本人。当前源码唯一artifact已逐字节核验为BFF15.1；正常部署、fresh授权和真实用户旅程仍待成对验证。

## SET-17 支付未提供的现有边界（2026-10-14，目标待验）

不新增/改写BFF public或owner机器契约。套餐GET仍经当前同源adapter消费正式目录；固定checkout503不提供交易，UI不发checkout请求。旧browser-private `/api/billing/mock-pay`保留配置503、Origin403、匿名401、准入失败503守卫，已准入请求在所有环境都503 `mock_pay_unavailable`，没有支付owner请求或成功ACK；其旧开发relay退役，在线身份准入所需的读取保留。直接pay页面只说明不可用，不证明URL中的orderId存在或已支付。Team只消费现有固定团队九操作，导航改名不产生创建tenant/team契约。验证守卫和零支付owner I/O，不调用支付或伪造账单。

## SET-16 通用通知与声音：沿已有任务契约（2026-10-13，实现候选）

2026-10-14 修正：仍无 wire/generated 改动。可信原始 subject 与 engine/scope 是长期资源身份，readBoundary admission/generation 是同步投递门；同主体重验保留已验证锚、去重和已解锁音频，但门关闭期间零投递且不补播。设置授权异步结果仍绑定当次 admission/generation，Audio unlock 单次 attempt fence 防止旧完成影响新尝试；真实主体/logout/preview/engine/scope/dispose 退役。readBoundary generation 不授予新任务或历史通知资格。

本片无新HTTP、owner API、权限、版本或generated改变。唯一任务事实仍为现固定BFF public15.0.0 validated AG-UI、MessageCreateReceipt与SessionSnapshot；Web只新增内部typed任务信号订阅，不成为第二套wire。完成严格取run.completed且status=completed，失败/取消/dispatch_failed/ACK/EOF不替代；快照event_watermark与active execution_head只用于正规恢复和锚定，不发历史通知。请求/音频许可是浏览器能力，不授权运行或服务端写入。

资源主体来自受信readBoundary原始subject，当次投递仍需layout已提交admission；设置授权异步结果受当次generation绑定，scope/session/run标识来自现引擎。不得从browser body、localStorage偏好、preview、ready或任意feature flag推断准入。营销通知没有正式owner契约，disabled且恒false；不新增假成功API。当前模型授权硬门与正式支付缺口仍未闭合。

实现补充：active execution_head搭配合法null watermark亦可锚定未来live事件，null不被解释为历史完成；快照自身不投递。引擎receipt/snapshot捕获通知代际，身份退役后迟到事实不能重授通知资格。Audio create/resume由手势同步启动，resume单次3s预算，超时/拒绝/退役关闭owned context并拒绝late复活；无自动resume或补播。任务观察者逐事件隔离异常；切会话/身份/scope关闭owned投递，声音刷新/退役后需再次手势。无新契约、SQL、依赖、营销订阅或Skills/连接器改动。

V2实现补充（2026-10-14）：同subject临时失准入只更新layout投递门，长期observer/audio及engine锚保持；门内终态仍被正规引擎消费，不缓存或补播。真实资源替换仅退役旧engine，保留新engine已经合法锚定的owner head。AppFrame awaiting身份不含read generation，旧主体未变化的waiting投影不在退休后立即重登记。现page-clients engine lease在StrictMode重新取得时取消延迟release，真正无owner时正规engine.dispose清锚和listeners；hook关闭owned Notification/Audio并取消订阅，不增加第二个dispose owner。每次Audio unlock递增独立attempt fence，旧resolve/reject/timeout不得关闭同subject后发有效context；Settings组件仍以当次admission/generation取消迟到许可和保存。

## SET-SHORTCUTS：无网络协议变更

快捷键编辑、清空和重设只写既有浏览器localStorage偏好，无请求、用户身份/API/权限/SQL/generated变更。保存成功只表示当前浏览器存储写入成功，不声称跨设备同步。语音输入无能力契约，显示不可用。

## SET-13 TeamRole public15严格消费目标（2026-10-13）

BFF是唯一可编辑public机器owner。等待SET13审查并提交后，由其不可变SHA/digest原字节替换src/generated/bff-public-openapi.yaml；两既有generator固定同一来源。正常生成Team SDK与Agent failure provenance，失败片段/roles/tuples及非Team语义不手改。TeamRole.permissions只接受现八域，platform仅execute，skill仅固定IAM十五动作，数组非空；未知域/动作继续拒绝，保原错误/paging/mutation输入/输出。

strict response集合扩展为breaking，15.0.0 /v1仅Root此次自有开发配对，不能冒minor或稳定生产兼容。先owner固定、再Web单pin/生成/严格测试、最后Root真实组合；不混新旧response。Admin consumer与未来稳定/v2激活规则见BFF三设计，日常/main/生产切换未授权。完整snapshot会继承95fbd894相对于Web旧413e3bbe已有的非Team机器差异，本片不编辑这些owner字段或Skills/MCP运行行为。

<!-- BEGIN:T-K03.13-WEB-MCP-PERSONAL-READ-D0 -->

## T-K03.13 Web 本人 MCP 读取 D0（目标，尚未实施）

唯一机器源为 BFF 已发行 public 13.3.0 / 137 operations；Web snapshot 与正式 canonical SHA256 均为 `0a9683b38cfd30534931dd0cd7821e3ccded94d6d15613a711cebc1f1e83a209`，不 repin/生成。

仅 GET /api/hub/self/mcp/connectors、/connectors/{connector_id}、/connectors/{connector_id}/connections、/connections/{connection_id} 保 self 映射对应 /v1/self/mcp 正式路径。list connectors 仅 status/limit/cursor，list connections 仅 limit/cursor，detail 零 query；canonical ID≤191、opaque cursor≤2048、limit 1–100。拒重复/未知 query、body、任何 Content-Length（含 0，仅本地拒绝、不 forward）、Transfer-Encoding、Idempotency-Key、未发行写和 provider 路径。旧 active projection 的路径/query/wire 不变。

按四 operation strict snake_case 成功 envelope、connector 五字段/connection 六字段及资源/filter/分页绑定；错误 error{code,message,retryable} 无 meta，逐 status/code 闭集 400/401/403/429/502/503，404 仅两个 detail 与 connector 下 connections，不适用于 connector 总 list；429/503 retryable=true，其余 false。实际字段与枚举引用机器，不复制第二规范。严格 JSON/request ID/no-store、存在时合法 Retry-After、10s 总预算和 1MiB UTF-8 body；拒 redirect/alias/fallback。

<!-- END:T-K03.13-WEB-MCP-PERSONAL-READ-D0 -->

<!-- BEGIN:T-K03.14-WEB-PERSONAL-LIFECYCLE-D0 -->

## T-K03.14-WEB-PERSONAL-LIFECYCLE D0（目标，未实施）
唯一机器事实源：正式BFF e1769b56 contract/openapi/v1/openapi.yaml public13.3，现Web固定snapshot不升级。Managed详情已有example_prompts/skill_updated_at，直接显示真实字段。
新同源闭集POST /api/hub/self/skills/{skill_id}/versions及/withdraw，精确映射正式/v1/self/skills/{skill_id}/versions及/withdraw；不添加alias/泛转发。前者display_name/summary/tags及明确example_prompts/category_keys，禁止expected_state_version，201严格draft六字段含state_version；后者reason+expected_state_version，200严格source_ref/status/event_id/replayed/state_version。全部exact UID、同series、decimal revision/CAS与请求绑定，unknown原key/body不可换意图。
按CreatePersonalSkillVersion/WithdrawPersonalSkill机器operation逐status错误闭集：400/401/403/404/409/412/413/429/502/503；保原envelope、request ID/no-store、合法Retry-After及取消。不得用其它Skill族通用enum×status放宽。10s总网络/累计body上限沿现client；共享PUT仍既有60s生命周期。不复制契约字段长文。
更新201不是发布/安装成功：真实新包链Publish显式owner及最终CAS；不凭旧UI恢复公开发布权。撤回与包上传互不串意图；服务端仍是权限唯一裁决。

<!-- END:T-K03.14-WEB-PERSONAL-LIFECYCLE-D0 -->

<!-- BEGIN:T-K03.14-WEB-SHARE-D0 -->

## T-K03.14-WEB-SHARE D0（目标，尚未实施）
BFF正式 `e1769b56aefa2e00e6460195c049cea81a9eea3b` / public `13.3.0` / 137 operations / canonical SHA256 `0a9683b38cfd30534931dd0cd7821e3ccded94d6d15613a711cebc1f1e83a209`；Platform `91bc3655ebd3648cb8f8ccddfacb5628bdeb1c5c`。 机器唯一事实源为正式BFF `contract/openapi/v1/openapi.yaml`；原Resolve六字段及现series GetSkill不变。

闭集同源：POST `/api/hub/skill-shares`→POST `/v1/skill-shares`；GET `/api/hub/skill-shares/{share_id}`→GET正式同路径；GET `/api/hub/skill-shares/{share_id}/skill`→GET正式nested路径。拒其它method/segment/query、GET body及任何Idempotency-Key。POST只接受strict source_ref/可选expires_at，无自动重试；无DELETE UI，owner撤销资格不扩大。

成功strict `{data:...}`：Create201/Resolve200的share_id/source_ref/url/created_at/expires_at/revoked_at完整六字段，创建核原source_ref且未撤销/未过期；url只接受当前可信浏览器同源、exact `/skills/shared/encodeURIComponent(share_id)`、零query/fragment，不改写服务端URL。Nested200精确share_id/source_ref/skill；skill含实际skill_id/series_id/decimalrevision/display_name/description/tags/example_prompts/category_keys/created_at/updated_at/owner_type/source_kind，optional original_name/author/cover_image，按机器strict，不接受private locators/current/installed/usage或未知字段；source_ref=skill:skill_id，cover仅actualUID path rewrite。

错误按正式三个operation各自response.status与SkillProductErrorResponse实际闭集，不通用enum×任意status、不把IAM失效当notfound；保request-id/no-store/Retry-After存在时合法校验。无conversation匿名读取，分享页可信session未admitted不发业务；anonymous显式正规login return_to，unavailable可重试且不授权。

每次JSON含fetch/body总10秒、累计1MiB/fatalUTF8、finally cancel/clear/迟到body cleanup；同源adapter保持Origin、在线session、可信tenant/subject、取消/timeout、请求body≤65,536bytes。分享reader沿现revision package GET/file_path闭集与既有字节预算，不扩任意转发。return-target新增仅canonical `/skills/shared/{合法share_id}`，无query/fragment/外链/双decode；新页不借/shared conversation。

共享 summary 不携带下载句柄；正式独立 browser-private policy 已有零字节 POST `/browser/v1/skill-shares/{share_id}/download`。同源仅映射 POST `/api/hub/skill-shares/{share_id}/download`；禁 query/key/TE，CL absent 或 0，ACK strict source_ref/revision/download_info(download_url/filename/expires_at)，绑定摘要实际 UID/decimal revision。`download_url` 只接受 `/skill-downloads/{43字符opaque handle}`，明确同源映射现字节 route；不调用 series current DownloadSkill。资格与字节读取总预算各 10s（BFF startSkillRequestBudget 默认 10s 含 pipeline），字节 route 拒 redirect，ZIP/attachment/长度受限，累计上限沿 BFF spool 1GiB，流式背压/取消/超时/迟到 cleanup，不缓存整个 ZIP。错误资格沿 policy 独立 504 deadline 闭集；字节 handler 保真实 410/Gone 等既有失败，不当成功保存。安装使用现正式独立客户端和strict19-field安装事实，不复制API、不用summary制造ACK。snapshot/资格准确文件清单见本任务TECH前缀，原历史测试语义不删。

<!-- END:T-K03.14-WEB-SHARE-D0 -->

<!-- BEGIN:T-K03.14-WEB-GITHUB-IMPORT-D0 -->

## T-K03.14-WEB-GITHUB-IMPORT D0（2026-10-10；目标，尚未实施）

当前Web `745f273` 保留已验收local-import、独立真实包reader和revision安装；GitHub仍为self伪路径、旧URL直接Import及合成installed卡片。Root正常浏览器已证旧Import404，未创建draft/install。目标消费正式BFF `486ec7e80e834471878dd031553571d7f16c03bd` / public `13.2.0` / canonical OpenAPI SHA256 `3e4dd272fa8180b8f2a2bacc88d37f99ed5c77eaba05ef03e858ab766f891206`，Platform `4f7501b`；以下为批准设计，不表示代码、generated pin或浏览器已接通。只加此前缀，下面原mixed全文逐字节保留。

### 唯一机器源与同源闭集
机器源为正式BFF `/Users/nako/.codex/worktrees/kokoro-r257-bff-normal/contract/openapi/v1/openapi.yaml` 的 `previewGithubSkill` / `importGithubSkill` 及 `src/http/routes/skill-github-import.ts`。Web新增两精确browser-private POST：`/api/hub/skills/github/preview`→`/v1/skills/github/preview`；`/api/hub/skills/github/import`→`/v1/skills/github/import`。旧self伪路径保持拒绝，不alias/fallback；拒其它method/segments/query，JSON请求累计≤65,536bytes，保Origin/在线session/可信上下文。

Preview exact `{repository_url,path?}`，无Idempotency-Key；200 `{data:...}` strict联合：selection_required=true仅repository_url/commit/paths；false仅selector/metadata/repository/content_sha256/size_bytes，按机器完整nested schema与实际绑定验证，不复用旧GithubImportResult。Import exact四字段owner/repository/commit/path，必须单一合法原Idempotency-Key；201 strict七字段skill_id/source_ref/status=draft/state_version/valid=true/content_digest/manifest_identity，source_ref必须绑定skill_id，state_version是正signed64 decimal。13.2五处path上限256字符已与运行selector一致；owner archive UTF8相对文件路径含文件名256bytes是另一边界，不放宽它；历史provenance/URL上限不机械替换。

现PublishDraft携带明确audience=owner与Import ACK expected_state_version；现Install使用真实revision source_ref。成功ACK逐项核资源/状态，不拿series作安装source。Preview/Import的SkillProductErrorResponse与实际admission/runSkillRoute错误按operation×status闭集：400 invalid_skill_request、401 session_authentication_required/session_invalid、403 service_auth_failed/session_forbidden/product_tenant_forbidden/skill_forbidden、404 skill_not_found、409 skill_idempotency_conflict/skill_command_in_progress、412 skill_precondition_failed、413 request_body_too_large、429 session_rate_limited/skill_rate_limited、502 skill_response_invalid、503 product_tenant_not_configured/iam_admission_unavailable/skill_dependency_unavailable；拒旧dotted alias与code/status错配。Publish/Install保持各自现正式错误族，不串用。

每次网络请求10秒总deadline包括fetch与body读取，累计响应≤1MiB，fatalUTF8/JSON、严格envelope、request-id/no-store；取消/超限/失败finally cancel，迟到response也清理。Preview不自动发写，Import未知不得换selector/key重试。

<!-- END:T-K03.14-WEB-GITHUB-IMPORT-D0 -->

<!-- BEGIN:T-K03.14-WEB-LOCAL-IMPORT-API_CONTRACT-D0 -->

## T-K03.14-WEB-LOCAL-IMPORT D0（2026-10-10；目标，尚未实施）

当前 Web main `3d2b419f971aaa3478b22d7f4e96f34190dff79b` 已有真实目录/包reader/安装动作；普通目录上传仍调用旧preview/confirm，个人设置的新建仍手填个人publish元数据，两者尚未消费正规local-import。事实源为正式BFF `939bf0e1da98a313233a923c6aa55481d06f5aca` 与Platform `32666c1c18360e707048a1104efe6b50e375002f`；既有协议已足够，不新增owner API/RPC/SQL/依赖。此D0仅新增本具名前缀，下面原mixed全文逐字节保留，不表示实现或浏览器验收通过。

### 唯一机器/运行事实
BFF browser-private/version1：`src/http/routes/local-skill-import.policy.ts`、`local-skill-import.ts`、`src/http/local-skill-import-input.ts`与`src/infrastructure/clients/platform/local-skill-import-response.ts`；Platform既有`SkillCatalogService`四个LocalSkillImport RPC及source/local-skill-import.state/service是状态机事实。不将本browser-private操作塞入Public13.1 OpenAPI或另建可编辑owner契约；现generated pin不动。

Web目标唯一 `/api/hub/skills/local-imports` POST、`/{intent_id}/complete` POST、`/{intent_id}/finalize` POST、`/{intent_id}` GET，精确映射BFF `/browser/v1/skills/local-imports`对应路径。closed method/segments/query与一次decode的安全ID；写请求必须单一合法idempotency-key、fresh Origin/session/可信BFF头，身份不从body自报。GET无body/key；Finalize必须实际零body，拒JSON{}，不套个人Publish audience/CAS。Begin/Complete JSON≤65,536 bytes，所有响应累计≤1MiB，fatal UTF8/JSON媒体/no-store/request-id/strict未知字段失败闭合。

Begin输入exact(filename,size_bytes:number正safe integer,content_sha256小写64hex)；文件名≤255、无路径/控制字符、满足owner小写.zip/.skill后缀。Begin201返回intent_id/skill_id/phase=upload_pending/upload_id/transfer_reference/expires_at/replayed。Complete exact(upload_id,source_version_id,size_bytes,content_sha256)；源版本只能真实PUT x-amz-version-id或owner Get已完成proof，不能生成/从URL推算。Complete200含intent_id/skill_id/phase=uploaded/upload_proof/scan_state/expires_at/replayed；proof的upload/version/size/hash与原冻结命令逐项核对，scan只接受pending/clean/infected/unknown。

Finalize200 strict data(intent_id,phase=completed,skill,installation,replayed)，完整skill采用实际SkillProductRecord projection（包括package_phase，不能误套少字段managed envelope）；安装采用现完整personalInstallation schema。核intent/预留series、skill.source_ref与skill.skill_id、skill↔installation的source/series/decimal revision、个人active/owner事实，再显示实际结果。不合成示例/标签/名称，也不把首次series=revision偶然相等当规则。

Get200 strict data(intent_id,skill_id,phase,expires_at，按phase可选upload_proof/rejection_code/skill/installation)：upload_pending无proof；uploaded/rejected/completed有真实proof；rejected需rejection_code；非completed不含skill/installation；completed必须skill但installation可缺失；expired不臆造proof。Get没有replayed/transfer/upload_id独立字段/scan_state。Get completed installation若缺失或已停用，展示实际事实，不根据phase造安装成功。

错误按四operation实际code/status闭集，引用当前route/admission：400 invalid_local_skill_import_request/local_skill_import_idempotency_key_required，404 local_skill_import_not_found，409 local_skill_import_idempotency_conflict，412 local_skill_import_precondition_failed，413 request_body_too_large，429 local_skill_import_rate_limited，502 local_skill_import_response_invalid，503 local_skill_import_dependency_unavailable，加fresh admission/IAM精确状态代码。GET不挂写skill action，写核create_draft+install。拒任意异常message码与personal/official别族错配；Web本地拒绝用本片闭集，不把缺字段、412或未知状态转空/成功。

BFF本身Get2s、Begin/Complete10s、Finalize20s总界；Web GET/Begin/Complete各10s、Finalize20s单请求总预算覆盖admission/fetch/body，边界不得重置计时；对象PUT本片20s（现publish仍60s），严格消费owner transfer.url/method/required_headers/expires_at，credentials omit/redirect error/no-referrer，真实version头校验、非成功不Complete。caller取消、慢不close/超限body、迟到fetch/reader需finally清timer、取消/释放body，不能只Promise.race而遗留请求。

验证精确四path/status/shape/identity/proof绑定，Finalize零body、错误族错配、unknown原key/body、Get各phase/缺installation、账号切换/locator过期/无File、慢流/超限/取消，以及两入口同一真实普通上传。保旧publish完整60s/ACK测试，不能因提取PUT破坏已有版本包链。

<!-- END:T-K03.14-WEB-LOCAL-IMPORT-API_CONTRACT-D0 -->

<!-- BEGIN:T-K03.14-WEB-CATALOG-PACKAGE-DETAIL-API_CONTRACT-D0 -->

## T-K03.14-WEB-CATALOG-PACKAGE-DETAIL D0：真实目录包详情目标（2026-10-10；待实施）

当前 Web main `d2545a34cc2f9bbc4aa991b93fde773db555e2d5` 已显示真实目录/摘要，品牌与分类一致；“查看详情”包 reader 尚未接通，同源目录 package 读取仍404。本前缀定义待实施目标，不作为业务已生效/浏览器验收证据。BFF正式 `939bf0e1da98a313233a923c6aa55481d06f5aca` 已有 public `GET /v1/skills/{skill_id}/package`（getSkillPackageDirectory），经 `publishedSkillPackageInspectionRoute` 调 `ProductSkillReadService.InspectSkillPackage`；Platform物理 `apps/kokoro-capability` 正式 `32666c1c18360e707048a1104efe6b50e375002f`。不新增 owner API/RPC、依赖或持久化。下面原 mixed 全文逐字节保留。

### 唯一机器事实与同源边界
字段事实引用 BFF `contract/openapi/v1/openapi.yaml` 的 `getSkillPackageDirectory`、`SkillPackageInspectionResponse/Data/File/SelectedFile`；成功为strict `{data}`，错误引用该operation的 `SkillProductErrorResponse`，不误用 self/installation 专属 `SkillPackageInspectionErrorResponse`。行为核对同仓 `src/http/routes/skill-download.ts`、`skill-drafts.ts` 及 `infrastructure/clients/platform/skill-package-inspection-response.ts`；Web既有generated pin不变，不维护另一份owner契约。

目标private exact `GET /api/hub/skills/{revision_skill_id}/package` 唯一映射正式 `/v1/skills/{skill_id}/package`；参数取owner `currentVersion.versionUid`，不是series。只容许一个可选非空 `file_path`，一次decode、不trim/二次decode；拒绝alias、非GET、未知/重复query、body/content-length（含0）/transfer-encoding/idempotency-key，沿现Origin/session/受信头/超时取消规则，不转发浏览器identity。

成功/嵌套未知字段失败闭合；source_ref须等于 `skill:{请求revision_skill_id}`。data.revision为正uint64十进制（非URL Skill ID）；size_bytes为含0的uint64十进制。最多128文件，安全NFC路径UTF8≤256 bytes，无绝对路径/drive/反斜杠/BOM/NUL/空段/dot/dotdot；目录严格排序且唯一。目录请求selected_file=null；文件请求selected_file.path精确等于请求且唯一在files中，text为合法Unicode，其真实UTF8 bytes等于列出size_bytes，保留空文本、BOM与行尾。后续文件响应须与已展示目录source_ref和decimal revision一致，错配提示刷新而非合并。

目录是owner认可的UTF8文本集合，不是ZIP全量binary文件目录。错误按该operation实际400/401/403/404/409/412/413/429/502/503及对应code闭集测试；实际`runSkillRoute`/admission错误与Web本地失败分别校验，禁止通用enum×status、fallback或把412/坏响应转空成功。JSON媒体/no-store/request-id、响应累计1MiB和10秒全请求预算均需验证；不暴露token/内部URL/owner异常。

D0后先Root精确授权现文件，再以真实函数/同源route RED→GREEN；当前机器契约不改，浏览器结果待Root后继验收。

<!-- END:T-K03.14-WEB-CATALOG-PACKAGE-DETAIL-API_CONTRACT-D0 -->

<!-- BEGIN:T-K03.14-WEB-SKILL-READ-CONTRACT-API_CONTRACT-D0 -->

## T-K03.14-WEB-SKILL-READ-CONTRACT D0：当前读取消费纠偏（2026-10-10；目标，待实施）

当前态为 Web main `2e69b3b63ad4ac935752e4ad0b69ee1ce964f564`；Root 正常浏览器 ListHubSkills/ListSkills HTTP200但严格解析失败。正式 BFF `939bf0e1da98a313233a923c6aa55481d06f5aca`、Public13.1机器契约不变（既有 canonical digest `418db9504b179d29113385f334628d304130491d4bbc86169e20c712cf2cd045`）。此片目标尚未实施/验收，下面既有设计前缀和 mixed 原正文全部逐字节保留；本片仅纠正现有 Skills 读取消费者，不增加 owner、协议、数据库或进程。

### 唯一事实源与可见性
完整读响应的唯一 owner schema 为上述 BFF commit 的 `src/http/skill-specification-schema.ts`（websiteHubResponseSchema、websiteListResponseSchema、websiteSkillSchema）；运行投影为 `src/application/skill-specification.ts`，HTTP envelope/下载 handle 由 `src/http/routes/platform-projection.ts` 发出。Web 现 `/api/skill.v1.SkillOptionalService/{ListHubSkills,ListSkills,GetSkill}` 与 `/api/skill.v1.SkillService/DownloadSkill` 仍是既有 browser-private adapter，不新建 public operation，不把消费 validator 当可编辑 owner 契约。

Web 严格承接完整 Hub item/icon/source/currentVersion/tags/tagOptions、完整 installed/official 嵌套对象和完整 detail/download 三字段资格响应；按照 owner schema 的字段类型与可选性解析，identity 为读取必要条件且 Get/Download 必须与请求 skillId 匹配。各操作成功/envelope保持原 owner 形状，不用泛化 passthrough、不静默 strip owner 字段。未知字段、坏类型或资源错配失败闭合；错误形状与状态按当前操作和同源 adapter区分，坏响应不得变空目录或可下载成功。

Hub/tagOptions 支持正式第八类 SKILL_HUB_TAG_APPS，分类投影为 apps；不扩其它公开请求 schema。安装 membership/added 与 enabled 是不同事实，已安装但禁用仍 installed=true、enabled=false，official added 不覆盖本人 enabled。GET 封面 private exact `/api/hub/skills/{revision}/cover` 唯一映射正式 `/v1/skills/{revision}/cover`；revision 来自已绑定 owner coverImage/current version，不建立 series alias 或外部 URL 代理。未知路径/非GET/body/query/身份失败按闭集拒绝。

### 门禁
具名真实四响应、嵌套完整字段、unknown/type/identity负控、apps、图片字节/媒体/Origin/session/revision绑定测试；Root pin/artifact不变，五 mixed 仅新增此前缀之外原正文保留。Root 真实浏览器目录/详情/安装/下载/封面仍待后继验收，不以 HTTP200 或 unit fixture 称完成。

<!-- END:T-K03.14-WEB-SKILL-READ-CONTRACT-API_CONTRACT-D0 -->

<!-- BEGIN:T-K03.14-WEB-PUBLISH-API_CONTRACT-D0 -->

## T-K03.14-WEB-PUBLISH D0：固定 Public13 发布与恢复消费（2026-10-10；目标，未接线）

当前 Web commit `3c59071d8188f025b3d7b7683bb2d8560ceaa0fa` 消费 public8旧snapshot，strict ACK漏state_version，三写缺CAS、PUT丢版本、Complete缺对象版本、Validate旧zip-v2、Publish零body且route拒绝JSON。目标引用已批准BFF D0 `8889701`：正式public13.1.0，URL仍/v1；正式实现 SHA 与 canonical artifact digest 已由 Root 固定，见本前缀末正式 pin；不使用变化中的 worktree 充当已验收 current。本前缀只确定目标，原mixed正文保留，不宣称生成/部署/验收通过。

Browser business请求继续只走同源`/api/hub/self/skills/*`与已发布本人managed读取；BFF唯一维护public机器事实，Web snapshot原字节固定后只读。不能从release整包恢复替代Admin/契约或建立第二可编辑contract。变更同源route时去掉旧Publish零body专门限制，替换为已发布精确JSON请求解析；保Origin、Product Session、有限字节/时间、取消、request ID及全部非self/legacy路径拒绝，不放泛化/manage命令。

| 操作 | 目标请求/版本来源 | 成功消费 |
| --- | --- | --- |
| CreateDraft | 原正式metadata；无CAS，不从base推算 | exact owner resource，包括state_version与skill/series/revision/status/replayed |
| Get package-upload | 同本人skill，只读无mutation key | exact phase/attempt_epoch/可选attempt/upload/source_version_id与required state_version |
| Begin | 原filename/MIME/size/hash、mandatory expected_state_version，replacement可选真实旧attempt | required state_version、attempt/upload/epoch、短期PUT reference与replayed |
| PUT | 引用批准URL/method/required headers，原File；omit credentials、拒redirect、no-referrer、允许的HTTPS或既有loopback开发边界 | 实际响应x-amz-version-id；PUT不产生Skill CAS |
| Complete | 原attempt/upload/hash/size、required source_version_id与mandatory CAS=Begin ACK | exact uploaded/scan_state/hash/身份及required state_version |
| Validate | 原attempt_id、mandatory CAS=Complete ACK | valid/skill/series/content_digest、current skill-md-v1:sha256:[a-f0-9]{64}、replayed及state_version |
| Publish | strict JSON explicit audience=owner/tenant/catalog，required CAS=Validate ACK；其它字段严格按固定owner契约 | ACTIVE source_ref/revision/event_id/replayed/state_version；不保空body路径 |
| 本人managed list/detail | 正规本人资源，支持真实draft选择及权威恢复读回 | exact owner status/series/revision/product/state_version等完整当前shape，不用旧七字段ACTIVE或安装态代替 |

CAS/state_version为canonical positive decimal string，1..9223372036854775807；数字/null/0/leading-zero/溢出拒绝。attempt_epoch继续按owner unsigned64与none/epoch0单独解析，revision不是CAS。source_version_id只采用真实ACK/owner已完成readback，非空、非null字面值与字符/长度严格固定owner规则；缺header、不可见CORS header或畸形值不能继续Complete，不剥版本字段适配旧parser。

媒体/状态/headers/envelope/object均closed；成功/失败状态逐operation遵循固定owner error family，不能建立万能错误enum或strip额外字段。实测skill_forbidden/401/403必须保持owner授权拒绝语义；412 skill_precondition_failed、409冲突/in-progress与502坏owner/503依赖保持可区分，最终合法code/status组合以正式13artifact和owner当前runtime验证，不用未发布枚举替代事实。未知错误或坏ACK失败闭合、不得空列表/preview/成功；Web不降低IAM/BFF准入或添加token权限缓存。

每阶段首次发送冻结body/CAS/key及资源和身份代际；重试/ACK丢失只重放同body/CAS/key。GET最新CAS不准写回原intent；异body/CAS同key不能借本地更新绕owner冲突。未知Publish先本人managed权威核对；仍未确定时展示未知并仅显式原意图恢复，不自动换key或创造成功。刷新丢key不称旧重放；owned draft/upload事实可重建观察，用户显式新replacement用新key与真实当前CAS，uploaded/validated沿owner已完成身份事实核验，不把Get当原command receipt。

后继验证覆盖六类ACK版本、signed64边界、各mandatory字段、PUT真实版本与CORS缺失、source/attempt不匹配、current manifest、Publish显式JSON与audience/CAS、每阶段原body/key重放、刷新/撤权/取消/迟到；snapshot精确版本/commit/digest测试绑定最终发布，不修改原mixed大型OIDC test。此阶段只设计，无契约/Schema/test通过声明。

### 正式目标 pin 与本人读取闭集（2026-10-10）

正式 BFF public 13.1.0 为 `2f3678736287241bbe620e087ab3b0da95fd2fb8`，canonical OpenAPI SHA-256 `418db9504b179d29113385f334628d304130491d4bbc86169e20c712cf2cd045`，136 个 operation；URL 仍 `/v1`。本片消费者从该正式 commit blob 原字节生成只读 snapshot；13.1 仅补实际命令授权链 403 `skill_forbidden`，Get/managed 不扩该错误，授权路径不变。此为批准目标引用，不代替 Web 当前工程门、真实对象链或浏览器验收。

本人读取唯一 browser-private 路径为 `/api/hub/self/skills/managed?status=draft|active&limit=...&cursor=...` 与 `/api/hub/self/skills/managed/{skill_id}`，分别精确映射 `/v1/self/skills` 与 `/v1/self/skills/{skill_id}`；static managed 优先，GET-only、闭集 query、重复参数/未知参数拒绝，detail 禁 query。正式 owner 已移除旧 `/v1/skills` list/detail，故本片删除对应旧 private published 路由、旧七字段 wire/schema/ref；本人已发布读 managed `status=active`，草稿读 `status=draft`。目录 `/v1/skill.list` 独立，不能代替本人事实；无 alias/fallback。成功与错误严格保留 managed `meta.request_id`，同 header 绑定。没有 package phase/hash/receipt 的 managed read 必须继续 GET package-upload，不合成字段。

当前安装消费者同片精确对齐正式 SkillInstallation 19 properties / 16 required，list/get/三 mutation 复用严格当前 resource、optional publisher/update 与真实 product 字段，完整保留 installation/source 身份绑定、原 body/key、状态与错误 family；403 skill_forbidden 仅三 mutation，list/get 不扩。不得省字段、passthrough 或把 HTTP 安装回执当浏览器成功。

<!-- END:T-K03.14-WEB-PUBLISH-API_CONTRACT-D0 -->

## R256-ADMIN-01：当前管理员资格消费契约（目标，尚未接线）

Web 下一消费者固定 BFF `ac3cd1da4f13e9e22320efbd4dbf4009aa0a2e29`、public `8.0.0`、canonical OpenAPI SHA256 `cec91c36c836319af4acbb4e2cf372434b70dd0f52bdf266420e1957057ac4be`。`GET /v1/me` 成功 `data` 必须 strict包含 `tenant_id`、`user_id`、`platform_admin:boolean`；缺字段、额外字段、身份不一致、非JSON/错误media、无 `no-store`/request ID、错误状态或依赖不可用均失败闭合。普通用户的合法结果是 `platform_admin:false`，不是登录失败。

Web callback 与 refresh 只接受这一新完整 shape；不保留旧两字段 union/default false。正常页面每次资格判断从受信 Product Session 向BFF fresh读取，不接受 query/body/header/cookie/JWT/email/Team role 自报。Settings只在当前值严格为 `true` 时显示唯一 `/admin` 入口；匿名、`false`、pending、error、撤权或主体/代际变化隐藏。`/admin` 页面及管理 same-origin API独立重复server gate：匿名按现登录边界处理，已认证但无资格拒绝，owner依赖失败保持可区分且不可沿用旧 `true`。浏览器隐藏不构成权限证明。

后继 breaking 接收采用 owner immutable snapshot正规生成与pin，不手改generated。当前正常 IAM 有数据演进、BFF/Web strict消费者和服务切换必须同一受控窗口；不运行新IAM配旧消费者或反向混搭。真实验收包括普通false登录/callback/refresh、管理员true入口/直链、撤权后现页与新请求拒绝、A→B/null与迟到响应，以及各管理owner自身授权；仅页面准入不证明任何CRUD权限。

---

## R257-MCP-WEB-D0：本人 Connection browser-private 消费契约（2026-10-06；仅设计）

当前live Web读的是BFF `/v1/mcp/servers`的Server declaration。目标same-origin `GET /api/hub/self/mcp/connections`只转发到待发布BFF public 8.0.0同名GET；BFF目前只有D0 `d776194`，机器/source/immutable commit与digest待Root固定，故本节不是pin或发布声明。Browser不直连Platform，不接受Server旧shape兼容。

输入closed为可选且单值`connection_id/provider_key/limit/cursor`：connection_id匹配`^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$`；provider_key为1..191 code points；limit仅无符号十进制1..100；cursor为1..2048 opaque。未知、重复、空、越界、body、transfer-encoding或Idempotency-Key拒400且零BFF调用。filter变化丢弃cursor/page历史，从首页读取；Web不解析cursor。

200严格`{data:{connections:[...],next_cursor?:string}}`，所有object closed；每项required且只含：`connection_id`、`connector_id`、`server_id`、`provider_key`、`transport:"streamable_http"`、`status:"active"`。三个ID各自opaque，不能互代；不返回name、URL、declaration、secret、scope、token、proof或工具权限。多Connection可指向同Server且不得合并。terminal page省略next_cursor，不接受null/空串。

所有响应必须JSON、`Cache-Control`含no-store及合法`x-request-id`。错误只接BFF固定closed envelope；当前Session admission的401/403/429、输入400、owner-invalid 502、dependency 503各自保留，不透传内部detail，不把任何错误改empty/preview。browser伪造tenant/subject/service/request身份不转发；adapter只使用每次当前Product Session派生的server headers。

browser Hub client对此operation使用一次10秒总deadline与1MiB成功/error body cap，范围包含同源headers、body、fatal UTF-8、JSON和strict schema parse；超时、超限、取消、非法UTF-8或shape错误不得落入legacy宽松`readError`或无限`response.json()`等待。

组件消费完整六字段用于strict验证，但主界面保持简洁Card：主信息为provider与人类可读连接状态，opaque connection/connector/server ID只在次要详情，transport仅按需辅助；不把六字段机械排成debug表，不显示内部permission、declaration、secret或owner诊断。loading/error/empty/ready与显式前后页保留。当前actor/filter/cursor/generation共同绑定请求；取消、卸载、重试、翻页、filter或actor变化后旧结果退役。empty仅为当前本人读取事实，不表示未安装Server、无第三方权限、费用状态或连接命令成功。后台`/admin`资格与此本人读取无耦合。

机器事实源仍是未来固定的BFF `contract/openapi/v1/openapi.yaml`原字节；Web本地Zod是consumer narrowing，不成为第二public contract。固定pin、生成、源码与测试路径见TECH。当前tab11 Servers 200只证明wrong-resource RED，不是本契约正控。

<!-- R257-MCP-WEB-D0-API-END -->

## T-C01.R255-PRESET-RETIRE（06:12）：退役未发布目录消费者，不改公开 agent 字段

本前缀记录实施前的 D0 目标，冻结时生产仍发旧目录请求，现已完成本片源码静态退役；仅覆盖旧 preset 目录/选择说明，原 suffix、公开 agent 字段和 generated pin 保留。Root 已实际观察 workspace、Settings、hard refresh 零旧 agents 请求与 models 200 真空目录（不是模型可调用、切换保存用户链通过）；最终工程 65531 仍在运行，实际当前验收见 docs/CURRENT.md，不预报最终工程或整组 PASS。

### 唯一契约来源与当前缺口

继续固定现 BFF public 8.0.0 artifact：owner commit 45e67f0e783fb4bcdb086665a09b7c3c5fadbb6f，canonical contract/openapi/v1/openapi.yaml，blob 1b42d49388ca26eaaef7371daf23cbf1158d5fe6，SHA256 0802a31f9469a17cd8fc8b78e6d2326e0571bc93f3ac8d19811a42a1b185df95；Root 本地接收 ef2d306。Web src/generated/bff-public-openapi.yaml 与现 generator pin/派生物均不修改；本地 artifact 不等于 remote 发布或 normal activation。

D0 冻结时 handwritten catalog.ts 的 AgentCandidate{name,description,is_default} / agents 列表、agentCandidatesPath() 与 SessionClient.listAgents 不对应任何正式 BFF GET /v1/agents 或 Agent GET /agents。Root 裁决删除这组 Web browser-private 假定，不用空目录 200、fallback 或模型/Skill 映射掩盖 404。模型 GET /models 消费不变，信任上下文、通用 /api/session adapter、BFF routing 和任何 owner HTTP 路由都不在本片修改范围。

### 目标请求与保留合同

- 正常工作区、Settings 不再读旧 agents 目录；删除该客户端方法、路径、候选 schema、preview 目录响应及 UI 调用。
- Web composer 不再生产可选 agent：其消息继续包含 canonical idempotency_key/content/thinking/selected_skill_source_refs，按原规则附 model、project_ref；其他受信身份与既有合同不变。删除的仅是该 UI 的 preset 输入，不使 BFF 公开字段非法。
- src/contract/chat.ts 中 MessageCreate.agent 和 contract/api-contract.test.ts 原合法 agent 输入断言必须保留。后继在该既有测试补“不带 agent 的消息也被接受”，与 execution-adapter/engine 的“不再生产 agent”断言分层，禁止修改 owner OpenAPI、pin 或 generated 来制造绿灯。
- unknown-ACK 重试沿原 pendingSubmission，保同 key/完整 body 等值和有效模型、mode、Skill、project 参数；不在 retry 时重新读取偏好或重组意图。
- /app/agents 与 /api/agents/[...path] 的连接 setup 保留，后者仍消费正式 /v1/agents/connections/setup。现 tests/system/agent-route.test.ts 是独立路由保护，不因删除目录而删除；其 owner setup 404 未决不在本片关闭。

后继同步三个旧说明 docs/integration/business-bff-contract-v1.md、chat-bff-contract-v1.md、user-web-api-contract-v4.md 的目录/preset 声明，明确不再消费，不新建第二合同。Root 验收应分别核工作区和 Settings 零旧目录请求、模型仍可用、消息/重试 body、独立 setup 路由保留。测试仅使用明确 fixture；真实浏览器与真实 owner 组合分别记录，不拿 fixture 冒用户 E2E。本轮只写三 D0 前缀，未运行契约或工程门。

---

## T-P02.R255-WEB-NEXT：ScheduledTask recurrence/next 契约消费者（本地候选，normal 未激活）

固定前置为 BFF local immutable artifact：commit `45e67f0e783fb4bcdb086665a09b7c3c5fadbb6f`（源码父提交 `e603bd55`）、canonical `contract/openapi/v1/openapi.yaml`、Git blob `1b42d49388ca26eaaef7371daf23cbf1158d5fe6`、public `8.0.0`、全文 SHA256 `0802a31f9469a17cd8fc8b78e6d2326e0571bc93f3ac8d19811a42a1b185df95`。Root 本地交接 commit 为 `ef2d306`；该 artifact 尚未 remote push、registry 发布或 normal BFF/schema 激活，因此这里只记录本地发布接收与消费者候选，不冒称线上或当前正常服务已经生效。Web 冻结基线为 `97a79d45f93a6007fb0f37002372fd503cd0d373`。

`ScheduledTask` 必有 `id,title,prompt,frequency,time,timezone,next_run_at,auto_approve,enabled,status`；`next_run_at` 严格为 UTC `date-time` string 或 JSON null。字段缺失、offset 非 `Z`、date-only 与未知字段均失败封闭。null 表示 owner 当前没有已确认下次执行时间，Web 不合成日期；合法 string 原值映射到 `nextRun` 并仅用于既有显示和日历分组。

`CreateScheduledTaskRequest` 保持五个 required 字段 `title,prompt,frequency,time,timezone`，可选 `recurrence_anchor_at`，不再允许输入 `next_run_at`。`ScheduledTaskPatchRequest` 是 closed object，显式允许 `title,prompt,frequency,time,timezone,recurrence_anchor_at,expires_at,auto_approve,enabled,status`，均可选且不允许 `next_run_at`；`expires_at` 继续允许 null 清除。当前 editor 没有 anchor 控件，合法省略且不得计算代填；collection/path/idempotency/error envelope 不变。

唯一 snapshot、两 generator 与8个 whole-public pin 已切到上述 commit/digest；runtime contract、mapper及列表/日历 actual `Response` 反例已实现。当前辅助 focused 148项通过；正常 IAM/BFF 的真实响应与浏览器新建/暂停/恢复/hard-refresh 仍需 Root 在 normal source/schema 安全激活后验证。

---

## T-B03.R255-WEB-CREDIT：当前消费者源码候选（待Root集成与真实用户验收）

当前切片只消费个人可用余额/预占及owner journal，不再读by-model或推导Free、每日赠送、quota、低余额阈值。固定BFF `97a99d35c8c78e7ca6e1370fd16ba5d670766095` / public `8.0.0` / OpenAPI全文SHA256 `33971eaa8b43e8aa85a8eef8c3b99e42f0999fe3136dc129705beb7e8bb0e2f4`，owner正式blob原字节复制，现两个generator正规派生；不双读旧wallet。

现 `/api/session/billing/summary` 与 `/api/session/billing/ledger` 复用可信session adapter。strict closed账户/流水data保十进制字符串、BigInt显示尺度10^6与owner UTC Z瞬时点（按用户locale/本地日历展示），disabled展示owner只读值；404/503是error而非零余额。每读10秒总预算覆盖headers/body/parse、真实abort及reader释放；mounted panel独立loading/error/ready，刷新撤旧投影，分页单flight、显式同cursor重试、null终页、重复cursor拒循环与journal去重。现主体marker仅退役结果，不赋权限、不建第二store。

Account与rail popover未知套餐均占位，保身份/订阅入口及原布局；preview仅显式fixture，不是live失败fallback。此节覆盖下方历史消费者状态，原mixed正文不修改。三面D0已批准、D1行为反例已由Root复跑；当前生产/测试候选待Root工程复验、独审与提交。真实Billing账户200、余额/流水翻页/刷新/跨主体浏览器验收尚未执行，正常503退出loading不证明资金旅程完成；70组台账不虚增。

---

## T-B03.R255-WEB-CREDIT-D0：个人余额与流水（Root批准设计前缀，生产未授权）

本节覆盖下方历史个人余额/quota/free/by-model消费者描述，不覆盖任务外mixed内容。阶段为D0三面设计收口，尚无生产、测试或生成修改许可，不以文档宣称页面完成。Web基线 `e8ff7599a62b045b0e7a3d20e8fd50894b31a099`；固定前置BFF正式commit `97a99d35c8c78e7ca6e1370fd16ba5d670766095`，public OpenAPI `8.0.0`，源 `contract/openapi/v1/openapi.yaml`，全文SHA256 `33971eaa8b43e8aa85a8eef8c3b99e42f0999fe3136dc129705beb7e8bb0e2f4`。不可沿mutable main、旧f3c64d90 snapshot或旧wallet shape双读。

Root正常HTTP证据：正规IAM登录后 `/api/auth/session` 为200/authenticated；真实 `/api/session/billing/summary`、`/api/session/billing/ledger?limit=50` 均503 `billing_unavailable`、private/no-store且带request-id，当前Billing正常入口尚未启用。`/api/billing/me/*`不存在，其404不是缺账户业务证明。新合法200与旧Web schema不匹配属于已核静态消费者缺口，尚未取得真实账户200或Credits浏览器失败/成功证据。70组11通过/6失败/14待复测/38未验/1支付后置不虚增。

### 唯一browser-private读取契约

- `GET /api/session/billing/summary` 无body/query，映射 `/v1/billing/summary`。现adapter解包success data，DTO严格恰 `{credit_account_id:uuid,status:"active"|"disabled",available_micros,held_micros}`，两个micros为 `^(?:0|[1-9][0-9]*)$` decimal string。
- `GET /api/session/billing/ledger?limit=&cursor=` 无body，仅limit十进制整数1..100（缺省50）及opaque cursor长度1..2048，拒未知/重复/非法输入；映射 `/v1/billing/ledger`。HTTP参数转义后owner收到原cursor，浏览器不解码其业务结构/trim/重建。
- Ledger data严格 `{items:[{journal_id:uuid,sequence,delta_micros,balance_after_micros,source_kind,source_ref,created_at}],page:{next_cursor:string|null}}`；entry闭集。sequence/balance_after_micros canonical nonnegative integer string；delta_micros正式signed integer正则 `^-?(?:0|[1-9][0-9]*)$`。source_kind非空、source_ref非空且≤255；created_at为合法date-time UTC `Z`字符串，不旧epoch数值。page.next_cursor必有、null终页，字符串最长2048按正式schema，不私自换旧optional next_cursor。只有非空cursor继续取页，异常/重复cursor失败封闭，不循环。

summary/ledger data的schema只此一版：删除balance_micros/quota/period/plan/free/daily、entries/entry_id/reason/run/title/conversation_id与by-model旧消费者，不建立union/fallback。source_ref是owner业务引用，不是Conversation导航凭据，不能猜URL或补读其他owner。micros/sequence不Number化；BigInt显示移位10^6不是费用倍率/余额重算。disabled仍只读真实值，无默认active/free或合成总余额。

两读沿现Product Session/IAM admission，tenant/subject不从query/header/body自报；现session adapter保success unwrap、private no-store、合法x-request-id及稳定error。401/403、404 billing_account_not_found、429、502、503 billing_unavailable/invalid upstream等正式错误按code/status处理，不统一零余额/空流水。合法有账户零值与合法items=[]是ready，不存在账户/服务故障是error。浏览器不携Billing URL/SDK/service proof，保持同源API。现代码尚未改且本轮真实仅503，不以静态wire差异冒已有真实200 parse FAIL。

### 边界行为与阶段

client单GET10秒含headers/body/校验，abort/timeout/stale attempt不能准入结果；初读/刷新/分页失败明确退出loading并显式Retry同一读，无自动资金写或mutation重放。主体/准入/卸载变化先退役旧读取，严格header/media/data/schema拒绝，不能为新wire降request-id/no-store/权限。现session adapter正常路径不另造route。

Root随后授权测试actual Response证明新shape接受、旧shape拒绝与错误/取消，固定pin正常生成及既有contract门；真实正常IAM/BFF/Billing→Credits余额/预占/流水分页/刷新/错误与主体隔离才用户验收。现三D0均仅目标，未授权生产/生成；支付、赠送、usage定价及完整70组不因此关闭。

---

## R254-FOLDER-LISTS：专案嵌套与普通会话常驻（Root批准，2026-10-05）

Web只改变mounted view props与callback携带的固定来源scope/read identity，不改变BFF版本化公开/同源wire或generated。列表仍现owner GET，project_ref可空仍唯一归属，展开不创建Conversation/Run或发消息。普通组固定direct，expanded project组各自cursor；不得扫全量本地分组，不请求折叠组。

选行使用现canonical /app?conversation=ID 或 /app/project/P?conversation=ID；列表来源与正文当前scope不可混用。改名/删除/Move仍现SessionClient命令与closed ACK校验，来源scope来自group、tenant/subject来自已验证上下文；pending/unknown/timeout不伪删/搬行，不自动重发。matching ACK只按固定scope失效原索引并刷新已挂载source/target，折叠目标以后展开再读。scope/subject/实例fence禁止迟到数据串组或旧命令抢新选择。没有新API、契约owner、error envelope、idempotency语义或兼容alias。

本节仅R254目标；准入、权限、owner receipt及原网络契约仍现实现事实源。先现UI行为反例，再窄实现与Root真实owner/浏览器复验，不以辅助fixture绿称接口或整页闭环。

---

## R252 匿名首页输入回归修正（Root最窄补充裁决）

审查发现现stashPendingDraft把匿名首页提示混入未标主体的localStorage全draft map；首次verified准入清旧map会丢有效输入，直接保留未知map又会泄露旧主体草稿。选择保留原首页业务、分开显式用户本次登录输入：仅现use-draft的专用stash/consume与现landing开始动作创建一次性sessionStorage prompt handoff，不新增目录/认证cookie/URL参数/认证实体，不改Skills正常stash。现page-clients在verified identity/竞态fence成立后先清未知或跨subject旧map，再严格消费并仅预填__pending__；同subject保完整map但也消费本次显式输入，绝不自动提交。

handoff是closed [1, created_at_ms, trimmed_prompt]，300秒以内且非未来、非空、最大65536字符；这是本浏览器交接的新增有限输入防护，不冒现API已有限制。首页现Textarea同maxLength，空白开始也清旧handoff；consume先remove再strict校验，无效/过期不恢复、不fallback旧pending。恢复写必须严格storage set而非吞失败的persisted-store helper；任何storage失败不更新marker、不admit。普通tab隔离仅按sessionStorage语义，duplicate/window.open可能继承初始存储，不宣称防复制；无论如何只预填而不执行。权限仍来自正式session/BFF，不由prompt证明。

方案比较：淘汰废止首页草稿（有效业务回归）；淘汰marker-null保旧map（未知主体泄漏）；采用现draft职责内单次显式prompt交接。原9源之外仅追加现use-draft.ts、landing-page.tsx，现tests/ui/use-draft.test.tsx、landing-page.test.tsx及已准入page-clients测试；同仓原writer，Root三D0与Git独占。先现测试证明首次verified准入丢本次输入，再实施；所有旧actor数据/异步race/清理失败断言保留，最后独审与Root真实首页输入→登录→只预填验证。

## R252-WEB-AUTH-RETURN：browser-private返回意图（2026-10-05；Root批准D0）

仅Web /login GET新增可选单一return_to；无参数合法默认/app，有参数必须恰好一次且无额外query，单次解码后严格验证，畸形拒绝无导航。目标≤2048字符；path仅/app、现agents/plugins/scheduled/library/skills和canonical project_<loweruuid>，无encoded path/额外slash/absolute/protocol-relative/control/backslash/hash。不以“只pathname”丢会话或已选标签：/app和项目仅可选canonical conv_<loweruuid> conversation；scheduled可选tab=calendar|list及canonical project_id；Library保留现tab/type/q/view/favorites有限显示过滤（q≤512，view=grid|list、favorites=1，type按现UI真实枚举），其他页无query；重复/未知key或错误值拒绝。具体canonical serialization保持浏览器等价语义且MAC/消费一致；不恢复hash editor/自动mutation。

public /api/auth/signin/kokoro-iam仍仅form csrfToken；内部typed Context传经校验target，HTTP不能构造该字段，禁止私有header绕公开准入。现固定OIDC callback URL、scope/resource/issuer/code/queryexact/PKCE/nonce/三cookie/state/identity验证不变，target不发送IAM，不携tenant/subject/secret。所有验证成功才303 same-origin bounded target；Redis/签名/replay失败沿现稳定码及cleanup，不跳未验target。所有auth no-store/no-referrer、无target原值/query/token日志。角色与业务读写仍BFF/IAM current subject裁决，target不是授权。

## R251-WEB-SKILLS-V2：消费BFF public8.0（2026-10-05；实施准入）

唯一事实源是BFF正式f3c64d90f4a6fd7083252ff3d1646c5ad1dee292 OpenAPI8.0.0，digest278fc0a60516617d41c754b7957fadbcc77f9b6132fa9f1a8af9409464319d0f，仍/v1、91ops。仅版本和Validate manifest_identity严格zip-v2值域改变，其余五字段/请求/错误/权限/幂等不变；Web复制committed原字节snapshot，现两generator正规派生，手写六字段schema只V2。旧V1、坏digest、未知字段拒绝且零Publish；不改Hub严格header/media/admission，不以Validate当发布/安装成功。

本轮属已批准未上线clean-slate替换，不保旧snapshot/旧parser双轨；Team/failure生成pin精确更新，不手改输出。当前源码/生成未实施，真实整页Publish/Install未验。

## R186-W-SNAPSHOT-DEADLINE：browser-private读取预算（2026-10-04；tests-first）

同源snapshot请求及同一anchor的全部process-page请求共用固定10秒本地总预算，包含headers、body与严格schema解析；分页不得逐页获得新预算。耗尽是Web本地首次水合失败，显示现安全错误并只允许显式重读，不转换为owner error、Run terminal、空snapshot或partial成功，也不重发Message。scope/generation/dispose继续abort；公开BFF contract、请求参数、错误envelope与AG-UI stream wire均不变。

## R177-WEB-PRD-NO-INTERSTITIAL：无旧document Retry协议（2026-10-03；tests-first）

anonymous撤权后Web只发起一次固定`GET /login` document navigation；不新增本地错误envelope、ACK、轮询或重试command，也不把页面内beacon解释为commit。`/login`真正响应继续严格为空query/可信Host与Origin，成功只允许302到既有IAM authorize，预检/CSRF/signin失败为no-store受控503；旧App Runtime永不恢复。原R165的整页Retry期待与当前用户目标冲突，保留其失败证据，待新严格handoff成功链通过后由Root正式收敛验收而非skip。

## R175-WEB-ANONYMOUS：browser-private composition 不扩 wire（2026-10-03；tests-first）

不新增 API、header、cookie、redirect或readiness协议。可信 browser session `200 authenticated:false`仍立即撤销 Runtime，并由现固定 `/login` native document navigation接管；在该 navigation commit 前，已由server Product Session准入的旧document只允许显示无数据 booting壳，绝不显示旧Conversation/draft或发owner请求。现10秒watchdog仍存在但不构成navigation ACK；首次无cookie的server `307 /login`规则不变。测试用闭集fixture beacon只观察DOM安全不变量，不进入生产contract。

## R173-SERVER-ADMITTED-SHELL：内部 booting composition（2026-10-03；tests-first）

不新增 HTTP API、wire schema、cookie、header或公开错误。layout 成功验证 HttpOnly Product Session后只投影内部无 claims布尔 `serverAdmitted`；AppGate据此选择现 AppFrame 的 `booting` presentation，不把它解释为客户端 authenticated。真实 probe完成前不得创建 owner client state或发 BFF sessions/models/agents/Chat请求；首个401/503/坏响应进入现fail-closed UI，可信anonymous在native sign-in commit前保留同一data-free booting壳。只有可信200 authenticated与auth-index fence成功才首次mount Runtime。anonymous SSR redirect、trusted-origin/Redis failure、preview规则不变。

真实Next门包括：正式cookie的原始GET `/app` 返回200，HTML含实际main/composer且不含runtime/app-frame spinner；浏览器hold首个真实session probe时同一booting shell可见且owner请求为零，release可信200后Runtime首次mount并保持原R147 cold/reload oracle；首次unavailable不得展示旧Conversation。这不是旧document恢复证明。

## R170-W-MOVE-UI：内部调用与用户可见状态（2026-10-04；候选已实现，发布待 Root 集成）

本片不新增HTTP/API；只消费required `SessionClient.moveSession`。Engine冻结canonical `sessionId`、`targetProjectId|null`与一次`commandId`，同一显式retry复用三者。没有unknown intent时retry返回`null`且零owner调用；pending时重复同意图共享结果，不同target也返回rejected而不换key。只有validated matching 200 ACK返回confirmed；明确且终局的owner拒绝为rejected；network/deadline/abort/parse/adapter、503及409 `idempotency_in_progress`为unknown。UI不得从list差异推断成功、不得换key自动retry、不得在ACK前导航。

active confirmed导航为Project target `/app/project/<canonical>?conversation=<canonical>`，Direct target为`/app?conversation=<canonical>`；保Conversation ID。运行中Run不取消、不重发，target engine以正式scope snapshot/replay恢复。非active confirmed不导航。Project destination只在正式Project list状态ready时取owner-confirmed list并排除current；`projectHref`、preview或synthetic shortcut不能成为目的地，未知/不可见ID没有自由文本入口。TC-C05-UI01..08分别覆盖destination权限、ACK前保全、三方向导航、scope admission、owner rejection、unknown同key恢复及全部迟到fence。

matching confirmed receipt先确立durable outcome，再应用generation/view fence：旧UI projection不导航、不显示错误、不抢焦点，但同scope来源仍必须发起新的owner GET并按canonical membership移除已移动Conversation。该对账不新增HTTP字段、receipt、entity或binding事实，也不自动重发Move。R194-W1只覆盖当前scope；跨scope unknown/late ACK、route未dispose及blocked-storage硬刷新仍为W2 OPEN。

R195-W2仍不新增HTTP、cookie、header、error code或owner字段。页面单槽Move coordinator只在现可信session probe已admit的verified subject下调用required `SessionClient.moveSession`，冻结原`sessionId/targetProjectId/commandId`与由此产生的同一body；scope/route/view engine不是调用身份。matching 200 ACK即使原view已unmount也必须结算，并立即按source scope+sessionId精确驱逐现browser内存/持久Conversation索引，再递增source/target有界per-scope version以取得新的canonical GET；不保存可被连续Move覆盖的per-session待办，不阻止下一次Move，不插target假行。旧view不得导航、报错或抢焦点。network/abort/parse/adapter、任意503及409 `idempotency_in_progress`继续为unknown：mount、focus、canonical GET和scope切换都不得自动POST，只有同一verified subject的明确Retry可再发一次完全相同的`Idempotency-Key`与body。

可信anonymous、subject change、logout、pagehide或真正document coordinator teardown通过epoch-fenced revoke清除/abort冻结command；普通probe effect cleanup与StrictMode replay不构成revoke。新subject既看不到也不能重试旧subject command，revoke后的迟到resolve/reject不得恢复unknown、发布reconciliation或导航。session probe temporary unavailable只suspend start/retry，不把owner outcome分类为closed rejection；同subject、同epoch的pending ACK仍可结算，恢复只解冻现slot且不以新key/body自动重发。上述均为browser内部生命周期，不改变BFF 7.1 Move、same-origin route或10秒client预算。后继必须删除engine-owned intent/retry双轨，禁止同时从engine与coordinator发Move。

---

## R167-SERVER-FIRST：首文档认证边界（2026-10-03；待 tests-first）

`/app` 与所有 `/app/**` 是 Web browser-private 页面边界，不新增公开 API。首次 document GET 在渲染 client `AppGate` 前，以现 Product Session cookie、当前 Redis generation/tombstone 和 `accessExpiresAt` 作同一 owner admission：无 cookie、无效/过期 cookie、stale generation、tombstone 或过期 access 固定进入相对 `/login`。具体 wire 允许真实 Next 的非 streaming 3xx `Location: /login` 或 streaming 200 redirect 表达；不得预设 307，也不得在任一表达中输出 `runtime-loading`、claims、access credential、session id、subject、cookie或查询参数。

配置缺失、Redis超时/失败不是 anonymous，必须 fail closed 为有限 unavailable 首屏，不跳 `/login`、不触发第二 OIDC transaction。active session 继续渲染 AppGate，并保留 `GET /api/auth/session`、BFF adapter 与后续 revocation 的既有每请求检查。显式 preview 只沿用非 production 开关；production 不从失败降级 preview。无新 endpoint、error envelope、owner contract 或 query。本 D0 的真实 HTTP RED 只验证首文档边界；后继实现与 active/failure 矩阵通过前不称协议已发布，也不把它当原旧文档卡住的因果证明。

---

## R158-W-MOVE-D0：public 7.1 Move 消费合同（2026-10-04；候选已实现，发布待 Root 集成）

唯一 owner 机器事实是 BFF 已发布 public OpenAPI 7.1 canonical SHA-256 `784f77e2c350c43d4fc4bc32933eace136185204ba49ddd738413f9b4b5b4fb5`（文档 `5e119cd6fc007f4ad8ffae048a8fcef687d9a8dc`、源码 `6c5cee0ca5b64dd7e1a855eae1022290eb16cd9a`）的 `POST /v1/sessions/{id}/move`。Web 后继第一片增加 Session client，并在现 `/api/session/[...path]` 内增加仅限该 operation 的响应投影；不增加新的浏览器公开 API、独立 proxy、engine action 或 UI。

- path `id` 必须匹配 canonical `^conv_<uuid>$`；body 必须是 closed `{target_project_id}`，其值匹配 canonical `^project_<uuid>$` 或为 `null`。不接受 slug、alias、source Project、空串或额外字段。BFF public raw URL 的无 query 规则不变；Web browser-private 经 Next 规范化后，把没有实际参数的空尾 `?` 视为同一 canonical URI，但任何非空 query 都必须本地返回 `400 invalid_move_request` 且不向 BFF 发请求。
- `commandId` 是一次用户 Move 意图的稳定幂等身份，必须满足 owner 的 printable 1..128 边界并原样进入 `Idempotency-Key`；client 不 trim、合并、随机替换或自动重发。相同意图的显式恢复才可复用同一 key/body。
- 成功只认 HTTP 200 和 strict flat adapter ACK `{session_id,project_ref}`；`session_id` 必须等于请求 Conversation，`project_ref` 必须与请求 target（含 `null`）相等。owner ACK 没有 `command_id`，Web 不复制或臆造该字段。202、其它状态、bad/extra JSON、错 session/target 全部拒绝，不能提交本地归属。
- 400/401/403/404/409/429/503 沿现 typed client error；网络、abort、timeout 与 503 unknown 均不说明 Move 未发生，也不自动 retry或从列表猜成功。BFF 当前 IAM admission、permission `chat.session.update`、same-key replay/conflict及 `Cache-Control:no-store` 仍是 owner语义。
- Move 不取消当前 Run/stream，不改 Message、Share、AG-UI cursor 或 Artifact 关联；只影响后续 message/Run admission。Web 第一片不投影这些事实，后继 UI/engine 必须在严格 ACK 后才更新视图。

Web client公开的首片边界固定为 `moveSession(input: MoveSessionInput): Promise<MoveSessionReceipt>`；`MoveSessionInput` 是 readonly `{sessionId:string; targetProjectId:string|null; commandId:string; signal?:AbortSignal}`，`MoveSessionReceipt` 是 readonly `{session_id:string; project_ref:string|null}`。该方法是 `SessionClient` required member，不发布optional/feature-detection兼容轨。preview固定抛专属`ConversationMoveError`的`unsupported`分支，不得改变preview sessions或生成假ACK；这不是owner业务错误码。生产实现不得经过现 `postJson`，因为后者会trim/缺省生成key并接受任意`response.ok`，与Move的exact command identity和strict 200冲突。
当前候选已由R170 engine/UI消费此required方法；机器契约字段与owner语义不变，Web没有新增公开endpoint或第二归属协议。
caller传入的非法session ID、target或command key统一是专属`{kind:"parse"}`本地失败：不附owner status/code/retryable/requestId/retryAfter，不发fetch，也不写任何会话归属。

生产Move client自带不可配置的10秒总预算，起点在fetch前，终点在完整body读取、JSON解析与ACK关联校验后；不是只包response headers，也不继承Web→BFF 15秒上界。内部controller组合可选caller signal：已aborted signal不发请求；在途abort转发；timeout与caller abort都拒绝为本地`network` unknown，保原commandId且不自动重发或推断owner取消。所有路径finally清timer/abort listener。该预算只属于Move，不改变其它SessionClient HTTP行为。

Move client拒绝值只使用专属closed `ConversationMoveError.details`：成功校验过的owner error映为 `{kind:"owner",status,code,retryable,requestId,retryAfter}`，其中status/code组合必须属于7.1机器图，requestId来自合法`x-request-id`，Retry-After仅429可按已发布正则保存为string或null。fetch/abort映`network`；200 ACK/body/identity/target解析失败映`parse`；代理自有502、坏/缺owner error、坏/缺request-id或非法Retry-After映`adapter`；preview/fake映`unsupported`。后四类没有owner status/code/retryable/requestId/retryAfter字段。不得借此修改其它`SessionClientError`、建立泛型Error体系或让调用方用message字符串判定unknown。

现 generic catchall 的 JSON success 要求 `{data,meta.request_id}`，generic error也要求 `meta` 且不接受 owner Move 的 `retryable`；因此合法 Move 200 会被降为502、typed Move error会丢业务 code。第一片必须以 method/path/canonical ID 三重精确识别 `POST sessions/<conv>/move`：success只解析 owner `{data:{session_id,project_ref}}`，从必需 `x-request-id` header取得请求身份后向浏览器返回 flat ACK；error只允许 owner发布的 status/code/retryable组合，保原HTTP status、typed error、`x-request-id` 与可选 `Retry-After`。缺/坏 header、shape或status组合 fail closed；generic success/error schemas及其它 route一字不宽化。`tests/system/session-route-http.integration.test.ts` 只作mock-auth direct route门；正向反例必须在 `tests/system/oidc-rp-next-http.integration.test.ts` 复用真实Next、Redis与Product cookie fixture，fixture BFF只模拟owner响应而不冒充真BFF owner。现product-bff Next测试的dead-Redis负例与fetch mock都不能替代该正向门。

机器 pin 更新必须复制 owner committed blob 到 `src/generated/bff-public-openapi.yaml`，把现 Team 与 Agent-failure generator 的 version/commit/digest provenance 更新到 7.1/上述完整 digest，并正规再生/check `src/generated/bff-agent-failure.ts` 与 `src/generated/bff-team/**`。`contract/api-contract.test.ts` 必须新增 Move path/parameter/request/200/error graph并保现 Scheduled/collection断言；七个现 `tests/contract/bff-*-public.test.ts` 继续保护 Team、failure、Library、Project、Skills/MCP fragment，不因全 blob升级删除或放宽。

engine/UI的Move意图生命周期与用户journey已在R170候选实现，但仍不是机器字段或新公开合同；正式发布及真实owner环境启用待Root集成，不关闭原loading P0。

---

## R143-W 会话删除消费合同（2026-10-03；限定实现与完整工程门冻结，实际发布以 HEAD/Root gitlink 为准）

Web 只消费 BFF main `a68cbe55cde709f9b21f3d5803bfbd3ca5d14e2b` public `7.0.0` canonical OpenAPI（SHA-256 `76d524d731b10d1cd4b16db4dae957701bf5c5d82a3cd915a42bc57617746ebe`）的 `DELETE /v1/sessions/{id}`。请求必须携带一个 `Idempotency-Key`，并按当前 engine scope 精确携带 `scope=direct` 或非空 exact `project_ref`；session ID 不替代 actor/scope。浏览器仍经同源 adapter 使用受信 Product Session，tenant/subject 不从 body/header 自报。

成功仅是 HTTP 200 且严格 envelope 解包后的 `{status:"deleted"}`。现共享 receipt schema 为 strict object 但 `status` 仍是 string；删除 client 在该解析边界之后再做 literal `deleted` 双判，未扩大或复制 BFF wire。401/403/404/409/429/503、网络错误、超时、abort 和坏 200 均不提交本地删除。404 的 `session_not_found` 同时隐藏缺失/越权/错 scope，不能单独证明“已经删除”。public route 的 required idempotency header 不等于 Web 已获得可依赖的 durable delete replay；unknown 首片不自动换新 key或盲重发，也不把列表首页缺项解释为成功。

DELETE 200 是 BFF owner 事务完成后的 ACK：Conversation 软删、stream consumer fence、share 撤销及所需 cancellation outbox 都由该事务负责。Web 不在 DELETE 前另发 Run cancel；ACK 前保留 Conversation、draft、Run 与所有页面投影。严格 ACK 后才按现本地 fallback 切换并触发一次同 scope 列表刷新。

现真实 Next/Chromium/透明 HTTP barrier 已固定 direct exact URL/query、单请求、ACK 时点与 503 保全；未新增 mock/unit 文件、未注入身份/storage，也未用 preview 代替 owner。Project exact query与换 active 后晚 ACK 的完整 real-UI 仍是 P2；当前 IAB/真实 owner 未验。未决机器契约问题 0；本片未增加 reconcile API、Project 级联、兼容 alias 或第二 DELETE 路径。

---

## R137-E117 当前 consumer contract（2026-10-03；已验证候选待 Root Git）

Web 已固定 BFF main `a68cbe55cde709f9b21f3d5803bfbd3ca5d14e2b` / public `7.0.0` / canonical SHA-256 `76d524d731b10d1cd4b16db4dae957701bf5c5d82a3cd915a42bc57617746ebe` 的原始机器契约并正规生成。浏览器同源 catchall 解包 owner success envelope，client 严格解析裸 `RunProcessPage`；错误 envelope 保留 stable code。required nullable snapshot process、exact scope/W/cursor、safe CUSTOM 闭集、Todo/activity替换、全页耗尽后续流与有界410恢复均为当前候选行为，无 public6 fallback、raw alias 或第二协议。

Root 最终 Node22 `pnpm check` 实测 contract 256、architecture 50、2346 tests/0 skip 及 lint/typecheck/build 全通过；本地 preview 真实页面的桌面/移动六节点也全部通过，覆盖 safe process 与正文、TEXT START forming、HITL activity 终态可见性。preview transport 只发 public7 safe `activity.updated`，明确不恢复 raw `tool.returned`；这不是正式 IAM、provider、Billing、真实 BFF HTTP 或全部深层状态码矩阵证据。候选尚未 Git 发布，旧 raw core schema/type/reducer/projection/cancel 清理仍待下一窄切片。下方 R135 是已执行的历史目标合同。

---
## R135-WEB7-D0（历史设计门）：public7 execution process 消费合同（2026-10-03；目标态）

Web 当前仍固定 BFF public `6.0.0`；目标机器事实源已正式发布于 BFF main `a68cbe55cde709f9b21f3d5803bfbd3ca5d14e2b`，`contract/openapi/v1/openapi.yaml` public `7.0.0`，SHA-256 `76d524d731b10d1cd4b16db4dae957701bf5c5d82a3cd915a42bc57617746ebe`。后继只能复制该 committed canonical 原字节并正规生成；本文是消费者约束，不是第二份可编辑 contract。Browser 仍只经 `/api/session/[...path]` 到 BFF，身份/scope 来自现受信上下文，不直连 Agent/BFF、不 body 自报。

snapshot 的 `execution_process` 在 data 中 **required nullable**：null 是没有 durable START；非 null 的 `run_id,todos,activities,next_cursor` 全部 required。`todos:null` 与 `todos:[]` 不同；activities 是 anchor 下第一页而非全集。`execution_head` 与 process 可指不同 Run：A terminal、B queued 时 process 保持 A，直到 B durable START。Web 不从 head、receipt、Message 或 local active id 推导 process Run。

后继严格消费 `GET /v1/sessions/{id}/runs/{runId}/process?watermark=W&cursor=C&limit=N`，并原样携带现 direct/project scope。200 data 的 `run_id,todos,activities,next_cursor,event_watermark` 全部 required；每页 `run_id` 必须等于 path Run、watermark 必须逐字等于 W，cursor 是 opaque pagination identity，不能与 AG-UI `Last-Event-ID` 混用、解码、比较或合成。limit 仅每页 1..100；必须读至 null，不能把 100 项当总量。

Todo 是完整有序替换；CUSTOM 仅接 owner 的 `kokoro.todo.updated` 与 `kokoro.activity.updated`。activity union 仅为安全 tool/subagent/skill 字段：opaque ids、受控 status/display code 或 Skill source refs/preflight/phase/条件 error code。额外字段、未知 discriminator、旧 `subagent.started/finished`、raw name/args/result/error/path/stack 及兼容 alias 全帧拒绝且不推进 cursor。相同 activity 的后续值整体替换并保首次位置；schema 未发布 phase 单向迁移图，因此 Web 不附加一套。 Todo content 的 1..1024 按 Unicode 字符计数而非 JavaScript UTF-16 code unit；非 null Todo 每页最多100。Skill `source_refs` 保序、1..16、unique 且逐项匹配 owner regex；failed phase 必须有受控 `error_code`，其他 phase 必须缺席该键（`null` 也拒绝）。tool/subagent 的 `display_code` 分别固定，交叉值拒绝。snapshot `messages` 延续机器契约既有 optional 语义，不借 public7 顺便收紧。

分页全部成功校验并原子采用后，唯一 AG-UI stream 从同一 W strictly-after 续流；partial 页不成为完整过程事实，不并行开流覆盖。400/401/403/404/429/503 均 fail closed：400 依 exact stable code 区分 invalid query/cursor/scope，401 进入原认证恢复，403 保授权失败，404 保资源不可见/不存在，429 保原限流语义，503 保过程投影或通用服务不可用；不得降级为空数组或 public6 merge。200 响应的 schema、run 或 W 不匹配属于 Web 本地 parse 失败，不解释为 HTTP 400。provenance/compact/frame 完整性错误和 owner 过程页超预算均按正式现有 `process_projection_unavailable` 处理，不发明 `process_page_item_too_large`；1 MiB 是 owner 过程页预算，不是 Web 对含正文/Delivery 的整份 snapshot 附加上限。process 410 `process_cursor_expired` 必须丢弃旧 W 全部页，重新 snapshot 后有界重建；重复 410 终止并显示安全失败。session snapshot 的删除/不存在语义不与 process 410 合并。

每次 scope/dispose/new hydrate 真实 abort snapshot/page/stream，并以 generation 在 parse、append、adopt 三处复核；迟到 success/error/finally 不写新 scope。合法 Message 全文、Vercel `UIMessage` 映射、full HITL、Delivery、optimistic admission、failure 与连接引用计数不变。breaking 策略为 public7 单轨：没有 public6 optional fallback、旧 raw shape、双 reader 或第二 SSE。

精确后继 pin/generator/test/source 与 RED/GREEN 命令见 TECH R135；当前 D0 未更新 canonical snapshot、generated 或运行 contract tests。未决协议问题 0。

---
## R91-WEB-PUBLIC6：`GET /v1/sessions` 查询合同（2026-10-02；正规生成 GREEN）

固定 owner 为 BFF `bb610ea7262574772e1d8c309a6e03171d07d0a3` / OpenAPI `6.0.0` / SHA-256 `75ef9f7a3b28018d9c7a3ca5899f75afe561dd40b794e7f71b0e3d078b29c129`。机器事实源仍是 owner `contract/openapi/v1/openapi.yaml`；Web snapshot 现为该 canonical blob。更新前 public5 snapshot 已形成并保存 123 pass / 13 fail 的真实 RED。

- `GET /v1/sessions` 省略 `scope` 或传空 `scope` 时，返回 admitted tenant 与 subject 可见的全部 active Conversation；不表示 direct。
- 显式 `scope=direct` 只返回 `project_ref IS NULL`；非空 `project_ref` 只筛选该 owned Project。两者同时出现属于 `invalid_scope`，必须在 Project lookup 前返回 HTTP 400 `BadRequest`。
- filter 任一变化后，调用方必须丢弃旧 cursor 并从第一页开始；cursor 绑定原查询，Web 不比较、改写或跨 filter 复用 opaque cursor。
- `DirectScopeQuery` 只能是 `"" | "direct"`，没有默认值；`ProjectRefQuery` 为 optional、nonempty exact string。二者都不覆盖 admitted tenant/subject，资源路由保持原有 project-bound authorization。
- 当前 runtime 已显式表达意图：默认 `listSessions({ kind: "direct" })` 发 `scope=direct`，项目集合发 exact `project_ref`，同源 adapter relay 原 query。故本切片不新增 API 参数、alias、fallback 或 runtime 改动。

测试须固定 exact canonical bytes/version，并对 listSessions operation 的四个 parameter ref、400 response、描述语义及两个 component parameter schema 作机器断言；R76 Scheduled create graph、Safe12、ChatMessage fingerprint、Team9 与其余 operation graph原样保留。

---

## R79-WEB-PROJECT-D0：项目创建上下文的精确消费合同（2026-10-02；目标态，待 Root 门审）

与TECH/DATA R79一致，基线Web main `dc330a99332be28bb74a4fa2d2196ba8425f9dc5`；本轮只写五文档前缀，runtime仍缺项目字段与live创建上下文。固定已发布BFF owner `479d4e8b0aeb438d2ec9cb3d4472130fc1a29972` public5.0.0 / YAML SHA-256 `3ce25a31d326a358d6e1d3c8ee33b5e07dbc34da13ee0933b3b5edf31531918b` 不变；机器source仍是固定snapshot中的CreateScheduledTaskRequest、ScheduledTask和/v1/scheduled-tasks，不在本文复制整套字段/第二契约。下方旧方案仅历史，当前证据见CURRENT R79。

### Browser-private导航不是public参数

- 采用现Project卡→`/app/scheduled?project_id=<exact编码>#scheduled-tasks/new`→现独立Scheduled surface/editor。没有第二live项目编辑器，也不重新使用项目preview callback/合成任务。
- Query仅浏览器创建上下文：缺省personal；project_id存在时必须恰一精确非空、无首尾空白值。重复/空/非法解码/context错误fail closed，明确显示错误/禁保存；不trim、去重、strip、猜最近项目或转personal。URL编码/一次解码只负责传输，不改变原引用；owner允许ID或slug，其可见性只由BFF裁决。
- GET列表仍现个人授权全集，不追加项目筛选query、不把全集称为Project列表。tab/view变化保创建上下文；取消保query、移除editor hash/history标记；显式个人导航回无项目参数URL，旧上下文不泄漏。
- Browser POST固定 `/api/scheduled-tasks` 无query，同源adapter按现raw body→BFF `/v1/scheduled-tasks` 无query；关联只在body `project_id`。上游collection POST禁止query，包括重复/空参数；不能复制浏览器URL search到mutation URL。tenant/subject/admission/权限保持受信session/BFF来源，不由UI填写。

### Runtime narrowing与command语义

create请求与record消费新增owner已存在optional exact project_id，内部Draft/Record为projectId，mapper显式双向转换。个人create不包含该键，项目create保持exact值；不存在project_ref alias。既有五必填、UI auto_approve必填、日期/时区/strict未知key规则保留，不声称本片镜像所有owner可选输入。

PATCH为现任务字段更新，显式排除project_id：create新增字段不得被partial()继承到PATCH。Patch view model/serializer均不加projectId；编辑任务只用owner task ID，query不能变更归属。记录中的projectId是owner投影不是授权证明。创建enabled/status仍拒绝，现PATCH状态与expires null清除保持。

现Idempotency-Key与body fingerprint复用；新增项目字段参与fingerprint，个人/不同Project分离。unknown network/parse只能显式原body原key重试，HTTP404明确失败不自动重试或退为个人。BFF `project_not_found` 404经现adapter/client保存typed status/code；UI安全错误保草稿/编辑器，不reload、不假ACK/本地任务。不存在/不可见不作不同UI探测。成功严格解码owner record后仅当前实例GET权威列表，不直接插入create结果。

### 隔离、验证与breaking策略

上下文kind/精确Project引用/编辑task ID构成无碰撞实例key；context/记录切换清editing/prompt/opener并卸载旧content。异步旧结果的close/error/reload都要当前实例守卫，A→B→A、项目→个人与撤销重开不能复用旧实例；不能把浏览器导航当owner取消。现列表requestSequence与命令身份保护保留。

本片是public5已有能力的Web窄消费扩展，无public版本或机器契约变更、无dual-reader/legacy fallback。精确后继10源码/5测试与唯一已知href断言迁移见TECH R79；其余原assert保持。定向验证命令（后继获授后）：`pnpm exec vitest run tests/scheduled/contract-calendar.test.ts tests/scheduled/client.test.ts tests/scheduled/editor-history.test.tsx tests/ui/kokoro-project-workspace.test.tsx tests/ui/kokoro-scheduled-surface.test.tsx`，再 `pnpm contract`、`pnpm test:architecture`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`（或现 `pnpm check`）。当前均未执行，不引用R77门作为新UI证据；Root负责实际owner/browser/e2e。无schema命令，无generated再生成或新contract文件。

---

## R76-WEB-PUBLIC5：唯一已发布 public 来源与消费边界（2026-10-02）

当前批准消费目标为 BFF public5.0.0，published main `479d4e8b0aeb438d2ec9cb3d4472130fc1a29972`；唯一 canonical `contract/openapi/v1/openapi.yaml` / SHA-256 `3ce25a31d326a358d6e1d3c8ee33b5e07dbc34da13ee0933b3b5edf31531918b`。Web 起始 main `28672f330df11cd55f7ff3f89f269acc3fe908cf` 已发布 public4消费者；本前缀覆盖旧版本现状，原 R65/其后历史正文不变。

沿原 exact-byte snapshot 与两个 generator，固定版本/commit/digest，不维护第二可编辑 OpenAPI、双轨、旧 owner alias 或 fallback。public5 仍只有 /v1；browser→同源→BFF 方向、受信身份、现 admission/opaque cursor/full pause/control/recovery、safe12/Message/Artifact 与 Team9 不变。BFF 上游 Product API public 与 Web browser-private 的可见性不混用。

public5 新的 Scheduled create 机器事实源是 owner `CreateScheduledTaskRequest` 及 `POST /v1/scheduled-tasks`：五必填、closed body、可选 exact project_id，删除创建 enabled/status；状态修改仍属于既有 PATCH，不发明创建状态默认来源。Project不存在/不可见由 owner404，参数和幂等由 owner边界处理。详细字段不在本文复制第二份；新增EOF机器图断言锁定required/closed/精确关联/POST404，原 Chat/R74 断言原字节保持。

现 Web 独立create builder 不发送被删字段，已经提供五必填，故本次无 scheduled源码迁移。新 project_id 关联没有 Web Draft/client/live项目创建入口，auto_approve 仍是当前 UI 投影必填；这不是全部public5输入均已由Web运行时schema表达的声明。关联新能力需另一个精确授权切片，不临时造 project_ref alias/透传未知字段。正规生成与门禁证据以 CURRENT R76 为准；真实owner/浏览器组合由 Root 验收。

---

## R65-WEB-PUBLIC4-D0：固定已发布 public4 的消费边界（目标态，仅文档）

本前缀与 TECHNICAL_DESIGN/DATA_MODEL 的 R65 是唯一当前目标；下方旧正文 byte-equal 保留历史，不据其实现 active_run、旧顶层 pending 或 decisions-only。本阶段仅四doc前缀，未改source/tests/pin/generated。当前 Web main06a1c86612d9557d83081bcb67e8fc539ae7eacb 仍消费public3；目标 BFF已发布main3c08a422f3a6aa3cf204c308716cfa64f6d61bb2，contract/openapi/v1/openapi.yaml public4.0.0 / SHA-256 5561450bd02e978bace1d4850c262aea645bad8fdf4ec46fd0cfffb6765c8ef6。完整machine是唯一API事实源；以下是consumer约束，不另建可编辑OpenAPI。

### 路径、身份与唯一 snapshot

Browser→现 /api/session/* adapter→BFF /v1/* 保持；session/run来自现路径，tenant/subject/session admission来自既有受信上下文，不body自报。GET /v1/sessions/{id} 的现 data/meta envelope、Message/Artifact/permission与event_watermark不改；data仅可缺失 execution_head，删除 active_run与顶层pending_pauses。无head字段缺失，不收null、空run或旧双字段。closed head required run_id/state/pending_pauses，state精确queued|active|waiting|resuming。

| head state | pending_pauses | UI与恢复 |
| --- | --- | --- |
| queued | [] | 等matching START，不从receipt猜已执行 |
| active | [] | UI streaming；无wire streaming alias |
| waiting | 恰一条phase=waiting完整PendingPause | 所有groups/items直接可见；等待全集决策 |
| resuming | 恰一条phase=resuming完整PendingPause | 保留全集、禁新key重复决定；不是已消费 |

head/最新full-state/Message/Artifact/watermark是BFF授权后同一RR读；Web只消费一次响应，不将多次请求拼成RR。event_watermark仍opaque agui_[0-9a-f]{32}或null，开流使用原Last-Event-ID，不从seq生成cursor。初读错误不是空成功；GC410仅event_cursor_expired允许现snapshot-first bounded恢复，其他错误保持connection unavailable而不是Run terminal。

### full-state、隐私与严格校验

PendingPause是owner完整ChatInteractionState的waiting/resuming投影：required interaction_revision/pause_revision/pause_ref/phase/groups/action_result，不是逐item暂停记录。interaction_revision正JS safe integer，pause_revision非负safe且<=interaction_revision；PendingPause pause_revision正、pause_ref非空。group_id/item_id全局唯一，groups/items原序；waiting/resuming groups非空，active/terminal明确[]。零pause revision对应null ref，正revision对应非空ref；active/terminal可保留历史正revision/ref，不强制归零。

InteractionItem仅required item_id/request_id/kind/allowed_decisions/display及optional nullable validation；kind为tool_approval|ask_user_question|result_review|input，allowed_decisions非空、唯一五类。display required name/description/editable/input_schema，optional nullable result_preview/truncated/source；字符串preview必须有boolean truncated和非空source。validation如存在仅owner json_schema_invalid/instance_path，不从私有args合成。闭合边界、integer范围及字段存在性以固定machine为准，任意业务input_schema/args/value字典不递归改写null。

action_result为null或command_id/pause_revision/kind；kind是accepted/native_consumed/validation_failed/unknown/cancelled。action.pause_revision<=当前pause；resuming必须accepted/unknown且精确当前pause。validation_failed的waiting携上一轮action revision，新的waiting非空action不代表已submitted。owner额外交叉约束由consumer contract向量及decoder验证，不凭nullable缺失默认化。

禁止公开/消费checkpoint locator、task/interrupt私有定位、原tool args、submitted decision value、risk/segment/checkpoint等旧字段；display/input_schema是明确公开数据，不据描述解析新wire。snapshot与CUSTOM共享同一consumer full-state校验，不维护第二协议。schema放既有control.ts，head/body在chat.ts，AG-UI frame在agui-events.ts；control不反向import后二者。

### AG-UI queued 与完整 interaction

GET /v1/sessions/{id}/events 继续durable AG-UI SSE，metadata/cursor/event_id及UTC timestamp沿现协议；不发opened/resolved逐项delta。

- CUSTOM kokoro.run.queued：strict value仅run_id、dispatch_sequence；dispatch_sequence正decimal string。此BFF专属metadata含source_owner=kokoro-bff、seq正decimal string、event_id/session_id/run_id/timestamp；run_id与value一致，source seq与dispatch sequence一致。复用现dispatch-error的精确字符串语义，不把任意CUSTOM开放成string/number union，不把BFF seq写入Agent numeric lastSeq或Number舍入。
- CUSTOM kokoro.interaction.state：value是完整六字段，包括active/terminal明确空groups；metadata为现Agent数值序列分支。先校验frame/full集合/当前run revision，再承认opaque cursor；map到现data-kokoro UIMessage part和内部projection，不另开SSE。
- 同revision同完整内容可no-op，omitted与null仍不同；倒退/同revision异内容fail closed。Web仅比较完整验证对象，不实现Agent control digest、BFF mutation fingerprint或owner interaction_digest。
- interaction phase terminal不是RUN_FINISHED/RUN_ERROR。真正matching Run terminal仅结束该Run；A terminal之后B queued仍必须drain，跨批/跨页不早关会话。最终无live head关闭idle stream；重连与Run状态分开。

### control 完整集合与 ACK

现 POST /v1/sessions/{id}/runs/{runId}/control、Idempotency-Key与receipt envelope保持。public三分支闭合，不接收session_id（该边界在旧BFF也已存在，不写成public4新增身份要求）：

| kind | required public body |
| --- | --- |
| run.cancel | kind |
| run.resume | kind、decisions、expected_pause_revision、pause_ref |
| run.steer | kind、message_id、content |

expected_pause_revision正safe integer，pause_ref非空；locators不optional、不default。五closed ResumeDecision都使用item_id：approve可选nullable object args；edit必需object args；reject可选nullable string reason；respond必需非空response；submit必需object value。submit不是request_id，其他分支不是tool_id，不保alias。decisions覆盖当前所有groups的item ID恰一次，按展示原序构造，重复/缺失/额外/disallowed整批拒绝，不能只补剩余项。UI以allowed_decisions为动作白名单，不从旧kind固定子集推断允许动作；edit另遵守display.editable，不从私有args预填。

冻结提交身份绑定当前session/run/pause_revision/ref，保key/body及完整业务null。HTTP202 receipt（即status=succeeded）仅admission/replay，不清卡、清groups、标rejected或转active；本地inflight防双发不能假冒owner resuming。只有durable accepted/unknown full-state进入resuming且全集保留；native_consumed下一完整revision空才active，非空为新waiting/re-pause；validation_failed显示新waiting与owner validation。普通tool returned/activity不解除pending；cancel ACK也不制造terminal。

结构错误400 invalid_run_control；不可见会话404 session_not_found，非当前/不存在Run404 run_not_found；stale pause/ref或非waiting且非合法同key recovery409 run_control_conflict。same key/different body保持409 idempotency_conflict、处理中idempotency_in_progress，不把后者当terminal或放弃unknown原意图。resuming只允许与当前action_result.command_id一致的原key恢复，不能换key重decide。网络unknown保留原key/body；新pause替换时旧ACK零写，snapshot-first对账而非本地猜清全集。Web不从receipt.request_digest重算owner摘要或私有request。

### 生成、消费者断言与后继门

准确机器消费、生成/七pin测试文件集及完整RED矩阵以同TECH R65为准；本轮不更新src/generated/bff-public-openapi.yaml。后继仅从已发布3c08a422 blob复制，固定version/digest，现failure/Team两generator正规--write/--check；safe12 failure fingerprint/九Teamoperation和其他owner语义不放宽，不手改generated、不新增Chat SDK generator。现contract/api-contract.test.ts对固定机器的ExecutionHead/ChatInteractionState/PendingPause/ResumeDecision/RunControlRequest图做独立closed/negative assertions，而不是只改版本让旧decoder静默接受。

首次public4用户激活必须snapshot/queued/完整pause/control/FIFO一片通过；无public3双读、HTTP4 terminal retry、retry_of_run_id或future P3B API。本D0未运行consumer RED、正式HTTP或浏览器；Root后继文档审→RED复验→source/pin/生成→contract/architecture/完整静态和行为门→正规owner组合验收。

---

# Kokoro User Web API 与协议契约

## WEB-PROJECT-READ-R42：指令历史复用已发布 wire（仅设计与 RED，2026-10-01）

独立审查发现原指令读取仍有未经 schema/boundary 校验的第二 GET，旧 data??payload 与 array assertion 不是当前 owner 协议。
本修补不变 public3.0.0/293dfe artifact acd92e pin，不新增 auth 字段、route、分页或 contract 版本。
现 GET /api/hub/projects/{id}/instruction-revisions 对应 GET /v1/projects/{projectId}/instruction-revisions，
operationId=listProjectInstructionRevisions，project.read，public/beta；路径 ProjectId 已由 owner 参数定义，当前无分页。
ProjectInstructionRevisionResponse 是 data.items + RequestMeta；每条 required id/instruction/updated_at/actor_name/current，
分别 string/string/date-time/string/boolean。consumer 在唯一 project.ts 校验开放 additive 字段与闭合 RequestMeta，
UI 映射 updated_at→updatedAt（瞬时点 epoch ms）、actor_name→actorName；不直接断言成 camelCase 数组。
现 PATCH /api/hub/projects/{id} 仍对应原 UpdateProjectInstructionRequest（instruction）与 ProjectResponse，原 Idempotency-Key 保留。
正式指令只消费已验证 Project detail/集合的 instruction，零额外 detail GET；历史 GET/PATCH 同读取边界、取消和 10 秒 deadline，
迟到旧身份响应不更新 UI，错误不制造空成功或正式历史记录。旧 fallback 删除但功能保留；本阶段尚未实施。

### R43 固定 wire 消费候选进度（2026-10-01）

现 project.ts 已验证 required revision snake_case 字段、data.items 与闭合 RequestMeta；开放 additive shape 保持。
GET history 与 PATCH 均用现同源路径、no-store/AbortSignal/10秒 fetch+body deadline，PATCH 原 instruction/Idempotency-Key 保持，
响应 ProjectResponse 的 id 必须匹配请求；当代 ACK 仅刷新正式 GET，不把请求正文或随机 revision 当持久事实。
正式 instruction 来自 validated current Project；无新 route/owner/version/pin/generated。固定生成物两项 --check exit0。

## WEB-PROJECT-READ-R40：固定 owner 读取已接入候选（2026-10-01）

Root 批准 D0 后，Web 用现 GET /api/hub/projects[/id] 接固定 public3.0.0 owner artifact；版本/commit/digest/generated 原字节未改。
共享 contract/project.ts 保留 Project 原字符串与 required/optional/date-time；Project/envelope 接受 additive 字段，RequestMeta 闭合且
request_id 长度 1–256。创建与读取共用唯一 ProjectResponse，旧创建 schema 路径删除；创建本地导航身份 guard 与原幂等不变。
读取无 body/身份 header/Idempotency-Key/分页；opaque id 仅 segment 编码，detail 回执 id 必须与请求一致。
每请求 GET/no-store/取消与 10 秒 deadline（含响应体）；取消/失败不是空成功，无自动重试或第二协议。
受信 subject 仅在页面的 Project 读取边界内保留；本地代际不上 wire，不替代 BFF 每次授权。401/403 及详情404 停用读取重试，
429/503/网络/JSON/shape 错误只给安全失败反馈与显式重试，不显示 upstream payload。

原创建和新 list/get consumer/owner-pin 断言已定点通过；完整门、真实登录浏览器与 owner 组合证据由 Root 后继验收。
下方 D0 保留为固定边界与历史阶段证据，禁止据候选宣称发布闭环。

## WEB-PROJECT-READ-D0-R39：固定正式 Project 读取边界（2026-10-01；仅文档候选）

本段是当前 Project read D0，替代历史 mock 描述的实施依据，不宣称已接通 consumer。事实源是 BFF
contract/openapi/v1/openapi.yaml；目录 v1 不等于 info 版本。当前发布 pin 为 public **3.0.0**，owner commit
`293dfe7638e5dea0df2bee6dfdd8483b53fc9df6`，整文件 SHA-256
`acd92ed2fa3e84032e824e1462d67a007c4a94a7e79b7bda8fd5a66f9d51cd3b`。
Web src/generated/bff-public-openapi.yaml、该 owner commit 的 blob 和当前 BFF main
`759bfe0a8c521946cae31a74b6426f43b063bae1` 的此契约实读原字节相同；当前 BFF 八项 dirty 不属于新发布事实。
现 tests/contract/bff-project-create-public.test.ts 与 scripts/generate-bff-agent-failure.mjs 已固定同 pin；本 D0 不更新 generated。

| 浏览器私有边界 | 正式 BFF owner 操作 | 机器响应/限制 |
| --- | --- | --- |
| GET /api/hub/projects | GET /v1/projects，listProjects，public/beta，project.read | ProjectListResponse；当前无 cursor/limit 参数，响应无 next_cursor，不能合成分页。 |
| GET /api/hub/projects/{id} | GET /v1/projects/{projectId}，getProject，public/beta，project.read | ProjectResponse；opaque id 按路径 segment 编码；不把 slug/品牌/会话标题当 id 或建立 UI alias。 |

同源 hub adapter 已经使用 admittedProductSession/productBffHeaders 转发上述路径；身份来自 Product Session/BFF admission，
浏览器不直连 owner，不提交 tenant/actor/header 身份。读取只有 GET、no-store、取消与有界 deadline；没有 mutation、
Idempotency-Key、第二协议或新 route。原创建 POST/同键意图、项目 SessionScope 与 AG-UI 不变。

后继共享 consumer schema 必须从该固定 Project、ProjectListResponse、ProjectResponse、RequestMeta 定义校验，
不从历史 mock 文档复制字段；保 required/optional、类型与 date-time 约束，id/name 原字值不 trim、重命名或派生。
Project 及其 envelope 的额外字段按机器定义的开放性处理，不擅自 strict 拒 additive 字段；RequestMeta 的
additionalProperties:false 与 RequestId 约束保持。consumer 不是第二可编辑公开 contract；create 与 read 共用唯一 shape。

错误保持分层：401/403 是身份/权限拒绝，清旧读取数据并停止使用；detail 404 是该项目不可见/不存在，不填空详情；
429/503/网络失败及无效 JSON/shape 为明确 error，可显式再 GET，但无自动无限重试或 fallback。GET 被取消不生成空成功，
响应是否写回由本地读取 generation、controller、当前 projectRef 与 authenticated boundary 共同裁决。
list 成功 projects=[] 才为 empty；当前无 continuation、无合并多页或“已加载全部分页”的声明。

后继扩现两个 project contract tests 核 list/get 的 path、ref、permission、无分页事实及完整 pin，并锁共享 schema 及创建回归；
UI 先 RED 再实现，Root 后跑 pnpm contract/test:architecture/lint/typecheck/test/build 与真实登录浏览器。
当前 /api/auth/session 已有 subject；只把其受信投影保留到本地 Project 读取代际，不新增 wire/token/tenant 字段。
身份 generation 的内部装配与四文档一致性待 Root 审查，未运行契约检查或浏览器验收。

## WEB-IDLE-TERMINAL-P1-R26：订阅生命周期不改变 wire（2026-10-01；源码候选）

本片不修改 public 3.0、同源 route、AG-UI frame、cursor、receipt、generated 或错误 envelope。BFF terminal ledger head 的
`200 text/event-stream` 后 EOF 是已发布终态收口；Web 对 settled snapshot 不发 events GET。新 message receipt 或 snapshot
`active_run` 提供 exact identity 后，Web 仍携带 snapshot watermark/最后确认 cursor 打开 events GET；active EOF 仍重连，终态 frame
仍关闭。410 snapshot-first、pre-receipt 原 key/body、late accepted receipt cancel 与真实 owner terminal 全部保持。

首次 snapshot 与 message create 并发时，即使 receipt 先返回，Web 也先等 snapshot：receipt 不触发额外 events GET。snapshot 已含该
receipt run 终态时不再订阅；snapshot 仍为旧 settled 视图或给出 active identity 时，才分别以 receipt/`active_run` 打开唯一订阅。
这是消费顺序约束，不新增 request、字段、状态或 fallback。

BFF 当前尚未为 reload 的准入后/RUN_STARTED 前窗口发布 queued identity；Web 不从 pending Message、正文或数组位置推导它。本片只
修复已证明 settled 的历史会话，不声称该 owner contract 缺口已闭环，也不建立第二协议或 idle polling。

## WEB-CONNECTION-R26：非 connected 写入边界（2026-10-01；源码候选）

本片仍是零 wire 变化。hydrated connection 为 reconnecting/unavailable 时，Web 不发送新的 message create 或 HITL resume；被拒动作不
换 idempotency key、不清 Composer draft 或既有 staged decision。Stop/cancel 仍沿已发布 run control 契约，显式 reconnect 仍只有
snapshot GET + watermark 后 events GET。空新会话默认 connected，首条正常 message create 契约不变。

reattach 本地等待窗口耗尽不会合成 `RUN_ERROR`、failed Message 或 terminal receipt；`timeout` 仅为 Web connection reason。最终
completed/failed 仍必须来自 owner snapshot/live/replay。首次 snapshot error、真实无身份 terminal 与 pre-receipt unknown 继续走既有
独立展示/恢复约定；本片不修改 AG-UI、browser-private route、generated、client typed error 或 public 3.0。

pre-receipt snapshot recovery 所保留的 optimistic user id 只存在 Web engine 内存，execution adapter 仍只序列化既有
`idempotency_key/content/thinking/model/agent/selected_skill_source_refs/project_ref`；不存在新增 JSON 字段或第二种 retry wire。

## WEB-CONNECTION-P1-R25：内部连接生命周期已落地（2026-10-01）

本片机器契约为零变更：public 3.0、同源 route、AG-UI frame、opaque cursor、错误 envelope、幂等字段与 generated pin 全部不变。
`onReconnecting`/`onConnected` 只是 transport→client→execution→engine 的 Web 内部生命周期 callback；429 等 hard HTTP 仍由既有
typed `network | http | parse` 类别 fail closed，不解析或展示 response body、URL、frame、cookie、token 或 provider 文本。

“重新连接”只发当前 conversation snapshot GET 和 watermark 后 events GET；不调用 message create、terminal retry 或 queued command，
不合成 `RUN_ERROR`/failed Message/receipt。owner snapshot/live 后续给出的 active、completed、failed 与无身份 terminal 仍按原严格
身份和 safe tuple 投影。首次 snapshot 失败与未获 create receipt 的同 key/body 恢复保持原契约；已获 receipt 后的 stream/replay
错误不再借用二者的 UI 或动作。

## WEB-CONNECTION-D0：连接状态不扩写 owner terminal（2026-10-01；仅设计门）

本目标不修改 public 3.0、browser-private route、AG-UI frame、opaque cursor、BFF envelope、幂等字段、generated artifact 或
版本 pin。BFF/Agent 发布的 Message/Run terminal 仍是失败事实唯一来源；Web 在 snapshot 已成功后遇到 stream/replay availability
错误，只能建立页面内存 connection 状态，不能合成 `RUN_ERROR`、failed Message、`failedRunId`、retry receipt 或新 user。

协议与动作边界固定如下：

- **exact terminal**：verified Agent/BFF `RUN_ERROR` 与 snapshot failed assistant 继续按既有 strict identity/safe tuple 进入相同
  run footer；无 `run_id` 的真实 failed assistant 继续独立显示 generic。connection 错误不得覆盖、移动、清除或复制这些事实。
- **pre-receipt**：create-message 尚未取得 receipt 的 transport-unknown 仍可用原 idempotency key 与冻结 body 恢复；取得 receipt 后的
  stream failure 不再借用该动作，也不得重新 POST 最后一条 user。
- **initial snapshot**：未得到可信 snapshot 的失败仍是会话读取失败；同源 adapter 与 owner status 保持 fail-loud，不回退 fixture。
- **transient stream**：网络 fetch 拒绝或正常 EOF 继续用最后接受的 opaque cursor 重连；内部 reconnecting/connected callback 只是
  Web transport 生命周期信号，不是新 wire。重复 cursor/frame 仍按既有规则去重。
- **hard stream/replay**：非 expired HTTP、`response.body === null`、非 SSE content-type、严格 frame parse error 或 expired-cursor snapshot recovery
  失败只产生 Web connection unavailable。坏 frame 必须 fail closed；不得尝试 reducer-shaped legacy envelope、第二协议或 preview fallback。
- **显式 reconnect**：Web 重新执行当前 conversation 的 snapshot-first 流程，并且只从返回 watermark 续流；不调用 message create、
  terminal retry 或 queued command。snapshot 的 active/terminal/pending 状态继续拥有恢复结果。

用户界面不得展示 upstream URL、query、response body、SSE frame、raw exception、cookie、token 或 provider 文本。若后继为了诊断扩展
内部 typed error，只允许稳定 `network | http | parse` 类别、受控 HTTP status、稳定 error code 与 request id；它们不是 Run failure
profile，也不得写入 Message/terminal projection。Root 当前尚未取得真实失败请求的 status/content-type/error category，因此本 D0
不把旧 BFF、503/502/429 或 parse drift 中任何一项写成已确认根因。

验收必须证明：旧 failure + 后来 completed + stream hard error 时仍只有旧 exact footer；active partial 在 transient reconnect 中不
terminal；parse hard error 显式恢复不产生 POST；pre-receipt、真实 unattributed terminal 与 initial snapshot error 均保持原语义；合法
410 只走 snapshot recovery；非法 frame 继续拒绝且无 fallback。全部变化是 Web internal API，机器 contract 检查预期零 diff。

## WEB-FAILURE-PLACEMENT-D0：public 3.0 exact run 归属（2026-10-01；仅设计门）

P1 候选只消费既有 identity：snapshot `run_id` 与 verified live event `run_id` 进入同一内存索引；没有 exact identity 的
generic 不归属。实现未修改 public 3.0 snapshot、AG-UI、同源 HTTP、generated pin 或幂等 contract；terminal footer 仍无 mutation，
pre-receipt 恢复仍只复用原 key/body。

本目标不新增 wire。BFF public 3.0 `ChatMessage` 仍提供 `status`、optional `run_id` 与现有 strict
`failure={source,code,retryable}`；failure presence guard 仍要求 assistant + failed + nonblank `run_id`。verified Agent
`RUN_ERROR` 与 BFF-owned dispatch `RUN_ERROR` 已分别携带通过 identity 校验的 exact run id。Web 只把这些已发布身份映射为
`failedRunId`，不得从 message text、空正文、数组尾项、`message_id` 或当前选中会话猜 run。

- snapshot：同一 `run_id` 的最终 owner-ordered assistant record 为 failed 时，Web 可建立该 run 的 compact failure footer；safe
  failure 存在则使用 strict tuple，不存在则为 generic。failed record 没有 `run_id` 时保留独立安全失败反馈，但不声称轮级归属。
- live/replay：Agent `RUN_ERROR` 只使用已校验 top-level/nested 相等的 run identity；dispatch 同样只使用其 canonical identity。
  profile/code/message/source 的既有严格规则不放宽，raw producer details 继续不进入 UI 状态。
- completed：canonical completion 只关闭相同 run。另一个 run 的终态、新 user、Project 切换或正文相同都不是清除/迁移历史
  failure 的协议信号；重复 `event_id` 不产生第二 footer。
- action：public 3.0 没有 terminal retry 或 queued command。owner terminal 的 `retryable` 是分类，不是 Web mutation capability；
  terminal footer没有重发动作。只有 create-message 未获 receipt 的 transport-unknown 意图可按现契约以原 key 和冻结 body 恢复，
  该动作不得创建新 user 来冒充 retry。Project、Conversation、Message、ScheduledTask 与 Run identity 继续相互独立。

因此后继实现不改 `src/contract/**`、`src/generated/**`、HTTP path、AG-UI frame、BFF envelope、幂等字段或版本 pin。若 owner
snapshot 对某一 generic failure 未给 nonblank `run_id`，consumer 只能显示不归属的安全反馈，不能发明 3.1 字段或 fallback。

## WEB-COMPOSER-P0：无网络契约变化（2026-10-01；候选）

`SessionEngine.submit` 的boolean是Web进程内调用结果，不是HTTP receipt或owner状态。false表示调用未进入既有create-message流程，
所以不得清除草稿、创建意图、改写项目conversation URL或发送请求；true仍使用已发布的同一消息端点与幂等键。运行中停止继续使用
既有cancel control，运行中输入继续使用现有create-message路径。本片不声明queued、terminal retry或新的steer契约。

## WEB-PROJECT-FLOW：Session list 正式空页（2026-10-01；已验证源码切片）

BFF public 3.0.0 `SessionListResponse.data`要求`required:[sessions,next_cursor]`：`sessions`是数组，`next_cursor`是
string或null，null唯一表示没有下一页。真实同源响应`{sessions:[],next_cursor:null}`合法；Web同源adapter仅从
成功envelope解包`data`并原样返回，不删除或改写null。

目标`sessionListSchema`接受required nullable，拒绝缺失/undefined、错误类型与额外键；空串作为已发布string原样保留，不保留optional旧shape，也不以
nullish兼容隐藏producer漂移。正式与preview transport使用同一flat browser-private DTO。分页view只在解析后显式将null映射为
内部无continuation。本片不改path、`project_ref`、BFF envelope、snapshot、AG-UI、failure、operation或retry合同。

## WEB-BFF-PUBLIC3：唯一 public 3.0.0 上游（2026-10-01；已验证源码基线）

当前源码已删除旧public 2.0 pin；机器来源为BFF owner commit
`293dfe7638e5dea0df2bee6dfdd8483b53fc9df6` 的 committed OpenAPI `3.0.0`，原字节 SHA-256
`acd92ed2fa3e84032e824e1462d67a007c4a94a7e79b7bda8fd5a66f9d51cd3b`。Web 将原字节固定到唯一
`src/generated/bff-public-openapi.yaml`。Team generator只锁固定digest，failure inspector另锁version与ChatMessage/failure语义；
owner commit provenance由Root核对该commit的committed blob与snapshot原字节相等。当前snapshot已复制该committed原字节，
failure artifact已再生为两角色且12tuple不变；Team15再生输出与旧基线逐字节相等。generated artifact不是第二份可编辑schema。

- `ChatMessage.role` 的 owner 闭集是 `user | assistant`；删除旧来源的 `system` 约束，不建兼容 parser、静默过滤或角色改写。
- `/v1` path 与全部 operation inventory 不变；Project、Team、Library、Skills/MCP 与 failure public测试只更换同一来源 pin。
- `ChatMessage.failure` 三键、10 code、12个合法 tuple、presence guard、verified Agent `RUN_ERROR`、BFF dispatch
  `RUN_ERROR`、取消与 Share 只读语义全部不变。
- Agent 4 / BFF public 3.1 retry command 尚未发布；owner terminal 没有 Web retry mutation。本片不以3.0角色收敛提前实现retry。

下方 WEB-FAILURE3 是 public 2.0 的历史实现记录；其 failure/dispatch 安全规则仍有效，但其中version、digest与system drift
描述已由本节取代。

## WEB-FAILURE3：BFF public 2.0 安全失败（2026-10-01；运行时候选）

唯一机器来源是 BFF `ccb8e144` 的 public OpenAPI `2.0.0`，SHA-256
`ba10f89baf0fdd8cd4da58947b0411da8c84294dfe77e278533aeda59a905773`。本候选已将该文件原字节固定到
`src/generated/bff-public-openapi.yaml`，并由独立 generator 导出带 exact provenance 的 failure tuple；该 generated artifact
不是第二份可编辑 schema，也不为旧 public 1.0 增加 alias/fallback。generator 的模块导入是 pure inspect/render，只有作为
真实入口执行时才接受固定的 `--write/--check`。HTTP 路径仍为 `/v1`；当前运行时候选已接入下述 Message 与 AG-UI
严格分支，不增加旧版 fallback 或第二协议，最终状态以 Root 对冻结源码的独立复验为准。

### Message safe profile

`GET /v1/sessions/{id}`、`GET /v1/sessions/{id}/messages` 与合法 `GET /v1/shared/{share_id}` 共用唯一
`ChatMessage.failure`：

```json
{"source":"agent","code":"model_unavailable","retryable":true}
```

对象必须恰有 `source/code/retryable`，`source` 恒为 `agent`。code 闭集是
`token_budget_exceeded | recursion_limit_exceeded | assembly_failed | enqueue_failed | dispatch_exhausted |
contract_incompatible | internal_error | model_unavailable | dependency_unavailable | model_access_denied`。
十码的 `false` 全合法；只有 `model_unavailable` 与 `dependency_unavailable` 还允许 `true`，故机器合法集合恰为 12 tuple。

failure 存在时 Message 必须同时满足 `role=assistant`、`status=failed`、`run_id` 存在且 trim 后非空。failure 缺失仍可表示
cancel/BFF dispatch/delete 等 failed assistant；缺失不是 `null`，Web 不补 `internal_error`。Web 不接收/展示
`payload_json`、provider message、exception、stack、owner status、`error_kind` 或额外键。

BFF public `ChatMessage.role` 还合法包含 `system`，但现 Web runtime/render 只支持 user/assistant。本片不静默丢弃或把 system
改写成 assistant，也不借 failure 工作扩展全部 chat rendering：generator/contract test 必须保留 owner 的 system 枚举并证明
system+failure 被 presence guard 拒绝；runtime 对无 failure 的 system 仍 fail-closed，列为独立 consumer follow-up。

### verified Agent `RUN_ERROR`

```json
{
  "type": "RUN_ERROR",
  "threadId": "CONVERSATION_ID",
  "runId": "RUN_ID",
  "code": "model_unavailable",
  "message": "Agent run failed",
  "metadata": {"kokoro": {
    "event_id": "EVENT_ID",
    "seq": 42,
    "session_id": "CONVERSATION_ID",
    "run_id": "RUN_ID",
    "timestamp": "2026-09-30T00:00:00.000Z",
    "failure": {"source":"agent","code":"model_unavailable","retryable":true}
  }}
}
```

Web 要求 top-level/nested code、thread/session 与 run identity 全部相等，message 精确为固定安全文本；顶层没有
`retryable`。解析成功后只传播 nested safe profile，不传播 `message`。snapshot 与 live 的 profile 是同一个业务值，reload
不得从 watermark 前事件补猜。

### BFF-owned dispatch `RUN_ERROR`

BFF permanent launch failure 仍是标准 AG-UI `RUN_ERROR`，但语义不是 Agent failure：metadata 带
`source_owner="kokoro-bff"`，`seq` 是 `^[1-9][0-9]*$` 十进制字符串且可能超过 JS safe integer，frame 没有
`metadata.kokoro.failure`；message 固定 `Agent launch could not be confirmed`，top-level code 是 BFF 本地 launch code。
该分支必须同时满足 `threadId===metadata.kokoro.session_id`、非空 `runId===metadata.kokoro.run_id`、top-level code
存在且为 nonblank opaque string，以及 message 精确匹配固定文本。Web 不枚举 BFF launch code。BFF durable payload 到 SSE
不重写这些字段。Web 只以 exact source owner/shape 识别内部 dispatch terminal，保留 string source sequence 作
identity/order metadata，不显示或分类其 code/message，不把它放进 Agent tuple 或 numeric `lastSeq`。不同的非空
thread/session、run identity、blank/missing code 或 message mismatch 都 fail-closed。

其他 RUN_ERROR 不通过 unknown fallback；取消继续使用既有 canonical cancellation 语义，不伪造成 failure。网络仍只有 AG-UI，
不新增 CUSTOM error、旧 envelope 或第二协议。

### 可见动作边界

public 2.0 没有 retry terminal command。`retryable` 只用于安全说明，不授权 Web 重新 POST 原 user；Agent 4/BFF 2.1 正式
发布前，snapshot/live/shared 的 Agent terminal、dispatch terminal 与无 profile generic terminal 都没有 retry mutation。
Web 仅对 create-message 尚未取得 receipt 的 transport-unknown 以原 idempotency key 和冻结 body 恢复，不能把该行为写成
Run retry。Share 永远只读。

## Failed snapshot hydration（历史 public 1.0 基线；由上节 public 2.0 目标后继）

本节记录 `WEB-FAILED-SNAPSHOT-RESTORE` 当时的窄恢复，不是当前 failure3 目标或正式 retry 依据。

BFF v1 snapshot 已合法提供 owner-ordered `messages[]`，每项包含闭集 `status`（含 `failed`）、role、content、created_at 与 optional run_id；现契约没有 terminal failure 的 code/message/retryable 字段。Web 只在数组最后一项为 failed assistant、`active_run` 缺失且没有 pending pause 时恢复本地通用 failed 状态，`runError=null`。该判定不改变请求、响应、watermark、SSE replay、schema 或生成物，也不把 BFF message status扩写成 Agent错误分类。

后续 user 或非 failed assistant 是更新的 owner 顺序事实，必须阻止旧失败恢复；active run 与 pending pause 分别表示在途执行/HITL，同样优先于历史 failed。具体错误文案继续只来自 live `RUN_ERROR`；刷新后在 Agent→BFF 发布安全 typed failure 契约前仅展示既有通用失败文案和手动 retry，不解析或展示上游原始异常。

## WEB-PERSONAL-CODE 历史候选（2026-09-30）

Web 基线49adb4b；本节只记录当时 client/schema/同源 route/UI 切片，不覆盖顶部 public 2.0 当前来源。
当时唯一 public snapshot 固定 BFF `67755d16ff0f40ea02d71a6dad7108507a04766a`，原字节 SHA-256
`40578534da44dff8fcb7bb6812d43753542528b379d684a19100c35a62c60114`，间接 Platform6519ae9a/v5.0.1。
Web 没有第二可编辑 public contract、内部 SDK 或 owner 摘要。

正式 `/api/hub/self/skill-installations` 五方法已具名严格映射唯一 `/v1/skill-installations`：Install/SetEnabled/Remove
保留原单个 key、body和200 receipt；List/Get无body/key，DELETE拒body而非吞掉。strict media/query/presence/尺寸、
请求身份由原 Product admission构造，浏览器 subject/token/Cookie 不透传为可信 owner metadata。
两边均验证九字段安全表示、uint64 decimal/UTC/removed disabled、receipt change/event/请求身份绑定和 operation-specific error。
所有有效 owner 响应保留 no-store/request ID，429仅合法 Retry-After；redirect/非200成功/额外字段/不匹配身份与code/status均拒绝。
无 public CAS 字段、自动mutation重试、旧name入口fallback或本地合成 ACK。

List使用唯一 top-level data array/optional meta.next_cursor，三态filter与opaque cursor保持。unknown同键恢复；
已确认receipt之后Get current，失败只重读，不重复命令。Publish与Install、安装管理与Run选择没有隐式调用。
取消沿既有有限transport传播，不宣称服务端回滚。实际代码门见CURRENT；当前文档不等于已激活或真实五方法浏览器链通过。

## WEB-PERSONAL：五本人安装 API 消费目标（2026-09-30；历史文档门）

Web 基线 `14a54b4b8da68b37d83a13402bc8abb87001574e` 当时尚未消费安装 API。当时唯一 public 机器源为 BFF
`67755d16ff0f40ea02d71a6dad7108507a04766a` 的 `contract/openapi/v1/openapi.yaml`，SHA-256
`40578534da44dff8fcb7bb6812d43753542528b379d684a19100c35a62c60114`；下列是 consumer 义务，不是第二可编辑 schema。
BFF 已固定 Platform `6519ae9a7dba63586474d2860f6725d3165b701e` v5.0.1；Web 不复制内部摘要、receipt codec、Proto 或 IAM metadata。
当前 Web snapshot 仍为571b51de；后续原字节 repin 与 strict runtime/UI 必须分别验证，文档不等于接通。

### 路径、身份与命令

browser-private 前缀 `/api/hub/self/skill-installations` 唯一映射 public `/v1/skill-installations`，无非 self alias。
五个 operationId 固定为 owner 的 installPersonalSkill、listPersonalSkillInstallations、getPersonalSkillInstallation、
setPersonalSkillInstallationEnabled、removePersonalSkillInstallation。除以下精确方法/路径外不经通用 fallback 透传。

| 请求 | consumer 义务 | 成功 |
| --- | --- | --- |
| POST 集合 | strict JSON 仅 exact source_ref；单个有效 Idempotency-Key；无 query | 200 `{data:mutation}` |
| GET 集合 | 可选 enabled/installed/limit/cursor，拒重复/未知 query、body 与 mutation key | 200 `{data:installation[],meta?:{next_cursor}}` |
| GET `/{installation_id}` | exact ID；无 query/body/key | 200 `{data:installation}` |
| PUT `/{installation_id}/enabled` | strict JSON 仅 required boolean enabled；单个 key；无 query | 200 `{data:mutation}` |
| DELETE `/{installation_id}` | 单个 key；零 body、无 query；不得吞掉入站 body 再转发 | 200 `{data:mutation}`，非204 |

Identity 沿现 Product Session/service 身份，浏览器只交业务 selector，不交 tenant/subject/target/proof/包字段。
BFF 每次含 replay 检查 current IAM；其内部 trusted subject 由 BFF 构造，不由 Web 转发浏览器自报头。
source_ref 仅一次 skill: 前缀与 canonical ID，exact、不 trim/按名称推导/补最新 revision；installation_id 不能替换成 source 或 series ID。
POST/PUT 原始 JSON ≤65,536 bytes；key 为 owner 的1–128可打印非逗号字符规则，unknown/null/boolean字符串拒绝。
public 没有 expected_revision、If-Match 或 generation 字段；CAS/fresh snapshot 是 Platform 内部行为，不新建 Web 前置协议。

### 安全响应与分页

- installation 按 owner schema 严格八个必填字段和可选 removed_at：installation_id/source_ref/series_id/revision、
  installed/enabled、installed_at/updated_at；不接 tenant、subject、asset/hash、manifest、signed URL 或内部 reason。
  revision 是1..2^64-1的十进制字符串，不转 JS Number；时间为合法 UTC RFC3339 Z，缺失不变 null/epoch。
  removed 态 installed=false、enabled=false、removed_at present；installed=true 无 removed_at；保持 owner 时间序约束。
- mutation 严格 installation/change/replayed 及可选 event_id，change 只允许 owner 七值。
  unchanged 必无 event_id；其他值必须有首个合法 event_id。不以 response.ok 或空 ACK 推导成功。
- List 不使用旧 Skill `{data:{skills,next_cursor}}` 或 legacy meta.request_id。
  next_cursor absent 时整个 meta absent；present 空串/null/未知字段拒绝。
  limit 省略50、合法1–100；cursor 非空且≤4096 UTF-8 bytes，opaque、不 trim/解码。
  installed/enabled 缺失表示不筛选（含 removed），false 与缺失不同；固定 installation_id ASC keyset、非 snapshot。
  cursor 绑定本人权限/filters/surface，筛选改变重置；每页重新授权，不将 cursor 当许可或在 Web 后过滤模拟 owner 分页。
- 所有成功与错误都核 JSON media、owner 专属状态、`Cache-Control: no-store`、有界 `x-request-id`。
  禁 redirect；只保留批准 header，429 的合法有界 Retry-After 可透出。
  现普通 Hub 改写 private,no-store/丢 request ID 的分支不适用于本操作组。

### 错误、取消与 unknown ACK

strict error-only `{error:{code,message,retryable}}` 按唯一 OpenAPI 的逐状态 code 校验：400输入，413超限，401 session，
403禁止，404本人不可见，409幂等冲突/进行中，412前置失败，429限流，502坏 owner 响应，503依赖/配置，504 deadline。
List 没有404/409/412成功恢复猜测；Get 与 mutation 按各 operation 专属错误集。分支不读 message；UI 只显示本地安全文案，
保留 code/retryable/request ID 供确定性处理。adapter 自身配置/准入/transport 错误也使用对应严格 envelope，不回旧字符串错误。
现请求有限 deadline 与 AbortSignal 继续贯穿，取消写请求不证明服务端回滚；不因20秒 BFF预算扩大所有 Hub timeout。

每个 mutation 冻结原 key、method/path/body。未知 ACK 只显式同键重试，不自动换键、使用旧服务或本地合成成功。
receipt replay 是历史提交结果而非当前 snapshot；取得合法 ACK 后 Get 当前 installation，当前读失败只显示待核，不重发已确认命令。
Install 未知且无 ID 仅同键重试；刷新丢 key 后只读取当前页，不由列表推造 receipt。401/403停止自动动作，409/412复核当前状态。
管理读无需 source 持续健康；false/remove 仍交 owner，Web 不先以公开 Skill 404或不健康阻止降权。
Publish 与安装、安装与 Run 选择无隐式调用；installed/enabled 不构成未来执行授权。

下一精确文件/RED与门禁见 TECHNICAL_DESIGN 同名节；本片只改四文档，没有 repin、运行消费或真实组合完成声明。

## WEB-PRODUCT-IA-CODE 当前消费者（2026-09-30；待 Root 验收）

基线 `7087225`。网络 API/contract/generated 未改：Conversation engine/project_ref、Project create frozen intent、
ScheduledTask live client/同源 `/api/scheduled-tasks` 继续现契约。只删除 Web 正式 Project 未解析 ACK 的 scheduled callback 接线，
其卡片导航独立 `/app/scheduled`；无新增、重命名或伪造 owner endpoint。项目专属 POST 契约仍属于 BFF，未来消费者须解析其真实回执。
内部 welcome `onCreateProject(draft?)` 与 `onOpenProject(ownerId,draft?)` 分离；不再把 preview sentinel 当正式创建命令。
rail 删除 onCreateTask→onNewChat / onReorderTasks alias；任务导航不提交 Chat。
审查返修同步 Conversation 的 DOM/data-test/aria/CSS 与组件文件名；命令菜单 new chat 文案对齐，非网络协议变更。缺 owner project ID 不发猜测项目请求。
Preview 夹具隔离、缺 callback 不宣称正式成功；无 auth、deadline、幂等、权限或错误门放宽。
下节文档门中的“当前”描述为实施前基线，代码候选与实测边界以本节/CURRENT 为准。

## WEB-PRODUCT-IA：既有资源入口消费边界（2026-09-30；仅文档）

基线 Web `79f19df`；本门不编辑 contract/generated，不新增 endpoint 或 owner wire。固定机器来源仍是
`src/generated/bff-public-openapi.yaml`，同源 path/schema 仍是 `src/contract/` 与现 route adapter。

| UI 意图 | 已存在边界 / 目标消费 |
| --- | --- |
| 独立会话 / 专案内会话 | 复用 Chat engine、既有 `project_ref` 与 conversation 列表过滤；归属可选，不把 Conversation ID 当 ScheduledTask/Run ID。原 Chat 幂等、AG-UI 与水位完全保留。 |
| 新建/打开专案 | 现 `features/app/project-create.ts` → `/api/hub/projects` → BFF `/v1/projects`；严格 owner 回执 ID 后打开 `/app/project/{id}`。未知 ACK 复用原意图；导航失败只重试已得 ID，不重发创建。品牌、slug 猜测、`kokoro`、preview sentinel 不提供真实项目身份。 |
| 独立任务 | 现 `/app/scheduled` → ScheduledTaskSurface live client → `/api/scheduled-tasks` → BFF `/v1/scheduled-tasks`，现 get/update/delete/retry 子路径保持。既有严格请求/回执 schema、mutation key 与失败状态复用；不新建“任务=新聊天”别名。 |
| 项目调度 | 固定 public 已有 POST `/v1/projects/{projectId}/scheduled-tasks`，要求 Idempotency-Key，返回 ScheduledTaskResponse；当前 useAppFrameProject 仅验 HTTP ok 丢弃回执，Project UI 合成 ID，不能当真实成功。首片移除正式嵌入假流程，任务导航去独立 live surface；后继若接项目创建，必须沿此 owner 回执和精确输入，不假造新协议。 |

**严守两个差异。** `/v1/projects/{projectId}/tasks` 返回 TaskListResponse，不等于 Conversation list，
也不等于 ScheduledTaskListResponse；不因路径里有 tasks 就挪用。现 ScheduledTask public 允许 project_id，
但 Web 独立 client 的视图投影未保留它，列表接口消费没有项目筛选；因此首片不声称任务页面已按 Project 过滤，
不通过猜 ID/标题或前端合成关系提供该承诺。完整项目集合消费者也尚未接入 rail，不把假单项目当集合。

浏览器只用同源 adapter；tenant/actor/owner 权限来自当前 Product Session/BFF，不由 UI body 自报。
HTTP 401/403/404/429/依赖错误仍保持现 contract 语义，loading/error 不转成功或预览数据；网络结果未知不发新副作用身份。
正式 UI 只有真实 owner ACK/经校验读取才宣称资源创建，入口存在不证明 Scheduler/Agent 已执行。
新入口沿站点有效导航与既有 mounted surface，不改公开 route 语义或添加兼容 alias。

验收建议：现 contract、architecture、ScheduledTask client/surface 行为门保持；首片组件 RED 覆盖导航意图不混用、
缺 callback/错误无假成功、真实 owner ID 才导航、preview 不污染正式请求。当前文档门未执行真 owner/E2E。

## W3-WEB-CHAT-SKILL-SELECTION（2026-09-29；当前消费合同，待 Root 验收）

BFF public 唯一 owner 为 `571b51de2057905c74c78ac966c8cf5ac11eca93`，其 OpenAPI 原字节 SHA-256 是
`f49023882315a4f46e46e95595a02eaa7bb85475d5f46d2b945bc0555edb0c90`；Web 已更新只读 snapshot 与生成校验 digest，
不建立第二可编辑契约。`MessageCreateRequest` clean-slate 删除旧 `pinned_skills`，改为
`selected_skill_source_refs`。Web 每次创建消息都显式发送该数组，包括无选择时的 `[]`；不得发送 alias、显示名称、
`null` 或省略来维持旧语义。

每项为 exact `skill:<SkillId>`：不得 trim/规范化，须匹配
`^skill:(?!skill:)[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])`；使用绝对末尾断言，尾随 LF、CR 或 Unicode
换行均拒绝，不得以 `$` 代替；
最多 16 项、有序唯一、单项最多 197 个字符，整个数组的 compact UTF-8 JSON 最多 4096 字节。选择顺序进入 BFF request digest。Web 在提交开始时冻结 content、idempotency key 与该数组；网络结果未知或
用户显式重试必须复用同一集合，不能采样重试时的新选择。同 key 不同选择由 BFF 409 拒绝。严格 consumer 同时拒绝旧
`pinned_skills`、重复、17 项、数组 JSON 超 4 KiB、前后空白/空 suffix 与多余字段。

个人 Skill GET 的 `source_ref/revision` 仅给选择标签与 exact identity；它不是 installed/enabled/executable proof。
当前正式页面没有选择入口，Agent 非空 reader 也未接，因此当前只提供 typed consumer/default `[]`，不宣称非空请求可执行。preview 名称动作
不进入此 wire；旧 `kokoro.web.pinned_skills` 不读取、不迁移、不作 fallback。

## W3 第二阶段 B：正式 Skill 写候选消费（2026-09-29；待 Root 真链验收）

BFF 唯一 public OpenAPI owner `62daba37fc0267830d73590bb5a3499807d46fc6`，Web 原字节 pin SHA-256 `5553b798446c8b764fc33d3ccdba6185c3c308213f712cdcf34e751166e0e923`，无第二可编辑契约。浏览器业务只向同源 `/api/hub/self/skills/*` 请求；同源 route 把 CreateDraft、Get package-upload、Begin、Complete、Validate、Publish 转到 BFF `/v1/skills/*`，携 Product Session/service 身份而不接受浏览器自报 tenant。严格 JSON media、`no-store`、安全 request ID、`{data}`/`{error:{code,message,retryable}}`，成功 201/200 按 operation；零字节 Publish 不带 JSON/body，Idempotency-Key 单次意图稳定且符合 owner 1–128 printable 规则。拒绝旧 multipart preview/confirm 作为正式写回执。

Begin 返回 `url/method=PUT/required_headers={content-type:application/zip}/expires_at`；Web 仅用短期引用原 File 直 PUT，不追加 Cookie/Bearer/header、禁重定向。HTTPS 页面到 HTTP URL 必拒；开发仅 loopback HTTP→loopback HTTP，BFF 另对 ObjectStore public origin 作精确 allowlist。Get `none/intent/upload_pending/uploaded/validated/aborted` 是 attempt 状态，Begin/Complete/Validate 均不能证明发布。Complete `scan_state=pending|unknown` 要停在扫描 partial，同页显式复核当前 attempt/epoch/upload 后同键 Validate；状态被替换只能明确重开意图。唯一完成判断是 strict `PublishSkillResponse.data` ACTIVE 且匹配 draft ID，或本人 `GET /v1/skills/{id}` 的 ACTIVE 七字段权威核回；恢复 GET 可取消，401/403 原码保留且不重发，首轮 404 显示未知，后续显式核对仍 404 才同键零 body 重发。感染、旧 attempt、无效 phase、未知 ACK 均不走旧 pool/catalog fallback。Draft owner raw-body 65,536 字节独立于 schema 各字段最大值；Web 先按序列化 UTF-8 字节预检并给可编辑超限提示，route 同限额且超过有类型化 413；Begin filename 在创建 Draft 前复用 schema 预检。非 self Skills/MCP alias 404，不以通用 route 绕过严格边界。六写候选在 BFF 仍 default-off/Platform v4 inactive；Root 真 HTTPS/CORS/Storage 浏览器链另验。

## W3-WEB-SKILL-CONSUMER 第二阶段 A：正式 GET 消费（2026-09-29）

BFF 唯一 public OpenAPI `62daba37fc0267830d73590bb5a3499807d46fc6`、Web 原字节 SHA-256 `5553b798446c8b764fc33d3ccdba6185c3c308213f712cdcf34e751166e0e923` 未变。正式同源 `/api/hub/self/skills?scope_kind=personal[&cursor]`、`/api/hub/self/skills/{id}`、`/api/hub/self/mcp/servers[?cursor]` 分别代理 BFF `/v1/skills`、by-ID、`/v1/mcp/servers`；不得直接访问 Platform。严格 `200 {data}`、`Cache-Control: no-store`、`x-request-id`，错误必须为 `{error:{code,message,retryable}}`，未知/缺失字段、旧 `{data,meta}`、redirect 和错误状态均失败；不从旧 pool/catalog 补读。Skill 列表保留 `source_ref/revision/next_cursor`；本人 ACTIVE by-ID 只取七安全字段，响应 ID/source_ref 与请求一致；404 不推断为未发布之外的事实。MCP 只投影六 owner-native 字段，不读 URL/secret/revision/allowed_tools，也不呈现无效启停/删除。旧 pool/catalog/quota、MCP secrets GET 在正式同源 route 拒绝；显式 preview fixture 与旧上传 preview/confirm 暂留到上传切片，非正式发布证据。六项新写 API 仍 default-off，本切不发请求。

第一阶段条目以下为历史 pin 门；本节才是当前只读运行状态。

## W3-WEB-SKILL-CONSUMER 第一阶段：BFF public 原字节 pin（2026-09-29）

唯一可编辑机器源是 BFF `62daba37fc0267830d73590bb5a3499807d46fc6` 的 `contract/openapi/v1/openapi.yaml`；Web `src/generated/bff-public-openapi.yaml` 只保存原字节 SHA-256 `5553b798446c8b764fc33d3ccdba6185c3c308213f712cdcf34e751166e0e923`，Team client 仍由现有生成器从该 snapshot 派生，Web 不建另一份 public schema。本阶段更新 pin、文档与直接 contract 负例，**不改正式同源 route/client/parser/UI**。当前这些运行代码仍使用旧 preview/confirm 与 MCP/Skill 形状，不能将新机器契约误述为已消费。

| BFF 唯一 public 边界 | 下一运行片的严格消费义务（本阶段只 pin） |
| --- | --- |
| `GET /v1/skills?scope_kind=personal[&cursor=...]` | 当次 IAM subject/tenant；只把 owner 返回的个人 ACTIVE 投影作为个人页权威列表，保留 `source_ref` 与正 `revision`，不使用旧 `scope=official|third_party`、pool/catalog 代替；opaque cursor 原样继续。成功 strict `{data:{skills,next_cursor?}}`，无旧 `{data,meta}` 双读。 |
| `GET /v1/skills/{skill_id}` | 本人 PERSONAL/ACTIVE 且不要求安装；200 只取 `skill_id/source_ref/revision/status/name/summary/tags` 七字段，非本人/非 ACTIVE/跨租户 404。发布 ACK/key 遗失时此读可核已 ACTIVE，Get package-upload 不可替代。 |
| CreateDraft / Get / Begin / Complete / Validate / Publish | 六项写候选 BFF default-off、Platform v4 inactive。目标为单 ZIP→Draft/Get/Begin→签名原字节 PUT→Complete→Validate→零 body Publish；每个 mutation 原 key/body 同键重试，当前 IAM/owner 重验。`uploaded`/`valid=true` 非发布成功；严格 Publish ACTIVE/event 回执或本人 by-ID 才显示完成。未知 ACK 显式未知，失效/感染/旧 attempt、坏回执不得转成功。 |
| `GET /v1/mcp/servers` | 仅 owner-native `server_id/provider_key/server_identity/transport/declaration_digest/status` 六字段，strict `{data:{servers,next_cursor?}}`。URL、revision、allowed_tools、secret_ref 与旧启停/删除展示不是当前读投影；不可伪造为可操作连接。 |

浏览器业务请求仍只走 Web `/api/*` 同源 Product Session adapter→BFF；ZIP bytes 唯一例外是按 BFF 受控短期签名引用发往批准 ObjectStore public origin 的直接 `PUT`，`credentials: omit`、`redirect: error`，原样 headers、无 Cookie/Bearer；Web/BFF 不代理 ZIP。401/403/404/409/412/429/502/503、`x-request-id`、`Cache-Control:no-store` 与错误 `{error:{code,message,retryable}}` 以 owner OpenAPI/运行行为为准，不从 message 推断恢复分支。下阶段旧 preview/confirm、`scope=official|third_party`、`.skill` 多候选和 MCP 假字段需同 UI 切片删除，不能保留 fallback。真正 CORS preflight/PUT、ACTIVE 刷新列表/by-ID、撤权/感染/过期/坏回执仍须 Root 隔离 Chromium 真链核验；六项写候选不能因本 pin 自动打开。旧 W3-WEB-SKILL-UPLOAD-DOC-GATE 的 BFF `55ca6c1`/SHA `0198220b` 只是历史文档门来源。

## S9-WEB-DOC：Chat Delivery 消费契约（2026-09-28；仅文档）

唯一 owner 机器源是 BFF main `bd1f794e7b1115d96965aa03d8a3a83a33c42fd7` 的
`contract/openapi/v1/openapi.yaml`，原字节 SHA-256
`a224b186813615467b6c045d3be83082d3e164e140d6da9722bf3f8d7e33b219`。
Web main `102033e34be89ba0e9958447e4d4021fcbf257b7` 的 generated 仍固定旧 SHA-256
`8a0849dcf3ae557d5f3166ad624c5eea9f42bc0b65c7a6ae7fda1741224d567b`；
本门不编辑 generated、Web Zod 或 BFF 契约，不声称当前 Chat 已能解析新响应。下一代码门先由固定
BFF 来源确定性重生成并查 drift，再改消费解析，不能手工改 owner schema 副本。

| 边界 | 目标消费规则 |
| --- | --- |
| `GET /api/session/sessions/{id}` → BFF `GET /v1/sessions/{id}` | 当前 Product Session 的本人 active Conversation/Project 准入由 BFF 实施。200 `data.deliveries` 为最近最多 100 件，按 `delivered_at DESC,artifact_id ASC`；`data.deliveries_has_more` **必填 boolean**，`data.event_watermark` 与 Delivery 来自同一 PostgreSQL 读快照。Web 不拿水位当授权；错误不构造空列表。 |
| 每个 snapshot `Delivery` | **必填且无额外字段**：`conversation_id`、`artifact_id`、`asset_id`、八值 `artifact_kind`、`title`、`mime`、`size`（0..`Number.MAX_SAFE_INTEGER` 的安全整数）、`run_id`、UTC `created_at`。`(conversation_id,artifact_id)` 是唯一视图身份/Library selector；`asset_id` 非单独下载入口。snapshot 不要求 `tool_call_id`、`path`、`content_hash`。 |
| `/api/session/sessions/{id}/events` AG-UI | BFF durable ledger cursor 是唯一 replay axis。`kokoro.delivery.created` 的 Agent live/replay payload 与 snapshot 不同：完整校验 ID、kind、`tool_call_id`、`path`、`content_hash`、title/mime/size 等生产字段；`conversation_id` 来自受校验的 AG-UI thread/session envelope，不从 hash/path 猜。保留 wire 协议严格性，但 UI 只投影必要字段，不能把 snapshot schema 套到 live 上。Web 当前 parser 尚拒这些新字段；不增加 legacy `SessionEvent` 网络 fallback。 |
| 断线/GC | 普通断线按 `Last-Event-ID` 从确认 cursor 续流；流建立收到 BFF HTTP 410 `event_cursor_expired` 时保留稳定码供 machine 区分、丢弃旧 cursor，重新 GET 本人快照，并从返回 watermark 续流。与 snapshot GET 的 410/404“会话不存在/已删”分开。Web 当前 transport 将流 410 包成无 status 普通错误，machine 直接 FAIL，尚无该恢复。其他 HTTP、坏 200 或坏事件 fail loud，提供显式重试，不降级为 hash/preview。 |
| Chat 卡/Canvas 动作 | 使用 Library 已发布的 `GET /api/hub/library/artifacts/{conversation_id}/{artifact_id}` 详情与同二元 `/content` 同源原生 attachment；每次由 BFF 重新授权，详情预检不保证下载仍可见。本人以外/错二元组不可见 404；Asset/hash/path 不是授权凭证。快照 `deliveries_has_more` 为真时显示现有 Library“查看全部作品”。 |

同一二元 ID 的 live/replay/snapshot 去重；同 hash 不同 ID 均保留。终态 snapshot 对账需要兼顾
同事务水位和在途 live 竞态，不能无条件以旧快照整表替换。Share snapshot 依 owner 契约保持
`deliveries: []`、`deliveries_has_more: false`，不是个人 Artifact 分享许可。本切片不扩展 Share、Project
授权，也不把个人 File `asset_id` 与作品联合。代码门覆盖坏字段/大小边界、双 ID、100+入口、410 恢复与
原生下载/私有错误，并跑 Node22 contract、architecture、lint、typecheck、test、build、隔离 E2E 与 Root 真
IAM→Chromium→Web→BFF→Agent→Storage 组合；本门仅要求文档/机器源核对及 `git diff --check`。

## W2-WEB-AGENT-ARTIFACT-F2-CODE：作品页消费契约历史基线（2026-09-28）

本仓已将 BFF `55d3c9cd55386d9dcc074e893cc388924dd94c13` 的唯一 public
OpenAPI 原字节固定到 `src/generated/bff-public-openapi.yaml`，SHA-256
`8a0849dcf3ae557d5f3166ad624c5eea9f42bc0b65c7a6ae7fda1741224d567b`；
生成检查为 15 文件无漂移。正式作品 consumer 只读 `GET /api/hub/library?kind=artifact&limit=50`
及其 opaque cursor、二元详情 `GET /api/hub/library/artifacts/{conversation_id}/{artifact_id}`，
严格拒非空 File/混合页、坏项和错二元身份，允许 `items:[]` 带 `next_cursor`。
详情预检非下载许可。内容只发起精确同源二元 `/content` 原生 attachment GET；Route 对
200 校验 ≤1 GiB 长度及安全头后流式转发，非 200 不加下载成功头，3xx 拒绝。
401/403/404/429/502/503 与坏 200 不降级为旧 hash/preview 空页；页面只能观察
发起动作，不能观察浏览器保存完成或预检后的下载竞态。BFF 每次内容请求仍独立准入。
个人文件 1 MiB 与通用 Hub 默认不变，Web 不另发布 Product contract。

作品页正式旧 `/api/session/artifacts` 列表/内容消费者已删，Chat `deliveryPath`/Canvas
仍保留；BFF live 已发布 `artifact_id/asset_id/artifact_kind`，而 Web Chat strict schema 与
BFF 空 `deliveries` snapshot 尚未协同恢复，不能把旧 Chat 路径视为新 Artifact alias。
Root 真浏览器及跨仓固定来源验收另行记录，不由本仓 contract 测试代替。

## W2-WEB-AGENT-ARTIFACT-F2：作品页消费契约设计基线（2026-09-28；代码前）

唯一机器来源是 BFF main `55d3c9cd55386d9dcc074e893cc388924dd94c13` 的
`contract/openapi/v1/openapi.yaml`，原字节 SHA-256
`8a0849dcf3ae557d5f3166ad624c5eea9f42bc0b65c7a6ae7fda1741224d567b`。
Web 当前生成快照仍为 BFF `d5c868f`/SHA-256
`3f8aba161444d8b617df7ff1789e698269a4a6dd2c8b2ae7b3aaadb331947681`；本门不复制或手改
owner OpenAPI/generated，也不宣称当前 UI 已使用新 API。后续代码门须从该固定 commit 原字节 pin、确定性
重新生成并用 consumer contract 测试检验源 digest、operation、成功/错误和安全头。

| Browser → Web browser-private                                            | BFF public 与 Web 消费边界                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/hub/library?kind=artifact&limit=50[&cursor=opaque]`            | 唯一 `GET /v1/library` / `listLibrary`；`kind` 必填且单值，仅 `file` 或 `artifact`，不接受省略、重复、`all`；作品页固定 `artifact`，`limit` 缺省 50、1–100，cursor 单值 1–4096。当前 subject/tenant 从在线 Product Session/BFF admission 获取，不接受浏览器身份 header/body。200 是 `{data:{items,next_cursor},meta:{request_id}}`；`data` 是**页级** `oneOf`：`items:[]` 空页、1–100 个纯 `kind:file`、或 1–100 个纯 `kind:artifact`。作品页必须拒绝非空 file/混合/坏 item；空页可仍带 `next_cursor`，需继续可见翻页，不与最终空态混同。cursor opaque、绑定 kind/tenant/subject/limit/位置但非快照或许可。                       |
| `GET /api/hub/library/artifacts/{conversation_id}/{artifact_id}`         | `GET /v1/library/artifacts/{conversation_id}/{artifact_id}` / `getLibraryArtifact`；只用二元 selector 请求当前已授权详情。200 `{data:LibraryArtifactItem,meta:{request_id}}`；与列表项同身份/字段，运行时严格解析。`asset_id`、hash、`source_run_id`、`content_sha256` 均不得取代二元路径或作为授权。                                                                                                                                                                                                                                                                                                                             |
| `GET /api/hub/library/artifacts/{conversation_id}/{artifact_id}/content` | `downloadLibraryArtifact`；无额外 query/body/客户端 Storage URL。BFF 200 为 `*/*` 原二进制，非 JSON、非 302，长度 `0..1,073,741,824` bytes。Web 只在**此精确 GET** 走专用有界流/真实背压/独立总与空闲 deadline/断连取消，检验 `Content-Type`、十进制 `Content-Length`、安全 `Content-Disposition`、`Cache-Control:no-store`、`Referrer-Policy:no-referrer`、`X-Content-Type-Options:nosniff`、`x-request-id`，最终 Proxy 不得覆盖 `no-referrer`；仅白名单同源返回。浏览器用同源原生 attachment 下载，不以 `fileFetch().blob()` 缓冲 1 GiB；UI 仅报告下载已发起，不宣称本地保存完成。短字节/超限/断流须终止流；下载文件名来自受校验的 owner 头，不执行 header 内容。个人 1 MiB 完整缓冲与通用 Hub 16 MiB/15 秒默认均不放宽。 |

非空 Artifact item 的判别字段为 `kind:"artifact"`，身份 `conversation_id`+`artifact_id`；还包括
`asset_id`、八值 `artifact_kind`、`title`、`filename`、`mime_type`、十进制 `size_bytes`、小写 64hex
`content_sha256`、`source_run_id`、UTC `delivered_at`。Web 映射为单独视图类型，不能 cast 成旧
`ArtifactRecord(content_hash,session_id,...)` 或个人 File。列表/详情/下载每次由 BFF 重验本人 active Conversation
关联及 Storage FINAL/CLEAN；同租户他人/错二元组/不可见统一 404，固定 Product tenant 外 403；401 会话失效，
400 非法 selector/query/cursor，429 准入限流，502 不可信 owner/对象，503 依赖故障或
`artifact_download_busy` 均保留 BFF 稳定错误码与请求 ID，错误不套二进制成功头、不降级旧 hash/preview。
下载前可用二元详情 GET 显示 401/403/404/503 等预检错误，但该结果不是 `/content` 授权，下载时仍重验且可能竞态失败。当前 transport `onData` 直接 enqueue、非 SSE 无独立空闲计时、end 未核 `Content-Length`/`response.complete`；代码门须实现 pause/resume 背压、独立总/空闲计时与短/超字节和完整结束核对。原生 `<a download>` 没有 JS HTTP/保存完成回执，预检后的 content 竞态或下载管理器失败不应被页面伪报为成功；若以后要求可见保存完成状态，应另设计 feature-detect 的流式 File System Access writer 与 fallback。分页错误保留已确认项与原 cursor 供显式重试，不能从 HTTP 200 外或坏 200 构造空列表；下载 503 busy
是进程内两 spool 背压而非客户端获得排队许可。成功/失败均 `no-store`，不暴露签名引用或内部身份头。

Agent live `delivery.created` **已有** `artifact_id/asset_id/artifact_kind`，但 Web 旧严格 Chat schema 会拒它；
BFF 当前 chat snapshot `deliveries: []`。本切片只替换 Library 作品页正式列表/详情/内容路径；Chat delivery、Canvas
及 snapshot/replay 的 schema、恢复和二元导航由后续 owner 协同切换，未切前不能把旧 Chat hash 描述成新 Product API
的别名，也不能以 Library 读取成功证明 Chat 恢复。待作品页新合同/UI/真浏览器过门后删除该页旧
`/api/session/artifacts` 与 hash 内容路径，不留正式双轨；Chat 旧路径有独立删除门。

## W2 个人文件下载 consumer 当前契约（2026-09-28；个人下载真纵切已验收）

Web generated public OpenAPI 已按 BFF main `d5c868f8ab8b8a33750e1286e9d020ca72895641` 原字节固定为
SHA-256 `3f8aba161444d8b617df7ff1789e698269a4a6dd2c8b2ae7b3aaadb331947681`；Team 派生生成物 drift check 通过。
浏览器仅调用 `GET /api/hub/library/files/{asset_id}/content`；该精确路径校验完整二进制、≤1 MiB、
`Content-Type`、`Content-Length`、`Content-Disposition`、`Cache-Control: no-store`、
`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff` 及安全、有界的 `x-request-id`，只转发窄白名单。Owner 非 200
错误保持错误语义，重定向、缺失/坏 header、短 body 受控失败且不触发保存；404 就近呈现且不泄露归属。
直接 contract/adapter/UI 测试及本仓 Node22 全门已通过；Root 固定 `44ee670f` 的真 Chromium 两次按钮保存原字节、HTTP 安全头及他人同 asset 404 PASS。完整 Product/W2 边仍另验。

## W2 个人文件下载 consumer 设计门历史基线（2026-09-28；代码前）

唯一可编辑 public 机器事实源为 BFF main `d5c868f8ab8b8a33750e1286e9d020ca72895641` 的
`contract/openapi/v1/openapi.yaml`，原字节 SHA-256
`3f8aba161444d8b617df7ff1789e698269a4a6dd2c8b2ae7b3aaadb331947681`。该 owner 已发布
`downloadLibraryFile`：`GET /v1/library/files/{asset_id}/content`，`public`/beta、`storage.library.read`、
无幂等键；200 为上限 1,048,576 bytes 的完整二进制，含 `Content-Type`、`Content-Length`、
`Content-Disposition`、`Cache-Control: no-store`、`Referrer-Policy: no-referrer`、
`X-Content-Type-Options: nosniff`、`x-request-id`。BFF 的 400/401/403/404/429/502/503 仍使用 owner 错误
契约；404 不能被 Web 改写为“文件列表为空”。代码前 Web generated 快照 digest 为
`6fa107540c6cc60ec8b45f1bcc19c8930f19c803b16f4c6d418c2edc9393fc52`，本设计门不修改生成物或运行时。

目标 browser-private 请求为 `GET /api/hub/library/files/{asset_id}/content`，无额外 query/body/客户端身份头，
只通过现有在线 Product Session adapter 注入 BFF Bearer；浏览器不接触 Storage reference/签名 URL。
仅该精确路径、GET、成功二进制响应增加上述下载安全头的严格校验与窄透传；既有通用 Hub header 白名单不
泛化，`Cache-Control` 保持 private/no-store 语义，错误响应不带成功下载头。畸形/缺失安全头、坏长度、
意外重定向或未完整取得内容不得进入文件下载；不能仅凭 `Content-Type`（例如用户上传的 JSON 文件）
推断成功或失败。文件卡以已校验个人 GET 项的 `asset_id` 构造路径，
但 BFF 仍须在每次请求重新校验 owner/ASSET/CLEAN，路径值本身不授予访问权。Web 可用已校验列表名称作为
安全锚点文件名，不将 Content-Disposition 当 HTML；下载 Blob 未完整取得前不得宣称成功。

运行状态须区分就近下载中、成功、可重试错误、私有/失效 404 与取消；主动取消回到可操作状态，不当作下载成功；重复点击禁发，切页/卸载取消，
迟到结果不下载或污染别的卡。401/403 不伪装为空页，429/502/503/网络错误由用户明确重试；
不自动走 Artifact hash URL 或 preview fallback。后续代码门须把 Web generated 原字节及 commit/digest
精确重钉、更新直接 contract/adapter/UI 测试，再由 Root 进行真实 Chromium 按钮与原字节验收。

## W2 个人文件上传 consumer 代码片（2026-09-28；历史切片，已由 Root 验收）

唯一 public 机器事实源是 BFF owner `8a90fdd9ec3809000924229bfc7b986ba8ba1522` 的
`contract/openapi/v1/openapi.yaml`，原字节 SHA-256
`6fa107540c6cc60ec8b45f1bcc19c8930f19c803b16f4c6d418c2edc9393fc52`。其
`POST /v1/library/files`（`uploadLibraryFile`）已发布；代码前 Web 只读 generated 快照固定旧 BFF
`a67ae2d`，当前工作树已单轨原字节重钉并更新生成来源/直接 contract 断言。浏览器只调用已存在的
`POST /api/hub/library/files` browser-private 同源 adapter，服务端以当前 Product Session 转 BFF；
不得浏览器直连 BFF/Storage 或自报 tenant、subject、personal scope、project ID。

| 边界 | Web consumer 目标 |
| --- | --- |
| 请求 | 单文件 `multipart/form-data`，恰好一个 `files` part、无额外字段/query；必填每文件意图唯一且重试稳定的 `Idempotency-Key`（BFF 接受 1–191 位、无逗号和周围空白的可打印 ASCII）。`File.size > 1 MiB` 先快速拒绝，剩余文件仍须用原生 Request 的实际**整段** multipart body ≤1,048,576 bytes 判定，不以 `File.size` 单独放行；Web adapter 已为该精确 POST 设置 1 MiB/50 秒，BFF 继续最终校验。 |
| 200 | 只接受 `{data:{file:{kind:"file",asset_id,filename,mime_type,size_bytes,content_sha256,scan_state:"clean"}},meta:{request_id}}` 的 BFF 成功形状，运行时严格校验并核当前文件名/大小；响应无 `created_at`、下载 URL 或 Artifact 字段。随后重新 `GET /api/hub/library?kind=file`；GET 成功才显示权威列表，GET 失败不得把 POST 回执当作持久已列项。 |
| 可恢复 | 网络断开/响应未知、已发请求后的 408/429/全部 5xx（含 `503 library_file_scan_pending`）及 `409 idempotency_in_progress`：保留**同一 File、同一 key**，只在用户明确操作后重试，绝不自动换 key 或宣布成功；扫描待定/幂等处理中显示“稍后同文件重试”，不误报上传失败。401/403 的登录/准入错误不伪造空页或自动重试。 |
| 终态 | `409 idempotency_conflict`、`409 file_upload_aborted` 与 `422 library_file_infected` 对本意图为终态，禁同键重试；400 非法文件/键、413 整体超限须就近显示并修正输入。未知/畸形 200 也不宣布成功，先保留原 File/key 供结果核对/明确同键重试。 |

BFF 每次幂等重放仍须进行当前身份准入；个人 scope 由可信 tenant/subject 派生。Web 不用 GET cursor、内容 hash、POST key 或另一成员的 session 作访问许可；只读个人页与 Agent 作品页维持独立模型。BFF 下载 public 契约已由后续 owner 切片发布，但不属于本上传片；Agent Artifact F2 也不借 Project POST 或作品 hash 下载路径实现。此处是 consumer 行为，不复制 BFF 可编辑 OpenAPI；上传 UI 与 generated 回钉已发布，Root 固定真实 Chromium 上传点击门已通过；Web 下载按钮仍未实现。

## W2 Library 文件 consumer（2026-09-28；已发布的只读基线）

Agent 作品页签继续消费 `/api/session/artifacts` 的 `ArtifactRecord`；Web public 快照
`src/generated/bff-public-openapi.yaml` 已原字节固定 BFF owner
`a67ae2d06b52202f349305ae3723f6e296c087a1` 的唯一 public OpenAPI SHA-256
`82df2303f9f86e9b4caa4b5965f930735740d8c044c955450e45406dc29cabb9`，并通过 Team 生成 drift 检查。

文件页签：浏览器 `GET /api/hub/library?kind=file&limit=50[&cursor=opaque]`，经既有同源
Product Session adapter 到 BFF `GET /v1/library`；`kind=file` 必填，不借无参或 `kind=artifact/all`
语义。BFF 200 为 `{data:{items:[...],next_cursor:string|null},meta:{request_id}}`，单页最多 100；
每项必须是 `kind:"file"`、`asset_id`、`filename`、`mime_type`、十进制字符串 `size_bytes`、
`content_sha256`、`scan_state:"clean"`、RFC3339 `created_at`。Web 以独立 Zod consumer 校验
`unknown`，仅向文件视图投影必要字段；不导入 Artifact 的 `content_hash`、
`session_id` 或下载 URL。`next_cursor` 只作 opaque 分页位置，不作权限；Web 不提供 tenant/subject/scope。

只有有效 200 且 `items:[]` 才显示空态；401/403/429、BFF `400 invalid_library_kind` 或
`invalid_library_page`、`502 storage_response_invalid`、`503 storage_unavailable`、网络故障及坏 200
均显示错误，不降级为 preview 空页、不自动重试。翻页失败保留已确认项并由用户重试原 cursor；
切换页签/卸载取消迟到请求。此只读列表段不覆盖上方已发布但 Web 尚未消费的个人 POST；下载和 Agent Artifact 新 public 列表仍不在本契约，
旧作品页签的 `/api/session/artifacts` 行为不变。此处是 consumer 运行行为，不是第二份可编辑 BFF OpenAPI。

## W1D-WEB-IAM-DIRECT-CUT browser-private 当前契约（2026-09-26，Root 集成待验）

### 切片前 operation 与当前结果

切片前 Web 同时暴露两套名称相近但事实来源不同的 browser-private operation；当前只保留正式 Auth.js 链：

| 切片前浏览器 operation | 切片前实现与语义 | 当前结果 |
| --- | --- | --- |
| `GET /api/auth/session-state` | 读取旧 `kokoro_session` sealed envelope，返回旧会话投影；由 `auth.ts`/`session-envelope.ts` 支撑 | route 已删除，Auth.js catch-all 对 GET/POST 显式 404；不迁移、不留 alias |
| `POST /api/auth/logout` | 读取旧 envelope，经 `KOKORO_IAM_BASE_URL` 直连旧 revoke/logout helper 并清旧 cookie | route 已删除，Auth.js catch-all 对 GET/POST 显式 404；不重定向或兼容 |
| `GET /api/auth/session` | Product Session 的非敏感只读投影；在线核对 Redis generation/expiry，返回 authenticated/subject/expiry，不刷新、不轮换 cookie，响应不含 access/refresh | 保留，request/response、cache 与错误语义不变 |
| `POST /api/auth/session` | Auth.js CSRF 通过后执行 Product Session refresh：读取在线 session，reserve CAS 后经固定 BFF `/iam` relay 单次刷新 IAM token、再经 BFF `/v1/me` 重核 subject/tenant，finalize CAS 成功才推进 generation、写入轮换 cookie并返回新投影；冲突、结果未知或依赖失败保持既有 fail-closed 路径 | 保留，CSRF、reserve/finalize、cookie、响应与错误语义不变 |
| `POST /api/auth/signout` | Auth.js/Product Session 正式退出；同源 Origin + Auth.js CSRF，本地 tombstone 后返回受限 issuer confirmation 导航 | 保留，远端撤销未知和 issuer confirmation 语义不变 |

旧两条 operation 不是 BFF public API，也没有第三方兼容承诺；clean-slate 删除不修改 BFF OpenAPI、IAM
OpenAPI 或固定 relay policy，也不建立新的机器 contract。正式 OIDC callback、`/login`、`/iam/*` 和
`/api/auth/session|signout` 是唯一保留认证链。删除后 Web 不再直接请求 IAM；OAuth/token/revoke/issuer
协议仍只通过固定 `Web → BFF /iam → IAM` 边界。

### 六个同源消费者的保留契约

`sameOriginOk` 已从误命名的 `auth.ts` 迁到单责 `src/lib/server/same-origin.ts`，只改变 import owner，不改变
以下六个 route 的 browser-private HTTP 契约：

| route | guard 适用面与必须保留的行为 |
| --- | --- |
| `/api/session/[...path]` | mutation 才执行现有 guard；Product Bearer、幂等、SSE/cursor/取消、body/response 限额与错误映射不变 |
| `/api/hub/[...path]` | mutation 的 Origin 拒绝与现有 Product Session/BFF 转发不变 |
| `/api/team/[...path]` | 非 GET 的 Origin 拒绝、Product Session 与固定租户权限不变 |
| `/api/scheduled-tasks/[[...path]]` | mutation 的 Origin 拒绝、方法/path 白名单与错误体不变 |
| `/api/billing/checkout` | 写请求的 Origin 拒绝、Bearer/幂等与 BFF checkout 语义不变 |
| `/api/billing/mock-pay` | 开发支付写请求的 Origin 拒绝和既有非生产门不变 |

迁移后的纯 guard 继续按当前契约处理：存在 `Origin` 时必须是可解析且 host 与请求 `Host` 相同；没有
`Host` 才用 request URL host；畸形或不匹配返回各调用 route 既有 403/机器错误；缺失 `Origin` 的处理
保持现状，不在本片发明第二个 CSRF 协议。各 route 已有 method、SameSite、Auth.js CSRF 或业务写入门禁仍各自负责。
浏览器自报 Authorization、tenant、actor、namespace 或 principal 仍不能覆盖在线 Product Session Bearer。

### 失败与验收

旧 route 删除后不代理、不自动重试、不创建 Product Session，也不从旧 cookie 推断认证；正式 session/signout
在 Redis 缺失/故障、旧 generation、tombstone、远端撤销结果未知时继续既有 fail-closed 响应与恢复路径。
本切片不新增 API、错误码、header、cookie、Redis key、缓存或幂等 receipt。

architecture RED→GREEN 已证明活动生产源码不再引用 `KOKORO_IAM_BASE_URL`、旧 auth route 或 sealed
cookie/envelope；六 route 同源守卫与正式 Auth.js session/signout 保留。Node22 `pnpm check`（contract 69、
architecture 36、Vitest 1474、lint/typecheck/build）和独立 dev E2E 11 pass/1 预期 skip 已通过。
Root 固定 SHA 的真实组合验收尚待执行；没有变更 BFF/IAM 机器契约。

## 当前 W1E IAM relay 消费来源（2026-09-26）

Web 固定消费 BFF `1105553cfc24d4f44a90f626132bc30323a77946` policy `2.1.0` 原始字节，
SHA-256 `8f7d4f4cb6fa0ec34d2cce8702d8882d3270a316a6cbdb2d8bdaccefb9c6b4a1`；policy 固定 IAM
`a4c2b61467f1fc1772d6b6d8e98f081c090289fb`，internal OpenAPI `0.6.0` SHA-256
`392ca0e49544c0ec6e0d2fa782c46c33c1847e2c350102e7ad3b8af43f858ced`。route/method/header/cookie/status
及登录、邀请交互的 Web 同源契约均不变；IAM 新增的 Platform 内部 operation 不进入 browser relay。

## W1D IAM relay 消费来源（历史验收）

Web 当前原样消费 BFF main `bc45632b8654db7e06eb9878bb4d7a609d12dc7b` 的 browser-private
policy `2.1.0`，artifact SHA-256 `b18a559d162509c3029908b2e1c77ee7e59ed6af61b82e18be6b2e7669a0ef0c`；
该 policy 固定 IAM main `6a55ffb4c22f0b155ddb83157735c0ace766701d`，内部 OpenAPI `0.4.0`
SHA-256 `a18d57172df841cb2f55aa845a3eeb519ddb5abc8bea1c2be74fbb7e0fb62416`。本次只是来源 commit
和派生 policy digest 重钉；route、header、cookie、预算、邀请操作语义和 Web 对外行为不变。下节目标态
中的旧 pin/“尚无入口”描述是设计时历史基线，当前运行事实以此节与代码为准。

## R5-INVITE-WEB-ENTRY：独立邀请 browser-private 契约（目标态）

当前 Web main `63aca94f93095722425340a0a95985e8796a5b33` 的本地 policy 仍为 `2.0.0`，尚无静态邀请入口；目标只读固定
BFF main `d6dc8a0ea5a3fee7a4f54f01fefdeff0e28892e7` 的
[`contract/iam-relay-policy.json`](../../kokoro-bff/contract/iam-relay-policy.json) `2.1.0`，SHA-256
`b3ff912e70858cc5a5cf7bdbc597c8872ab29c5bfec4dfbe070ce4b37500239d`。其上游 IAM main
`ac94f152daffa2293801ea4f56f98b3ae59452d7`、内部 OpenAPI `0.4.0`/SHA-256
`a18d57172df841cb2f55aa845a3eeb519ddb5abc8bea1c2be74fbb7e0fb62416`。Web 重钉时只复制 BFF
commit blob 快照并机器校验 digest、路由/方法、Location 和四枚举，不手改生成物或维护第二份 IAM 契约。三条 dynamic invitation
operation 是 `browser-private`，绝不并入 BFF public Product `/v1` API。

| 浏览器 → Web | Web → BFF | 准入与响应 |
| --- | --- | --- |
| `GET /iam/interactions/invitation?id=<UUID>` | `GET /iam/v1/tenants/{tenant_id}/invitations/{invitation_id}/context` | 精确单一小写 UUID、无额外 query；tenant 仅来自 server-only 配置。有效 issuer Session 才读取，IAM 只向匹配收件人返回 pending 预览；无 Session 显示独立 issuer 登录/注册表单，不泄露邀请资料。context 返回组织名、角色、到期的 UI 投影，字段形状只以 owner OpenAPI 为准。 |
| 同一静态页面 POST 登录/注册 | 精确 `POST /iam/sign-in/email` 或 `POST /iam/sign-up/email` | 同源 Origin + Web 一次性 CSRF；BFF Web service 身份、无 Product Bearer。注册 body 只能是 `name,email,password,callbackURL`，callbackURL 由 Web 固定 Origin + 当前 UUID 构造，绝不接受浏览器 URL；注册成功只进入邮箱验证等待，不获得 issuer/Product Session。 |
| 同一静态页面 POST 接受/拒绝 | `POST .../{invitation_id}/accept` 或 `/reject` | 当前 issuer Cookie、固定 tenant/UUID、同源 Origin、Web 一次性 CSRF；上游无 query/body/Authorization/Idempotency-Key。accept 200 才可导航 Product `/login`；reject 200 仅本页完成。 |
| `GET /iam/verify-email?...` 的 302 | Web 同源页面 Location | BFF `invitationLocation` 只允许 `/iam/interactions/invitation?id=<canonical UUID>`，或其后单个 `&error=TOKEN_EXPIRED\|INVALID_TOKEN\|USER_NOT_FOUND\|INVALID_USER`；Web 只用固定安全文案显示错误，拒绝外域、额外/重复/编码 alias 与任意重排。 |

现有 `/iam/[...path]` 仍只有固定静态 issuer GET；静态 Web invitation route 不被视为 IAM API。`/auth/sign-in` 是 OAuth
签名交互，不是邀请登录别名；`/login` 是 Product RP 入口，不负责未入组者首登。Web 不接受浏览器指定 tenant、actor、
recipient、service secret、Origin 目标或 callbackURL；issuer Cookie 只走 BFF policy 白名单及 `Path=/iam`，Product/Auth.js Cookie 不转发。
请求/响应限额、deadline、原生 Cookie、错误码/状态与 Location 仍以固定 BFF policy、IAM OpenAPI 和本仓唯一运行时门禁为准，
本文不复制一份可编辑 DTO。context 404 不区分错人/不存在/终态；过期/停用按 IAM 稳定 code 局部反馈。所有页面、POST
与本地拒绝均 `Cache-Control: no-store`、`Referrer-Policy: same-origin`、受控 `x-request-id`，不向跨站请求发送邀请 URL，
并让浏览器同源表单 POST 保留可严格校验的 `Origin`；不回显验证 token、密码、
Cookie、原始上游 message/details 或完整 query。429 可按受控 `Retry-After` 局部提示；未知写入结果不自动重试，也不凭终态
404 推断曾接受成功。验收必须覆盖准确机器来源、精确路径/方法、CSRF 重放与身份/租户负例，以及真实三仓 HTTPS/SMTP/Chromium。

## W1C 固定租户 Web consumer 目标（2026-09-24 设计门）

当前 `/login` 成功只作同源 302，不呈现连接/整页重试 UI；浏览器
`/api/team/switch` 与可见 Team 切换器已删除。`/auth/select-tenant` 保留无状态
302 以使 `Path=/iam` issuer cookie 到达内层；内层 GET 仅使用 server-only
`KOKORO_TENANT_ID` 完成 signed continuation，不显示选择表单，不开放浏览器
POST 或 `/iam/organization/list`。Web code callback 与 refresh 已消费 BFF owner 发布的
固定版本 `GET /v1/me` 当前身份投影，验证 subject、tenant 与部署配置后才建立
可用 Product Session；BFF 公开契约为 `{data:{user_id,tenant_id},meta:{request_id}}`，
OpenAPI SHA-256 `75ab482132602bd1d7ce77dbec1423b10d4ce7a8244ad284ecac78cd4e7b50ca`。
Web 严格拒绝额外/缺失字段、非 JSON、非 200、超限、超时和取消；callback 拒绝不创建
Product Session，refresh finalize 前拒绝会撤销 pending record，不回退旧 generation。调用只发送
一个当前 user Bearer、固定 Web service identity 与受信 `Forwarded`，不向浏览器暴露上游正文或凭据。
删除旧 Team switch mutation/可见切换器，不能从浏览器 body/header 指定 tenant。
失败只给有界机器错误，不跳转到任何整页重试或假登录页面。现有历史小节描述
原发布版本，不作为新 consumer 的并行实现依据。

Web 当前固定消费 BFF `dd605c99e9bb5c6669ec31e04e285e5f92b79ed0`
policy `2.0.0`，artifact SHA-256
`74893ba4e566e4824a278cd3ee1548030a33435f9b37b7026a8a7e943c080037`，
IAM owner `ad5224a9e0a3a31d1c593d214d37940d6923b2e7`；仅来源重钉，policy
版本、route/method/header/cookie/限额及 Web 运行语义不变；
`/organization/list` 已删除。下文旧 policy 1.x/候选列表/tenant 表单是历史发布记录，
不表示当前仍可访问。

公开页面路径：`GET /` 是固定单租户营销首页，`GET /login` 是不依赖 System runtime manifest 的服务端 Product RP OIDC 启动路由（成功 302 到同源 IAM authorize，不渲染中转页）；`/app` 要求在线 Product Session；System runtime manifest 是可选展示数据，不决定访问权或 live/preview transport。`/auth/sign-in` 是 IAM issuer 签名交互路由，只有有效签名交互才呈现真正邮箱/密码表单，不能当作静态营销别名。公开首页/登录入口不调用 `/api/system/runtime-manifest`；`/login` 在服务端经 Auth.js CSRF 启动固定 OIDC provider，失败返回无自动循环的 503；此入口行为不改变 token、cookie 或 BFF/IAM owner API。

当前签名表单 GET 在 Web Proxy 签发原有 Cookie-bound 一次性 CSRF 后内部渲染 React/shadcn 页面；`/auth/sign-in/form` 不对浏览器开放。浏览器 POST 仍提交原始 `/auth/sign-in?{signed-query}`，字段、同源 Origin、issuer Cookie、CSRF 与 BFF→IAM 两步调用不变。HTML 模式的 401/429/503 改为 303 回原签名 URL：短时加密反馈仅传受控错误码/邮箱、不传密码或上游正文；新 GET 签发新 CSRF 并在同一表单就近提示。非 HTML 客户端仍按原错误状态与 envelope 返回；成功继续采用受限同源 Location。页面与资源的 Referrer-Policy 为 `origin`，不向资源请求带签名 query。

状态：browser-private 治理基线与 W1C-2 当前/目标契约，2026-09-23；W1C-2A 只读 GET relay、
W1C-2B-1 sign-in、W1C-2B-2 tenant/consent、2C RP-only 与 S1 Product Session 已发布，S1 真实三仓 HTTPS 组合已通过。
普通 `/v1` Bearer adapter 与 UI Product 登录/探针/退出已由 S2-A 切换；S2-A 真实三仓组合已验；两个旧 magic-link browser route 已删除，其余旧认证/Team 路径删除未完成。

## R2e-IAM-VERIFY-WEB：邮箱验证 browser-private 增量（本提交已实现，真 IAM 待验）

起始 Web `main` 基线 `0a093f65bdc4990b956b10ae534198e3b4b5c3b5` 消费 BFF policy `1.0.0`、
`eb1eb2926d08b8a3779898b2c31e604a8585ec8b`，artifact SHA-256
`ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`；其浏览器 GET
白名单缺 `/iam/verify-email`。BFF owner `main` `dadf9264116ea9df2c0886c4af84bacb67aa6e41`
当时发布 `contract/iam-relay-policy.json` version `1.1.0`、SHA-256
`97022ea8727619bae03927027ef6a8ce87a3d2da4580ba5d211dc63b16fdc42c`；Web 该历史切片只读重钉
该 blob 与 commit，不编辑 BFF policy，不建立第二份可编辑 IAM contract。IAM owner
`b363554d07e5b6e182160b42ae1402330e55d9db` 拥有 Better Auth 1.7.3 验证 token/邮箱状态，
Web 不解释 token 或验证结果。此增量是 Web `browser-private`，不进入 BFF public `/v1` OpenAPI。

| Web 已实现 operation | 请求与原生响应 |
| --- | --- |
| `GET /iam/verify-email?token=...&callbackURL=...` | 仅此精确路径与 GET；Next 规范化后恰好一个非空 `token`、最多一个 `callbackURL`，重复或额外键在 Web 本地拒绝，零 BFF socket。纯函数拒绝其输入中的编码键名；真实 Next 可将 `%74oken` 规范化成相同 `token`，唯一键可接受，与字面键并存则按重复拒绝。Web 只保证支持形状的键值语义，BFF 保持收到的 Web URL query。`token` 为 IAM 有期签名 JWT；`callbackURL` 不是 Web/BFF 对上游或 `Location` 的授权，Web 不解释/记录 token。错误方法、路径编码 alias、畸形/超限 query 不形成 BFF socket。 |
| IAM 原生 200/302/失败 | 原生 status/body 与已允许 header/cookie 保持；302 `Location` 必须通过现有固定 Web origin、精确已批准路径检查，`/auth/sign-in` 是邮件 bootstrap 指定的返回路径，外域/任意新路径拒绝，不自动跟随。此精确路径的浏览器响应（含 Web 本地拒绝/上游失败）无论上游缺失或给出可缓存 `Cache-Control`，Web 固定覆盖为 `no-store` 并合成 `Referrer-Policy: no-referrer`；其他 GET 不变。 |

BFF policy 的 `responseHeaders` 仍不含 `referrer-policy`；BFF 对此敏感 GET 虽已合成
`Cache-Control: no-store`/`Referrer-Policy: no-referrer`，Web 不能依赖普通 header 白名单透传后者，
也不应为它泛化白名单；Web Route Handler 在已准入路径合成，最终 `src/proxy.ts` 在通用安全头后
对精确 pathname 再覆盖，保证 Next 最终浏览器响应而非仅 helper 对象满足契约。浏览器入站
`Authorization`、Product Session/Auth.js cookie、任意身份 header
不能作为 IAM 凭据；仅已有 issuer cookie 过滤继续有效。Web 自有拒绝维持受控 code、`x-request-id`、
`no-store`/`no-referrer`，不泄露 query、token、原生错误 body。该 GET 不生成 Product Session、Web Redis key、SQL、
receipt 或缓存，不增加 POST、sign-up、组织写入和通配 `/iam/*`。验证先以固定 artifact digest/provenance
及 contract/architecture 测试拒绝来源漂移，再用 unit/真实 Next HTTP 覆盖支持的 query 形状、同源 302、
缺失/恶意缓存头、外域/编码/错方法零上游；真实 IAM 邮件点击及浏览器 Referer 由 Root 组合门另验。
Next 开发模式的 `logging.incomingRequests.ignore` 仅精确抑制 `/iam/verify-email`（含 query）的
框架 stdout 请求行；不改变其他路由日志，也不是 TLS 前置 access log、浏览器历史或邮件系统的保密声明。

## W1C-2：同源 IAM 与 Product Session 契约（S1 已发布并完成三仓组合）

### 版本、来源和可见性

当前 Web 仍有 IAM magic-link/team-session 直连和旧 sealed session；2A 只读 `/iam`、2B-1 sign-in POST、2B-2 静态 `/iam/interactions/*` POST、2C Auth.js Code+S256 RP-only 与 S1 均已发布。S1 成功 callback 后建立在线 Product Session，提供标准 `GET/POST /api/auth/session` 与 `POST /api/auth/signout`；session GET 只在线核对并返回 authenticated/subject/expiry，不回 access/refresh、不刷新或轮换 cookie。session POST 要求同源 Origin 与 Auth.js CSRF，并按 reserve CAS → 固定 BFF `/iam` relay token refresh → BFF `/v1/me` 身份重核 → finalize CAS 执行刷新，只有 finalize 成功才推进 generation、轮换 cookie并返回新投影。普通 BFF `/v1` adapter 已在线核验 Product Session generation 并仅发送一个 access Bearer；S2-A 的真实三仓业务代理链仍待验收。
BFF relay 在 W1C-2 起始基线固定来源 `eb1eb2926d08b8a3779898b2c31e604a8585ec8b`，其
`contract/iam-relay-policy.json` version `1.0.0` 当时 blob SHA-256 是
`ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`，
引用 IAM owner `e36da9ecf8d62a364182949817431a8e2329d50a`、allowlist SHA-256
`f63dacfa8a7bcec3c56efb8ffb762a3f8bd82bb380eff40a1462db1e77d61ead` 与 snapshot SHA-256
`b2eac1919e16fdc30a40bee0f3c4300b641bd8f674214aea7731bf10299559e1`。IAM test-only fixture
已随 BFF repin 发布；W1C-2A 已 vendor **只读** policy snapshot。Web contract test 对 snapshot 原始
字节计算固定 digest，并校验 provenance、只读路由子集、结构不变量与篡改负例；Root 的跨仓门另从固定
BFF commit blob 比对同一字节，Web 仓不把本地副本自比冒充源 commit 证明。真实 Web→BFF→IAM 与
Auth.js S1 真实 IAM 组合已通过；S2-A 普通业务代理的真实组合待验。Web 不重建/维护 IAM OpenAPI、BFF Product OpenAPI 或 BFF policy 的第二事实源。

`/iam/*` 是 Web 拥有的 `browser-private` **原生 OAuth/OIDC 传输边界**，不是 BFF `/v1`
Product API，也不进入 Developer API。`/api/auth/[...nextauth]` 是已发布的 Auth.js RP transaction/callback 与 S1 session/signout
入口；`/auth/sign-in` 是 Web 表单，`/auth/{select-tenant,consent}` 是 IAM 外层引导，真正表单位于
`/iam/interactions/*`。普通 `/api/*` 是 Web 的 browser-private
Product projection，最终请求 BFF `/v1/*`；IAM 所有 endpoint 语义、字段、OAuth 错误和 cookie 仍由 IAM
发布的协议定义，Web/BFF 不包装成 `{data}`/`{error}`。Web 本地准入拒绝可以使用安全机器码和
`x-request-id`，不得泄露 token/secret/原始 provider body。

W1C-2C 第一切片的**历史 RP-only 契约**：当时 RP callback 即使完成 code、ID token 与 userinfo 验证，也只返回受控
`503 product_session_unavailable` 并清除 RP 事务；不签发可用 Auth.js/Product Session cookie，
不透出 token、userinfo 或 callback code。这不是首次登录完成。server-only Basic token POST 与
Bearer userinfo GET 只能经固定 BFF `/iam` relay；浏览器直打仍本地拒绝。S1 已替代成功 callback 的固定 503，建立 Product Session 并实现 refresh/signout；普通 `/v1` Bearer 代理已由 S2-A 完成；旧路径删除仍属 S2-B。
Browser-private RP 入口只接受单 provider 的 Auth.js CSRF 获取、受控 signin POST 与固定 callback GET；
精确同源 Host/Origin、方法、body/query 长度及重复键先校验，浏览器不能覆盖固定 `client_id`、
`redirect_uri`、`scope`、`resource`、`callbackUrl`。authorize 与 token 各恰好一个固定 internal
resource；token 使用 `client_secret_basic`，userinfo 使用 server-only Bearer 且不发送浏览器 cookie。
R5-Web-Team-Product 前置切片的固定申请 scope 为
`openid profile email offline_access iam:session-authorization.verify iam:member.read iam:invitation.read iam:role.read iam:member.write iam:invitation.write`；
保留既有顺序，在三个 Team 只读 scope 后仅追加 IAM `ad5224a` 授权的两个 user-delegated 写 scope。
Auth.js authorization Location 的 scope 必须完整、顺序一致且仅出现一次；缺项、重复或额外 scope 均拒绝。
这是 Web 申请边界，不替代 IAM/BFF 的授权验证；旧 Team UI/API 仍待独立原子替换。
state/nonce/PKCE 与 ID token issuer/audience/signature 在 code exchange 前后分别验证，userinfo
`sub` 必须等于已验证 ID token 的 `sub`；Redis state 原子一次消费，错误/失联只返回安全码。
ID token 算法固定 `EdDSA`（Ed25519），RS256 即使有合法 JWK 也拒绝。BFF token/userinfo/JWKS
backchannel 各有绝对 5 秒及响应头/正文 1 MiB 上限，超限/慢滴流关闭连接；不放宽 BFF 固定 policy。
浏览器 callback 断连时 Web 将 `request.signal` 传播到当前 BFF 请求并销毁 socket，不继续 JWKS/userinfo。

### `/iam` 固定 route/method 与 HTTP 语义

仅消费最终固定 BFF policy 的如下**精确** route/method；路径前缀是 Web/BFF 的 `/iam`，表内是
policy 的 relative path，不扩张为任意 catch-all：

| Relative path | Methods | 用途与入站凭据 |
| --- | --- | --- |
| `/.well-known/openid-configuration`、`/.well-known/oauth-authorization-server`、`/jwks` | GET | issuer discovery/JWKS；无浏览器 Authorization |
| `/oauth2/authorize` | GET、POST | Code+S256；issuer cookie；POST 同源 CSRF |
| `/oauth2/token` | POST | 仅 Web server 生成 Basic，code/refresh 与单一 resource；无浏览器 cookie |
| `/oauth2/userinfo` | GET | 仅 Web server 生成 Bearer；无浏览器 cookie |
| `/oauth2/revoke` | POST | 仅 Web server 生成 Basic；无浏览器 cookie |
| `/oauth2/end-session` | GET、POST | issuer cookie；POST 同源 CSRF |
| `/oauth2/end-session/confirm` | POST | issuer logout-confirmation cookie；同源 CSRF |
| `/sign-in/email`、`/sign-out` | POST | issuer cookie；同源 CSRF |
| `/get-session` | GET | issuer cookie；仅 IAM 交互状态，不是 Product Session 授权；`/organization/list` 已从 Web relay 删除 |
| `/organization/set-active`、`/oauth2/consent`、`/oauth2/continue` | POST | issuer cookie；同源 CSRF |

W1C-2B-2 的 `/auth/select-tenant|consent` 只准严格同源 GET 且保持原签名 query，302 引导到
Web-owned 静态 `/iam/interactions/select-tenant|consent`；外层 POST 405。issuer cookie 的 IAM
原生 `Path=/iam` 在内层才被浏览器携带；CSRF cookie 与 POST form 也只绑定内层路径。
四条交互 route 显式拒绝 HEAD/OPTIONS 为 405，不生成 CSRF cookie/Redis nonce，不触达 BFF；
真实入站 method 还在共用 guard 与 handler 预期 method 精确比较，不能借框架派发复用 GET/POST。
内层 select-tenant GET 只把受信 BFF `/iam/organization/list` 的 active
组织作为候选，POST 绑定候选集并重核，调用固定 `/iam/organization/set-active`；内层 consent GET
仅展示未验签的 signed-query `scope` 预览，POST 无浏览器 `scope` 字段，仅明确 Agree 后将 query
原样交 IAM `/iam/oauth2/consent`，签名与 scope 子集由 IAM 验证。两页的 200 redirect JSON/302
仅转成白名单交互 Location 与合规 issuer cookie；401/429/5xx body/cookie 不透出。最终 callback
在 2B-2 基线上，`/api/auth/callback/kokoro-iam` 尚未安装，匹配该目标返回受控 `503 rp_callback_unavailable`；
当前已安装固定 callback；按 IAM 实际成功响应仅将严格同源、唯一 `code/state/iss`
且 `iss=${KOKORO_WEB_ORIGIN}/iam` 的 Location 交给浏览器，完整 query 由 RP 验证型 callback 再核 issuer。后续 RP
2C RP-only 基线验证成功仍只报 `503 product_session_unavailable`；当前 S1 验证成功建立 Product Session、清 RP 事务 cookie 并 303 到 `/app`，仍不把 token 发给浏览器。S1 真实三仓链已验；S2-A 普通业务代理组合已通过固定三仓真 HTTPS。

上表是 W1C-2B 的完整固定 policy。已发布的 W1C-2A `/iam/[...path]` Route Handler 只安装 GET
`/.well-known/openid-configuration`、`/.well-known/oauth-authorization-server`、`/jwks`、
`/oauth2/authorize`、`/get-session`、`/organization/list`；S1 另安装固定 `client_id`/`post_logout_redirect_uri` 的 `/oauth2/end-session` GET，以及只接收 `action=confirm`、精确同源 Origin、IAM 签名 confirmation cookie 的 `/oauth2/end-session/confirm` POST。直接 owner POST、浏览器 userinfo Bearer 和其他动态路由仍在 Web 本地 fail closed。本片静态 `/iam/interactions/*` 是 Web 自有表单而非 BFF
catch-all 例外；callback/post-logout 传输在 2B-2 尚未安装。2C 只在 RP callback 真正安装并通过
严格 Location/签名交互与 code 测试后，将 consent 的固定 callback Location 交给浏览器；
S1 已安装受限 post-logout 确认流程，callback 验证成功建立 Web Product Session；其余动态路由仍关闭。

W1C-2A 拒绝 magic-link alias、任意 `/internal/v1`/admin/dynamic-client CRUD、未知方法，以及 handler
可见的大小写/encoded route alias；本地拒绝不得开启 BFF/IAM socket。真实 Next HTTP 探针证明 dot 与
encoded-dot 输入在 handler 前规范化为同一 canonical resource，双斜线由 Next 返回 308 canonical
Location，编码 route 名返回 404；这些框架行为不扩张 Web allowlist、身份或泄露响应。上游 Location
仍在 URL 解析前拒绝 `%`、dot segment、双斜线与 backslash。Web 固定 BFF origin、service identity
和受控 header/body；丢弃入站 browser Basic/Bearer、Forwarded、`x-kokoro-*` 自报身份，
不将 Auth.js/Product Session cookie 发给 BFF/IAM。仅 issuer snapshot 中的完整 cookie 名允许通过：
`kokoro-issuer.{session_token,session_data,dont_remember,session_token.oauth_logout_confirmation}`，
production 使用 `__Secure-kokoro-issuer.` 前缀。普通 cookie `Path=/iam`；logout-confirmation cookie
仅 `Path=/iam/oauth2/end-session/confirm`。多 `Set-Cookie` 不能合并；未知名称、Domain、路径或属性拒绝。

代理保持 IAM 原生 status/body、合法 Location、Cache-Control、Content-Type、429 Retry-After、logout
Content-Security-Policy/X-Content-Type-Options/Pragma 和精确 Set-Cookie，不自动跟随 redirect。
唯一浏览器导航适配是 `GET /iam/oauth2/authorize` 的 IAM 200 `application/json` 精确
`{redirect:true,url}`：先经原生响应 header/issuer cookie 校验，再按已存在的固定同源交互/严格 callback
Location 白名单验证 `url`，转无 body 302；其他 `/iam` JSON、非法 shape/URL、错误 status 不作重定向，
非法 authorize continuation 返回无上游 body/cookie 的 502。该适配不新增 BFF/IAM contract 或可编辑 policy。
固定 policy 的 Location 只允许固定 `KOKORO_WEB_ORIGIN` 下已安装的只读 `/iam` route，或固定的
`/auth/{sign-in,select-tenant,consent}` 目标路径；后两者现在先经无状态同源 302 到静态
`/iam/interactions/*`，浏览器才会携带 IAM `Path=/iam` issuer cookie。callback 与 post-logout
Location 在 2B-2 基线尚未允许；当前仅允许安装后的固定 callback URI/唯一
`code/state/iss`，其中 `iss` 精确等于固定 Web issuer；缺失、重复、错误或额外键拒绝。
合法 IAM 已签 query 只作为 opaque continuation 保留，
不当作 Web 自报授权。不可信 Location/Set-Cookie 必须在输出前拒绝。policy 最大
query 8192 B、request body 65536 B、header 16384 B、response 1048576 B、duration 5000 ms；
Web 限额不得高于这些值，并传递取消。`KOKORO_WEB_ORIGIN` 是 server-only 固定 HTTP(S) origin，缺失或
非精确 origin 时 relay 503；入站 Host 必须精确等于配置 host，GET 若有 Origin 必须等于配置 origin，
POST 必须携精确 Origin，否则在连 BFF 前 403。反代后的 Next handler URL authority 可为内部
`localhost:<port>`，不作为公开 origin 判据；不采信 `Forwarded`/`X-Forwarded-*` 作为替代身份。
W1C-2A 的 GET 必须无 body：非零/异常 `Content-Length`、任意 `Transfer-Encoding` 或 Fetch Request 可观察
body 均在连 BFF 前返回 400；真实 Next HTTP 测试覆盖无 Content-Length 的 chunked GET body。
所有浏览器 cookie mutation
缺失/`null`/错误 Origin 或 CSRF 证据都拒绝。Web-rendered `/auth/sign-in` 以及静态
`/iam/interactions/{select-tenant,consent}` GET
为目标 POST path、IAM 交互和短 TTL 生成随机 CSRF 值，分别放入 Web HttpOnly cookie 和隐藏 form 字段；
其摘要/绑定存 Web Redis 短 TTL key，POST 时原子一次性消费，Redis unavailable 拒绝；
浏览器表单 POST Web-owned Server Action/Route Handler 时，Web 在连 BFF 前验证 Origin、双值、
交互绑定与一次性消费，按 IAM 机器契约构造 `/iam/sign-in/email|organization/set-active|
oauth2/consent|oauth2/continue` 原生 body，Web CSRF 字段不传 IAM；IAM 已签 query 与 issuer cookie
原样续接。浏览器直 POST 上述 `/iam` 路由无 action 证明则拒绝。其余允许的浏览器 `/iam` POST
（authorize、sign-out）须
有等价 Web 表单证据，或经真实 wire 证明 IAM 原生 CSRF 生成/携带/校验，再叠加 Web Origin；否则拒绝。
`end-session/confirm` 已单独核对 Better Auth 1.7.3 原生 signed confirmation cookie、session/TTL 绑定；Web 再限制精确 Origin/Host、固定 form 与 cookie 路径，不作为通用 POST 例外。
Auth.js 自身 action 的 CSRF token 与同源 Origin 叠加校验；普通业务 cookie mutation 使用 Web 自有
CSRF 防护。server-only token/revoke 路径的 Basic 只来自 Web 受信代码；
BFF 验 Web service 身份但不假设同一 secret 能判断 Basic 最初是否来自浏览器。

### RP、Product Session 与普通 `/v1`

Auth.js RP 配 Code+S256 PKCE、state、nonce；IAM client 由 operator 创建/readback，必须是
`user_delegated`/`client_secret_basic`、`require_pkce=true`、`enable_end_session=true`、精确 callback/
post-logout URI、`openid profile email offline_access iam:session-authorization.verify` scopes、
internal resource binding。`IAM_ISSUER_URL` 与 discovery issuer 精确相同。authorize/token/refresh wire
均须恰好一个 `resource=https://kokoro.dev/resources/iam-internal`；浏览器参数不能覆盖它。Auth.js v4
默认 token request 不视为已覆盖，此点须在真实 HTTP 检查请求体/Bearer audience/BFF admission。

Product Session 是 Web server-only：Auth.js 加密 HttpOnly cookie 只含随机 session ID、generation、
当前 access 与必要 RP 退出提示，**不含 refresh**；固定 `KOKORO_WEB_ORIGIN` 为 HTTPS **或** Web 运行于 production mode 时，Product cookie 创建/refresh/清除均带 `Secure`，不借 IAM issuer 的 production cookie 模式决定；公开 session callback 不输出 token。Web Redis 隔离
record 保留 Web 密钥加密的当前 refresh、固定到期及 `active(g)`/`refreshing(g,reservation,deadline)`/
`revoked`。每请求先在线比对 generation/tombstone。refresh 的第一 CAS 只允许一位赢家从 active 预留，
由赢家向 IAM 发起至多一次固定 Basic/resource exchange；第二 CAS 仅在 reservation、deadline、未撤销
仍成立时提交新加密 refresh 与 `active(g+1)`，随后才发新 cookie。败者只拒绝本请求，不撤销赢家、
不清其 cookie、不请求 IAM；pending、旧 generation、replay、结果未知、Redis unavailable 均明确拒绝；reserve 后密文 AAD 解密损坏尽力按 reservation tombstone，Redis 故障仍 fail closed；
不回退旧 active/sealed cookie，也不依赖 issuer replay 窗口。未决 reservation 到期仅撤销。refresh wire 对 access UTF-8 ≤2048 B、refresh ≤8192 B、整数 `expires_in` 1–3600 s 校验；Product JWE Set-Cookie 完整字节 ≤4096 B，callback 在 Redis 创建前、refresh 在 finalize 前预检，超限不推进 generation。Product 成功 GET/refresh/signout 带随机 UUID `x-request-id`。finalize
成功但新 cookie 交付未知，或 finalize ACK 未知时不发送新 cookie；即使 Redis 已提交新 generation，
旧 g 仍拒绝，须重新登录，无客户端可达的 active record 由 TTL 回收。普通受保护 BFF `/v1` 代理只注入从当前
Product Session 读取的**一个** `Authorization: Bearer` 与 Web service identity；不再发送
`x-kokoro-namespace`/`x-kokoro-principal-id`，也不相信 body/query/header 中的 tenant/actor。
logout 以可信解封的 session ID 与 cookie generation 原子 compare-and-tombstone；若当前 record generation 不匹配，旧 cookie 调用不发送 Product `Set-Cookie`（否则乱序响应可能删除新 cookie），HTTP 200 返回精确 `{ "status": "stale_session", "remote_revocation": "not_required" }`，旧 cookie 仍被在线 generation 校验拒绝；不写 tombstone、不删除当前 record、不请求 revoke，也不返回 `issuer_session`/`issuer_end_session_url`。**仅匹配 generation 的 active 记录**
同时 take 已确认当前的加密 refresh，并单次有界尝试 IAM revoke；issuer end-session 是单独的浏览器确认流程，不由 refresh revoke 代替。refreshing/pending 记录
只 tombstone，绝不 take/发送可能已轮换的旧 refresh；报告远端撤销未确认。记录缺失也建覆盖最大会话/
在途窗口的 tombstone，迟到 finalize 不可复活；重复 logout 不重复远端 revoke。清 cookie；active
状态的远端失败报告未确认，写入 ACK 未知则清 cookie 只能报告本浏览器清除，不能报告服务端撤销。
不把旧 refresh 的 revoke 当作幂等或单设备操作；其可能影响同 client/user family 且返回 400。
无持久补偿队列，远端未确认仅靠 IAM owner TTL 兜底。 `POST /api/auth/signout` 返回 `issuer_session=pending_browser_confirmation` 与固定同源 `issuer_end_session_url`，URL 仅含注册的 `client_id` 和 `post_logout_redirect_uri`，无 ID/access/refresh token；该响应不表示 IAM issuer 已退出。浏览器 GET 确认页取得 IAM 签名、限定 `Path=/iam/oauth2/end-session/confirm` 的 confirmation cookie，随后以精确 Origin 和 `action=confirm` POST 专用路由，IAM 验签及 TTL/session 绑定后清除 issuer session 并重定向 `/auth/sign-in`。confirmation cookie 不透传其他 GET/POST；错误 Origin、额外参数、错误 form 或非法重定向在 Web 拒绝。确认表单限 1024 B、应用读取 5 秒硬截止；Next 在 body 未到齐前的缓冲不算 handler 已响应。
service-only runtime manifest 与公开 Share 按 BFF owner 明确边界运行，不伪造用户凭据。BFF 自己验证
IAM admission、resource/tenant 业务授权；Web session UI 不构成 owner 授权。

旧 `/api/auth/magic-link/request` 与 `/api/auth/callback` 已删除，不保留 alias 或失败重定向；
`/api/auth/logout`、`/api/auth/session-state`、旧 `/api/team/*` magic-link/team-session、
`/auth/refresh`、旧 sealed-envelope/nonce 与 IAM 直连仍待后续 clean-slate 切片删除或按上述 route 替换，
不留 fallback 或双轨 cookie；
2C RP 验证片不删除这些仍被旧调用点使用的路径，也不将其视为新 RP 授权。既有 Product request/
response、幂等 key、SSE/AG-UI 仍服从 BFF `/v1` owner contract；`/iam` 原生协议不套用 Product
JSON envelope、Product idempotency receipt 或分页。

### 验收矩阵

W1C-2A 的 `pnpm contract` 检查 snapshot 固定 digest/provenance/invariants/tamper，route/server 测试检查
只读路由正反例、cookie/header/redirect、固定 public origin、限额/timeout/cancel；真实 Next HTTP 测试记录
canonical、evil Host、dot/encoded-dot canonicalization、双斜线 308 和编码 route 404。Root 跨仓门负责
固定 BFF commit blob 的源字节比对。W1C-2B 再补 Origin/CSRF、普通 `/v1` 单一 Bearer 与零自报身份；
`pnpm lint`、`pnpm typecheck`、
`pnpm test`、`pnpm build`、`pnpm test:e2e` 覆盖实现及浏览器状态。Root 隔离真实 Web→BFF→IAM
HTTP/Browser 证明首次 sign-in、tenant/consent signed query、callback code 单次使用、refresh rotation
并发、logout/revoke、跨 tenant/同 tenant 其他用户 404/403、IAM/Redis 失联、429、安全 header、
无 credential 泄漏。IAM fixture/BFF repin 虽已发布，Web consumer 与真实组合仍为**待验**；登录边界完成
不等于 W1D Product generated consumer/AG-UI edge 完成。

## 1. Visibility 与发布边界

本仓所有浏览器同源 `/api/*` 都是 `browser-private`。它们由 `kokoro` 拥有，只用于当前 Web 与
同一部署中的 server adapter 协同升级，不承诺第三方兼容性，也不进入 Developer API 门户。

只有 `kokoro-bff` 自有、标记为 `public` 的 Product API 可以进入 Developer API。Web 文档可以链接
固定 BFF artifact，但不得复制一份可编辑 OpenAPI、发布内部 route，或把 browser-private DTO 宣称为
公开 API。

## 2. 调用拓扑

```text
Browser /api/*                         browser-private
  -> Web same-origin adapter
  -> kokoro-bff /v1/*                  BFF-owned Product API
  -> owner APIs / Agent / Scheduler    internal-owner or event-protocol
```

终态不允许 Web 直连 IAM/System/Agent/其他 owner。当前认证 helper 仍直连 IAM，是已登记迁移缺口，
不是新的允许例外。

## 3. 当前契约来源

| 来源 | 用途 | 权威性 |
| --- | --- | --- |
| `src/app/api/**/route.ts` | 实际注册路径、method、header 与 projection | 当前运行事实 |
| `src/contract/*.ts` | Zod request/response、path helper、AG-UI narrowing | 当前 runtime contract source |
| `contract/api-contract.test.ts`、`tests/contract/` | 正向、拒绝、路径和 event 回归 | 可执行约束 |
| `docs/integration/*.md` | 细节与历史上下文 | 次级参考；可能滞后 |
| `src/generated/proto/*` | 旧 Root source 生成的 consumer snapshot | 冻结历史；当前不可再生、未被 runtime import |

本仓没有活跃的 `contract/openapi/` 或 generator。不得手改 `src/generated/proto/` 使其看似当前；若
重新引入生成流程，source、生成器、固定工具版本、digest、breaking check 和 CI 必须一起落在正确 owner。

## 4. Browser-private route 分类

| 浏览器路径 | 当前用途 | 目标上游 |
| --- | --- | --- |
| `/api/session/*` | Chat snapshot、command、control、AG-UI SSE、artifact/share | `kokoro-bff /v1/*` |
| `/api/hub/*` | Skills、MCP、Projects 的历史 browser alias | `kokoro-bff /v1/{skills,mcp,projects}/*` |
| `/api/agents/*` | Agent connection setup 投影 | `kokoro-bff /v1/agents/*` |
| `/api/scheduled-tasks/*` | Scheduled typed adapter | `kokoro-bff /v1/scheduled-tasks/*` |
| `/api/billing/*` | Billing catalog/checkout 投影 | `kokoro-bff /v1/billing/*` |
| `/api/system/runtime-manifest` | 当前产品/surface 的 manifest | `kokoro-bff /v1/system/runtime-manifest` |
| `/api/shared/*` | 公开 share 投影 | `kokoro-bff` owner route |
| `/api/auth/magic-link/request`、旧 `/api/auth/callback` | 已删除的 magic-link 申请/消费端点 | 不保留 route、alias 或 `/login?auth=` 失败跳转；固定 OIDC `/api/auth/callback/kokoro-iam` 仍归 Auth.js `/api/auth/[...nextauth]` |
| 旧 `/api/auth/logout`、`/api/auth/session-state` | 仍在的旧 sealed session 退出/状态 | 后续 clean-slate 删除；Product Session 已由 Auth.js browser-private action 承接 |
| `/api/team/*` | 当前仍有 Team context/成员邀请等路径；`/api/team/switch` 已删除 | 固定 Product tenant，不保留浏览器租户切换 route 或 UI；Team context 整体替换属后续 consumer 切片 |
| `/iam/*`、`/auth/{sign-in,select-tenant,consent}` | `/iam` owner mutation 直接 browser POST 全拒绝；`/auth/sign-in` 是 GET/POST，另两个 `/auth/*` 仅 GET 引导；内层 tenant 是 GET-only 固定续接，consent 是带 issuer cookie 的 GET/POST 表单 | 已安装固定 Auth.js RP callback；不是任意 `/v1` proxy |
| `/api/dev/*` | 非 production preview fixture | 无 live upstream；不得在 production 启用 |

Catch-all route 不表示浏览器可以任意代理 `/v1`；允许路径必须由 client/schema/route test 明确冻结。

## 5. JSON 与 HTTP 规则

### 5.1 通用形状

BFF 成功（示意；request ID 位于响应 header）：

```json
{"data": {}}
```

BFF/Web 错误（示意）：

```json
{"error": {"code": "stable_code", "message": "safe message", "retryable": false}}
```

Web 可在 browser-private 边界将 BFF success `data` 投影成当前 UI 所需 DTO，但错误必须保留稳定 code
与响应 `x-request-id`。当前部分 route 仍返回 flat `{error: string}` 或 body `meta.request_id`，
列为收敛缺口，不能作为新 route 模板。

### 5.2 输入与命名

- 浏览器 JSON 使用 `snake_case`；外部值先以 `unknown` 接收并经 Zod 校验。
- tenant、subject、service identity、部署域名和 request id 不从 body 推导。
- opaque ID 在 path segment 中只编码一次；分页使用 opaque cursor 和稳定排序。
- 长期公开 offset pagination 不由 Web 定义。

### 5.3 幂等与并发

- POST/PATCH/DELETE 等具副作用 command 使用 `Idempotency-Key`；相同 key/相同 digest 重放原结果，
  相同 key/不同 digest 返回冲突。
- 浏览器可产生 command identity，但 durable receipt 与 request digest 由 BFF owner 保存。
- MessageCreate 的浏览器内部参数可携 `idempotency_key` 供状态机重试；标准 Chat 客户端发送的 JSON 仅为
  `{content, model?, agent?, thinking?, pinned_skills?, mcp_servers?, project_ref?}`，该 key 只在
  `Idempotency-Key` header。客户端在 fetch 前拒绝未知字段或空/缺 key；未获回执的重试冻结
  首发 options/业务 body 与 key。同一 AI SDK UIMessage id/content 的重复提交复用 key，新消息
  id 或编辑后的内容使用新 key。`/api/session/*` 不再从 JSON body 提升旧 key。
- 幂等身份缺失时不做自动 mutation retry。
- 资源版本冲突由 BFF contract 的 version/ETag/receipt 语义表达；Web 不猜测成功。

### 5.4 身份、缓存和错误

- 浏览器只携同源 cookie；Web 不把 cookie 原样转发 BFF。
- mutating request 需要同源防护；server adapter 重建 allowlisted header。
- 用户/工作区 JSON 和 SSE 使用 `private, no-store`；不在公共 CDN 缓存。
- 返回体不得含 SQL、堆栈、provider secret、runtime JWT、refresh token、internal URL 或 tenant selector。
- request ID 位于 `x-request-id`，不为关联信息机械新增 body `meta.request_id`；`Retry-After` 只按 allowlist 透传。

## 6. AG-UI 单协议规则

Web↔BFF 的 Agent event stream 只使用 AG-UI canonical event union：

- 标准 Run、Text、Tool、Reasoning、Activity、Subagent、Interrupt/Resume 事件优先；
- Kokoro 专有 artifact/delivery 只能使用有命名空间、已登记 schema 的 `CUSTOM`；
- BFF durable ledger 的 cursor 是唯一 replay axis；`Last-Event-ID` 回传该 cursor；
- Web 对 AG-UI 校验后映射为内部 `UIMessage` parts 或纯 reducer event；内部表示不回到网络；
- 不允许 legacy `SessionEvent` SSE、双读、protocol fallback 或第二个 resumable stream；
- `AgUiChatTransport` 是仓内 Vercel AI SDK adapter，不是 server endpoint，也不拥有持久化事实。

当前源码已有 AG-UI parser，但仍保留 legacy network parse fallback，且 AI SDK adapter尚未实现。
因此本节是已接受 contract 方向，不是“迁移已完成”的证据。

## 7. 版本与 breaking policy

- browser-private contract 与 Web commit 共同版本化；不单独承诺 public semver。
- BFF upstream 始终使用显式 `/v1`，其 breaking policy 由 `kokoro-bff` owner contract 定义。
- 变更顺序：BFF owner contract/artifact → Web 固定来源/digest → Zod/AG-UI parser → adapter → tests/docs。
- V1 clean-build 不保留双读、旧 endpoint alias 或 runtime fallback；协调发布后删除旧形状。
- generated 输出只读，必须由固定 source/generator 再生并通过 drift/breaking check。

## 8. 最小 contract test

每次变更至少覆盖：

1. 正常 request/response/event；
2. unknown field、缺失字段和边界值拒绝；
3. tenant/identity 字段不能由 browser body/header 注入；
4. idempotency、cursor、`Last-Event-ID` 和 request id；
5. BFF error envelope 与不泄密映射；
6. AG-UI 未知/非法事件 fail-loud；
7. live 失败不回退 preview 或旧协议；
8. browser-private contract 不进入 Developer API catalog。

执行入口：

```bash
pnpm contract
pnpm test:architecture
```

## Project resource upload browser projection (2026-09-28)

BFF `public` owner artifact is `kokoro-bff/contract/openapi/v1/openapi.yaml` at commit
`199a1833d5a6c17839ff39b81380cf5a8377cf85` (SHA-256
`8d250e61080f40a0c980b9d5c055bda605b66adcfb11450f1575375cca435f82`), copied byte-for-byte to
`src/generated/bff-public-openapi.yaml`. The Web browser-private `POST /api/hub/projects/{id}/resources`
adapter forwards one multipart `files` part and the caller's stable `Idempotency-Key` to the BFF owner.
The adapter caps the entire body at 1 MiB and the upstream wait at 50 seconds for this route only.
The client projects only a BFF HTTP 200 envelope with exactly one CLEAN resource into the visible
confirmed list; HTTP errors, malformed 200 receipts, and uncertain outcomes retain the original
file/key for explicit retry. A terminal infected result is shown without retry. Browser multi-select
uses N independent owner requests, not an unsupported N-file body. GET project resources is a
separate owner contract and not implemented by this mutation slice; preview resource fixtures are
unchanged. The local Zod schema is a consumer validator, not a second editable public contract.

## W2 project resource browser-private GET (2026-09-28)

Owner BFF public OpenAPI commit `31c4803b3df0e90c031a97844f89df384ca1a35c`, exact vendor bytes
SHA-256 `87b1ff3a39f5fa0a67cabdf6b78df59697874bd817aa218ca676ec1472ec15e6`.
Browser `GET /api/hub/projects/{id}/resources?limit=50[&cursor=opaque]` forwards through the existing
Product Session same-origin BFF adapter to BFF `GET /v1/projects/{projectId}/resources`. The response
is strictly validated as `{data:{items:[CLEAN asset],next_cursor},meta}` with at most 100 items; no upload
ID, download URL, or Storage credential enters the Web list. `cursor` remains opaque and URL-encoded.
HTTP failure or malformed 200 is a visible error, not an empty page; the user retries GET. Preview fixtures
are explicit preview-only. The POST mutation contract remains unchanged.

## W2 project create browser-private POST (2026-09-28)

Current BFF `public` owner OpenAPI is `kokoro-bff/contract/openapi/v1/openapi.yaml` at
`31c4803b3df0e90c031a97844f89df384ca1a35c` (byte-identical Web snapshot
`src/generated/bff-public-openapi.yaml`, SHA-256 `87b1ff3a39f5fa0a67cabdf6b78df59697874bd817aa218ca676ec1472ec15e6`).
Browser-private `POST /api/hub/projects` sends the owner `CreateProjectRequest` with required `name`
and `Idempotency-Key`; existing same-origin Product Session adapter maps it to BFF `POST /v1/projects`.
Only BFF HTTP 200 `ProjectResponse` with `data.project.id` and `slug` passing the local consumer
validator can navigate to `/app/project/{id}`. The ID is canonical; slug is validated but not substituted.
One unresolved user intent keeps the same key/name/draft across error-strip retry or rail/welcome re-entry. Preview creation is a separate
fixture and never sends this mutation. Error response or malformed success stays on the current view.
Compatible extra owner fields are ignored by the consumer validator; required Project identity fields
remain mandatory. Once a valid owner 200 has returned, a failed navigation retry reuses that confirmed
id and does not resend POST.
## SET-05 个性化可靠保存（2026-10-13，候选已实现，待主控验收）

沿用唯一现有 browser-private `/api/hub/preferences/personalization` → BFF `/v1/preferences/personalization`，GET 返回 personalization(nullable)/revision，PUT 四字段与 expected_revision，冲突码 personalization_revision_conflict。不新增 owner API、公开版本、generated pin 或 alias。昵称128、职业256、about2000、instructions8000的Unicode码点上限保持；编辑与响应校验使用同一规则，不使用UTF-16 maxLength。snapshot revision为非负safe integer，null iff revision0；PUT ACK必须四字段匹配且revision精确expected+1，不能接受跳跃。client 接收 AbortSignal，10s总deadline涵盖fetch与body、响应限64KiB；超时仅取消当前request、迟到body清理，不取消编辑session或自动重试。取消/迟到结果不得推进当前草稿或显示保存成功。首次读取失败不具备写入基准，禁止 PUT；冲突必须显式恢复，未知写结果保原草稿及状态，不自动换revision重放。

## SET-07：本人资料 browser-private projection

唯一新Web入口GET /api/account/profile，不是新的公开Product或IAM业务API；禁止query/body，canonical Web请求，GET以外不提供动作。调用现BFF /v1/me在线准入与/iam/oauth2/userinfo；不直接访问IAM。成功仅{data:{subject,name,email,email_verified}}，后3字段可为null，姓名/邮箱缺scope不是匿名或伪造默认值；userinfo sub与Product subject必须一致。其他IAM字段不透传，包含token、credential、cookie、Location或原始error body均不得回浏览器。

所有响应private,no-store；无有效会话401、请求不合法400/403、依赖或登记未配置503、非法上游502，错误只用本片稳定安全类别，不显示原始异常。userinfo401/403失败关闭，429/5xx不得转成功空资料。单请求总5秒包含所有读取与body，上限16KiB，取消/迟到拒成功；身份校验与最终session复验同一原request，不由浏览器传subject/tenant。现IAM/BFF contract、generated pin和scope权限语义不变。
