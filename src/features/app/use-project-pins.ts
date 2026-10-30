"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { HubClientError } from "@/hub/client"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { useProductReadRecheck } from "@/ui/auth/product-read-recheck-context"
import { createProjectPinsClient, type ProjectPinItem, type ProjectPinState, type ProjectPinsClient } from "./project-pins"

type Target = { status: "known"; value: ProjectPinState } | { status: "reading" | "pending" | "unknown" | "error" | "unavailable"; previous?: ProjectPinState }
type View = { context: object; targets: Record<string, Target>; nextCursor: string | null; loaded: boolean; loading: boolean; failed: boolean }
/** One mounted-shell collection per admitted actor, never a route or Project cache. */
export function useProjectPins({ preview, boundary, visibleIds, onUnavailable, client: injected }: {
  preview: boolean; boundary: ProjectReadBoundary | undefined; visibleIds: readonly string[] | null
  onUnavailable?: (id: string) => void; client?: ProjectPinsClient
}) {
  const client = useMemo(() => injected ?? createProjectPinsClient(), [injected])
  const report401 = useProductReadRecheck()
  const subject = boundary?.subject ?? null, generation = boundary?.generation ?? 0
  const admitted = !preview && boundary?.admitted === true && subject !== null
  const context = useMemo(() => ({ client, subject, generation, admitted }), [client, subject, generation, admitted])
  type Scope = { context: typeof context; active: boolean; controller: AbortController; flights: Map<string, object>; versions: Map<string, number>; epoch: number; listFlight: object | null; cursors: Set<string>; collectionIds: Set<string>; collectionEpoch: number; nextCursor: string | null }
  const live = useRef<Scope | null>(null)
  const visible = useRef(visibleIds)
  const [stored, setStored] = useState<View | null>(null)
  const empty = useCallback((): View => ({ context, targets: {}, nextCursor: null, loaded: false, loading: false, failed: false }), [context])
  const current = stored?.context === context ? stored : empty()
  const latest = useRef(current.targets)
  useLayoutEffect(() => { visible.current = visibleIds; latest.current = current.targets }, [visibleIds, current.targets])
  useLayoutEffect(() => {
    const scope: Scope = { context, active: true, controller: new AbortController(), flights: new Map(), versions: new Map(), epoch: 0, listFlight: null, cursors: new Set(), collectionIds: new Set(), collectionEpoch: 0, nextCursor: null }
    live.current = scope
    return () => { scope.active = false; scope.controller.abort(); scope.flights.clear() }
  }, [context])
  const valid = useCallback((scope: Scope, id?: string) => admitted && scope.active && live.current === scope && scope.context === context
    && !scope.controller.signal.aborted && (id === undefined || visible.current?.includes(id) === true), [admitted, context])
  const publish = useCallback((scope: Scope, update: (value: View) => View) => {
    if (!valid(scope)) return
    setStored(previous => update(previous?.context === context ? previous : empty()))
  }, [context, empty, valid])
  const target = useCallback((scope: Scope, id: string, value: Target) => publish(scope, state => {
    const old=state.targets[id], previous=old?.status === "known" ? old.value : old?.previous
    const next=value.status === "known" || value.status === "unavailable" || previous===undefined ? value : {...value,previous}
    return {...state,targets:{...state.targets,[id]:next}}
  }), [publish])
  const denied = useCallback((error: unknown, scope: Scope, id?: string) => {
    if (!valid(scope)) return
    if (error instanceof HubClientError && error.reason === "http" && error.status === 401) report401?.({ subject, generation, signal: scope.controller.signal })
    if (id && error instanceof HubClientError && error.reason === "http" && error.status === 404 && error.code === "project_not_found") {
      target(scope, id, { status: "unavailable" }); onUnavailable?.(id); return true
    }
    return false
  }, [generation, onUnavailable, report401, subject, target, valid])
  const readTarget = useCallback(async (id: string) => {
    const scope = live.current
    if (!scope || !valid(scope, id) || scope.flights.has(id)) return
    const flight = {}; scope.flights.set(id, flight); scope.versions.set(id, ++scope.epoch)
    target(scope, id, { status: "reading" })
    try {
      const page = await client.list({ project_id: id }, scope.controller.signal)
      if (!valid(scope) || scope.flights.get(id) !== flight) return
      const item = page.items[0]
      target(scope, id, { status: "known", value: { project_id: id, is_pinned: item !== undefined, pinned_at: item?.pinned_at ?? null } })
    } catch (error) { if (valid(scope) && !denied(error, scope, id)) target(scope, id, { status: "error" }) }
    finally { if (scope.flights.get(id) === flight) scope.flights.delete(id) }
  }, [client, denied, target, valid])
  const load = useCallback(async (cursor?: string) => {
    const scope = live.current
    if (!scope || !valid(scope) || scope.listFlight) return
    if (cursor !== undefined && cursor !== scope.nextCursor) return
    if (cursor !== undefined && scope.cursors.has(cursor)) { publish(scope, state => ({ ...state, failed: true })); return }
    if(cursor===undefined){scope.collectionIds.clear();scope.collectionEpoch=scope.epoch;scope.cursors.clear();scope.nextCursor=null}
    const flight = {}, epoch = scope.collectionEpoch
    scope.listFlight = flight
    publish(scope, state => ({ ...state, loading: true, failed: false, ...(cursor===undefined?{nextCursor:null}:{}) }))
    try {
      const page = await client.list({ limit: 50, ...(cursor === undefined ? {} : { cursor }) }, scope.controller.signal)
      if (!valid(scope) || scope.listFlight !== flight) return
      if (page.next_cursor !== null && scope.cursors.has(page.next_cursor)) throw Error("pin pagination cycle")
      if (cursor !== undefined) scope.cursors.add(cursor)
      for(const item of page.items)scope.collectionIds.add(item.project_id)
      scope.nextCursor=page.next_cursor
      publish(scope, state => {
        const targets = { ...state.targets }
        for (const item of page.items) {
          if ((scope.versions.get(item.project_id) ?? 0) > epoch || scope.flights.has(item.project_id) || targets[item.project_id]?.status === "unknown" || targets[item.project_id]?.status === "unavailable") continue
          targets[item.project_id] = { status: "known", value: { ...item, is_pinned: true } }
        }
        if(page.next_cursor===null) for(const [id,entry] of Object.entries(targets)){
          if(entry.status==="known"&&entry.value.is_pinned&&!scope.collectionIds.has(id)&&!scope.flights.has(id)&&(scope.versions.get(id)??0)<=epoch)targets[id]={status:"known",value:{project_id:id,is_pinned:false,pinned_at:null}}
        }
        return { ...state, targets, nextCursor: page.next_cursor, loaded: true, loading: false }
      })
    } catch (error) { if (valid(scope)) { denied(error, scope); publish(scope, state => ({ ...state, loading: false, failed: true })) } }
    finally { if (scope.listFlight === flight) scope.listFlight = null }
  }, [client, denied, publish, valid])
  useEffect(() => { if (admitted) void load() }, [admitted, context, load])
  const set = useCallback(async (id: string, isPinned: boolean) => {
    const scope = live.current, fact = current.targets[id]
    if (!scope || !valid(scope, id) || scope.flights.has(id) || fact?.status !== "known" || latest.current[id] !== fact) return
    const flight = {}; scope.flights.set(id, flight); scope.versions.set(id, ++scope.epoch)
    target(scope, id, { status: "pending" })
    try {
      const value = await client.set(id, isPinned, scope.controller.signal)
      if (valid(scope) && scope.flights.get(id) === flight) target(scope, id, { status: "known", value })
    } catch (error) {
      if (valid(scope) && !denied(error, scope, id)) target(scope, id, { status: "unknown" })
    } finally { if (scope.flights.get(id) === flight) scope.flights.delete(id) }
  }, [client, current.targets, denied, target, valid])
  const pinned: ProjectPinItem[] = admitted ? Object.values(current.targets).flatMap(entry => {
    const value=entry.status === "known" ? entry.value : entry.status !== "unavailable" ? entry.previous : undefined
    return value?.is_pinned && value.pinned_at !== null && visibleIds?.includes(value.project_id) ? [{project_id:value.project_id,pinned_at:value.pinned_at}] : []
  }).sort((a, b) => Date.parse(b.pinned_at) - Date.parse(a.pinned_at) || (a.project_id < b.project_id ? -1 : a.project_id > b.project_id ? 1 : 0)) : []
  return { context: context as object, available: admitted, targets: admitted ? current.targets : {}, pinned, loading: current.loading, failed: current.failed, loaded: current.loaded, nextCursor: current.nextCursor,
    ensure: (id: string) => { if (!Object.hasOwn(latest.current,id)) void readTarget(id) }, check: readTarget, set,
    loadMore: () => { if (current.nextCursor !== null) void load(current.nextCursor) }, refresh: () => { void load() } }
}
export type ProjectPinsModel = ReturnType<typeof useProjectPins>
