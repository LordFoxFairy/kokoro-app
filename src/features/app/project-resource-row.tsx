import { File, Globe2 } from "lucide-react"
import type { ProjectResourcePreview } from "./project-workspace-model"
import styles from "./project-resource-detail.module.css"
export function ProjectResourceRow({
  resource,
  disabled,
  onOpen,
}: {
  resource: ProjectResourcePreview
  disabled: boolean
  onOpen: (target: HTMLButtonElement) => void
}) {
  return (
    <div role="listitem" className={styles.row}>
      {resource.kind === "web" ? <Globe2 aria-hidden="true" /> : <File aria-hidden="true" />}
      <button type="button" disabled={disabled || resource.kind !== "file"} onClick={(event) => onOpen(event.currentTarget)} className={styles.open}>
        <strong>{resource.name}</strong>
        <small>{resource.detail}</small>
      </button>
    </div>
  )
}
