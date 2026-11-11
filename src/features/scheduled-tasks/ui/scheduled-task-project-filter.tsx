"use client"

import { useEffect, useMemo, useState } from "react"

import type { Project } from "@/contract/project"
import { listProjects } from "@/features/app/project-list"
import { useT } from "@/i18n/context"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

import styles from "./scheduled-task-surface.module.css"

export function ScheduledTaskProjectFilter({ projectId, invalid, boundary, onChange }: {
  projectId?: string; invalid: boolean; boundary?: ProjectReadBoundary; onChange: (id: string | null) => void
}) {
  const t = useT()
  const [opened, setOpened] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const scope = useMemo(() => ({ subject: boundary?.subject, generation: boundary?.generation,
    admitted: boundary?.admitted ?? true, opened, attempt }), [boundary?.subject, boundary?.generation, boundary?.admitted, opened, attempt])
  const [result, setResult] = useState<{ scope: typeof scope; projects: Project[]; error: boolean } | null>(null)
  useEffect(() => {
    if (!scope.opened || !scope.admitted) return
    const controller = new AbortController()
    void listProjects(controller.signal).then(projects => {
      if (!controller.signal.aborted) setResult({ scope, projects, error: false })
    }, () => { if (!controller.signal.aborted) setResult({ scope, projects: [], error: true }) })
    return () => controller.abort()
  }, [scope])
  const current = result?.scope === scope ? result : null
  return <div className={styles.projectFilter}>
    <label>
      <span>{t("scheduled.projectFilter")}</span>
      <select value={invalid ? "__invalid__" : projectId ?? ""} disabled={!scope.admitted}
        onFocus={() => setOpened(true)} onChange={event => onChange(event.target.value || null)}>
        <option value="">{t("scheduled.allProjects")}</option>
        {invalid ? <option value="__invalid__" disabled>{t("scheduled.invalidFilter")}</option> : null}
        {projectId && !current?.projects.some(project => project.id === projectId) ? <option value={projectId}>{projectId}</option> : null}
        {current?.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
    </label>
    {opened && !current ? <span role="status">{t("scheduled.projectsLoading")}</span> : null}
    {current?.error ? <button type="button" onClick={() => setAttempt(value => value + 1)}>{t("scheduled.projectsRetry")}</button> : null}
  </div>
}
