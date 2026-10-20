"use client"

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createSkillInstallationClient } from "@/hub/client"
import { createProjectSkillSelectionClient } from "@/hub/project-skill-selection-client"
import { projectSkillIdSchema, type ProjectSkillSelection } from "@/hub/project-skills.schema"
import type { PersonalInstallation } from "@/hub/schemas"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

export type ProjectSkillCommand =
  | { kind: "install"; sourceRef: string }
  | { kind: "enabled"; id: string; enabled: boolean }
  | { kind: "remove"; id: string }
  | { kind: "update"; id: string; expectedSourceRef: string; sourceRef: string }
  | { kind: "selection"; ids: readonly string[] }
type Scope = {
  projectId: string | null
  subject: string | null
  generation: number
  admitted: boolean
  open: boolean
}
type Facts = {
  items: readonly PersonalInstallation[]
  selection: ProjectSkillSelection
  cursor: string | null
}
type Lease = { scope: Scope; controller: AbortController; facts: Facts | null; ready: boolean; read: number }
type ReadState = {
  scope: Scope
  status: "loading" | "ready" | "error"
  facts: Facts | null
  listStatus: "ready" | "loading" | "error"
}
type Intent = {
  command: ProjectSkillCommand
  key: string
  projectId: string
  phase: "unknown" | "writing" | "read"
  attempt: Scope | null
}

/** Actor/Project-owned memory only. Private facts expire each lease; uncertain intent does not. */
export function useProjectSkills(
  projectId: string | null,
  boundary: ProjectReadBoundary | undefined,
  open: boolean,
) {
  const subject = boundary?.subject ?? null,
    admitted = boundary?.admitted === true,
    generation = boundary?.generation ?? 0
  const scope = useMemo<Scope>(
    () => ({ projectId, subject, generation, admitted, open }),
    [projectId, subject, generation, admitted, open],
  )
  const clients = useMemo(
    () =>
      projectSkillIdSchema.safeParse(projectId).success && projectId !== null
        ? {
            installations: createSkillInstallationClient({ projectId }),
            defaults: createProjectSkillSelectionClient(projectId),
          }
        : null,
    [projectId],
  )
  const live = useRef<Lease | null>(null)
  const [read, setRead] = useState<ReadState | null>(null)
  const pending = useRef<Intent | null>(null)
  const boundProject = useRef<string | null>(null)
  const [intent, setIntent] = useState<Intent | null>(null)
  const writing = useRef<{ scope: Scope } | null>(null)
  const listAttempt = useRef<AbortController | null>(null)
  const query = useRef("")
  const owned = useCallback((lease: Lease) => live.current === lease && !lease.controller.signal.aborted, [])
  const publishIntent = (value: Intent | null) => {
    pending.current = value
    setIntent(value)
  }

  const refresh = useCallback(
    async (lease: Lease): Promise<boolean> => {
      if (!clients || !owned(lease)) return false
      listAttempt.current?.abort()
      const version = ++lease.read
      lease.ready = false
      lease.facts = null
      setRead({ scope: lease.scope, status: "loading", facts: null, listStatus: "ready" })
      try {
        const [page, selection] = await Promise.all([
          clients.installations.list(
            { installed: true, limit: 50, ...(query.current.trim() ? { query: query.current.trim() } : {}) },
            lease.controller.signal,
          ),
          clients.defaults.get(lease.controller.signal),
        ])
        if (!owned(lease) || lease.read !== version) return false
        const facts: Facts = { items: page.data, selection, cursor: page.meta?.next_cursor ?? null }
        lease.facts = facts
        lease.ready = true
        setRead({ scope: lease.scope, status: "ready", facts, listStatus: "ready" })
        return true
      } catch {
        if (owned(lease) && lease.read === version)
          setRead({ scope: lease.scope, status: "error", facts: null, listStatus: "ready" })
        return false
      }
    },
    [clients, owned],
  )

  useLayoutEffect(() => {
    // A temporary unresolved detail is not a new Project. An actual new canonical binding is.
    if (projectSkillIdSchema.safeParse(scope.projectId).success && scope.projectId !== null) {
      if (boundProject.current !== null && boundProject.current !== scope.projectId) {
        const retired = pending.current
        pending.current = null
        queueMicrotask(() => setIntent((value) => (value === retired ? null : value)))
      }
      boundProject.current = scope.projectId
    }
    const lease: Lease = { scope, controller: new AbortController(), facts: null, ready: false, read: 0 }
    live.current = lease
    if (scope.open && scope.admitted && scope.subject !== null && clients !== null) {
      const acknowledged = pending.current?.phase === "read" ? pending.current : null
      void Promise.resolve()
        .then(() => refresh(lease))
        .then((ready) => {
          if (ready && acknowledged && pending.current === acknowledged && owned(lease)) {
            pending.current = null
            setIntent(null)
          }
        })
    }
    return () => {
      if (live.current === lease) live.current = null
      lease.controller.abort()
    }
  }, [scope, clients, refresh, owned])

  const active = () => {
    const lease = live.current
    return lease?.scope === scope &&
      owned(lease) &&
      scope.open &&
      scope.admitted &&
      scope.subject !== null &&
      clients
      ? lease
      : null
  }
  async function run(command: Intent): Promise<boolean> {
    const lease = active()
    if (!lease || !clients || command.projectId !== scope.projectId || pending.current !== command)
      return false
    if (writing.current?.scope === scope) return false
    const attempt = { scope }
    writing.current = attempt
    let current = command
    try {
      if (command.phase !== "read") {
        current = { ...command, phase: "writing", attempt: scope }
        publishIntent(current)
        const body = current.command,
          signal = lease.controller.signal
        if (body.kind === "install") await clients.installations.install(body.sourceRef, current.key, signal)
        else if (body.kind === "enabled")
          await clients.installations.setEnabled(body.id, body.enabled, current.key, signal)
        else if (body.kind === "remove") await clients.installations.remove(body.id, current.key, signal)
        else if (body.kind === "update")
          await clients.installations.update(
            body.id,
            { expected_source_ref: body.expectedSourceRef, source_ref: body.sourceRef },
            current.key,
            signal,
          )
        else await clients.defaults.replace(body.ids, current.key, signal)
        if (!owned(lease) || pending.current !== current) return false
        current = { ...current, phase: "read", attempt: scope }
        publishIntent(current)
      }
      // An acknowledged command never writes again, including after another generation/close.
      if (await refresh(lease)) {
        if (owned(lease) && pending.current === current) {
          publishIntent(null)
          return true
        }
      }
      return false
    } catch {
      if (owned(lease) && pending.current === current)
        publishIntent({ ...current, phase: "unknown", attempt: null })
      return false
    } finally {
      if (writing.current === attempt) writing.current = null
    }
  }
  function execute(command: ProjectSkillCommand): Promise<boolean> {
    const lease = active()
    if (!lease?.ready || pending.current || scope.projectId === null) return Promise.resolve(false)
    // A stale UI callback must use the current installation facts. This only
    // gates a new enable intent, never disabling or replaying an unknown write.
    if (command.kind === "enabled" && command.enabled &&
      lease.facts?.items.find(item => item.installation_id === command.id)?.source_status !== "active")
      return Promise.resolve(false)
    // Disabling/removing a default requires an explicit separate default selection first.
    if (
      (command.kind === "remove" || (command.kind === "enabled" && !command.enabled)) &&
      lease.facts?.selection.installation_ids.includes(command.id)
    )
      return Promise.resolve(false)
    const frozen: ProjectSkillCommand =
      command.kind === "selection" ? { ...command, ids: [...command.ids] } : { ...command }
    const next: Intent = {
      command: frozen,
      key: `project-skill:${crypto.randomUUID()}`,
      projectId: scope.projectId,
      phase: "unknown",
      attempt: null,
    }
    publishIntent(next)
    return run(next)
  }
  async function list(search: string, more: boolean) {
    const lease = active()
    if (!lease?.facts || !clients || pending.current) return
    const previous = lease.facts
    const cursor = more ? previous.cursor : null
    if (more && cursor === null) return
    listAttempt.current?.abort()
    const controller = new AbortController()
    listAttempt.current = controller
    query.current = search
    lease.ready = false
    setRead({ scope, status: "ready", facts: previous, listStatus: "loading" })
    try {
      const page = await clients.installations.list(
        {
          installed: true,
          limit: 50,
          ...(search.trim() ? { query: search.trim() } : {}),
          ...(cursor === null ? {} : { cursor }),
        },
        AbortSignal.any([lease.controller.signal, controller.signal]),
      )
      if (!owned(lease) || controller.signal.aborted || listAttempt.current !== controller) return
      const items = more
        ? [
            ...previous.items,
            ...page.data.filter(
              (item) => !previous.items.some((old) => old.installation_id === item.installation_id),
            ),
          ]
        : page.data
      const facts = { ...previous, items, cursor: page.meta?.next_cursor ?? null }
      lease.facts = facts
      lease.ready = true
      setRead({ scope, status: "ready", facts, listStatus: "ready" })
    } catch {
      if (owned(lease) && !controller.signal.aborted && listAttempt.current === controller)
        setRead({ scope, status: "ready", facts: previous, listStatus: "error" })
    }
  }
  const visible = read?.scope === scope ? read : null
  const allowed = Boolean(scope.open && scope.admitted && scope.subject !== null && clients)
  const visibleIntent = intent?.projectId === projectId ? intent : null
  return {
    allowed,
    facts: allowed ? (visible?.facts ?? null) : null,
    status: !allowed ? ("blocked" as const) : (visible?.status ?? ("loading" as const)),
    listStatus: visible?.listStatus ?? "ready",
    pending: visibleIntent,
    busy: Boolean(
      visibleIntent &&
      ((visibleIntent.phase === "writing" && visibleIntent.attempt === scope) ||
        (visibleIntent.phase === "read" && visible?.status === "loading")),
    ),
    acknowledged: visibleIntent?.phase === "read",
    execute,
    isCurrent: () => active() !== null,
    retry: () => {
      const command = pending.current
      if (command) void run(command)
    },
    reload: () => {
      const lease = active()
      if (lease) {
        const command = pending.current
        if (command?.phase === "read") void run(command)
        else void refresh(lease)
      }
    },
    // Explicit abandonment is not a rollback. UI confirms this and reads current facts before another intent.
    abandon: () => {
      const lease = active()
      if (lease && !(pending.current?.phase === "writing" && pending.current.attempt === scope)) {
        publishIntent(null)
        void refresh(lease)
      }
    },
    search: (value: string) => {
      void list(value, false)
    },
    loadMore: () => {
      void list(query.current, true)
    },
  }
}
