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

创建入口严格按 Manus 已观察顺序拆分为 `custom-api`、`custom-mcp`、`json` 与 `url`；它们不得落入同一个泛化表单。Custom MCP 先显示详情层，再进入独立 `MCP 配置`；Custom API 使用独立 profile/环境变量详情。JSON 的来源格式含 STDIO、SSE、Streamable HTTP，必须只调用 Platform 原子 import contract：浏览器不得把 JSON 拆成多个 Register 请求或把非 HTTP 条目改写为 HTTP。现有固定 BFF/App artifact 已接原子 HTTP import，整份原文只提交一次。当前 owner 仅接受 `streamableHttp`；STDIO 和 SSE 返回明确 precondition，不改写传输格式、不冒称支持运行。URL 的 BYO OAuth 字段仅属于 URL 高级层，值只提交给 owner，不在投影或浏览器存储回显。

## 当前组件职责

- `mcp-projection-read.tsx`：用户意图与 v1 owner command 协调；不保存第二份投影。
- `use-mcp-projection.ts`：按身份、资源和 cursor 共享单飞投影读取，保留最后确认结果。
- `mcp-provider-directory.tsx` / `mcp-connection-list.tsx`：仅负责真实 owner 投影的筛选与卡片呈现。
- `mcp-provider-catalog-dialog.tsx`、`mcp-provider-detail-dialog.tsx`、`mcp-connector-editor-dialog.tsx`：分别拥有目录、Provider 详情、Provider 生命周期编辑的焦点/弹窗边界。
- `custom-mcp-detail-dialog.tsx`：只拥有自定义 MCP 的详情、管理菜单与 `MCP 配置`；读取 owner-issued server ID 后才渲染，绝不按显示名猜类型。
- `custom-api-detail-dialog.tsx` / `custom-api-form.tsx` / `use-custom-api-projection.ts`：只拥有 Custom API profile 的安全详情和编辑；环境变量值永不进入读取视图。
- `connector-command.ts` / `use-connector-creation-form.ts`：仅本地单命令的准入/lease/unknown及异步完成关闭机制，由 API/JSON 创建、MCP Prepare 与 typed Custom API 管理实际消费者共用，不是网络代理或命令注册表。
- `custom-api-create-flow.ts` / `mcp-json-import-flow.ts` / `connector-command-context.tsx`：各自 typed 输入/创建命令与稳定 AppFrameRuntime 的 API/JSON actor/client 命令槽。冻结正文/key只在RAM，unknown显式同请求恢复；关闭窗口不丢命令，换actor/真正卸载退休。确认清实际secret/JSON原文，API和JSON分别失活捕获主体的独立投影，Form/Dialog只拥有当前窗口关闭。JSON仍一次原子HTTP导入，不循环Register。
- `mcp-server-creation-flow.ts` / `use-mcp-server-creation.ts`：Custom/URL 多阶段创建的独立 actor/client 工作流和当前窗口消费者；原 Register/Prepare key、正文与 CAS 仅在 RAM 保留，未知结果显式恢复原命令。Register 确认只留精确 locator，新 Prepare 读取本代 server/connector，OAuth 不借旧准入，晚 ACK 仅刷新原主体。
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
