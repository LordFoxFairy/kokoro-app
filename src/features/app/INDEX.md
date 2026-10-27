# App product surfaces

- `kokoro-project-workspace.tsx` keeps the Project host and its existing context state mounted across root and Task views. The root keeps its measured grid/composer; Task uses an independent flex timeline and one shell composer.
- `project-context-composition.tsx` presents the same instruction, resource, recommendation and Skills sections; `project-context-dialogs.tsx` owns only their existing instruction/resource dialog assembly. Network clients and command lifetimes stay with the existing controllers.
- `project-workspace-dialogs.tsx` retains only the existing root website/scheduled preview dialogs. This context slice adds no website, scheduling or ACL capability.
- Canvas owns conversation artifacts separately. Project settings temporarily hide/inert its existing view, preserving its slot and unsaved component state; closing settings restores it without writing a Canvas close preference.
