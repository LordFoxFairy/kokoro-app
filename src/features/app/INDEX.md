## 自动化创建入口（Public29候选）

`kokoro-app-surface.tsx`仅从现`useScheduledLocation`识别home automation workflow，选择现ScheduledTaskSurface及原导航/header条件。创建、RSS、运行记录、编辑生命周期全归scheduled-tasks feature，不新增chat发送或engine/Run/display逻辑。项目preview桥只承接旧normal的calendar-only显式保护，编辑器原初态/字段不提供RSS，不增加真实项目排程能力。

## Project Skill 精确内容消费者

`project-skill-detail-dialog.tsx` 仅捕获真实 Project 安装与原 pin，回焦 host 交给同一 Manus reader 的显式 Project 分支；列表／默认／更新／移除不换 owner。

# App product surfaces

- `kokoro-project-workspace.tsx` keeps the Project host and its existing context state mounted across root and Task views. The root keeps its measured grid/composer; Task uses an independent flex timeline and one shell composer.
- `project-context-composition.tsx` presents the same instruction, resource, recommendation and Skills sections; `project-context-dialogs.tsx` owns only their existing instruction/resource dialog assembly. Network clients and command lifetimes stay with the existing controllers.
- `project-workspace-dialogs.tsx` retains only the existing root website/scheduled preview dialogs. This context slice adds no website, scheduling or ACL capability.
- Canvas owns conversation artifacts separately. Project settings temporarily hide/inert its existing view, preserving its slot and unsaved component state; closing settings restores it without writing a Canvas close preference.

## Project pin consumer

`use-project-pins.ts`在AppFrame挂载层持actor/admission作用域的RAM个人pin集合，不随Project／会话route重置；每project串行，ACK/精确读和collection页按epoch合并。未知PUT保前次读事实，只显式exact GET核当前态，不自动重派或把GET当原receipt。不可见项从UI退休；无本地持久事实。`project-pins.ts`只走具名same-origin有界client及同canonical派生decoder。

## Project Skill source reads

`project-skill-source-picker.tsx` keeps pending reads sr-only with search-field `aria-busy`; failed personal/official reads use a short associated field hint, never an empty list or generic retry panel. Enter explicitly rereads the same failed query; busy/IME guards and the existing actor/generation token, cursor and abort ownership remain unchanged. Back/reopen retains the existing fresh picker lifetime.
