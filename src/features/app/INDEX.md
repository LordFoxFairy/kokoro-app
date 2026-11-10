## 当前消息的资源客户端（A‑08）

Composer 复用现 Library CLEAN 文件/FINAL artifact 和 Project resources 列表/上传，不建立第二 API 或文件缓存。`uploadProjectResource` 增加可选 AbortSignal，既有 Project 页面调用保持原义，Composer 退休上传时可终止网络并忽略迟到成功；未知结果仍保原 File/key 供显式重试。

## 个人文件删除（A‑09）

`kokoro-library-files.tsx` 在原个人文件列表中确认删除，`kokoro-library-file-client.ts` 只发送同源空命令。未确认时保持文件和原键；精确回执后才退休该行和其过期分页投影。身份/准入或标签页退休中止当前请求，不保留本地删除事实。

同一文件页保留 `file_q` / `file_type` URL，文字在校验原始 Unicode code points 后防抖派发；筛选、页窗与游标同代退休。列表只展示 owner 筛选结果，不再按已加载的页面猜命中。筛选遮住未知删除目标时仍可从同页恢复原删除命令；Composer 的无筛选列表调用不变。

## 作品来源回跳（A‑09）

列表不猜来源作用域：卡片快捷入口读取同源二元详情，并核同 Conversation / Artifact / Asset / source Run / digest；详情弹窗复用已读值。显式 `project_ref: null` 才回直聊，canonical Project ID 进入原 Project 的会话，省略表示来源不可用且仍可读取详情和下载。AppFrame 与侧栏复用同一个 scope-aware 导航和移动围栏，身份或路由退休取消迟到回跳。

## Project Overview 待办

`project-todo-section.tsx` 只呈现当前准入 Project 的 owner 列表与手动 CRUD，不消费 Run Todo 或排程。写入前按当前 subject / Project 在标签页 sessionStorage 冻结原命令；未知只能显式重试，412 读回后须显式采用当前版本。切 Project 或准入代际会退役异步结果；正式 wire 与 ACK 校验归 BFF 生成消费者；`project-todo-client.ts` 只在本地 view model 与生成 wire 之间映射，经唯一 Hub adapter，不增加 SDK／HTTP 运行时副本。

## Project Skill 精确内容消费者

`project-skill-detail-dialog.tsx` 仅捕获真实 Project 安装与原 pin，回焦 host 交给同一 Manus reader 的显式 Project 分支；列表／默认／更新／移除不换 owner。

# App product surfaces

- `kokoro-project-workspace.tsx` keeps the Project host and its existing context state mounted across root and Task views. The root keeps its measured grid/composer; Task uses an independent flex timeline and one shell composer.
- `project-context-composition.tsx` presents the same instruction, resource, recommendation and Skills sections; `project-context-dialogs.tsx` owns only their existing instruction/resource dialog assembly. Instruction history preserves owner order, selects the owner-marked current revision on open, and never derives the current label from position. Network clients and command lifetimes stay with the existing controllers.
- `project-workspace-dialogs.tsx` retains only the existing root website/scheduled preview dialogs. This context slice adds no website, scheduling or ACL capability.
- Canvas owns conversation artifacts separately. Project settings temporarily hide/inert its existing view, preserving its slot and unsaved component state; closing settings restores it without writing a Canvas close preference.

## Project pin consumer

`use-project-pins.ts`在AppFrame挂载层持actor/admission作用域的RAM个人pin集合，不随Project／会话route重置；每project串行，ACK/精确读和collection页按epoch合并。未知PUT保前次读事实，只显式exact GET核当前态，不自动重派或把GET当原receipt。不可见项从UI退休；无本地持久事实。`project-pins.ts`只走具名same-origin有界client及同canonical派生decoder。

## Project Skill source reads

`project-skill-source-picker.tsx` keeps pending reads sr-only with search-field `aria-busy`; failed personal/official reads use a short associated field hint, never an empty list or generic retry panel. Enter explicitly rereads the same failed query; busy/IME guards and the existing actor/generation token, cursor and abort ownership remain unchanged. Back/reopen retains the existing fresh picker lifetime.
