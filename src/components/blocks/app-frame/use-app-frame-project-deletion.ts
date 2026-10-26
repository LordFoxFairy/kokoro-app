"use client"

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { Project } from "@/contract/project"
import { projectDeletionIdSchema } from "@/contract/project-deletion"
import { deleteProject, getProjectDeletion, ProjectDeletionError } from "@/features/app/project-deletion"
import type { ProjectReadState } from "@/features/app/use-project-list"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import type { ProjectDeletionControl } from "@/components/blocks/workspace-header/workspace-header.types"

type Options = {
  projectRef: string | undefined
  projectWorkspace: boolean
  preview: boolean
  mounted: boolean
  boundary: ProjectReadBoundary | undefined
  routeKey: string
  current: ProjectReadState<Project>
  onAccepted: (projectId: string) => void
}
type View = Pick<ProjectDeletionControl, "open" | "name" | "status" | "problem" | "snapshot">
type Scope = {
  context: object; route: string; active: boolean; busy: boolean; accepted: boolean; revoked: boolean
  target: string | null; key: string | null; controller: AbortController | null; view: View
}
const initialView: View = { open: false, name: "", status: "idle", problem: null, snapshot: null }
function route() { return typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}${window.location.hash}` }

/** One mounted route's command intent. Read revisions never identify commands. */
export function useAppFrameProjectDeletion({ projectRef, projectWorkspace, preview, mounted, boundary, routeKey, current, onAccepted }: Options): ProjectDeletionControl {
  const [navigationEpoch, setNavigationEpoch] = useState(0)
  const context = useMemo(() => ({ projectRef, projectWorkspace, preview, mounted, subject: boundary?.subject,
    generation: boundary?.generation, admitted: boundary?.admitted, routeKey, navigationEpoch }),
  [projectRef, projectWorkspace, preview, mounted, boundary?.subject, boundary?.generation, boundary?.admitted, routeKey, navigationEpoch])
  const scopeRef = useRef<Scope | null>(null)
  const acceptedRef = useRef(onAccepted)
  useLayoutEffect(() => { acceptedRef.current = onAccepted }, [onAccepted])
  const [projection, setProjection] = useState<{ scope: Scope; view: View } | null>(null)
  useLayoutEffect(() => {
    const scope: Scope = { context, route: route(), active: true, busy: false, accepted: false, revoked: false,
      target: null, key: null, controller: null, view: initialView }
    scopeRef.current = scope
    const retire = () => {
      if (route() === scope.route) return
      scope.active = false
      scope.controller?.abort()
      setNavigationEpoch(value => value + 1)
    }
    window.addEventListener("popstate", retire)
    window.addEventListener("kokoro:surface-navigation", retire)
    return () => {
      window.removeEventListener("popstate", retire)
      window.removeEventListener("kokoro:surface-navigation", retire)
      scope.active = false
      scope.controller?.abort()
      scope.key = null
    }
  }, [context])
  const alive = useCallback((scope: Scope) => scope.active && scopeRef.current === scope && scope.context === context && scope.route === route(), [context])
  const publish = useCallback((scope: Scope, change: Partial<View>) => {
    if (!alive(scope)) return
    scope.view = { ...scope.view, ...change }
    setProjection({ scope, view: scope.view })
  }, [alive])
  const view = projection?.scope.context === context ? projection.view : initialView
  const available = mounted && projectWorkspace && !preview && boundary?.admitted === true
    && typeof boundary.subject === "string" && boundary.subject.trim().length > 0
    && Number.isSafeInteger(boundary.generation) && boundary.generation >= 0
    && current.status === "ready" && current.data.id === projectRef && projectDeletionIdSchema.safeParse(projectRef).success
    && view.problem !== "permission" && view.snapshot === null

  const run = useCallback(async (readOnly: boolean) => {
    const scope = scopeRef.current
    if (!scope || !alive(scope) || scope.busy || scope.revoked || !scope.target || !scope.key) return
    if (!scope.accepted && readOnly) return
    const target = scope.target
    const key = scope.key
    scope.busy = true
    const controller = new AbortController()
    scope.controller = controller
    const valid = () => alive(scope) && !controller.signal.aborted
    publish(scope, { status: readOnly ? "reading" : "pending", problem: null })
    try {
      if (!readOnly && !scope.accepted) {
        const receipt = await deleteProject(Object.freeze({ projectId: target, idempotencyKey: key }), controller.signal)
        if (!valid()) return
        // Both read and write authority change before any React commit or GET.
        scope.accepted = true
        publish(scope, { status: "accepted", snapshot: receipt, problem: null })
        acceptedRef.current(target)
      }
      if (!valid()) return
      publish(scope, { status: "reading" })
      const snapshot = await getProjectDeletion(target, controller.signal)
      if (!valid()) return
      publish(scope, { status: "status", snapshot, problem: null })
    } catch (error) {
      if (!valid()) return
      const permission = error instanceof ProjectDeletionError && (error.status === 401 || error.status === 403)
      if (permission) scope.revoked = true
      const conflict = error instanceof ProjectDeletionError && error.code === "idempotency_conflict"
      const uncertain = !(error instanceof ProjectDeletionError) || error.status === undefined || error.status >= 500 || error.status === 429
        || error.code === "idempotency_in_progress" || error.code === "ack_shape_mismatch"
      publish(scope, { status: scope.accepted ? "read-error" : uncertain ? "unknown" : "error",
        problem: permission ? "permission" : scope.accepted ? "read" : conflict ? "conflict"
          : error instanceof ProjectDeletionError && error.status === 429 ? "rate-limited"
            : error instanceof ProjectDeletionError && error.code === "idempotency_in_progress" ? "in-progress"
              : error instanceof ProjectDeletionError && error.status !== undefined && error.status >= 500 ? "unavailable"
                : uncertain ? "unknown" : "rejected" })
    } finally {
      controller.abort()
      if (scope.controller === controller) scope.controller = null
      scope.busy = false
    }
  }, [alive, publish])

  const canWriteProject = useCallback(() => {
    const scope = scopeRef.current
    return scope !== null && alive(scope) && !scope.accepted && !scope.revoked
  }, [alive])
  return {
    available, ...view, focusScopeToken: context,
    canWriteProject,
    onOpen: () => {
      const scope = scopeRef.current
      if (!scope || !alive(scope) || (!available && scope.key === null)) return
      publish(scope, { open: true, name: scope.key === null && current.status === "ready" ? current.data.name : scope.view.name })
    },
    onClose: () => {
      const scope = scopeRef.current
      if (scope && alive(scope)) publish(scope, { open: false })
    },
    onConfirm: () => {
      const scope = scopeRef.current
      if (!scope || !alive(scope) || !available || !scope.view.open || scope.busy || scope.key !== null || !projectRef) return
      scope.target = projectRef
      scope.key = crypto.randomUUID()
      void run(false)
    },
    onRetry: () => {
      const scope = scopeRef.current
      if (!scope || !alive(scope) || scope.view.problem === "conflict") return
      void run(scope.accepted)
    },
    onRead: () => { void run(true) },
  }
}
