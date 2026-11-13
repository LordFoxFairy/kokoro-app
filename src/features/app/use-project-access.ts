"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { readProjectAccess, ProjectAccessError, type ProjectAccess } from "./project-access-client"
/** Mounted Project read fact, never a permission cache or a second Session. */
export function useProjectAccess(
  projectId: string | undefined,
  boundary: ProjectReadBoundary | undefined,
  onUnavailable: (id: string) => void,
) {
  const [revision, setRevision] = useState(0)
  const context = useMemo(
    () => ({
      projectId,
      subject: boundary?.subject,
      tenant: boundary?.tenant,
      admitted: boundary?.admitted,
      generation: boundary?.generation,
      revision,
    }),
    [projectId, boundary?.subject, boundary?.tenant, boundary?.admitted, boundary?.generation, revision],
  )
  const [state, setState] = useState<{ context: object; access: ProjectAccess | null } | null>(null),
    live = useRef<object | null>(null),
    retire = useRef(onUnavailable)
  useEffect(() => {
    retire.current = onUnavailable
  }, [onUnavailable])
  useEffect(() => {
    live.current = context
    if (!projectId || !context.admitted || !context.subject) return
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 10000)
    void readProjectAccess(projectId, controller.signal)
      .then(
        (access) => {
          if (live.current === context && !controller.signal.aborted) setState({ context, access })
        },
        (error) => {
          if (live.current !== context || controller.signal.aborted) return
          setState({ context, access: null })
          if (error instanceof ProjectAccessError && [403, 404].includes(error.status ?? 0)) retire.current(projectId)
        },
      )
      .finally(() => clearTimeout(timer))
    return () => {
      if (live.current === context) live.current = null
      controller.abort()
      clearTimeout(timer)
    }
  }, [context, projectId])
  const access = state?.context === context ? state.access : null
  return {
    context,
    access,
    projectId,
    boundary,
    refresh: useCallback(() => setRevision((value) => value + 1), []),
    isCurrent: () => live.current === context,
  }
}
export type ProjectAccessModel = ReturnType<typeof useProjectAccess>
