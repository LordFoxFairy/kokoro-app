"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { LibraryArtifact, LibraryArtifactClient } from "./kokoro-library-artifact-client"
import type { LibraryArtifactQuery } from "./kokoro-library-model"

type Owner = Readonly<{ admitted: boolean; subject: string | null | undefined; generation: number }>

export function appendUniqueArtifacts(
  current: readonly LibraryArtifact[],
  additions: readonly LibraryArtifact[],
): LibraryArtifact[] {
  const key = (item: LibraryArtifact) => JSON.stringify([item.conversationId, item.artifactId])
  const items = new Map(current.map((item) => [key(item), item]))
  for (const item of additions) items.set(key(item), item)
  return [...items.values()]
}

/** One authorized data source, with independent query windows and explicit sparse-page continuation. */
export function useLibraryArtifacts(
  owner: Owner,
  query: LibraryArtifactQuery,
  client: LibraryArtifactClient,
  fixture: readonly LibraryArtifact[] | undefined,
) {
  const [attempt, setAttempt] = useState(0)
  const boundary = useMemo(() => ({ owner, client, fixture }), [owner, client, fixture])
  const scope = useMemo(() => ({ boundary, query, attempt }), [boundary, query, attempt])
  const active = useRef<typeof scope | null>(scope)
  const [record, setRecord] = useState<{
    scope: typeof scope
    items: LibraryArtifact[]
    nextCursor: string | null
  } | null>(null)
  const [failure, setFailure] = useState<typeof scope | null>(null)
  const [more, setMore] = useState<{ scope: typeof scope; error: boolean } | null>(null)
  const sequence = useRef(0),
    flight = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const seen = useRef(new Set<string>())
  const previousLoad = useRef<{ boundary: typeof boundary; query: LibraryArtifactQuery } | null>(null)
  useLayoutEffect(() => {
    active.current = scope
    sequence.current += 1
    seen.current.clear()
    flight.current = false
    return () => {
      if (active.current === scope) active.current = null
      sequence.current += 1
      controller.current?.abort()
      flight.current = false
    }
  }, [scope])
  useEffect(() => {
    if (!owner.admitted || fixture !== undefined) return
    const abort = new AbortController()
    controller.current = abort
    const token = ++sequence.current
    const current = () => active.current === scope && token === sequence.current && !abort.signal.aborted
    const read = async () => {
      previousLoad.current = { boundary, query }
      try {
        const page = await client.listArtifacts(null, abort.signal, query)
        if (current()) setRecord({ scope, items: appendUniqueArtifacts([], page.items), nextCursor: page.nextCursor })
      } catch {
        if (current()) setFailure(scope)
      } finally {
        if (current()) controller.current = null
      }
    }
    const previous = previousLoad.current
    const delay =
      previous?.boundary === boundary && previous.query.type === query.type && previous.query.query !== query.query
        ? 225
        : 0
    const timer = delay ? setTimeout(() => void read(), delay) : null
    if (!delay) void read()
    return () => {
      if (timer !== null) clearTimeout(timer)
      abort.abort()
    }
  }, [scope, boundary, query, client, fixture, owner.admitted])

  const loadMore = useCallback(async () => {
    if (
      !owner.admitted ||
      fixture !== undefined ||
      active.current !== scope ||
      record?.scope !== scope ||
      flight.current ||
      record.nextCursor === null
    )
      return
    const cursor = record.nextCursor
    flight.current = true
    const abort = new AbortController()
    controller.current = abort
    const token = ++sequence.current
    const current = () => active.current === scope && token === sequence.current && !abort.signal.aborted
    setMore({ scope, error: false })
    try {
      const page = await client.listArtifacts(cursor, abort.signal, query)
      if (!current()) return
      if (page.nextCursor !== null && (page.nextCursor === cursor || seen.current.has(page.nextCursor)))
        throw Error("library_repeated_cursor")
      seen.current.add(cursor)
      setRecord((prior) =>
        prior?.scope === scope
          ? { ...prior, items: appendUniqueArtifacts(prior.items, page.items), nextCursor: page.nextCursor }
          : prior,
      )
      setMore(null)
    } catch {
      if (current()) setMore({ scope, error: true })
    } finally {
      if (current()) {
        flight.current = false
        controller.current = null
      }
    }
  }, [owner.admitted, fixture, scope, record, client, query])
  const controlled = fixture !== undefined
  const confirmed = record?.scope.boundary === boundary
  const pending = owner.admitted && !controlled && record?.scope !== scope && failure !== scope
  return {
    artifacts: owner.admitted ? (fixture ?? (confirmed ? record.items : [])) : [],
    nextCursor: !controlled && record?.scope === scope ? record.nextCursor : null,
    loading: pending && !confirmed,
    refreshing: pending && confirmed,
    queryPending: pending,
    error: !controlled && failure === scope,
    loadingMore: !controlled && more?.scope === scope && !more.error,
    loadMoreError: !controlled && more?.scope === scope && more.error,
    reload: () => setAttempt((value) => value + 1),
    loadMore,
  }
}
