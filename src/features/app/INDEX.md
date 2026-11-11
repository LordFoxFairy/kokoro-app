## 资料库与 Canvas 正式内容预览（A‑09/A‑10）

`kokoro-library-preview-content.ts` 复用现同源内容读取、一次 deadline、EOF／SHA／UTF‑8；
`kokoro-library-text-preview.tsx` 统一正式主体代际、关闭／迟到处理和只读渲染。个人卡与作品详情按需打开，
Canvas Delivery 核原会话、Asset、来源 Run 和元数据。正文不入持久缓存，不启旧工作区路径，
超界留原下载。产品验收见 Root TODO。

## 首页创建草稿（A‑11）

简报范围和网站类别使用现 Composer 的可见约束行，刷新从同一草稿识别；只替换精确可识别的本场景行，正文/附件留在原草稿边界。模板或灵感显式预填仍替换正文，但保留已选约束。超过现输入上限不截断。网站添加项目只调用原 Project 操作，设计与游戏仍使用普通 Chat。

## 当前消息的资源客户端（A‑08）

Composer 复用现 Library CLEAN 文件/FINAL artifact 和 Project resources 列表/上传，不建立第二 API 或文件缓存。`uploadProjectResource` 增加可选 AbortSignal，既有 Project 页面调用保持原义，Composer 退休上传时可终止网络并忽略迟到成功；未知结果仍保原 File/key 供显式重试。

## 个人上传取消（A‑09）

未提交的选择可直接清除，不发请求。请求开始后取消只中止当前浏览器等待，原文件和命令键仍用于显式恢复；旧请求或迟到回执不得刷新或接管新尝试。仍用原 CLEAN owner 回执与重新读取的个人列表确认，不宣称服务器撤销。

## 个人文件删除（A‑09）

`kokoro-library-files.tsx` 在原个人文件列表中确认删除，`kokoro-library-file-client.ts` 只发送同源空命令。未确认时保持文件和原键；精确回执后才退休该行和其过期分页投影。身份/准入或标签页退休中止当前请求，不保留本地删除事实。

同一文件页保留 `file_q` / `file_type` URL，文字在校验原始 Unicode code points 后防抖派发；筛选、页窗与游标同代退休。列表只展示 owner 筛选结果，不再按已加载的页面猜命中。筛选遮住未知删除目标时仍可从同页恢复原删除命令；Composer 的无筛选列表调用不变。

## 作品收藏与单件删除（A‑09）

现收藏星标只接受本人的 exact BFF 状态；页面 URL 的 `favorites=1` 对应 owner `favorites_only=true`，不把已加载页当收藏全集。作品删除只提交二元目标和原幂等键，未知保留同一操作供明确重试，只有精确回执才从当前投影退休目标；身份／路由变化丢弃迟到回执。不改变原 Project 归属、个人文件或 Agent 输入协议。

## 作品来源回跳（A‑09）

列表不猜来源作用域：卡片快捷入口读取同源二元详情，并核同 Conversation / Artifact / Asset / source Run / digest；详情弹窗复用已读值。显式 `project_ref: null` 才回直聊，canonical Project ID 进入原 Project 的会话，省略表示来源不可用且仍可读取详情和下载。AppFrame 与侧栏复用同一个 scope-aware 导航和移动围栏，身份或路由退休取消迟到回跳。

## Project Overview 待办

`project-todo-section.tsx` 只呈现当前准入 Project 的 owner 列表与手动 CRUD，不消费 Run Todo 或排程。写入前按当前 subject / Project 在标签页 sessionStorage 冻结原命令；未知只能显式重试，412 读回后须显式采用当前版本。切 Project 或准入代际会退役异步结果；正式 wire 与 ACK 校验归 BFF 生成消费者；`project-todo-client.ts` 只在本地 view model 与生成 wire 之间映射，经唯一 Hub adapter，不增加 SDK／HTTP 运行时副本。

## Project Skill 精确内容消费者

`project-skill-detail-dialog.tsx` 仅捕获真实 Project 安装与原 pin，回焦 host 交给同一 Manus reader 的显式 Project 分支；列表／默认／更新／移除不换 owner。

# App product surfaces

- `kokoro-agents-surface.tsx` reads the admitted user’s Telegram, LINE or Slack connection on opening and sends only explicitly chosen owner-versioned commands. Pending QR/links use the same owner URL; private confirmation codes live only in the open form and are cleared before dispatch. An expired ticket is removed, an unknown or stale command only rereads, and switching scope aborts the original attempt. LINE bot return consumes the fixed fragment locally, reads the exact setup, and requires explicit approval before opening the one-time official LINE authorization. Slack returns through a fixed browser callback redirect; the modal reads the owner again and only claims the local workspace link, not Slack app uninstallation. Callback/connected state always comes from the owner. Preview does not fabricate setup state.

- `kokoro-project-workspace.tsx` keeps the Project host and its existing context state mounted across root and Task views. The root keeps its measured grid/composer; Task uses an independent flex timeline and one shell composer.
- `project-context-composition.tsx` presents the same instruction, resource, recommendation and Skills sections; `project-context-dialogs.tsx` owns only their existing instruction/resource dialog assembly. Instruction history preserves owner order, selects the owner-marked current revision on open, and never derives the current label from position. Network clients and command lifetimes stay with the existing controllers.
- `project-workspace-dialogs.tsx` retains only the independent scheduled preview. `project-websites-dialog.tsx` opens for the current admitted Project when its website feature is enabled; search and unsaved changes remain local, and save/unlink use the existing Hub boundary and the BFF version. An uncertain or stale write is followed by a fresh owner read, never an automatic write. Neither UI nor BFF visits or publishes the linked website.
- Canvas owns conversation artifacts separately. Project settings temporarily hide/inert its existing view, preserving its slot and unsaved component state; closing settings restores it without writing a Canvas close preference.

## Project pin consumer

`use-project-pins.ts`在AppFrame挂载层持actor/admission作用域的RAM个人pin集合，不随Project／会话route重置；每project串行，ACK/精确读和collection页按epoch合并。未知PUT保前次读事实，只显式exact GET核当前态，不自动重派或把GET当原receipt。不可见项从UI退休；无本地持久事实。`project-pins.ts`只走具名same-origin有界client及同canonical派生decoder。

## Project Skill source reads

`project-skill-source-picker.tsx` keeps pending reads sr-only with search-field `aria-busy`; failed personal/official reads use a short associated field hint, never an empty list or generic retry panel. Enter explicitly rereads the same failed query; busy/IME guards and the existing actor/generation token, cursor and abort ownership remain unchanged. Back/reopen retains the existing fresh picker lifetime.
