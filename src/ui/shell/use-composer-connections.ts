"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { SessionEngine } from "@/engine/machine"
import { SERVER_ENGINE_SNAPSHOT } from "@/engine/machine"
import { HubClientError, type HubClient } from "@/hub/client"
import { useProductReadRecheck } from "@/ui/auth/product-read-recheck-context"
import type { McpAvailability, McpConnector } from "@/hub/mcp-connector.schema"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { AUTH_INDEX_SUBJECT_KEY, readBrowserAuthIndexSubject } from "./page-clients"

export type ComposerConnection = { id: string; name: string; availability: McpAvailability; selectable: boolean }
export type ComposerConnectionsController = {
  items: readonly ComposerConnection[]
  selectedIds: readonly string[]
  status: "loading" | "ready" | "error" | "disabled"
  nextCursor: string | undefined
  refresh: () => void
  loadMore: () => void
  toggle: (id: string) => void
}
/** A Project overview owns local choices without touching its retained conversation. */
export type ComposerConnectionDraftSelection = {
  context: object
  selectedIds: readonly string[]
  isCurrent: () => boolean
  update: (change: (ids: readonly string[]) => readonly string[]) => void
}
type ConnectionReader = Pick<HubClient, "listMcpConnections" | "getMcpConnector">
const emptySelection: readonly string[] = Object.freeze([])
const noopSubscribe = () => () => undefined
const serverSnapshot = () => SERVER_ENGINE_SNAPSHOT

function subjectMarkerMatches(enforce: boolean, subject: string | null): boolean {
  if (!enforce) return true
  try { return subject !== null && readBrowserAuthIndexSubject() === subject }
  catch { return false }
}

/** Current draft intent, not the account's enabled state or a provider recommendation. */
export function useComposerConnections({ engine, client, boundary, enforceSubjectMarker, localDraft }: {
  engine: SessionEngine | null
  client: ConnectionReader
  boundary: ProjectReadBoundary
  enforceSubjectMarker: boolean
  localDraft?: ComposerConnectionDraftSelection
}): ComposerConnectionsController {
  const reportRead401 = useProductReadRecheck()
  const { admitted, subject, generation } = boundary
  const owner = useMemo(() => ({ engine, client, admitted, subject, generation, enforceSubjectMarker }), [engine, client, admitted, subject, generation, enforceSubjectMarker])
  const draftContext = localDraft?.context
  const scope = useMemo(() => ({ ...owner, draftContext }), [owner, draftContext])
  const [request, setRequest] = useState<{ scope: typeof scope; revision: number; cursor?: string | undefined }>({ scope, revision: 0 })
  const [catalog, setCatalog] = useState<{ scope: typeof scope; revision: number; items: ComposerConnection[]; nextCursor?: string | undefined; status: ComposerConnectionsController["status"] }>({ scope, revision: -1, items: [], status: "loading" })
  const [retiredOwner, setRetiredOwner] = useState<typeof owner | null>(null)
  const loadedCursors = useRef(new Set<string>())
  const committedScope = useRef<typeof scope | null>(null)
  const activeRequest = request.scope === scope ? request : { scope, revision: 0 }
  const markerMatches = subjectMarkerMatches(enforceSubjectMarker, subject)
  const valid = () => admitted && subject !== null && subjectMarkerMatches(enforceSubjectMarker, subject)
  const canAct = () => {
    if (committedScope.current !== scope) return false
    if (valid() && retiredOwner !== owner) return localDraft?.isCurrent() ?? true
    engine?.setSelectedMcpConnectionIds([])
    setRetiredOwner(owner)
    return false
  }
  const available = valid() && retiredOwner !== owner && engine !== null
  const sameScope = catalog.scope === scope && available
  const items = sameScope ? catalog.items : []
  const status = !available ? "disabled" : sameScope && catalog.revision === activeRequest.revision ? catalog.status : "loading"
  const snapshot = useSyncExternalStore(engine?.subscribe ?? noopSubscribe, engine?.getSnapshot ?? serverSnapshot, serverSnapshot)
  const selectedIds = available ? localDraft
    ? localDraft.isCurrent() ? localDraft.selectedIds : emptySelection
    : snapshot.selectedMcpConnectionIds ?? emptySelection : emptySelection

  useLayoutEffect(() => {
    committedScope.current = scope
    loadedCursors.current = new Set()
    return () => { if (committedScope.current === scope) committedScope.current = null }
  }, [scope])

  useLayoutEffect(() => {
    const retire = () => {
      if (!subjectMarkerMatches(owner.enforceSubjectMarker, owner.subject)) {
        owner.engine?.setSelectedMcpConnectionIds([])
        setRetiredOwner(owner)
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === AUTH_INDEX_SUBJECT_KEY) retire()
    }
    retire()
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("storage", onStorage)
      owner.engine?.setSelectedMcpConnectionIds([])
    }
  // Only identity/engine retirement clears its selection. Entering or leaving
  // a local Project draft changes catalog scope, never the hidden engine.
  }, [owner, markerMatches])

  useEffect(() => {
    if (!admitted || subject === null || engine === null || retiredOwner === owner) return
    let live = true
    const controller = new AbortController()
    const current = () => {
      if (!live || controller.signal.aborted) return false
      if (subjectMarkerMatches(enforceSubjectMarker, subject)) return true
      engine.setSelectedMcpConnectionIds([])
      setRetiredOwner(owner)
      return false
    }
    const assertCurrent = () => { if (!current()) throw new Error("retired Connection read") }
    const cursor = activeRequest.cursor
    const revision = activeRequest.revision
    void (async () => {
      assertCurrent()
      const page = await client.listMcpConnections({ limit: 50, ...(cursor === undefined ? {} : { cursor }) }, controller.signal)
      assertCurrent()
      if (page.next_cursor !== undefined && (page.next_cursor === cursor || (cursor !== undefined && loadedCursors.current.has(page.next_cursor)))) throw new Error("repeated Connection cursor")
      if (new Set(page.connections.map(item => item.connection_id)).size !== page.connections.length) throw new Error("duplicate Connection projection")
      if (page.connections.length && !client.getMcpConnector) throw new Error("Connection metadata unavailable")
      const metadata = new Map<string, Promise<McpConnector>>()
      const next: ComposerConnection[] = []
      let offset = 0
      const consume = async () => {
        while (offset < page.connections.length) {
          assertCurrent()
          const index = offset++
          const connection = page.connections[index]!
          let read = metadata.get(connection.connector_id)
          if (read === undefined) {
            read = client.getMcpConnector!(connection.connector_id, controller.signal)
            metadata.set(connection.connector_id, read)
          }
          const connector = await read
          assertCurrent()
          if (connector.connector_id !== connection.connector_id || (connector.server_id !== undefined && connector.server_id !== connection.server_id) || connector.provider_key !== connection.provider_key) throw new Error("Connection metadata identity mismatch")
          next[index] = { id: connection.connection_id, name: connector.display_name ?? connector.provider_key, availability: connector.availability,
            selectable: connector.enabled && connector.status === "active" && connector.availability !== "unavailable" && connector.availability !== "reauthorization_required" }
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, page.connections.length) }, consume))
      assertCurrent()
      if (cursor === undefined) loadedCursors.current.clear()
      else loadedCursors.current.add(cursor)
      setCatalog(previous => {
        const prior = cursor === undefined || previous.scope !== scope ? [] : previous.items
        if (next.some(item => prior.some(old => old.id === item.id))) return { scope, revision, items: prior, status: "error", nextCursor: cursor }
        return { scope, revision, items: [...prior, ...next], nextCursor: page.next_cursor, status: "ready" }
      })
    })().catch((error: unknown) => {
      if (current()) {
        if (error instanceof HubClientError && error.reason === "http" && error.status === 401)
          reportRead401?.({ subject, generation, signal: controller.signal })
        setCatalog(previous => ({ scope, revision, items: previous.scope === scope ? previous.items : [], nextCursor: cursor, status: "error" }))
        controller.abort()
      }
    })
    return () => { live = false; controller.abort() }
  }, [scope, activeRequest.revision, activeRequest.cursor, admitted, subject, engine, client, enforceSubjectMarker, retiredOwner, owner, reportRead401, generation])

  return {
    items, selectedIds, status, nextCursor: sameScope ? catalog.nextCursor : undefined,
    refresh: () => { if (canAct()) setRequest(previous => ({ scope, revision: previous.scope === scope ? previous.revision + 1 : 1 })) },
    loadMore: () => {
      if (canAct() && status !== "loading" && sameScope && catalog.nextCursor !== undefined) setRequest(previous => ({ scope, revision: previous.scope === scope ? previous.revision + 1 : 1, cursor: catalog.nextCursor }))
    },
    toggle: id => {
      if (!canAct() || engine === null) return
      const change = (original: readonly string[]) => original.includes(id) ? original.filter(value => value !== id)
        : items.some(item => item.id === id && item.selectable) && original.length < 16 ? [...original, id] : original
      if (localDraft) localDraft.update(change)
      else engine.setSelectedMcpConnectionIds(change(engine.getSnapshot().selectedMcpConnectionIds ?? emptySelection))
    },
  }
}
