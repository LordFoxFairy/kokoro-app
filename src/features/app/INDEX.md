# App product surfaces

- `kokoro-project-workspace.tsx` keeps the Project host and its existing context state mounted across root and Task views. The root keeps its measured grid/composer; Task uses an independent flex timeline and one shell composer.
- `project-context-composition.tsx` presents the same instruction, resource, recommendation and Skills sections; `project-context-dialogs.tsx` owns only their existing instruction/resource dialog assembly. Network clients and command lifetimes stay with the existing controllers.
- `project-workspace-dialogs.tsx` retains only the existing root website/scheduled preview dialogs. This context slice adds no website, scheduling or ACL capability.
- Canvas owns conversation artifacts separately. Project settings temporarily hide/inert its existing view, preserving its slot and unsaved component state; closing settings restores it without writing a Canvas close preference.

## Project pin consumer

`use-project-pins.ts`在AppFrame挂载层持actor/admission作用域的RAM个人pin集合，不随Project／会话route重置；每project串行，ACK/精确读和collection页按epoch合并。未知PUT保前次读事实，只显式exact GET核当前态，不自动重派或把GET当原receipt。不可见项从UI退休；无本地持久事实。`project-pins.ts`只走具名same-origin有界client及同canonical派生decoder。
