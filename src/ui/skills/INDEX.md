# ui/skills — 技能面板

## 职责
hub self 面技能池（有效可用项）：列表/启停/配额/版本历史 + 上传 preview→confirm 两段发布。
桌面 Settings 的 GitHub 导入使用独立、紧凑的单提交 Dialog：输入合法仓库后直接 import，失败可修复，
成功后刷新技能池；不会把 GitHub 地址误送入 zip 上传流程。

## 公开件
- `SkillsPanel`（`skills-panel.tsx`）：props `client: HubClient` / `onClose` / `pinned` / `onTogglePin`。
- `SkillUploadDialog`（`skill-upload-dialog.tsx`）：桌面独立上传入口，`.zip`/`.skill` dropzone + preview/candidate
  selection/confirm 状态；通过 `returnFocusRef` 回到 Create/Browse 触发点，关闭/卸载会取消当前 multipart 请求。

## 协作者
- `@/hub/client`（纯请求）、`@/hub/rules`（`isRequiredLockError` / `isQuotaExhausted`）、`@/hub/schemas`。
- `GithubImportDialog`（`github-import-dialog.tsx`）：`parseGithubRepository` 负责 HTTPS GitHub owner/repo
  边界校验；`HubClient.importGithub` 为生产提交入口，只有 `previewGithub` 的注入客户端会明确显示
  preview-only，不把读取结果伪装成已保存；两者都缺失时显示能力不可用。
- `SkillDetailDialog`（`skill-detail-dialog.tsx`）：技能名称打开独立详情 surface，展示文件树、YAML 复制和
  试用入口；它不伪造后端文件读取，待 Hub 提供完整内容 projection 后再替换详情内容源。
- `@/lib/query`：池+配额合并读走 `useResource("hub/skills")`；启停/发布成功后 `invalidate("hub/skills")`。版本历史键 `hub/skill-revisions/<name>`。

## 陷阱
- 池只含「有效可用」项（official 上架∧未关 + 自有包）；池内项恒为已启用，唯一动作是停用。
- required 官方技能拒关：hub 409 `hub.skill_required` → 经 `isRequiredLockError` 反射为锁定态。
- 上传是非缓存状态机（idle→preview→confirming→done），不走 query 层。
- GitHub 是 `input→importing→done|preview|unavailable`；关闭会使迟到响应失效，只有 `importGithub`
  结果成功后再失活 `hub/skills`。Hub 的稳定错误码会映射到可操作的本地化提示，重复提交在同一帧内被拦截。
- 技能目录的 cursor pagination 在同一滚动 Dialog 内有界合并，并对重复 cursor 停止，避免用户看到空的
  第二个分页层或因异常 cursor 进入无限请求。

## 桌面几何与只读客户端边界

- Settings 嵌入页对齐 Manus 桌面内容轴：搜索 `200×32px`、范围行 y=`185`、卡片从 y=`233` 开始；卡片为
  `371.5×135px`，描述 `12px/16px`，开关 `22×14px`。
- “浏览技能”目录是独立 `800×680px` 的 scroll surface，卡片为 `370×135px` 两列；官方/第三方切换只改变
  catalog scope 查询，不改变 workspace 身份边界。
- `HubClient` 仅有 `previewGithub` 时，GitHub 对话框进入明确的 preview-only 完成态，不触发 `onImported`；
  只有 `importGithub` 成功才刷新技能池。上传预检返回的诊断错误会保留在候选项中，候选的 checkbox
  使用稳定的编码 ID 关联描述和错误。
- GitHub 导入关闭/卸载会 abort 当前请求；导入或上传成功同时失活 `hub/skills` 与 catalog 查询键，避免
  重新打开目录时残留过期的安装状态。短桌面视口由 Dialog 内部滚动承接内容，footer 不依赖页面高度。
