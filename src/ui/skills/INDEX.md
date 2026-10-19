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

## W3 第二阶段 B 当前边界
正式 `/app/skills` 与 Settings Skills 共用 `personal-skills-read.tsx` 的单 ZIP 发布入口；`personal-skill-publish-dialog.tsx` 管本地输入/阶段和关闭重开同意图，`personal-skill-publish-flow.ts` 管 CreateDraft→Get→Begin→PUT→Complete→Validate→Publish 的同键恢复。Draft raw body ≤65,536 字节、Begin filename 先本地预检，输入错误可编辑重选，不先创建 Draft。Complete pending/unknown 只显示 partial，复核当前 attempt 后可继续，旧 attempt 明确重新开始；首轮未知 Publish 只核 by-ID，后续显式复核仍 404 才原 key/零 body 重发。只有 ACTIVE Publish 回执或本人 by-ID 核回显示发布，401/403 原码失败且不重发。网络/签名 PUT 和严格 wire 在 `src/hub/skill-publish-client.ts`。旧 `SkillUploadDialog`/GitHub import/preview-confirm 仍仅显式 preview fixture；下文旧说明只适用于 preview，不是正式 API。六项 BFF 写候选 default-off，真浏览器 owner 验收另门。

## W3 第二阶段 A 当前边界
正式 `/app/skills` 与 Settings Skills 经 `personal-skills-read.tsx` 只读 BFF 本人 `scope_kind=personal` 页、opaque cursor、source_ref/revision，并以 ACTIVE by-ID 七字段打开详情。旧 `skills-panel.tsx` 池/目录/启停、`SkillUploadDialog` preview/confirm 仅显式 preview fixture 可见；上传正式切换待下一片，旧 done 不是发布事实。以下旧职责、组件和陷阱均只描述 preview fixture，不是当前正式读协议。

## 职责
hub self 面技能池（有效可用项）：列表/启停/配额/版本历史 + 上传 preview→confirm 两段发布。
桌面 Settings 的 GitHub 导入使用独立、紧凑的单提交 Dialog：输入合法仓库后直接 import，失败可修复，
成功后刷新技能池；不会把 GitHub 地址误送入 zip 上传流程。

## 公开件
- `SkillsPanel`（`skills-panel.tsx`）：props `client: HubClient` / `readBoundary: ProjectReadBoundary` / `onClose` / `pinned` / `onTogglePin`；子 Dialog 只消费页面或 App shell 已确认的 boundary，不各自注册 Session probe。
- `SkillUploadDialog`（`skill-upload-dialog.tsx`）：桌面独立上传入口，`.zip`/`.skill` dropzone + preview/candidate
  selection/confirm 状态；通过 `returnFocusRef` 回到 Create/Browse 触发点，关闭/卸载会取消当前 multipart 请求。

## 协作者
- `@/hub/client`（纯请求）、`@/hub/rules`（`isRequiredLockError` / `isQuotaExhausted`）、`@/hub/schemas`。
- `GithubImportDialog`（`github-import-dialog.tsx`）：`parseGithubRepository` 负责 HTTPS GitHub owner/repo
  边界校验；focused GitHub client 为正式 Preview/immutable Import 入口，后续由flow消费原Publish/Install；旧optional注入已删除，不把Preview或draft响应伪装成已安装。
- 下载反馈独立于详情/reader：已校验且不可重试的下载拒绝或隐藏缺失仅提示当前未开放下载；网络/协议失败提示下载未完成，不清正文、不冒整个详情失效，不按message文本判断原因。
- 安装池详情显式选择 installation metadata/package/download；目录 current 和分享保持独立。`@/hub/skill-installation-content` 校验精确 source/revision/目录并在退休时取消，不回退到当前系列。
- `ManusSkillDetailDialog`（`manus-skill-detail-dialog.tsx`）：唯一的详情与文件阅读面；只在 owner
  返回 `skill_id` 与 `revision_skill_id` 时读取真实 package tree 和正文。缺少 binding 的旧投影保持详情入口禁用，
  不再由浏览器合成 YAML、文件树或示例正文。
- `@/lib/query`：池+配额合并读走 `useResource("hub/skills")`；启停/发布成功后 `invalidate("hub/skills")`。版本历史键 `hub/skill-revisions/<name>`。

## 陷阱
- 池只含「有效可用」项（official 上架∧未关 + 自有包）；池内项恒为已启用，唯一动作是停用。
- required 官方技能拒关：hub 409 `hub.skill_required` → 经 `isRequiredLockError` 反射为锁定态。
- 上传是非缓存状态机（idle→preview→confirming→done），不走 query 层。
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

## 2026-10-16 Settings Explore 展示与地址恢复

SettingsModal 拥有 Skills 的 installed scope / explore 展示意图，settings-location 读取同一 canonical hash；AppFrame 原 writer 负责 replace，不另加 history entry。My Skills 入口仍为 personal，手动范围选择同步地址，Explore 刷新恢复；箭头和导航再选技能明确返回 root / All。Panel 不再持独立 catalog 布尔值，Pool 在 Settings 下使用受控 scope，普通独立池仍自持；不以 key 重挂整个 Settings 或未决业务 holder。hash 不保存身份、安装或权限事实。

探索页 desktop 标题带 81px；紧凑设置隐藏面板标题，通过现 More → 技能返回。目录工具栏以 ResizeObserver 测量实际容器与九个本地化标签的宽度（字体 ready、语言变化同样重测）：放得下时搜索独占一行、分类行上下各 16px；否则搜索 + 分类菜单同一行，底距 16px。布局切换保留分类/键盘焦点，隐藏测量行 inert，不产生第二组可操作控件。

列表为 60×80 封面、16px 图文间距、14/20 标题、两行 13/18 说明、真实更新时间、28px 操作；分隔线仅从文字轴开始，hover 伸出内容轴 16px。空图不伪造封面或作者，已安装与可添加仍来自真实 owner。既有 rail suite 仅加两项独有风险回归（hash/返回/受控 scope 和分类宽度/焦点），不恢复已退役 UI suites；真实浏览器与最终门禁边界见 CURRENT。
