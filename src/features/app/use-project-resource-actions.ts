import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  beginProjectResourceDownload,
  deleteProjectResource,
  getProjectResource,
  ProjectResourceAccessError,
  type ProjectResourceDeleteIntent,
  type ProjectResourceItem,
} from "./project-resource-access"
type DeleteState = "idle" | "confirm" | "pending" | "unknown" | "rejected" | "forbidden"
type View = {
  selected: string | null
  metadata: ProjectResourceItem | null
  loading: boolean
  error: boolean
  deleteState: DeleteState
  downloadState: "idle" | "pending" | "started" | "error"
}
const empty: View = { selected: null, metadata: null, loading: false, error: false, deleteState: "idle", downloadState: "idle" }
type Scope = {
  token: object
  active: boolean
  revoked: boolean
  route: string
  intents: Map<string, ProjectResourceDeleteIntent>
  states: Map<string, DeleteState>
  controllers: Set<AbortController>
}
export function useProjectResourceActions(projectRef: string | undefined, context: object, available: boolean, onDeleted: (assetId: string) => void) {
  const token = useMemo(() => ({ context, projectRef, available }), [context, projectRef, available])
  const scopeRef = useRef<Scope | null>(null)
  const [projection, setProjection] = useState<{ token: object; value: View } | null>(null)
  const value = projection?.token === token ? projection.value : empty
  const valueRef = useRef(value)
  useLayoutEffect(() => {
    valueRef.current = value
  }, [value])
  useLayoutEffect(() => {
    const scope: Scope = {
      token,
      active: true,
      revoked: false,
      route: `${location.pathname}${location.search}${location.hash}`,
      intents: new Map(),
      states: new Map(),
      controllers: new Set(),
    }
    scopeRef.current = scope
    const retire = () => {
      if (`${location.pathname}${location.search}${location.hash}` === scope.route) return
      scope.active = false
      for (const controller of scope.controllers) controller.abort()
      scope.intents.clear()
      scope.states.clear()
      setProjection(null)
    }
    window.addEventListener("popstate", retire)
    window.addEventListener("kokoro:surface-navigation", retire)
    return () => {
      scope.active = false
      for (const controller of scope.controllers) controller.abort()
      scope.intents.clear()
      scope.states.clear()
      window.removeEventListener("popstate", retire)
      window.removeEventListener("kokoro:surface-navigation", retire)
    }
  }, [token])
  const current = useCallback(
    (scope: Scope) =>
      available &&
      scope.active &&
      !scope.revoked &&
      scopeRef.current === scope &&
      scope.token === token &&
      scope.route === `${location.pathname}${location.search}${location.hash}`,
    [available, token],
  )
  const set = useCallback(
    (patch: Partial<View>) => setProjection((previous) => ({ token, value: { ...(previous?.token === token ? previous.value : empty), ...patch } })),
    [token],
  )
  const revoke = useCallback(
    (scope: Scope) => {
      if (!current(scope)) return
      scope.revoked = true
      for (const controller of scope.controllers) controller.abort()
      scope.controllers.clear()
      scope.intents.clear()
      scope.states.clear()
      set({ ...empty, selected: valueRef.current.selected, deleteState: "forbidden" })
    },
    [current, set],
  )
  const open = useCallback(
    (assetId: string) => {
      const scope = scopeRef.current
      if (!projectRef || !scope || !current(scope)) return
      for (const old of scope.controllers) old.abort()
      scope.controllers.clear()
      for (const [id, state] of scope.states) if (state === "pending") scope.states.set(id, "unknown")
      const controller = new AbortController()
      scope.controllers.add(controller)
      set({ ...empty, selected: assetId, loading: true, deleteState: scope.states.get(assetId) ?? "idle" })
      void getProjectResource(projectRef, assetId, controller.signal)
        .then(
          (metadata) => {
            if (current(scope) && !controller.signal.aborted) set({ metadata, loading: false })
          },
          (error: unknown) => {
            if (!current(scope) || controller.signal.aborted) return
            if (error instanceof ProjectResourceAccessError && error.verifiedOwner && (error.status === 401 || error.status === 403)) revoke(scope)
            else set({ error: true, loading: false })
          },
        )
        .finally(() => scope.controllers.delete(controller))
    },
    [current, projectRef, revoke, set],
  )
  const close = useCallback(() => {
    const scope = scopeRef.current
    if (!scope || !scope.active || scope.token !== token || scopeRef.current !== scope) return
    for (const controller of scope.controllers) controller.abort()
    scope.controllers.clear()
    scope.states.forEach((state, id) => {
      if (state === "confirm" && !scope.intents.has(id)) scope.states.delete(id)
    })
    for (const [id, state] of scope.states) if (state === "pending") scope.states.set(id, "unknown")
    set({ ...empty })
  }, [token, set])
  const askDelete = useCallback(() => {
    const scope = scopeRef.current,
      assetId = valueRef.current.selected
    if (!scope || !current(scope) || !assetId || !valueRef.current.metadata || scope.intents.has(assetId)) return
    scope.states.set(assetId, "confirm")
    set({ deleteState: "confirm" })
  }, [current, set])
  const confirmDelete = useCallback(() => {
    const scope = scopeRef.current,
      assetId = valueRef.current.selected
    if (!projectRef || !scope || !current(scope) || !assetId || scope.states.get(assetId) === "pending" || scope.states.get(assetId) === "forbidden") return
    let intent = scope.intents.get(assetId)
    if (!intent) {
      if (scope.states.get(assetId) !== "confirm" || !valueRef.current.metadata) return
      intent = Object.freeze({ projectRef, assetId, key: crypto.randomUUID(), body: null })
      scope.intents.set(assetId, intent)
    }
    scope.states.set(assetId, "pending")
    set({ deleteState: "pending" })
    const controller = new AbortController()
    scope.controllers.add(controller)
    void deleteProjectResource(intent, controller.signal)
      .then(
        () => {
          if (!current(scope) || controller.signal.aborted) return
          scope.intents.delete(assetId)
          scope.states.delete(assetId)
          onDeleted(assetId)
          set({ ...empty })
        },
        (error: unknown) => {
          if (!current(scope) || controller.signal.aborted) return
          let state: DeleteState = "unknown"
          if (error instanceof ProjectResourceAccessError && error.verifiedOwner) {
            if (error.status === 401 || error.status === 403) {
              revoke(scope)
              return
            }
            state = "rejected"
            scope.intents.delete(assetId)
          }
          scope.states.set(assetId, state)
          set({ deleteState: state })
        },
      )
      .finally(() => scope.controllers.delete(controller))
  }, [current, projectRef, onDeleted, revoke, set])
  const download = useCallback(() => {
    const scope = scopeRef.current,
      assetId = valueRef.current.selected
    if (!projectRef || !scope || !current(scope) || !assetId || valueRef.current.downloadState === "pending") return
    const controller = new AbortController()
    scope.controllers.add(controller)
    set({ downloadState: "pending" })
    void beginProjectResourceDownload(projectRef, assetId, controller.signal)
      .then(
        () => {
          if (current(scope) && !controller.signal.aborted) set({ downloadState: "started" })
        },
        (error: unknown) => {
          if (!current(scope) || controller.signal.aborted) return
          if (error instanceof ProjectResourceAccessError && error.verifiedOwner && (error.status === 401 || error.status === 403)) revoke(scope)
          else set({ downloadState: "error" })
        },
      )
      .finally(() => scope.controllers.delete(controller))
  }, [current, projectRef, revoke, set])
  return { ...value, open, close, askDelete, confirmDelete, download }
}
