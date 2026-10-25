## 2026-10-25 配置保存后的局部读回展示

`custom-mcp-detail-dialog.tsx` 只在本窗口已确认保存、同主体/代际/exact对象且fresh读回挂起的短窗口保留不可变HTTP/SSE标签；不伪造Current/CAS或解锁动作，错误、unknown与退休仍显式处理。原Button outline恢复，配置按钮不再由局部CSS抹掉边框/背景/阴影。正常操作对照及未验范围归Root唯一执行板。

## 2026-10-25 当前业务只读401的有限再准入

AppGate在整个KokoroAppSurface外提供单用途read-recheck context；只有既有MCP/API投影、精确connector详情、composer metadata及Project GET hook的当前typed HTTP401，携其原subject/generation/未abort signal，才可报告。403、parse、network、迟到、preview和所有写命令不触发。Probe同步撤旧数据代，合并一次原Session检查；既有POST/CAS/未知轮换不取消、不重派，真正同主体确认后才发布新代由原hook重读GET。

恢复自身的GET/POST成功不重置预算；恢复新代若再401，撤准入且不自动再探针，仅该分支显示既有Retry按钮，调用原probe.retry开始明确独立恢复。后续独立正常续期可重新授予一次恢复额度；原页隐藏/主体退休/ABA围栏保留。不改HTTP/Schema/权限、命令正文/key或费用，不把本片定向回归说成原plaza相邻200错误根因或ChatEngine/bootstrap全局修复；正常激活与主方验收另做。

## 2026-10-25 personal HTTP/SSE 消费者候选

`mcp-custom-form.tsx` 复用原 Select 提供显式 HTTP/SSE；fresh 配置详情只显示真实且不可编辑的 transport。`hub/mcp-connector.schema.ts` 分开 required Current 与 operation-aware historical ACK，两层原 route/client 共同核 replayed／原请求，旧 absent body/key 不补值；JSON 保原整文档和单 key，HTTP/SSE 逐项原序绑定。URL 添加仍 absent HTTP，自定义 API 不变；项目发布 UI/action 两 guard 只接受 fresh HTTP。六个创建／恢复生命周期源文件原字节保持，creation flow 仅新增非秘密只读 transport getter；unknown 关窗重开显示原请求协议，旧 absent 显示“—”，原命令仍冻结／显式恢复；正式多 owner 正常验收由 Root 接手。

## 外层广场个人 API 与管理共卡（2026-10-25）

`mcp-custom-api-card.tsx`由管理列表和外层`mcp-custom-api-gallery.tsx`共用；广场仅呈现当前主体已准入且确认过的真实 Custom API profile，不由缺失 Provider 猜私有 MCP、不伪造目录。尚无正式 API 分类，故只在“全部”展示，名称/备注搜索只过滤已读取页，原 opaque 续页与独立读取失败/重试保留；有已确认 API 时不再展示整个目录为空的误导文案。点击继续按精确 profile_id 打开原编辑器，未触发新创建或 Prepare。

## 已确认 API 与独立 MCP 读取分离（2026-10-25）

`mcp-projection-read.tsx`在当前 API 列表已返回非空卡片时允许展示与打开原详情，即使独立初始 MCP 列表仍加载或失败；MCP 原 loading/error/读重试保持，不把失败当空成功，不触发新创建/重发。MCP 翻页仍只按已读回游标。`app-frame-rail`行为回归保 partial-read 的已确认卡片与详情、原错误、显式读重试恢复、真正全空态和未知 MCP 游标不启用翻页；未把偶发正常初始网络失败归因于共享flight。

## 2026-10-25 图标暂存与密钥编辑候选

`mcp-icon-draft.ts` 拥有窗口内暂存命令状态与原key/body/CAS恢复，`use-mcp-icon-draft.ts`绑定主体／准入／窗口，`mcp-icon-picker.tsx`和局部CSS复用在原API/MCP创建及编辑表单。选图仅创建暂存记录，原实体保存才携带selector／clear；关闭由`mcp-create-dismiss-context.ts`显式回收已知未绑定图标，未知保存不取消可能已绑定资源。`mcp-bound-icon.tsx`只展示已准入安全引用，失败／到期回退，不新增GET或刷新签名。

API详情复用原更新契约支持同名轮换、移除／撤销及未保存取消；已有密钥值不回读、不把placeholder当秘密提交，ACK清退草稿。列表即使当前页均已撤销仍保留合法游标的翻页入口。上述为候选实现，正常浏览器收据与余项以CURRENT／Root唯一执行板为准。

### 创建完成后的精确详情交接

`mcp-server-creation-flow.ts`只导出已确认绑定的非秘密locator；`use-mcp-server-creation.ts`在finish清退前固定server/connector/provider，完成回调失败重试同locator、不重新注册。`mcp-create-dialog.tsx`在原actor/generation/window仍有效时交给现`mcp-projection-read.tsx`的detail-only入口，后者重新读取并验证精确绑定，避免复制广场或从名称/首张卡猜详情。API与独立JSON导入保持原完成分支。正常四入口验收与URL项目发布后继分开记录，不把完成跳转当项目发布。

## 2026-10-24 私有 MCP 配置布局

`custom-mcp-detail-dialog.tsx`沿独立配置header／滚动body／footer组织；同名CSS仅配置态采用实测95vw／600×714、持续两列、局部控件token与图标右侧说明，短屏body收缩而操作可达。配置复制SVG16px，复制／添加Header文字以局部configurationButtonLabel承接2px逻辑尾距，宽度仍由内容决定；不改通用Button。详情态和管理／Prepare／试用／秘密／CAS语义保持；可见focus使用语义ring outline。参考规格与差异在`docs/manus-reference-audit-v2.md`，状态以CURRENT为准。

## 2026-10-24 Header 配置与撤销历史分离

`custom-mcp-detail-dialog.tsx`只显示正式描述符中active且configured的当前Header；revoked历史仍由owner／wire保留，不构造重复移除。现mcp-custom-trial回归保有效项、撤销同名重新配置与未保存Try行为；正常回读／刷新证据见CURRENT。

## Prepare 持久恢复与核验（2026-10-24，正常读取已验、恢复待验）

`mcp-preparation-recovery.ts`只拥有非秘密IndexedDB原子事务/严格codec/compare-by-key退休；`mcp-preparation-commands.ts`协调当前主体、恢复、核验proof、原请求与ACK，不镜像owner状态。`connector-command`仅增加显式unknown bootstrap及可选恢复政策；其它命令默认语义保持。核验沿现详情两GET，proof绑定窗口并随关闭退休，明确重试才POST；迟到已确认completed仅Done收口。存储失败不降级RAM，管理变更互锁与原清理语义保留。设计与实际证据/未验范围见App三面设计及CURRENT，不据此声称正常MCP闭环。

## 私有MCP长发现文本（2026-10-24）

现src/hub/mcp-connector.schema.ts承接owner无逐字段长度上限的发现显示文本；其它字段/控制字符/Unicode/strict校验与整体传输预算保持。tests/hub/mcp-connector-schema.test.ts覆盖三类长描述的GET和原Prepare receipt；原长CJK拒绝断言因合法owner语义改为正例，坏Unicode负控仍保留。旧502冻结请求仍inspect_owner，不因本片自动重放或置成功。

## 2026-10-24 JSON首次重复URL拒绝

`mcp-json-import-flow.ts`仅为JSON整文档原子导入启用`connector-command.ts`的首次明确拒绝分类；精确409/url_conflict/retryable=false且此前无未知结果时释放未执行意图。表单复用具名URL重复消息并保全文可编辑，更正后新key一次提交完整文档。其它构造者不启用分类，旧unknown/CAS/主体/窗口退休不变。当前真实JSON201后Prepare502的长metadata消费缺口见CURRENT，未据此关闭JSON或MCP。

## 2026-10-24 私有MCP配置保存落点

`custom-mcp-detail-dialog.tsx`以实际字段/Header草稿判断未保存变更并禁用Try；`mcp-projection-read.tsx`仅在当前主体/代际/窗口确认update_server后保留配置层、发出本地保存receipt并切换精确connector/server回读。旧CAS动作退休，秘密草稿在确认时清退；非秘密已提交值只在确认后作为临时草稿承接回读，fresh事实到达后rebase。未知命令仍恢复原key/body，失败读取只重读、不再次PATCH。未改API/owner；实际验证与未验范围见App CURRENT。

## 2026-10-24 创建重复URL的确定拒绝

`mcp-server-creation-flow.ts`区分首次确定的URL重复拒绝与未知提交；custom和URL表单使用具名提示并保字段可编辑。旧unknown重放依旧保原命令，status/code/retryable不符不释放。正常证据与未闭合CRUD见CURRENT，不以此称四入口已完成。

## 2026-10-24 私有详情试用交接

`mcp-trial-context.tsx`只桥接挂载AppFrame的草稿动作，不拥有网络或连接状态；`mcp-projection-read.tsx`核当前精确私有server/connector和命令锁，`custom-mcp-detail-dialog.tsx`把ready Try与原Prepare/OAuth恢复分开。原配置字段/秘密只写/管理CAS不变。正常验收状态见App CURRENT；四创建和全Skills/MCP未据此完成。

## 广场分类的可用列宽适配（2026-10-19）

`use-mcp-category-layout.ts` 承接原目录弹窗的标签实测与焦点交接，广场复用同一机制；不再用视口42rem猜测分类是否容纳。按当前语言完整标签宽度与实际控件列宽比较，中文412px为本次参考实测临界值而非代码常量。窄列搜索与筛选同排，筛选36px、14/18px、8px圆角；设置目录保留32px。查询/分类不重建、不发额外命令；缩放隐藏中的分类控件不可聚焦，展开中的菜单切回标签时关闭并交还当前选项。无API、数据或owner变更。参考1280/390及459/460边界来自实际Manus，浏览器回归绑定真实布局，不断言CSS源码。

## MCP 当前可用性

`mcp-availability-status.tsx` 在连接卡片、提供方详情/选择器、私有MCP详情统一显示owner五态，不从active/enabled猜测，也不执行任何续期/重连；原生命周期与enabled管理语义保持。严格wire由现hub schema拥有，历史安全header描述不按写入数量截断。

### 完整目录关系与明确选择（2026-10-19）

`use-mcp-provider-relations.ts` 只读现管理 connector 接口，按 opaque cursor 串行收完；不使用 runtime active-only 投影，也不将旧缓存/首分页当完整零关系。一个 live scan 由同 client/actor/准入代际/confirmed-write revision 的目录订阅者共享，最后订阅退休即取消；仅在飞共享，无跨打开的完整结果缓存。50页/10秒是读操作预算，不是业务上限；循环、超预算、失败、取消均保持未知，显式重试从首页开始。

广场与设置目录显示已添加正向标记（非revoked，不混启用/可执行），完整零项才提供新建。唯一非private关系冻结ID、类型/私有server绑定并走exact GET；多项及private由独立 `mcp-provider-connection-picker.tsx` 明确选择，再读选中connector/server，不塞回当前分页。被选ID不随刷新换绑，撤销/类型或server改变进入错误，不退回Create。原Create运行/未知/已确认恢复优先，确定拒绝后重核关系；换actor清退目录选择，同actor重核只退役事实。原管理命令与主体/CAS/幂等围栏保留。private精确读取失败的Retry重发原ID GET；confirmed-write revision/重试立即退休旧connector/server操作资格，当前connector及server均重读后才恢复，重读漂移不保留旧管理/Prepare按钮。

卡片使用一份紧凑排版：76px行、40px标框/24px图、14/20px标题与12/16px说明、32px状态框，不保留旧巨型封面及重复紧凑覆盖。保留目录网格/分类的独立响应式规则；视觉与正常环境验收以本轮实际证据为准，不以fixture声称真实账号完整旅程。模型、实际工具、扣费、CI及远端仍暂停。

目录打开的延后 autofocus 仅在焦点仍停留原处且输入仍挂载时执行；已交给分类的用户焦点不被旧打开帧抢回。原分类交接用例用受控帧补强，不靠扩时或等待掩盖竞态。

## 连接器目录弹窗布局（2026-10-19）

目录外框仍为800×680及95%视口上限；本片修正其内容区而非Settings已添加列表。目录标题后搜索/创建为同一32px行；卡片768px起两列、其下单列。分类另按实际容器与本地化标签测量：放得下时独占下一行，否则下拉进入搜索与创建之间，不把网格断点当分类断点。分类下拉由 `mcp-category-dropdown.tsx` 单独承接，目录与窄屏工具栏共用同一owner分类值/回调，不复制筛选状态或新增查询协议。测量在Portal实际挂载后启动，观察容器、标签和字体；切换形态承接分类焦点、关闭失去锚点的菜单，不改搜索节点或查询。目录布局CSS只在catalog作用域，不改广场、Settings已添加卡片、详情或创建命令。

参考与本地正常目录内容不同：参考有已发布条目，本地当前提供方为空，不创建假卡片或虚构连接。自定义分类仍缺正式owner事实，本片不假接该功能；空态、筛选和错误保持原流程。一次AX记录显示回到Settings容器，随后直接读取DOM即时/稳定焦点均为浏览按钮，当前未复现实际失焦；保留观察而不加延迟补丁。正常非空卡片/已连接目录标记亦未闭环，不宣称整页或全部MCP生命周期完成。

## URL 表单自然高度与 OAuth 面板（2026-10-19）

同日正常 IAB 对照 Manus：URL 外框以实际内容自然增高、95vw/95dvh 为上限；不用固定408/496高度。桌面收起/展开为480×408/500，390×720因警告换行自然变370.5×427.5/519.5；390×400与390×300分别限380/285。URL内部form另承接同一高度上限与overflow:auto，外框不因键盘聚焦被程序滚走；实际wheel/Tab均可到可见取消，外框始终保留。OAuth字段14px/20px、面板12px圆角与12px字段间隔对齐本次参考。

所有新规则仅URL dialog作用域，不改JSON/API/私有headers、请求/凭据/原命令恢复。正常空输入与保存禁用，未填凭据、提交注册或授权；局部几何/键盘证据不代表真实OAuth或整站像素一致。高级设置的措辞、图标与透明URL内部input圆角仍有可见/结构差异，不靠遮盖或造数据称全部对齐。

## Provider 创建恢复职责（2026-10-19）

`provider-creation-commands.ts` 属于现有 shell 命令上下文，按 actor/provider 保留原 Create 的不可变正文/键及确认 locator，复用单一 `connector-command`；不保存第二份 provider/connector/CAS 投影。`mcp-projection-read` 编排本窗口的双精确读取与授权，`mcp-provider-detail-dialog` 仅呈现未知/确认待续接和显式恢复控件。关闭/准入重核停止等待，换主体退休；创建已确认后授权失败不再 Create。动态 OAuth 提示只控制下次点击预开，不替代当前 exact owner 事实。既有连接器管理与创建恢复独立，只有消费连接/ticket 或确认移除该连接才释放原创建命令。

原意图只在已挂载 App shell 内存中存续，不承诺浏览器刷新/进程重启后恢复；不添加 localStorage secret 或持久命令旁路。以下较早的“Create未知key恢复待做”描述为历史缺口，不覆盖本节；正常产品整链/真实 OAuth 与工具验收另列。

## JSON 导入短窗口收缩（2026-10-18）

JSON textarea保留桌面308px首选高度，删除308px最小高度约束，由现有flex在短窗口收缩；仅JSON编辑区/操作按钮圆角分别对齐10px/8px。实测390×400编辑区230px、390×300为135px，导入按钮不再位于弹窗下方；390/768/1280宽度的正常高度保持。空值禁用、键盘Tab与Escape、原未知命令/授权语义不改，URL及Custom API样式不在本片写区。

## 已确认写入后的首屏详情与重复游标（2026-10-18）

列表可保留已确认卡片避免闪空，但旧聚合revision的行不再作为详情known：MCP以既有loading/error准入，Custom API仅在dataRevision与当前revision一致且无读取错误时提供known。写失活后已打开的精确locator立即重读，等待期间不提供旧CAS操作；GET仍不是写入ACK。目录发现重复cursor后停止续页，保留原卡片与错误，显式重试从首屏重新开始；普通网络失败仍只重试原cursor。

## Custom API 状态语义（2026-10-18）

`mcp-connection-list.tsx` 的Custom API Check仅标记“已添加”：`CustomApiProfile`没有实际连接状态。真正MCP连接继续按owner返回的status投影，不从配置已保存、API名称或说明推断已连接。原AppFrame恢复用例承接此区分，无新状态模型或数据请求。

## JSON 导入提示与视口边界（2026-10-18）

`mcp-json-import-form.tsx` 用纯 JSON placeholder展示当前 owner 已支持的 Streamable HTTP格式，不把示例预填成命令；初值为空、导入禁用，输入后仍一次提交完整原文。参考界面还展示 STDIO/SSE 语法，本产品这些导入/执行能力未闭合，不借提示宣称支持。

`mcp-create-dialog.module.css` 仅 JSON mode 的600×458框使用95vw/95dvh上限和纵向滚动，窄/短窗口不裁掉标题或动作；URL、Custom API、注册 mode 不变。原 JSON form 用例扩空值/提示/零调用保护，实际浏览器验390/768/1280动态宽度、390×400短窗口键盘Tab可达、清空禁用与Escape返回创建焦点。原授权/未知命令/原key与正文恢复不变。

## 2026-10-17 精确详情与独立API续页

`use-custom-api-projection`继续拥有共享首屏，只给当前head/admission附独立opaque续页；显式重试、ID去重、重复cursor停机，不缓存尾页到共享head。`use-custom-api-detail`与`use-mcp-provider-connection`分别读取已开窗口的精确locator，不依赖首屏/当前页；二者消费对应既有聚合revision，旧窗口确认写使当前窗口重读但不关闭。未接全量API搜索。

Provider授权窗口生命周期包含窗口token；ticket成功后保留详情，主动关闭/换窗退休等待，迟到Create不得继续Begin/导航。`private-mcp-oauth-binding`只判断owner真实OAuth事实，UI/hook共用，ready+configured允许active显式重连。Create未知原key恢复仍待独立既有命令切片，不把abort当撤销提交。实际验证见App CURRENT。

# ui/mcp — 连接面板

## Settings 卡片表面（2026-10-16）

同会话实测1600×900与733×764：已添加卡片应透明承接Settings底色、6%轻边框；hover只加4%前景混合底色，不把边框加深至20%。仅data-settings-layout范围覆盖，目录/独立视图及焦点行为不变；颜色沿foreground语义token，未照搬固定浅色填充。正常DOM/计算样式实际RED→GREEN，像素色差随既有Kokoro语义前景可有1级左右差异，不冒全页面像素相等。


- 广场分类使用参考的 32px 高、4px 横向 gap；控件区与结果区之间保留 16px 底距，空态与有卡片时使用同一基线。

## Settings 布局基线（2026-10-16）

同主题/语言、DPR2、865×764与390×844正常页面对照Manus：已添加连接器 toolbar 保32px，桌面标题divider后24px、窄屏8px；搜索200px仅收缩不扩张，操作组间距8px、左右12px，toolbar后12px接13px/19.5px标签。卡片76px、12px网格gap，桌面两列/窄屏一列；名称14px/500，说明13px/16px最多两行。MCP feature 独占自己的内容顶部与toolbar底距，不再由Settings shell的mcpBody重复写padding；其它嵌入feature不变。紧凑Settings沿参考380px/98vw envelope，390视口内内容348px，而非额外扣32px外边距。测量只证明这些布局锚点，原始截图/DOM在本地ignored，不冒全页面/全状态像素一致。

## 当前边界
正式 Settings/MCP 与目录经 `mcp-projection-read.tsx` 渲染 BFF owner-native 投影和 opaque cursor，并通过现有 CAS 命令完成编辑、启停、删除和授权重试；URL、secret、revision、allowed_tools 不进入正式视图。旧的 server pool、凭据池和 preview 入口已删除，不保留兼容分支。

Settings 的已添加连接器由同一 owner 投影渲染为可聚焦的紧凑卡片；搜索只过滤当前已读取页的真实名称、说明和已解析 provider 名称，不展示 opaque `provider_key`。卡片打开现有 CAS 管理弹窗，编辑、启停、删除及授权重试仍通过正式命令；仅在 owner 返回前后游标时显示分页。
Settings 的 Browse 与空态添加入口打开独立目录弹窗，不替换已添加列表；目录和已添加列表各自保留搜索条件。外部 Plugins 页面继续以内联目录呈现，但与弹窗复用同一 provider 投影、卡片生成和详情/Connect 行为。
Provider 目录与个人连接列表分别读取、分别保留成功投影并独立显示失败/重试；任一 owner read 延迟或失败不阻塞另一侧已成功内容。每份投影绑定当前 read identity，身份变化时旧数据立即退出渲染，inflight 仍按订阅生命周期取消。
OAuth 点击同步预开并隔离 popup，再使用 owner 返回的 HTTPS URL；callback Complete 在 StrictMode 下共享 inflight，只通过 BroadcastChannel 发送 connector_id 触发 owner projection 重读，不广播 code/state/token，也不以通知判定 active。popup 阻止时不发起 owner command，关闭、过期与卸载均清理句柄。

创建入口严格按 Manus 已观察顺序拆分为 `custom-api`、`custom-mcp`、`json` 与 `url`；它们不得落入同一个泛化表单。Custom MCP 先显示详情层，再进入独立 `MCP 配置`；Custom API 点击卡片直接打开独立 profile/环境变量编辑器，不增加只读概览层。JSON 的来源格式含 STDIO、SSE、Streamable HTTP，必须只调用 Platform 原子 import contract：浏览器不得把 JSON 拆成多个 Register 请求或把非 HTTP 条目改写为 HTTP。现有固定 BFF/App artifact 已接原子 HTTP import，整份原文只提交一次。当前 owner 仅接受 `streamableHttp`；STDIO 和 SSE 返回明确 precondition，不改写传输格式、不冒称支持运行。URL 的 BYO OAuth 字段仅属于 URL 高级层，值只提交给 owner，不在投影或浏览器存储回显。

## 当前组件职责

- `mcp-projection-read.tsx`：用户意图与 v1 owner command 协调；不保存第二份投影。
- `use-mcp-projection.ts`：按身份、资源和 cursor 共享单飞投影读取，保留最后确认结果。
- `mcp-provider-directory.tsx` / `mcp-connection-list.tsx`：仅负责真实 owner 投影的筛选与卡片呈现。
- `mcp-provider-catalog-dialog.tsx`、`mcp-provider-detail-dialog.tsx`、`mcp-connector-editor-dialog.tsx`：分别拥有目录、Provider 详情、Provider 生命周期编辑的焦点/弹窗边界。
- `custom-mcp-detail-dialog.tsx`：只拥有自定义 MCP 的详情、管理菜单与 `MCP 配置`；读取 owner-issued server ID 后才渲染，绝不按显示名猜类型。
- `custom-api-detail-dialog.tsx` / `custom-api-detail-dialog.module.css` / `custom-api-form.tsx` / `use-custom-api-projection.ts`：只拥有 Custom API profile 的直达编辑和独立样式；原命令恢复/删除确认保持，环境变量值永不进入读取视图，不变不提交。
- `connector-command.ts` / `use-connector-creation-form.ts`：仅本地单命令的准入/lease/unknown及异步完成关闭机制，由 API/JSON 创建、MCP Prepare 与 typed Custom API 管理实际消费者共用，不是网络代理或命令注册表。
- `custom-api-create-flow.ts` / `mcp-json-import-flow.ts` / `connector-command-context.tsx`：各自 typed 输入/创建命令与稳定 AppFrameRuntime 的 API/JSON actor/client 命令槽。冻结正文/key只在RAM，unknown显式同请求恢复；关闭窗口不丢命令，换actor/真正卸载退休。确认清实际secret/JSON原文，API和JSON分别失活捕获主体的独立投影，Form/Dialog只拥有当前窗口关闭。JSON仍一次原子HTTP导入，不循环Register。
- `mcp-server-creation-flow.ts` / `use-mcp-server-creation.ts`：Custom/URL 多阶段创建的独立 actor/client 工作流和当前窗口消费者；原 Register/Prepare key、正文与 CAS 仅在 RAM 保留，未知结果显式恢复原命令。Register completion 对外只含精确 locator；同一次创建已确认的安全只读视图可由 opaque 内存 handoff 在同 client/actor/准入代际/revision 内交给详情，免去取消 picker 后的重复读取与空白闪跳。新观察、确认开始或任一绑定失效即退休，不落 IDB/路由，错误不复活旧 facts；普通冷开与新 Prepare 仍读取本代 server/connector，OAuth 不借旧准入，晚 ACK 仅刷新原主体。
- `mcp-projection-types.ts`：共享的投影视图类型、分类词汇和 owner artwork/status 映射；不含请求或模拟数据。


MCP 注册／原子导入与已确认的个人命令，统一失活当前 client／subject 的连接器页和首屏持久投影，并通知挂载读者重新读取；Provider 元数据保持独立。旧预热与旧请求按共享 revision 退休，即使取消后迟到也不写回。全局创建和 Settings 内部创建共用该规则，Settings 不再因写入重挂整个连接器内容，搜索等用户意图保留。Custom API 是独立投影：两个创建入口确认成功后统一调用 `invalidateCustomApiProjection`，取消原主体的旧预热／读取并通知共享读者，不刷新其他主体、client、MCP 或 Provider；仅本地 refreshKey 不再充当创建刷新机制。


## 同 actor 登录重核

`mcp-create-dialog.tsx` 单独拥有创建窗口的关闭：已提交的 client／mode／open 生命周期变化或卸载后，旧完成仍通知其原确认回调失活投影，但不关闭后开的创建窗口；Settings 不在确认回调内第二次关闭。排队的首次聚焦在窗口退休时取消，迟到帧也不操作新窗口。此处不把取消当作写入回滚，也不取消／自动重试 owner 命令；API/JSON 单步创建与 Custom/URL 两阶段创建各自持有原命令恢复；详情编辑的 Prepare 未知恢复仍是后继。

查询、分类、cursor、目录开关和精确 connector/server、provider/connection、API profile locator 属于 actor 稳定的展示意图；Settings 与 Plugins 不因临时失准入卸载整面板。所有 owner 投影、私有详情、错误/忙态与删除确认按 client/主体/准入代际退休；失准入只显示无私有数据的详情壳，恢复后从新页精确找回原资源，缺失或读取失败保留显式重试，不按名称或新绑定替代。换 actor（包括 A→B→A）清空意图。

已打开的自定义详情保持 Dialog DOM；配置仅保用户明确输入的 dirty 字段，未编辑字段从新 owner 配置读取，保存使用新 CAS。旧读取消且迟到不展示；旧命令不关当前窗口、不发布旧 ACK，已确认写仍按原 actor 失活正确的 MCP／Custom API 独立投影。详情协调器的 OAuth popup 在准入退休时关闭、取消并禁止迟到导航，旧 Create 确认也失活 pending 连接，而不继续旧授权。新 create/browse 在重核期间暂停。Custom API 创建现使用独立 actor flow，保同 actor 输入，重核只读、换 actor 清空、取消旧等待后只显式恢复原 key/body；未知期间禁止新命令，确认后完成或当前窗口关闭。JSON 原子导入及 Custom/URL Register→Prepare 也使用独立 actor/client 命令意图；原生 OAuth 接当前 window/admission，fresh owner 才决定 ready，不以 popup 通知作为完成证据。真实第三方 OAuth 提供方闭环、详情 Prepare 未知恢复仍未验收；整个文档重载不持久保存创建 secret/key。


配置编辑的准入重核不重建表单或文本控件：尚未明确修改的owner值和已配置header/env描述立即清空，dirty用户输入仅在本actor内保留；控件readonly且保存/Prepare/管理/草稿增删暂停，Close/Retry仍可用。`use-mcp-editor-selection.ts`只保存字段ID、选择范围/方向/文本长度和控件内部scroll，不保字段值、已移除控件或凭据；恢复时限定当前仍聚焦的本表单控件，裁剪并更新范围，承接pending期间的新选择而非抢回旧焦点。原生不支持selection API的URL控件不强设range；generic provider editor/创建表单不冒称已覆盖本片。

URL“保存并发布”先在用户点击中预开既有隔离 popup，再执行原创建与必要授权；弹窗被拦截时零注册，owner 无需 OAuth 时只清理预留窗口并完成。popup 关闭/超时与准入退休暂停当前两阶段等待，保留原 unknown 命令，不借旧 continuation 继续 Prepare/Begin；普通 Save 和显式 Connect 协议保持。第三方真实 OAuth 仍须单独验收。


`mcp-preparation-commands.ts` 拥有按精确 server/connector 区分的原 Prepare 正文/CAS/key，创建和详情共用；不同资源互不阻塞，不新增第二份准备意图或 owner 投影。`connector-command-context.tsx` 的唯一 Provider 位于 AppFrameRuntime，覆盖主页面与 overlays，移除旧 overlay-only owner。unknown 关闭重开/重核仅恢复原命令，确认后只完成当前窗口；确认断开/删除退役精确命令，迟到 ACK 不复活已撤销目标。快照仅 locator/状态，无 private facts/secret，整个文档重载仍不持久恢复命令。 详情窗口/准入代际取消原等待；迟到的同命令 ACK 只可由当前显式重试或完成动作消费，不借旧窗口关闭新窗口。


Connector恢复错误当前已固定BFF browser-private profile并由Hub/同源adapter严格校验，拒绝错status/retryable及read上的receipt写错误。此阶段仅传递既有HubClientError的机器code；本目录actor命令/表单的差异化恢复UX仍待后继，不把profile的recovery当自动请求或新key许可。


`connector-command-failure.ts` 仅将固定BFF合法tuple映射为非敏感reason/本地提示，single-command与Register持原失败限制；same_command显式恢复，inspect_owner/配置原因在状态层拒重试，不自动换key。创建API/JSON/Custom/URL及共享Prepare详情复用原alert/button展示九语言；窗口可关闭，核验提示不代表新建许可或GET结清。OAuth创建popup错误仅保当前scope的reason，其他详情生命周期/真实OAuth与人工结清产品流程仍未验。


`custom-api-management-commands.ts` 在稳定shell按profile ID持一个typed update/remove原意图，不经过通用runAction。未知期间不可改body/CAS或切换操作；Close/重核只暂停等待，显式恢复原key/body，首次明确400拒绝才允许修正新命令。summary只有locator/operation/kind/failure，ACK清core与已挂载编辑器实际secret草稿；其他资源独立、actor/client退休清理。列表缺资源仍显示可打开的原意图，不以GET/404结清；旧窗口迟到ACK只失活原主体投影，不能关闭后开窗口。Hub管理方法要求caller key且严格绑定目标及已写字段/安全env描述；删除仍需原用户确认。原生OAuth/其他MCP管理恢复和整文档重载仍未闭环。


## MCP 五项管理恢复与 Prepare 互锁

`mcp-management-commands.ts` 只构造MCP固定五项typed management与现Prepare，不成为通用registry。每connector及可选private server绑定一个管理原命令，unknown冻结操作/body/CAS/key；其间新Prepare和其他管理被状态层拒绝，Prepare未结阻止修改配置/启停。明确disconnect/delete仍沿原清理语义允许，确认ACK才退休匹配Prepare。Provider/Private/Generic详情经同一index及`mcp-management-status.tsx`呈现，关闭/准入暂停当前等待、换actor退休；原窗口ACK只失活原投影，当前显式恢复/Done才可关闭当代window。列表缺行保locator恢复入口，不生成owner事实或GET结清。

私有MCP ACK清实际header草稿/移除意图；非敏感明确输入在只读完成窗口保留至Done，避免把新GET当原命令正文。Hub update/delete server与update/enabled/remove connector均显式caller key、严格locator/写入安全字段及ACK，不变HTTP或原生OAuth。旧runAction只留下未覆盖的目录创建/原生授权协调，不能据此声称其完整命令恢复已完成。整文档重载、显式结束未知等待、真实OAuth和剩余视觉仍待后继。

API／JSON创建窗口的每次等待由use-connector-creation-form持有独立caller AbortSignal；取消或真实窗口/准入退休只停止本次flight，命令仍保unknown及原key/body。connector-command按flight关联处理abort、settle移除监听；旧窗口不取消后继重试，同值boundary对象重建不退休，迟到ACK不自动关闭后开窗口。此处不是owner撤销或人工结清能力。


私有详情/配置的needs_oauth且pending/error主操作使用连接，不再错误派发Prepare。`use-private-mcp-authorization.ts` 仅消费当前窗口exact server/connector/CAS，复用原popup与正式Reconnect；单窗口在途单飞，关闭/切目标/重核取消等待，旧ACK只失活原主体、不导航或关新窗。Begin成功仍保详情、不冒active，回调通知后重新读取owner事实；未结Prepare/management先沿原命令。Provider/generic授权、创建及owner协议保持，秘密不入hook状态或浏览器存储。


## 目录完整读取与单项详情

`use-mcp-provider-directory.ts` 使用现有 owner 的 query/category_key/cursor：未筛选首屏加入原 shell projection，不重复预热；筛选与续页独立读取，不过滤首批数组冒全量搜索。180ms 搜索防抖，筛选/actor/准入代际退休游标、取消并拒迟到；续页失败保已有卡片，显式原游标重试，拒循环cursor。页面和catalog dialog共享该目录意图，详情返回不重置搜索/分类/已读页；控件始终保持挂载。空目录与筛选无匹配区分。seed失败只影响依赖seed的未筛选面，不污染成功的独立筛选。

`use-mcp-provider-detail.ts` 只在已打开的精确provider不在当前已读页时走Hub单项GET；ACK必须匹配provider_key，关闭/准入/actor退休旧响应。已安装且无private server的MCP可直接打开此详情，不等待目录成功，不扫描全部页。现有私有server、BYOK、授权和管理命令职责不变。

证据：`tests/ui/mcp-provider-directory.test.tsx`、`mcp-provider-detail.test.tsx`、现Hub/rail回归。正常空目录已读，尚无真实非空提供方/真实第三方OAuth闭环，不把协议fixture当目录内容完成或推荐事实。


## 自定义 MCP 表单视觉修正（2026-10-24）

按已归档 Manus 实测修正表单 surface/阴影、普通 URL 输入、备注圆角与 headers 标签层级，尺寸和提交工作流不变。隔离 CSS/DOM 证据只证明本表单视觉；HTTP 只读和图标上传禁用仍是明确未闭环项，不称完整对齐。视觉夹具无论 Chromium 启动或关闭失败都释放 Vite 资源。

## URL MCP 项目定义发布（2026-10-25 候选）

`mcp-url-form` 的保存并发布走 Register ACK → 独立 `mcp-project-publication-dialog`，不预开 OAuth、不暗跑 Prepare。`mcp-project-publication-commands` 由原 actor shell 持有精确原命令；取消 picker 保留已创建实体与精确详情。项目由既有本人 project reader 读取，pin 读包括墓碑 CAS；ACK 只显示定义发布、明确 execution_ready=false。异常仅 typed receipt/已发布 same_command 策略显式恢复；首次明确拒绝的修改须新输入，receipt 404不证明未提交。

发布恢复 journal 与 commands 分离：日志只存非秘密原命令，首次 POST 前持久化、原 ACK 后精确清退；重载只恢复未知状态。原子 first-rejection 清退保护跨 tab 竞争。项目列表首屏独立于 pin 扫描，确认只读已选 CAS（4 lanes、128 总页、10秒），关闭中断且不隐式发写。
