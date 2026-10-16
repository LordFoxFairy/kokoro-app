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

## V1 目录读取

正式主页与 Settings 共享 `createManusSkillHubClient`：目录经同源
`ListHubSkills` 读取，安装状态来自同一 BFF 的 `ListSkills`；不访问已经退役的
`GET /api/hub/self/skills/catalog`。公开 Developer API 的 `/v1/skill.list` 与这组
browser-private 展示操作分开治理，均由 BFF 聚合实际 owner 事实。主页与 Settings 使用
`hub/skills/catalog` 缓存命名空间，提交成功时按此前缀失活；目录没有 quota 投影，不请求旧 quota 路径。

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
