import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import type { SessionEngine, MachineState } from "@/engine/machine"
import type { CreationIntent } from "@/ui/composer/creation-intent-pill"
import type { SettingsTab } from "@/ui/settings/settings-modal"

import {
  conversationIdFromLocation,
  readInitialCreationIntent,
  settingsTabFromLocation,
  writePendingCreationIntent,
} from "./app-frame-helpers"

export type AppFrameNavigationOptions = {
  engine: SessionEngine | null
  projectRef: string | undefined
  projectWorkspace: boolean
  mounted: boolean
  activeId: string | null
  threadMessageCount: number
  hydrating: boolean
  machinePhase: MachineState["phase"]
}

/** Owns shareable URL state, route hydration, and creation-intent persistence. */
export function useAppFrameNavigation({
  engine,
  projectRef,
  projectWorkspace,
  mounted,
  activeId,
  threadMessageCount,
  hydrating,
  machinePhase,
}: AppFrameNavigationOptions) {
  // Client URL state starts from the server-safe empty value. Read the deep
  // link in a layout microtask so the first hydrated tree remains identical
  // to SSR while settings/capsules still appear before the next interaction.
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null)
  const [deploymentIntent, setDeploymentIntentState] = useState<CreationIntent | null>(null)
  useLayoutEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setSettingsTab(settingsTabFromLocation())
      setDeploymentIntentState(readInitialCreationIntent())
    })
    return () => {
      active = false
    }
  }, [])

  const setDeploymentIntent = useCallback((intent: CreationIntent | null) => {
    setDeploymentIntentState(intent)
    writePendingCreationIntent(intent)
  }, [])

  useEffect(() => {
    // A direct-chat creation mode belongs to the direct welcome route. Clear
    // its persisted projection when the App Router enters a project so a
    // later return to /app cannot resurrect a stale capsule from another
    // workflow.
    if (!projectWorkspace || deploymentIntent === null) return
    let active = true
    queueMicrotask(() => {
      if (active) setDeploymentIntent(null)
    })
    return () => { active = false }
  }, [deploymentIntent, projectWorkspace, setDeploymentIntent])

  const settingsHistoryEntryRef = useRef(false)
  const initialConversationRef = useRef<string | null>(conversationIdFromLocation())
  const conversationUrlRef = useRef<string | null>(conversationIdFromLocation())
  const conversationUrlHydratedRef = useRef(false)
  const [conversationRouteId, setConversationRouteId] = useState<string | null>(null)

  useLayoutEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) setConversationRouteId(conversationIdFromLocation())
    })
    return () => {
      active = false
    }
  }, [])

  const syncSettingsUrl = useCallback((tab: SettingsTab | null, mode: "push" | "replace"): void => {
    if (typeof window === "undefined") {
      return
    }
    const url = new URL(window.location.href)
    if (tab === null) {
      url.searchParams.delete("settings")
      if (/^#\/?settings\//.test(url.hash) || url.hash.includes("/settings/")) {
        url.hash = ""
      }
    } else {
      // Match Manus' shareable settings route. Keep the legacy query form
      // accepted on input, but emit one canonical URL so tab changes do not
      // alternate between two address-bar formats.
      url.searchParams.delete("settings")
      const routeTab = tab === "appearance" ? "general" : tab
      url.hash = `#/account/settings/${routeTab}`
    }
    const write = mode === "push" ? window.history.pushState : window.history.replaceState
    write.call(window.history, window.history.state, "", url.pathname + url.search + url.hash)
  }, [])

  const syncConversationUrl = useCallback((id: string | null, mode: "push" | "replace"): void => {
    if (typeof window === "undefined") {
      return
    }
    const url = new URL(window.location.href)
    const hashConversation = /^#\/?conversation(?:=|\/)/.test(url.hash)
    if (id === null) {
      url.searchParams.delete("conversation")
    } else {
      url.searchParams.set("conversation", id)
    }
    // Emit the query form as the canonical conversation URL after accepting
    // a hash deep-link; otherwise back/forward would keep two identities.
    if (hashConversation) {
      url.hash = ""
    }
    const next = url.pathname + (url.search ? url.search : "") + url.hash
    const current = window.location.pathname + window.location.search + window.location.hash
    conversationUrlRef.current = id
    if (next === current) {
      return
    }
    const write = mode === "push" ? window.history.pushState : window.history.replaceState
    write.call(window.history, window.history.state, "", next)
  }, [])

  // A settings URL is a real client-side view state. Back/forward updates the
  // mounted Dialog without navigating away from the workspace shell.
  useEffect(() => {
    const onPopState = () => {
      setSettingsTab(settingsTabFromLocation())
      const requestedConversation = conversationIdFromLocation()
      const previousConversation = conversationUrlRef.current
      conversationUrlRef.current = requestedConversation
      setConversationRouteId(requestedConversation)
      if (!projectWorkspace && requestedConversation !== previousConversation) {
        // Browser history is another conversation switch path. Settings-only
        // history entries keep the same conversation and must not consume a
        // pending direct-chat creation action.
        setDeploymentIntent(null)
      }
      const currentSnapshot = engine?.getSnapshot()
      const currentId = currentSnapshot?.store?.activeId ?? null
      if (requestedConversation !== null) {
        if (requestedConversation !== currentId) {
          engine?.openConversation(requestedConversation)
        }
      } else if (previousConversation !== null && currentId !== null) {
        // Going back from a conversation returns to a fresh workspace. Do not
        // clear a blank draft session that is already the current view, as can
        // happen when a Settings URL is closed without a conversation state.
        engine?.newConversation()
      }
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [engine, projectWorkspace, setDeploymentIntent])

  // AppFrame remains mounted across App Router transitions. Re-read the URL
  // when entering/leaving a project so a stale conversation query cannot make
  // the next project overview look like an active task.
  useEffect(() => {
    const requestedConversation = conversationIdFromLocation()
    conversationUrlRef.current = requestedConversation
    // Route leaves are intentionally empty so AppFrame stays mounted. Apply a
    // newly entered conversation query to the newly selected scope here; the
    // initial deep-link effect only runs once per shell mount.
    if (requestedConversation !== null && requestedConversation !== (engine?.getSnapshot().store?.activeId ?? null)) {
      engine?.openConversation(requestedConversation)
    }
    const frame = window.requestAnimationFrame(() => setConversationRouteId(requestedConversation))
    return () => window.cancelAnimationFrame(frame)
  }, [engine, projectRef, projectWorkspace])

  // Deep links are applied after hydration so the URL wins over the locally
  // remembered active session without changing the SSR/first paint contract.
  useEffect(() => {
    if (!mounted || conversationUrlHydratedRef.current) {
      return
    }
    conversationUrlHydratedRef.current = true
    const requestedConversation = initialConversationRef.current
    if (requestedConversation !== null && requestedConversation !== activeId) {
      engine?.openConversation(requestedConversation)
    }
  }, [activeId, engine, mounted])

  // A restored direct session and a newly submitted first message both acquire
  // a stable URL without adding an extra history entry on every stream event.
  // Project overview is intentionally a URL without `conversation`; it is a
  // workspace landing surface, not an implicit redirect to the last task.
  useEffect(() => {
    if (!mounted || projectWorkspace || activeId === null || threadMessageCount === 0) {
      return
    }
    if (conversationIdFromLocation() === null) {
      syncConversationUrl(activeId, "replace")
    }
  }, [activeId, mounted, projectWorkspace, syncConversationUrl, threadMessageCount])

  const resolvedConversationRouteId = mounted
    ? conversationIdFromLocation()
    : conversationRouteId
  // A mounted shell can cross from direct chat into a project overview without
  // replacing the engine instance. The URL is authoritative for that route:
  // never paint the direct thread while the project has no conversation route,
  // and never paint a stale thread while a deep-link is being opened.
  const routeOwnsConversation = resolvedConversationRouteId === null
    ? !projectWorkspace
    : resolvedConversationRouteId === activeId
  // A deep-linked task must not fall through to the empty project welcome
  // while the scoped engine is still switching or fetching its snapshot. That
  // intermediate tree was perceived as a blank page (and could briefly show a
  // misleading “new task”); keep the shell chrome and show the explicit
  // loading workbench until the requested conversation is authoritative.
  const conversationHydrating = mounted
    && resolvedConversationRouteId !== null
    && (hydrating || !routeOwnsConversation)

  // A stale/forbidden conversation can be evicted by the engine. Once its
  // fallback session has finished hydrating, the old URL must stop owning the
  // stage; otherwise the mismatch guard would keep the loading surface on
  // screen forever. Direct chat returns to its fresh welcome and project chat
  // returns to the project overview. A real hydration error keeps its URL so
  // the error surface can retry the same conversation.
  useEffect(() => {
    if (
      !mounted
      || resolvedConversationRouteId === null
      || hydrating
      || activeId === null
      || activeId === resolvedConversationRouteId
      || machinePhase === "error"
    ) {
      return
    }
    let active = true
    queueMicrotask(() => {
      if (!active) return
      syncConversationUrl(null, "replace")
      setConversationRouteId(null)
    })
    return () => {
      active = false
    }
  }, [activeId, hydrating, machinePhase, mounted, resolvedConversationRouteId, syncConversationUrl])

  const conversationHydrationFailed = mounted
    && resolvedConversationRouteId !== null
    && !hydrating
    && machinePhase === "error"
    && threadMessageCount === 0

  return {
    settingsTab,
    setSettingsTab,
    deploymentIntent,
    setDeploymentIntent,
    conversationRouteId,
    setConversationRouteId,
    resolvedConversationRouteId,
    routeOwnsConversation,
    conversationHydrating,
    conversationHydrationFailed,
    syncSettingsUrl,
    syncConversationUrl,
    settingsHistoryEntryRef,
  }
}

export { settingsTabFromLocation }
