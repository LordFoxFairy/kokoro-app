## 2026-10-25 独立封面媒体消费

`skill-cover-media.tsx` 由外层目录、Settings目录与详情共同使用。合法 exact revision URL 只是同源媒体定位，不代表有图；按原client/actor与URL换代，只有当前图片成功加载后展示，未加载／失败保留原fallback。详情仅按实际loaded预留封面宽度，统一unoptimized以保同源身份；不改变列表、安装、包读取或当前准入。

## 个人系列删除（2026-10-21，候选）

personal-skill-actions新增真实delete，不替换withdraw；personal-skill-management仍是精确锚点／actor／恢复入口owner。personal-skill-delete-dialog只负责系列删除确认、正式history publication读取、冻结命令与显式原意图重放。确认后GET404不再锁死未知重试，只有匹配回执清选择并失活列表。deleted安装保留但禁详情、历史、包、启用和更新；停用仍可用。最终180项候选尚未正常生效；未操作正常环境，正常浏览器与最终配对由主方统一验收。Manus真实图标上传后的enabled与本地disabled仍是剩余差异，不在此片新增上传API／Storage或自动启用。

## 目录搜索切换的连续点击（2026-10-21）

外层 `KokoroSkillsSurface` 仅保留当前准入 client 已确认的目录及游标页，查询切换期间本地匹配并保持卡片触发器；新查询仍由 owner 决定。待确认时禁用安装／续页，详情只保精确选择意图，不读取旧私有事实；身份或准入代际变化立即退休旧投影。复用现有组件、资源键与详情窗口，不新增缓存层、API 或兼容路径。

## 历史版本的可用性标识（2026-10-21）

历史的当前项仅表示正式 publication 指针；版本停用／撤回／隔离与 publication 撤回分别展示，撤回不重复标识、不错误传给其他历史项。不改变选择、读取权限、发布或安装状态；沿原中性状态样式，无新组件层。

## 个人发布管理入口（2026-10-21）

`personal-skill-actions`只提供操作菜单；`personal-skill-management`负责精确版本的正式本人核验、准入退休和窗口恢复，原publish/withdraw组件仍拥有命令意图。`SkillsContent`以主体隔离会话，以精确操作目标重建终态后的管理窗口；未知意图不会因关窗或同主体重核而替换key/body/CAS。发布成功菜单只使用确认回执的新source/revision，重新核验后进入操作，不伪造或升级installation。撤回确认显示名称与精确版本。没有历史恢复／删除按钮，不声称它们已实现。

## 已安装技能的发布者展示（2026-10-21）

详情发布者来自已准入且精确绑定的 installation `publisher_profile`，不把调用方传入的站点品牌当作个人作者。资料缺失／尚未读回时不显示猜测名称；仅 owner 明确的 official 来源可使用原官方品牌标签。沿用原身份代次退休和 exact pin 读取，不新增 API、权限判断、缓存或作者查询。目录与分享的原展示路径不变。

## 设置工具栏尺寸归属（2026-10-19）

嵌入设置的搜索上限200px、添加84px及32px高/8px圆角范围项来自同视口Manus实测；四项按文字自然宽度与10px横内距布局，不再用桌面规则扩宽搜索或固定52/66px范围项。独立Skills窗口保持原样，紧凑搜索继续收缩到可用轨道；只改本组件CSS，不新增状态、请求或样式字符串测试。

## 设置范围筛选的选中反馈（2026-10-19）

嵌入设置页的范围筛选复用 ToggleGroup 原有 data-state；选中规则使用与基础项相同的 slot 边界再限定 on，避免透明背景/常规字重覆盖已选反馈。不增加筛选状态、请求或全局样式；实际浏览器先复现选中项与未选项同为透明/400，再核个人、官方、第三方切换与键盘互斥反馈。

## 更新未知结果的明确停止等待

个人安装更新继续保留unknown、原key/body及普通reset保护；HTTP412不证明原操作未提交。`skill-installation-update-flow`的abandon仅接受当前admitted boundary、同一unknown snapshot、无active等待且尚无ACK，清本地恢复意图而非撤销owner更新。`skill-installation-update-dialog`二次确认后调用，取消返回原按钮；actor/generation/状态变化使旧确认失效。父SkillsContent失活原池/目录查询并关闭，不合成成功。正常页面的请求前故障验收与真实owner lost-ACK是不同证据，范围见CURRENT。

## 当前安装来源可用性（2026-10-17）

正式安装 wire 必需的 source_status 原样投影到卡片；它不等于 installed/enabled，也不是执行授权。已知非 active 来源禁止新启用/试用，既有 enabled 安装仍可停用，详情/历史包阅读与显式更新不受影响。不可用提示占原卡片 footer 的次要日期位置，不增卡片高度挤走更新；完整日期仍在详情。未提供该字段的目录/显示模型不据此制造 active 事实，实际命令仍由 owner 当前资格裁决。

安装详情以已核 exact installation 的当前可用性组成 currentSkill；启用与试用同用这份事实，试用回父组件仍核原 owner/admitted 及 series/revision/source/installation locator，不因旧卡状态而静默失效，也不借新来源替换旧 pin。原安装 wire、命令、缓存退役、权限、目录 series-current 下载及分享 exact 语义不变。

## GitHub 导入结果未知

`personal-skill-github-import-flow.ts` 将非preview阶段的正式HTTP5xx也归为unknown：已创建draft后的checkpoint/响应失败不证明未提交。保留原selector、各阶段body/key，仅显式恢复；preview仍是可重新输入的读取失败。404也没有证明可释放完整Import意图，因此不增加“换仓库/换key”旁路。

## Reader 展示意图与重核事实

Settings 的详情实例按原 source＋精确 locator 绑定，actor 仍由外层清理。`ManusSkillDetailDialog` 的 viewTarget 仅保存同 actor/资源的 reader、文件路径、目录展开和文档 scroll 意图；每代 admission token 继续退休私有 metadata、installation、manifest、正文和旧请求。pending 展示通用 reader 框架，fresh pin/目录确认后才恢复有效路径和滚动；换 actor/目标、关闭清意图，显式重新进入重置，失败重试不强制 SKILL.md。没有修改 session 的周期、认证或任何网络契约。

## 2026-10-16 包文件导航展示

`SkillPackageFiles` 是目录与本人管理 reader 共用的纯文件树：只渲染已检查的 owner 路径，展开集合初始为空，选择文件不清除展开，重新进入 reader 重置；展开不取文件字节。详情 reader 在紧凑文件菜单选择后收起并将焦点还给入口，同文件不重读。文件树字重、13px/19.5px、27.5px 行高、200px 桌面导航及紧凑内容尺寸菜单以 Manus 实测为准；不变更安装 pin、请求身份或正文解析协议。

## 安装更新的键盘返回

显式更新确认后的 owner 回读会移除原更新按钮；普通关闭返回仍可用的真实触发器，原按钮已移除或禁用时返回同一安装池搜索框。从待核实通知恢复则记录本次通知按钮；不通过 DOM/CSS 字符串寻找或伪造数据卡片。

## SKILLS-UPDATE U4（本地实施，正常组合待验）

- `skill-installation-update-flow.ts`：actor-owned 原安装/两 pin/key 意图；unknown 原样显式重试，ACK-known 只 GET。当前事实每代退役，series/revision/installation ACK 绑定，不以 GET 到目标冒认成功。
- `skill-installation-update-dialog.tsx`：真实当前安装/已选版本、确认、未知恢复和回读反馈；复用 Dialog/Button 与语义 token。
- `SkillsContent` 持 flow，不在 generation-keyed `InstalledSkillsContent` 内；独立恢复入口不随卡片/筛选消失。`available_update` 仅来自 owner；更新期间锁住原安装操作，ACK 后失活安装池与目录，不重写历史试用/消息。

<!-- T-K03.14-WEB-PERSONAL-LIFECYCLE D0: target, not implemented -->
本人managed详情将显示真实例子/更新时间；更新沿personal-skill-publish flow正规新版本包链，撤回独立personal-skill-withdraw-dialog。仅owner范围；实现闭集及待验门见三设计具名前缀。

<!-- T-K03.14-WEB-GITHUB-IMPORT UI -->
现GithubImportDialog → personal-skill-github-import-flow → focused GitHub client / 现Publish owner+CAS / 真实Installation ACK；删除旧Hub optional URL导入与preview模拟写，不影响local-import/真实reader。

<!-- T-K03.14-WEB-LOCAL-IMPORT UI slice -->
- `skill-upload-dialog.tsx`：目录/个人新建共用普通拖放 `.zip`/`.skill`；不手填发布元数据、不消费旧preview/confirm。
- `skill-upload-dialog.module.css`：承接普通上传的400px窗口、标题/投放区/要求排版，复用站点Settings表面token；空footer不占位，运行/恢复/完成状态的真实按钮仍正常呈现。关闭后的焦点恢复由既有组件持有，样式不改变导入命令或网络生命周期。
- `personal-skill-import-flow.ts`：原File/hash、冻结命令与未知结果、当前账号locator及GET恢复；只浏览器状态，不解析ZIP、不拥有持久业务事实。
- `personal-skill-publish-dialog.tsx` 保留已存在draft包更新/恢复，不是普通新建入口。导入完成后重新读取权威目录/个人列表，不生成卡片。

# ui/skills — 技能面板

## 当前投影身份

已绑定 owner 的安装卡片、探索目录分页合并与 mutation pending/error/enabled 状态统一使用 `skill_id`（series ID），不以显示名判同。重命名保持同一状态，同名不同 series 不互相覆盖；无 owner binding 的 preview entry 使用独立标签的 scope/name tuple，不与真实 ID 或含分隔符的名称碰撞。GitHub 导入后的排序提示绑定返回的精确 revision Skill ID。

安装列表的 `source_kind`、`query` 由客户端和同源 adapter 校验并转发给 BFF `/v1/skill-installations`，由 owner 在分页前筛选；不在浏览器先截取一页再假装完整过滤。搜索长度按正式契约的 Unicode scalar（最多 1024）计数，重复或未知参数仍拒绝。

Settings 已添加池直接读取正式 installation 集合，包含停用但不含已移除项；完整有界读取最多 10 页／1000 项，所有页共享 10 秒预算。来源只用 `product.source_kind`；缺失为 unknown，仅在全部可见，不用 ownership 或官方目录补猜。卡片保留 installation ID、series ID 与 `source_ref` 的精确 Skill UID，十进制 revision 不冒充 UID。循环 cursor、重复安装／系列、异常后页整体失败，不发布部分清单。

Skills adapter 必须接收受信 readBoundary：同主体／generation／admitted 复用同一实例，不同代际退役旧读取与旧命令回调。暖池 lease 承接 StrictMode 重放；退役时清除该 client 的查询 namespace，旧响应不恢复旧数据。Settings 状态按 client 重挂；外部目录的缓存、分页、详情和安装意图按同一身份隔离，组件退役取消后续查找与提交。这里的取消不声称撤销已到 owner 的写入；未知 ACK 仍由原 actor 的正规幂等／回读流程核实。

## V1 目录读取

正式主页与 Settings 共享 `createManusSkillHubClient`：目录经同源
`ListHubSkills` 读取，目录安装状态来自同一 BFF 的 `ListSkills`，Settings 池使用上述正式安装集合；不访问已经退役的
`GET /api/hub/self/skills/catalog`。公开 Developer API 的 `/v1/skill.list` 与这组
browser-private 展示操作分开治理，均由 BFF 聚合实际 owner 事实。主页与 Settings 使用
`hub/skills/catalog` 缓存命名空间，提交成功时按此前缀失活；目录没有 quota 投影，不请求旧 quota 路径。

目录来源仅识别 owner 明确的 `MANUS_OFFICIAL` 与 `COMMUNITY` 发布者类型。缺失或未来值保留为 unknown，不猜为第三方、个人或品牌官方；卡片与详情省略无事实的发布者标签，series/revision 和安装状态不受影响，未知项只在“全部”中出现。这里的发布者来源不等同公开 `owner_type` 或 Hub/Device 安装来源。

## 正式生产入口与旧组件边界

Settings 的正式入口是 `src/ui/settings/sections/skills-settings-section.tsx` →
`SkillsContent`（`skills-panel.tsx`）。非 preview 会话由
`createManusSkillHubClient` 读取精确 installation；preview 只替换 client，不换成另一套发布管理页面。
`/app/skills/page.tsx` 本身返回 null，页面由既有 App shell 挂载，不能据该占位判断缺少正式技能页。

`personal-skills-read.tsx` 当前仅由 `tests/ui/personal-skill-publish-dialog.test.tsx` 引用，
没有生产调用。其页内 `latestRevisionPerSeries` 不代表 current publication，也不是正式安装列表的版本选择规则；
不要为修复该旧组件而改变 exact installation 或接回旧布局。清理组件及测试前须核对独有行为的承接，
本次仅纠正维护索引，未删除源码或测试。

## 职责与公开件

- `SkillsContent`：当前身份下的安装池、目录、详情意图、安装更新与个人发布管理入口；
  未知命令的恢复入口不随卡片筛选或窗口关闭消失。
- `SkillsPanel`：独立 Dialog 包装，持 `client`、`readBoundary`、关闭及试用回调；
  Settings 嵌入由 `SkillsSettingsSection` 直接使用 `SkillsContent`。
- `SkillUploadDialog`：正式 ZIP／`.skill` 拖放入口，消费 `personal-skill-import-flow` 与
  `skill-local-import-client` 的真实导入操作，不是旧 preview→confirm API。
- `PersonalSkillManagement`：对精确版本做正式 self-managed 发布者核验，再打开既有更新／撤回组件；
  不以安装归属猜测发布权，不把撤回当删除。
- `PersonalSkillPublishDialog`／`personal-skill-publish-flow`：既有 draft 的包更新、不可变修订发布及原命令恢复；
  不负责普通新建导入，不在发布成功后自动升级安装。
- `PersonalSkillWithdrawDialog`：精确版本的撤回确认与原 key／CAS 恢复；历史版本与当前发布的语义仍须按
  owner 限制核验，不能静默改目标。正式系列历史、恢复、删除不因这些组件存在而视为已实现。

## 协作者
- `@/hub/client`（纯请求）、`@/hub/rules`（`isRequiredLockError` / `isQuotaExhausted`）、`@/hub/schemas`。
- `GithubImportDialog`（`github-import-dialog.tsx`）：`parseGithubRepository` 负责 HTTPS GitHub owner/repo
  边界校验；focused GitHub client 为正式 Preview/immutable Import 入口，后续由flow消费原Publish/Install；旧optional注入已删除，不把Preview或draft响应伪装成已安装。
- 下载反馈独立于详情/reader：已校验且不可重试的下载拒绝或隐藏缺失仅提示当前未开放下载；网络/协议失败提示下载未完成，不清正文、不冒整个详情失效，不按message文本判断原因。
- `manus-skill-client`：GetSkill 只读严格 `{skill}` metadata，详情 flight/cache 不缓存下载句柄；DownloadSkill 使用独立 required-downloadInfo schema。普通下载入口要求本代详情精确匹配已选 revision，点击后独立准入并复核返回 version；生命周期退休后不导航，不把卡片或旧详情缓存当下载授权。
- 安装池详情显式选择 installation metadata/package/download；目录 current 和分享保持独立。`@/hub/skill-installation-content` 校验精确 source/revision/目录并在退休时取消，不回退到当前系列。
- `ManusSkillDetailDialog`（`manus-skill-detail-dialog.tsx`）：唯一的详情与文件阅读面；只在 owner
  返回 `skill_id` 与 `revision_skill_id` 时读取真实 package tree 和正文。缺少 binding 的旧投影保持详情入口禁用，
  不再由浏览器合成 YAML、文件树或示例正文。目录／安装 metadata 读取失败在概览和 reader 都显示显式重试，
  reader 不维持假加载；重试只重读原 locator，保当前文件／滚动意图，不重放安装、分享或发布命令。
- `@/lib/query` 与 `skills-resource-cache`：安装池使用 client-scoped `skillResourceKey(SKILLS_KEY, client)`；目录使用同样隔离的 `SKILLS_CATALOG_KEY`。正式 adapter 的 `skillQuota` 返回明确缺省，不请求旧 quota API；不存在可由旧 name-based cache 冒充的正式系列历史。

## 陷阱
- 安装池包含 `installed=true` 的停用项；`installed`、`enabled` 与 `source_status` 是独立事实。读取和预览不自动启用，不从目录 current 推导安装 pin。
- required 官方技能拒关：hub 409 `hub.skill_required` → 经 `isRequiredLockError` 反射为锁定态。
- 正式导入／发布的未知结果保原 key、请求与主体，通过原状态机显式恢复；中间 draft、扫描或上传回执不等于已安装。成功后只失活真实读取，不合成卡片或成功状态。
- GitHub 是 `Preview→select/ready→Import draft→Publish owner/CAS→Install`；关闭取消等待并保原命令意图，只有真实Install ACK
  结果成功后再失活 `hub/skills`。Hub 的稳定错误码会映射到可操作的本地化提示，重复提交在同一帧内被拦截。
- 技能目录的 cursor pagination 在同一滚动 Dialog 内有界合并，并对重复 cursor 停止，避免用户看到空的
  第二个分页层或因异常 cursor 进入无限请求。

## 桌面几何与只读客户端边界

- Settings 嵌入页对齐 Manus 桌面内容轴：搜索 `200×32px`、范围行 y=`185`、卡片从 y=`233` 开始；卡片为
  `371.5×135px`，描述 `12px/16px`，开关 `22×14px`。
- “浏览技能”目录是独立 `800×680px` 的 scroll surface，卡片为 `370×135px` 两列；官方/第三方切换只改变
  catalog scope 查询，不改变 workspace 身份边界。
- GitHub Preview和Import draft均不触发`onImported`；仅真实Publish/Install完成刷新权威技能读取。上传预检返回的诊断错误会保留在候选项中，候选的 checkbox
  使用稳定的编码 ID 关联描述和错误。
- GitHub 导入关闭/卸载会 abort 当前请求；导入或上传成功同时失活 `hub/skills` 与 catalog 查询键，避免
  重新打开目录时残留过期的安装状态。短桌面视口由 Dialog 内部滚动承接内容，footer 不依赖页面高度。

- Skill Share: `src/hub/skill-share.schema.ts` / `skill-share-client.ts` 严格消费正式六字段链接与精确 revision 摘要；`src/app/skills/shared/[id]/page.tsx` 复用真实摘要/包 reader，安装独立读取和 ACK。未知 Create 不自动重建；复制失败复用原 ACK。共享页消费既有 browser-private exact 下载句柄，严格绑定 source_ref/revision，流式下载原包，不借 series current 下载。
## 示例试用

详情只允许同版本、已安装启用的示例进入正式 handoff；内部 installed_source_ref 保存原安装 pin，不能由系列 added 或 current source 推导。外部目录和 Settings 都保留真实 action card 身份，失败不关闭详情或回落纯文本；preview 单独保持文字预填。实际执行仍由 owner 判定。

- 目录重核：外层保同 actor 的搜索/筛选/精确详情 locator；`use-catalog-skill-installation` 拥有本代安装动作与冻结未知命令。详情/包文件展示仍按代际退休，`SkillPackageFiles` 仅渲染 owner 文件树。分享未知墓碑与当代 ACK 分离，导入只读/已确认结果重核退役，未知恢复意图保留。
- 外层目录在搜索／重核期间打开的 pending 详情，目录读取失败后可在当前弹窗内显式重试；沿当前筛选重读并保留原精确 locator，不要求关闭弹窗，也不重放安装／发布命令。未准入期间不提供重试。

## 2026-10-16 Settings Explore 展示与地址恢复

SettingsModal 拥有 Skills 的 installed scope / explore 展示意图，settings-location 读取同一 canonical hash；AppFrame 原 writer 负责 replace，不另加 history entry。My Skills 入口仍为 personal，手动范围选择同步地址，Explore 刷新恢复；箭头和导航再选技能明确返回 root / All。Panel 不再持独立 catalog 布尔值，Pool 在 Settings 下使用受控 scope，普通独立池仍自持；不以 key 重挂整个 Settings 或未决业务 holder。hash 不保存身份、安装或权限事实。

探索页 desktop 标题带 81px；紧凑设置隐藏面板标题，通过现 More → 技能返回。目录工具栏以 ResizeObserver 测量实际容器与九个本地化标签的宽度（字体 ready、语言变化同样重测）：放得下时搜索独占一行、分类行上下各 16px；否则搜索 + 分类菜单同一行，底距 16px。布局切换保留分类/键盘焦点，隐藏测量行 inert，不产生第二组可操作控件。

列表为 60×80 封面、16px 图文间距、14/20 标题、两行 13/18 说明、真实更新时间、28px 操作；分隔线仅从文字轴开始，hover 伸出内容轴 16px。空图不伪造封面或作者，已安装与可添加仍来自真实 owner。既有 rail suite 仅加两项独有风险回归（hash/返回/受控 scope 和分类宽度/焦点），不恢复已退役 UI suites；真实浏览器与最终门禁边界见 CURRENT。

## 2026-10-21 本人系列历史

PersonalSkillManagement保留原发布者准入和写意图，仅按操作分开history只读门；PersonalSkillHistoryDialog拥有历史快照/分页/精确版本选择，内部HistoryPackage复用SkillPackageFiles/SkillPackageDocument。schema在hub/personal-skill-history.schema，listHistory复用SkillPublishClient读取边界，managed包沿skill-installation-content既有预算与精确pin检查；无目录current/安装替换、全局缓存或隐式恢复。PersonalSkillRestoreDialog仅承接明确确认的原包新版本发布，原ZIP由hub/personal-skill-archive有界读取；复用发布session及CAS。恢复组件放在历史DialogContent之外，关闭/同主体重核不卸载原session；同一时刻只展示历史或确认弹窗。永久删除仍未交付，不显示假成功动作。
