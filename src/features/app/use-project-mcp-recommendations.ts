"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { HubClient } from "@/hub/client"
import { createProjectMcpRecommendationsClient, type ProjectMcpRecommendationRef, type ProjectMcpRecommendations, type ProjectMcpRecommendationsClient } from "@/hub/project-mcp-recommendations-client"
import { canonicalProjectMcpRecommendations } from "@/generated/bff-project-mcp-recommendations"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { readProjectMcpRecommendationOptions, type ProjectMcpRecommendationOption } from "./project-mcp-recommendation-options"

type State = { context: object; facts: ProjectMcpRecommendations | null; configReady: boolean; options: readonly ProjectMcpRecommendationOption[]; directoryReady: boolean; busy: boolean }
const origin = () => typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}`
const marker = () => { try { return window.localStorage.getItem("kokoro.web.auth-index-subject") } catch { return null } }
export type ProjectMcpRecommendationSaveResult = "current" | "conflict" | "unconfirmed" | "retired"

/** The mounted Project shell owns this single configuration fact; dialogs only edit local copies. */
export function useProjectMcpRecommendations({ projectId, boundary, enabled, hub, client: injected }: {
  projectId: string | null
  boundary: ProjectReadBoundary | undefined
  enabled: boolean
  hub: HubClient
  client?: ProjectMcpRecommendationsClient
}) {
  const client = useMemo(() => injected ?? createProjectMcpRecommendationsClient(), [injected])
  const subject = boundary?.subject ?? null, admitted = boundary?.admitted === true, generation = boundary?.generation ?? 0
  const [epoch, setEpoch] = useState(0), [attempt, setAttempt] = useState(0)
  const route = origin()
  const context = useMemo(() => ({ projectId, subject, admitted, generation, enabled, hub, client, route, epoch }), [projectId, subject, admitted, generation, enabled, hub, client, route, epoch])
  const allowed = enabled && projectId !== null && subject !== null && admitted
    && route.split("?")[0] === `/app/project/${encodeURIComponent(projectId)}`
  const live = useRef<{ context: typeof context; controller: AbortController; active: boolean } | null>(null)
  const pending = useRef<object | null>(null)
  const [state, setState] = useState<State | null>(null)
  const isCurrent = useCallback(() => {
    const lease = live.current
    return Boolean(allowed && lease?.active && lease.context === context && !lease.controller.signal.aborted && origin() === route && marker() === subject)
  }, [allowed, context, route, subject])
  useLayoutEffect(() => {
    const lease = { context, controller: new AbortController(), active: true }
    live.current = lease
    const retire = () => {
      if (origin() === route && marker() === subject) return
      lease.active = false; lease.controller.abort(); setEpoch(value => value + 1)
    }
    window.addEventListener("popstate", retire); window.addEventListener("kokoro:surface-navigation", retire); window.addEventListener("storage", retire)
    return () => {
      lease.active = false; lease.controller.abort()
      if (live.current === lease) { live.current = null; pending.current = null }
      window.removeEventListener("popstate", retire); window.removeEventListener("kokoro:surface-navigation", retire); window.removeEventListener("storage", retire)
    }
  }, [context, route, subject])
  const publish = useCallback((patch: Partial<Omit<State, "context">>) => {
    if (!isCurrent()) return
    setState(previous => ({ ...(previous?.context === context ? previous : { context, facts: null, configReady: false, options: [], directoryReady: false, busy: false }), ...patch, context }))
  }, [context, isCurrent])
  useEffect(() => {
    if (!isCurrent() || projectId === null) return
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, live.current!.controller.signal])
    void client.get(projectId, signal).then(facts => { if (!signal.aborted) publish({ facts, configReady: true }) }, () => undefined)
    void readProjectMcpRecommendationOptions(hub, signal).then(options => { if (!signal.aborted) publish({ options, directoryReady: true }) }, () => undefined)
    return () => controller.abort()
  }, [context, attempt, client, hub, isCurrent, projectId, publish])
  const admittedToView = allowed && marker() === subject
  const current = admittedToView && state?.context === context ? state : null
  const save = async (recommendations: readonly ProjectMcpRecommendationRef[]): Promise<ProjectMcpRecommendationSaveResult> => {
    if (!isCurrent() || !current?.configReady || !current.directoryReady || !current.facts || projectId === null || pending.current) return "retired"
    const frozen = structuredClone([...recommendations]), input = { expected_state_version: current.facts.state_version, recommendations: frozen }
    const lease = live.current!, flight = {}
    pending.current = flight; publish({ busy: true })
    try {
      try { await client.replace(projectId, input, lease.controller.signal) } catch { /* Unknown/closed failure gets one safe current-value read, never another PUT. */ }
      if (!isCurrent() || live.current !== lease) return "retired"
      try {
        const facts = await client.get(projectId, lease.controller.signal)
        if (!isCurrent() || live.current !== lease) return "retired"
        publish({ facts, configReady: true })
        return JSON.stringify(facts.recommendations) === JSON.stringify(canonicalProjectMcpRecommendations(frozen)) ? "current" : "conflict"
      } catch {
        if (!isCurrent() || live.current !== lease) return "retired"
        publish({ configReady: false }); return "unconfirmed"
      }
    } finally { if (pending.current === flight) { pending.current = null; publish({ busy: false }) } }
  }
  return { context: context as object, allowed: admittedToView, facts: current?.facts ?? null, configReady: current?.configReady ?? false,
    options: current?.options ?? [], directoryReady: current?.directoryReady ?? false, busy: current?.busy ?? false,
    isCurrent, refresh: () => { if (isCurrent() && !pending.current) { publish({ configReady: false, directoryReady: false }); setAttempt(value => value + 1) } }, save }
}
export type ProjectMcpRecommendationsModel = ReturnType<typeof useProjectMcpRecommendations>
