"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { SessionEngine } from "@/engine/machine"
import { SERVER_ENGINE_SNAPSHOT } from "@/engine/machine"
import { HubClientError, type HubClient } from "@/hub/client"
import { useProductReadRecheck } from "@/ui/auth/product-read-recheck-context"
import type { McpAvailability, McpConnector } from "@/hub/mcp-connector.schema"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { AUTH_INDEX_SUBJECT_KEY, readBrowserAuthIndexSubject } from "./page-clients"

export type ComposerConnection = { id: string; name: string; availability: McpAvailability; selectable: boolean; connectorId?: string; providerKey?: string }
export type ComposerConnectionsController = {
  items: readonly ComposerConnection[]
  selectedIds: readonly string[]
  status: "loading" | "ready" | "error" | "disabled"
  nextCursor: string | undefined
  refresh: () => void
  loadMore: () => void
  toggle: (id: string) => void
  complete?: boolean
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
export function useComposerConnections({ engine, client, boundary, enforceSubjectMarker, localDraft, loadAllForDefaults = false }: {
  engine: SessionEngine | null
  client: ConnectionReader
  boundary: ProjectReadBoundary
  enforceSubjectMarker: boolean
  localDraft?: ComposerConnectionDraftSelection
  loadAllForDefaults?: boolean
}): ComposerConnectionsController {
  const reportRead401 = useProductReadRecheck()
  const { admitted, subject, generation } = boundary
  const owner = useMemo(() => ({ engine, client, admitted, subject, generation, enforceSubjectMarker }), [engine, client, admitted, subject, generation, enforceSubjectMarker])
  const draftContext = localDraft?.context
  const scope = useMemo(() => ({ ...owner, draftContext }), [owner, draftContext])
  const [request, setRequest] = useState<{ scope: typeof scope; revision: number; cursor?: string | undefined }>({ scope, revision: 0 })
  const [catalog, setCatalog] = useState<{ scope: typeof scope; revision: number; items: ComposerConnection[]; nextCursor?: string | undefined; status: ComposerConnectionsController["status"]; complete?: boolean }>({ scope, revision: -1, items: [], status: "loading" })
  const revisionAtRender = request.scope === scope ? request.revision : 0
  const [fullScanRequest, setFullScanRequest] = useState<{ scope: typeof scope; revision: number } | null>(null)
  // Keep an already dispatched scan stable when manual selection touches the
  // draft, but do not turn its later user refresh into another automatic scan.
  const fullScan = loadAllForDefaults || fullScanRequest?.scope === scope && fullScanRequest.revision === revisionAtRender
  if (loadAllForDefaults && (fullScanRequest?.scope !== scope || fullScanRequest.revision !== revisionAtRender))
    setFullScanRequest({ scope, revision: revisionAtRender })
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
    const timer = fullScan ? setTimeout(() => {
      if (current()) {
        setCatalog(previous => ({ scope, revision, items: previous.scope === scope ? previous.items : [], status: "error", complete: false }))
        controller.abort()
      }
    }, 10_000) : undefined
    void (async () => {
      assertCurrent()
      let pageCursor = fullScan ? undefined : cursor
      let nextCursor: string | undefined
      const cursors = new Set<string>(), ids = new Set<string>()
      const connections = [] as Awaited<ReturnType<ConnectionReader["listMcpConnections"]>>["connections"]
      for (let pages = 0; pages < 50; pages++) {
        const page = await client.listMcpConnections({ limit: 50, ...(pageCursor === undefined ? {} : { cursor: pageCursor }) }, controller.signal)
        assertCurrent()
        for (const item of page.connections) {
          if (ids.has(item.connection_id)) throw new Error("duplicate Connection projection")
          ids.add(item.connection_id); connections.push(item)
        }
        nextCursor = page.next_cursor
        if (nextCursor !== undefined && (nextCursor === pageCursor || cursors.has(nextCursor) ||
          (!fullScan && cursor !== undefined && loadedCursors.current.has(nextCursor)))) throw new Error("repeated Connection cursor")
        if (nextCursor === undefined || !fullScan) break
        cursors.add(nextCursor); pageCursor = nextCursor
        if (pages === 49) throw Error("Connection page budget exceeded")
      }
      if (connections.length && !client.getMcpConnector) throw new Error("Connection metadata unavailable")
      const metadata = new Map<string, Promise<McpConnector>>()
      const next: ComposerConnection[] = []
      let offset = 0
      const consume = async () => {
        while (offset < connections.length) {
          assertCurrent()
          const index = offset++
          const connection = connections[index]!
          let read = metadata.get(connection.connector_id)
          if (read === undefined) {
            read = client.getMcpConnector!(connection.connector_id, controller.signal)
            metadata.set(connection.connector_id, read)
          }
          const connector = await read
          assertCurrent()
          if (connector.connector_id !== connection.connector_id || (connector.server_id !== undefined && connector.server_id !== connection.server_id) || connector.provider_key !== connection.provider_key) throw new Error("Connection metadata identity mismatch")
          next[index] = { id: connection.connection_id, connectorId: connection.connector_id, providerKey: connection.provider_key,
            name: connector.display_name ?? connector.provider_key, availability: connector.availability,
            selectable: connector.enabled && connector.status === "active" && connector.availability !== "unavailable" && connector.availability !== "reauthorization_required" }
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, connections.length) }, consume))
      assertCurrent()
      if (cursor === undefined || fullScan) loadedCursors.current.clear()
      else loadedCursors.current.add(cursor)
      setCatalog(previous => {
        const prior = fullScan || cursor === undefined || previous.scope !== scope ? [] : previous.items
        if (next.some(item => prior.some(old => old.id === item.id))) return { scope, revision, items: prior, status: "error", nextCursor: cursor }
        return { scope, revision, items: [...prior, ...next], nextCursor, status: "ready", complete: nextCursor === undefined }
      })
    })().catch((error: unknown) => {
      if (current()) {
        if (error instanceof HubClientError && error.reason === "http" && error.status === 401)
          reportRead401?.({ subject, generation, signal: controller.signal })
        setCatalog(previous => ({ scope, revision, items: previous.scope === scope ? previous.items : [], nextCursor: cursor, status: "error", complete: false }))
        controller.abort()
      }
    }).finally(() => clearTimeout(timer))
    return () => { live = false; controller.abort(); clearTimeout(timer) }
  }, [scope, activeRequest.revision, activeRequest.cursor, admitted, subject, engine, client, enforceSubjectMarker, retiredOwner, owner, reportRead401, generation, fullScan])

  return {
    items, selectedIds, status, complete: sameScope && catalog.revision === activeRequest.revision && catalog.status === "ready" && catalog.complete === true,
    nextCursor: sameScope ? catalog.nextCursor : undefined,
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
