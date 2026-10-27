import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { useT } from "@/i18n/context"
import { renameProject, ProjectRenameError } from "@/features/app/project-rename"
import { ProjectReadError } from "@/features/app/project-list"
import { projectRenameIdSchema, projectRenameRequestSchema, type ProjectRenameIntent } from "@/contract/project-rename"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import type { ProjectRenameControl } from "@/components/blocks/workspace-header/workspace-header.types"
import { uploadProjectResource as uploadProjectResourceRequest } from "@/features/app/project-resource-upload"
import { ProjectResourceUploadError } from "@/features/app/project-resource-upload"
import { listProjectResources as listProjectResourcesRequest } from "@/features/app/project-resource-list"
import { createProject as createProjectRequest, ProjectCreateError } from "@/features/app/project-create"
import { navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"
import { clearPendingDraft } from "@/ui/shell/use-draft"

import {
  createPreviewProjectRef,
  takePendingProjectDraft,
  writePendingProjectDraft,
} from "./app-frame-helpers"
import type { Project, ProjectInstructionRevisionWire } from "@/contract/project"
import type { ProjectReadState } from "@/features/app/use-project-list"
import { getProject, listProjectInstructionRevisions, updateProjectInstructions } from "@/features/app/project-list"
import { ProjectInstructionSaveError, type ProjectInstructionRequest, type ProjectInstructionRevision } from "./app-frame.types"

export type AppFrameProjectOptions = {
  projectRef: string | undefined
  projectWorkspace: boolean
  preview: boolean
  mounted: boolean
  draft: string
  updateDraft: (value: string) => void
  clearDraft: () => void
  projectDetail: ProjectReadState<Project>
  instructionHistory: ProjectReadState<ProjectInstructionRevisionWire[]>
  instructionsEnabled?: boolean
  instructionContext: object
  refreshProject: () => void
  refreshRenamedProject?: (target: string, signal: AbortSignal) => Promise<Project>
  renameBoundary?: ProjectReadBoundary
  renameRouteKey?: string
  onOpenProject?: (projectRef: string, draft?: string) => void
  onProjectCreated?: () => void
}

type ProjectCreationIntent = {
  key: string; name: string; draft: string; route: string; subject: string | null | undefined
  navigationScope: { active: boolean; context: object }
}
type ProjectCreationState = { pending: boolean; error: boolean; retryable: boolean }

/** Owns project-scoped draft handoff, instructions, resources, and mutations. */
export function useAppFrameProject({
  projectRef,
  projectWorkspace,
  preview,
  mounted,
  draft,
  updateDraft,
  clearDraft,
  onOpenProject,
  onProjectCreated,
  projectDetail,
  instructionHistory,
  instructionContext,
  instructionsEnabled = false,
  refreshProject,
  refreshRenamedProject,
  renameBoundary,
  renameRouteKey,
}: AppFrameProjectOptions) {
  const t = useT()
  // Command lifecycle is fenced independently of read revision and draft state.
  const [renameRouteEpoch, setRenameRouteEpoch] = useState(0)
  const renameContext = useMemo(() => ({ projectRef, projectWorkspace, admitted: renameBoundary?.admitted, subject: renameBoundary?.subject,
    generation: renameBoundary?.generation, route: renameRouteKey, routeEpoch: renameRouteEpoch, preview, mounted }),
  [projectRef, projectWorkspace, renameBoundary?.admitted, renameBoundary?.subject, renameBoundary?.generation, renameRouteKey, renameRouteEpoch, preview, mounted])
  type RenameScope = {
    context: typeof renameContext; route: string; active: boolean; busy: boolean; revoked: boolean; controller: AbortController | null
    intent: { command: ProjectRenameIntent; rawInput: string; route: string; ack: boolean; readOnly: boolean } | null
  }
  const renameScopeRef = useRef<RenameScope | null>(null)
  type RenameUi = Pick<ProjectRenameControl, "open" | "name" | "status" | "problem" | "frozen">
  const emptyRenameUi: RenameUi = { open: false, name: "", status: "idle", problem: null, frozen: false }
  const [renameUi, setRenameUi] = useState<{ context: typeof renameContext; ui: RenameUi } | null>(null)
  const renameView = renameUi?.context === renameContext ? renameUi.ui : emptyRenameUi
  useLayoutEffect(() => {
    const scope: RenameScope = { context: renameContext, route: typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}${window.location.hash}`, active: true, busy: false, revoked: false, controller: null, intent: null }
    renameScopeRef.current = scope
    const routeChanged = () => {
      const route = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (route === scope.route) return
      scope.active = false
      scope.controller?.abort()
      scope.intent = null
      setRenameRouteEpoch((epoch) => epoch + 1)
    }
    window.addEventListener("popstate", routeChanged)
    window.addEventListener("kokoro:surface-navigation", routeChanged)
    return () => {
      window.removeEventListener("popstate", routeChanged)
      window.removeEventListener("kokoro:surface-navigation", routeChanged)
      scope.active = false
      scope.controller?.abort()
      scope.intent = null
      scope.controller = null
    }
  }, [renameContext])
  const renameAvailable = mounted && projectWorkspace && !preview && renameBoundary?.admitted === true
    && renameBoundary.subject !== null && projectDetail.status === "ready" && projectDetail.data.id === projectRef
    && projectRenameIdSchema.safeParse(projectRef).success && refreshRenamedProject !== undefined && renameView.problem !== "permission"
  const setRenameView = useCallback((ui: Omit<RenameUi, "frozen">) => {
    const scope = renameScopeRef.current
    if (scope?.active && scope.context === renameContext) setRenameUi({ context: renameContext,
      ui: { ...ui, frozen: scope.intent !== null || scope.revoked } })
  }, [renameContext])
  const runRename = useCallback(async (readOnly: boolean, restart = false) => {
    const scope = renameScopeRef.current
    const retained = scope?.intent
    if (!scope?.active || scope.context !== renameContext || !retained || scope.busy || !refreshRenamedProject || !projectRef) return
    scope.busy = true
    const controller = new AbortController()
    scope.controller = controller
    const current = () => scope.active && renameScopeRef.current === scope && !controller.signal.aborted && scope.intent?.command === retained.command
      && (typeof window === "undefined" || retained.route === `${window.location.pathname}${window.location.search}${window.location.hash}`)
    setRenameView({ open: true, name: retained.rawInput, status: readOnly ? "confirming-read" : "pending", problem: null })
    try {
      if (!current()) return
      if (!readOnly) {
        await renameProject(retained.command, controller.signal)
        if (!current()) return
        scope.intent = { ...retained, ack: true, readOnly: true }
      } else scope.intent = { ...retained, readOnly: true }
      setRenameView({ open: true, name: retained.rawInput, status: "confirming-read", problem: null })
      const resource = await refreshRenamedProject(retained.command.projectId, controller.signal)
      if (!current()) return
      scope.intent = null
      setRenameView(restart ? { open: true, name: resource.name, status: "idle", problem: null }
        : { open: false, name: "", status: "idle", problem: null })
    } catch (error) {
      if (!current()) return
      if ((error instanceof ProjectRenameError || error instanceof ProjectReadError) && (error.status === 401 || error.status === 403)) {
        scope.intent = null
        scope.revoked = true
        setRenameView({ open: true, name: "", status: "error", problem: "permission" })
      } else if (scope.intent?.readOnly || scope.intent?.ack) {
        setRenameView({ open: true, name: retained.rawInput, status: "read-error", problem: "read" })
      } else {
        const uncertain = !(error instanceof ProjectRenameError) || error.status === undefined || error.status >= 500 || error.status === 429
        setRenameView({ open: true, name: retained.rawInput, status: uncertain ? "unknown" : "error", problem: uncertain ? "unknown" : "rejected" })
      }
    } finally {
      controller.abort()
      if (scope.controller === controller) scope.controller = null
      scope.busy = false
    }
  }, [projectRef, refreshRenamedProject, renameContext, setRenameView])
  const openRename = useCallback(() => {
    const scope = renameScopeRef.current
    if (!renameAvailable || !scope?.active || scope.context !== renameContext || scope.busy) return
    scope.route = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const retained = scope.intent
    setRenameView(retained ? { open: true, name: retained.rawInput, status: retained.readOnly ? "read-error" : "unknown",
      problem: retained.readOnly ? "read" : "unknown" } : { open: true, name: projectDetail.status === "ready" ? projectDetail.data.name : "", status: "idle", problem: null })
  }, [projectDetail, renameAvailable, renameContext, setRenameView])
  const projectRename: ProjectRenameControl = {
    focusScopeToken: renameContext,
    available: renameAvailable,
    ...renameView,
    onOpen: openRename,
    onClose: () => {
      const scope = renameScopeRef.current
      if (!scope?.active || scope.context !== renameContext || scope.busy) return
      if (window.location.hash === "#rename") {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`)
        scope.route = `${window.location.pathname}${window.location.search}`
      }
      setRenameView(scope.intent ? { ...renameView, open: false } : { open: false, name: "", status: "idle", problem: scope.revoked ? "permission" : null })
    },
    onChange: (name) => {
      const scope = renameScopeRef.current
      if (!scope?.active || scope.context !== renameContext || scope.busy || scope.intent || scope.revoked) return
      setRenameView({ open: true, name, status: "idle", problem: null })
    },
    onSave: () => {
      const scope = renameScopeRef.current
      if (!renameAvailable || !scope?.active || scope.context !== renameContext || scope.busy || scope.intent || !projectRef) return
      if (window.location.pathname !== `/app/project/${projectRef}`) return
      const parsed = projectRenameRequestSchema.safeParse({ name: renameView.name })
      if (!parsed.success) { setRenameView({ ...renameView, status: "error", problem: "invalid" }); return }
      const command = Object.freeze({ projectId: projectRef, name: parsed.data.name,
        idempotencyKey: crypto.randomUUID(), body: JSON.stringify(parsed.data) })
      scope.intent = { command, rawInput: renameView.name, route: `${window.location.pathname}${window.location.search}${window.location.hash}`, ack: false, readOnly: false }
      void runRename(false)
    },
    onRetry: () => {
      const scope = renameScopeRef.current
      if (scope?.context === renameContext && scope.intent) void runRename(scope.intent.ack || scope.intent.readOnly)
    },
    onRestart: () => {
      const scope = renameScopeRef.current
      if (!scope?.active || scope.context !== renameContext || !scope.intent || scope.busy) return
      scope.intent.readOnly = true
      void runRename(true, true)
    },
  }
  const requestProjectRename = useCallback((target: string) => {
    if (preview || !projectRenameIdSchema.safeParse(target).success) return
    navigateMountedSurface(`/app/project/${encodeURIComponent(target)}#rename`)
  }, [preview])
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#rename" || !renameAvailable || renameView.open) return
    openRename()
  }, [openRename, renameAvailable, renameView.open])

  // A menu handoff is document-local and expires with admission or navigation.
  // It never copies instructions or survives a different actor's lifetime.
  const instructionEntryContext = useMemo(() => ({ mounted, preview, instructionsEnabled,
    admitted: renameBoundary?.admitted, subject: renameBoundary?.subject, generation: renameBoundary?.generation }), [mounted, preview, instructionsEnabled,
    renameBoundary?.admitted, renameBoundary?.subject, renameBoundary?.generation])
  type InstructionEntryScope = { context: object; active: boolean; request: ProjectInstructionRequest | null; route: string | null }
  const instructionTriggerRef = useRef<HTMLButtonElement | null>(null)
  const instructionEntryScopeRef = useRef<InstructionEntryScope | null>(null)
  const [instructionEntry, setInstructionEntry] = useState<{ context: object; request: ProjectInstructionRequest } | null>(null)
  const instructionAccess = mounted && instructionsEnabled && (preview || renameBoundary?.admitted === true && renameBoundary.subject !== null)
  useLayoutEffect(() => {
    const scope: InstructionEntryScope = { context: instructionEntryContext, active: true, request: null, route: null }
    instructionEntryScopeRef.current = scope
    const retire = () => {
      if (scope.route === `${window.location.pathname}${window.location.search}${window.location.hash}`) return
      scope.request = null
      setInstructionEntry((current) => current?.context === scope.context ? null : current)
    }
    window.addEventListener("popstate", retire)
    window.addEventListener("kokoro:surface-navigation", retire)
    return () => {
      scope.active = false
      scope.request = null
      window.removeEventListener("popstate", retire)
      window.removeEventListener("kokoro:surface-navigation", retire)
    }
  }, [instructionEntryContext])
  const requestProjectInstructions = useCallback((target: string, returnFocus: HTMLButtonElement | null) => {
    const scope = instructionEntryScopeRef.current
    if (!instructionAccess || !target || !scope?.active || scope.context !== instructionEntryContext) return
    const route = `/app/project/${encodeURIComponent(target)}`
    const request: ProjectInstructionRequest = {
      projectRef: target,
      returnFocus: returnFocus?.isConnected ? returnFocus : null,
      fallbackFocus: () => instructionTriggerRef.current,
      isCurrent: () => scope.active && scope.request === request
        && route === `${window.location.pathname}${window.location.search}${window.location.hash}`,
      onConsumed: () => setInstructionEntry((current) => current?.request === request ? null : current),
    }
    scope.request = request
    scope.route = route
    setInstructionEntry({ context: instructionEntryContext, request })
    navigateMountedSurface(route)
  }, [instructionAccess, instructionEntryContext])
  const instructionReady = instructionAccess && projectWorkspace && projectRef !== undefined
    && (preview || projectDetail.status === "ready" && projectDetail.data.id === projectRef)
  const projectInstruction = {
    onTriggerMount: (target: HTMLButtonElement | null) => { instructionTriggerRef.current = target },
    available: instructionReady,
    onOpen: (returnFocus: HTMLButtonElement | null) => { if (instructionReady && projectRef) requestProjectInstructions(projectRef, returnFocus) },
  }
  const projectInstructionRequest = instructionReady && instructionEntry?.context === instructionEntryContext
    && instructionEntry.request.projectRef === projectRef ? instructionEntry.request : undefined

  const [previewProjection, setPreviewProjection] = useState<{ context: object; instruction: string; history: readonly ProjectInstructionRevision[] } | null>(null)
  // A read refresh cannot retire an uncertain write. Only identity, Project,
  // admission, or actual route retirement owns this command lifetime.
  const [instructionRouteEpoch, setInstructionRouteEpoch] = useState(0)
  const instructionCommandContext = useMemo(() => ({ instructionEntryContext, projectRef, projectWorkspace, instructionRouteEpoch }),
    [instructionEntryContext, projectRef, projectWorkspace, instructionRouteEpoch])
  type InstructionIntent = { projectRef: string; instruction: string; key: string; acknowledged: boolean }
  const saveScopeRef = useRef<{ context: object; active: boolean; busy: boolean; revoked: boolean;
    intent: InstructionIntent | null; controllers: Set<AbortController> } | null>(null)
  useLayoutEffect(() => {
    const scope = { context: instructionCommandContext, active: true, busy: false, revoked: false,
      intent: null as InstructionIntent | null, controllers: new Set<AbortController>() }
    saveScopeRef.current = scope
    const route = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const retire = () => {
      if (!scope.active || route === `${window.location.pathname}${window.location.search}${window.location.hash}`) return
      scope.active = false
      scope.intent = null
      for (const controller of scope.controllers) controller.abort()
      setInstructionRouteEpoch((value) => value + 1)
    }
    window.addEventListener("popstate", retire)
    window.addEventListener("kokoro:surface-navigation", retire)
    return () => {
      scope.active = false
      scope.intent = null
      for (const controller of scope.controllers) controller.abort()
      scope.controllers.clear()
      window.removeEventListener("popstate", retire)
      window.removeEventListener("kokoro:surface-navigation", retire)
    }
  }, [instructionCommandContext])
  const projectInstructions = preview
    ? previewProjection?.context === instructionContext ? previewProjection.instruction : ""
    : projectDetail.status === "ready" ? projectDetail.data.instruction ?? "" : ""
  const projectInstructionHistory = useMemo<readonly ProjectInstructionRevision[]>(() => preview
    ? previewProjection?.context === instructionContext ? previewProjection.history : []
    : instructionHistory.status === "ready" ? instructionHistory.data.map((item) => ({
      id: item.id, instruction: item.instruction, updatedAt: Date.parse(item.updated_at), actorName: item.actor_name, current: item.current,
    })) : [], [preview, previewProjection, instructionContext, instructionHistory])
  const [projectCreation, setProjectCreation] = useState<ProjectCreationState>({ pending: false, error: false, retryable: false })
  const creationIntentRef = useRef<ProjectCreationIntent | null>(null)
  const creationInFlightRef = useRef<{ intent: ProjectCreationIntent; controller: AbortController } | null>(null)
  const creationLiveRef = useRef(false)
  const createdProjectRef = useRef<string | null>(null)
  const latestDraftRef = useRef(draft)
  const lastDirectDraftRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    const intent = creationIntentRef.current
    if (!intent || intent.subject === renameBoundary?.subject) return
    // A different actor starts a distinct lifetime, never reuses the old key.
    // Retired completions cannot release or overwrite a newer actor's flight.
    creationInFlightRef.current?.controller.abort()
    creationIntentRef.current = null
    creationInFlightRef.current = null
    createdProjectRef.current = null
    setProjectCreation({ pending: false, error: false, retryable: false })
  }, [renameBoundary?.subject])

  useLayoutEffect(() => {
    creationLiveRef.current = true
    return () => {
      creationLiveRef.current = false
      creationInFlightRef.current?.controller.abort()
    }
  }, [])

  useEffect(() => {
    latestDraftRef.current = draft
  }, [draft])

  useEffect(() => {
    if (!projectWorkspace) lastDirectDraftRef.current = draft
  }, [draft, projectWorkspace])

  useEffect(() => {
    // Direct Chat → project is a mounted route handoff, so the direct
    // session's draft has no stable project session id yet. Carry it through
    // a one-shot sessionStorage envelope, then let the project-scoped draft
    // controller persist it under the new session id. Existing project drafts
    // always win; a stale envelope is consumed either way.
    if (!mounted || !projectWorkspace || !projectRef) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      const handoffDraft = takePendingProjectDraft(projectRef)
      // The one-shot envelope is the explicit source selected by the user. It
      // must win over a stale route-neutral draft left by a previous creation
      // capsule; otherwise a new project can reopen with the website fixture
      // prompt instead of the text the user just entered.
      if (handoffDraft !== null) updateDraft(handoffDraft)
      else if (!draft && lastDirectDraftRef.current) {
        // The existing-project rail link has no explicit envelope. Preserve
        // its historical Direct Chat → project draft handoff without making
        // the two route-neutral composer keys the same storage fact.
        updateDraft(lastDirectDraftRef.current)
      }
      lastDirectDraftRef.current = null
    })
    return () => {
      active = false
    }
  }, [draft, mounted, projectRef, projectWorkspace, updateDraft])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active || !preview || !projectRef) return
      const value = window.localStorage.getItem(`kokoro.preview.project.${projectRef}.instructions`) ?? ""
      const historyValue = window.localStorage.getItem(`kokoro.preview.project.${projectRef}.instruction-history`)
      let history: ProjectInstructionRevision[] = []
      if (historyValue) {
        try {
          const parsed = JSON.parse(historyValue)
          if (Array.isArray(parsed)) history = parsed
        } catch { history = [] }
      }
      if (history.length === 0 && value) {
        history = [{ id: "preview-current", instruction: value, updatedAt: Date.now(), actorName: t("firstSite.you"), current: true }]
      }
      setPreviewProjection({ context: instructionContext, instruction: value, history })
    })
    return () => { active = false }
  }, [preview, projectRef, instructionContext, t])

  const saveProjectInstructions = useCallback(async (instructions: string): Promise<void> => {
    const saveScope = saveScopeRef.current
    if (!saveScope?.active || saveScope.context !== instructionCommandContext || !projectRef) throw new DOMException("Aborted", "AbortError")
    if (preview) {
      window.localStorage.setItem(`kokoro.preview.project.${projectRef}.instructions`, instructions)
      const revision: ProjectInstructionRevision = { id: crypto.randomUUID(), instruction: instructions, updatedAt: Date.now(), actorName: t("firstSite.you"), current: true }
      const history = [revision, ...projectInstructionHistory.map((item) => ({ ...item, current: false }))]
      window.localStorage.setItem(`kokoro.preview.project.${projectRef}.instruction-history`, JSON.stringify(history))
      setPreviewProjection({ context: instructionContext, instruction: instructions, history })
      return
    }
    if (projectDetail.status !== "ready" || projectDetail.data.id !== projectRef
      || renameBoundary !== undefined && (!renameBoundary.admitted || renameBoundary.subject === null)) throw new Error("project_not_available")
    if (saveScope.revoked) throw new ProjectInstructionSaveError("forbidden", instructions)
    if (saveScope.busy) throw new DOMException("Operation pending", "AbortError")
    // Retain the original bytes and identity even if a caller presents new text.
    let intent = saveScope.intent ?? { projectRef, instruction: instructions,
      key: `project-instructions:${projectRef}:${crypto.randomUUID()}`, acknowledged: false }
    saveScope.intent = intent
    saveScope.busy = true
    const controller = new AbortController()
    saveScope.controllers.add(controller)
    const current = () => saveScope.active && saveScopeRef.current === saveScope && !controller.signal.aborted
    try {
      if (!intent.acknowledged) {
        await updateProjectInstructions(intent.projectRef, intent.instruction, intent.key, controller.signal)
        if (!current()) throw new DOMException("Aborted", "AbortError")
        intent = { ...intent, acknowledged: true }
        saveScope.intent = intent
      }
      // A known ACK never writes again, including after a failed owner read.
      await getProject(intent.projectRef, controller.signal)
      if (!current()) throw new DOMException("Aborted", "AbortError")
      await listProjectInstructionRevisions(intent.projectRef, controller.signal)
      if (!current()) throw new DOMException("Aborted", "AbortError")
      refreshProject()
      saveScope.intent = null
      return
    } catch (error) {
      if (!current()) throw new DOMException("Aborted", "AbortError")
      if (error instanceof ProjectReadError && (error.status === 401 || error.status === 403)) {
        saveScope.revoked = true
        saveScope.intent = null
        throw new ProjectInstructionSaveError("forbidden", intent.instruction)
      }
      if (intent.acknowledged) throw new ProjectInstructionSaveError("read-error", intent.instruction)
      if (error instanceof ProjectReadError && error.reason === "http" &&
        (error.status === 400 || error.status === 404)) {
        saveScope.intent = null
        throw new ProjectInstructionSaveError("rejected", intent.instruction)
      }
      // A bare 409 can mean idempotency_in_progress, not a rejected mutation.
      // The existing reader does not expose its code: preserve the exact intent.
      throw new ProjectInstructionSaveError("unknown", intent.instruction)
    } finally {
      saveScope.busy = false
      saveScope.controllers.delete(controller)
      controller.abort()
    }
  }, [preview, projectRef, t, projectDetail, projectInstructionHistory, instructionContext, instructionCommandContext, refreshProject, renameBoundary])

  const uploadProjectResource = useCallback(async (file: File, idempotencyKey: string) => {
    if (!projectRef) throw new ProjectResourceUploadError("project_not_selected", false)
    return uploadProjectResourceRequest(projectRef, file, idempotencyKey)
  }, [projectRef])

  const listProjectResources = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    if (!projectRef) throw new Error("project_not_selected")
    return listProjectResourcesRequest(projectRef, cursor, signal)
  }, [projectRef])

  const openProject = useCallback((nextProjectRef: string, handoffDraft?: string) => {
    const projectRefToOpen = nextProjectRef
    writePendingProjectDraft(projectRefToOpen, handoffDraft)
    // A project without a conversation has its own draft key. Clear the
    // direct source only if it is still the draft handed off by this intent;
    // a newer B edit must remain available when returning to Direct Chat.
    if (handoffDraft === undefined || latestDraftRef.current === handoffDraft) {
      clearDraft()
      clearPendingDraft()
    }
    if (onOpenProject) {
      onOpenProject(projectRefToOpen, handoffDraft)
      return
    }
    navigateMountedSurface(`/app/project/${encodeURIComponent(projectRefToOpen)}`)
  }, [clearDraft, onOpenProject])

  const finishProjectNavigation = useCallback((intent: ProjectCreationIntent) => {
    const projectId = createdProjectRef.current
    if (projectId === null || creationIntentRef.current !== intent) return
    const currentScope = renameScopeRef.current
    const route = `${window.location.pathname}${window.location.search}${window.location.hash}`
    // Route/context cleanup permanently revokes the original navigation token,
    // including A → Q → A. A known owner success never recreates that authority.
    if (!currentScope?.active || !intent.navigationScope.active || currentScope !== intent.navigationScope ||
      currentScope.context.subject !== intent.subject || route !== intent.route) {
      createdProjectRef.current = null
      creationIntentRef.current = null
      if (currentScope?.active) setProjectCreation({ pending: false, error: false, retryable: false })
      return
    }
    try {
      openProject(projectId, intent.draft)
      createdProjectRef.current = null
      creationIntentRef.current = null
      setProjectCreation({ pending: false, error: false, retryable: false })
    } catch {
      // The owner mutation succeeded. A navigation retry must use its returned
      // identity, never issue another POST or abandon the original draft.
      setProjectCreation({ pending: false, error: true, retryable: true })
    }
  }, [openProject])

  const runCreateProject = useCallback(async (intent: ProjectCreationIntent) => {
    if (creationInFlightRef.current) return
    const scope = renameScopeRef.current
    if (!scope?.active || scope.context.subject !== intent.subject || scope.context.admitted === false) return
    const flight = { intent, controller: new AbortController() }
    creationInFlightRef.current = flight
    const current = () => {
      const active = renameScopeRef.current
      return creationLiveRef.current && active?.context.subject === intent.subject
        && creationIntentRef.current === intent && creationInFlightRef.current === flight
    }
    setProjectCreation({ pending: true, error: false, retryable: false })
    try {
      const project = await createProjectRequest(intent.name, intent.key, flight.controller.signal)
      if (!current()) return
      // A temporary same-subject pause cannot authorize a projection. Retain
      // the original key conservatively for explicit recovery, never a new POST.
      if (renameScopeRef.current?.context.admitted === false) {
        setProjectCreation({ pending: false, error: true, retryable: true })
        return
      }
      createdProjectRef.current = project.id
    } catch (error) {
      if (!current()) return
      const retryable = renameScopeRef.current?.context.admitted === false || !(error instanceof ProjectCreateError)
        || error.status === undefined || error.status >= 500 || error.status === 429
        || error.code === "project_create_invalid_response"
        || (error.status === 409 && error.code === "idempotency_in_progress")
      if (!retryable) creationIntentRef.current = null
      setProjectCreation({ pending: false, error: true, retryable })
      return
    } finally {
      if (creationInFlightRef.current === flight) creationInFlightRef.current = null
    }
    const currentScope = renameScopeRef.current
    // Refresh the current owner's collection independently of navigation.
    // Old-account and disposed completions have no projection write authority.
    if (currentScope?.active && currentScope.context.subject === intent.subject && currentScope.context.admitted !== false) {
      try { onProjectCreated?.() } catch { /* Owner success is not an unknown POST outcome. */ }
    }
    finishProjectNavigation(intent)
  }, [finishProjectNavigation, onProjectCreated])

  const createProject = useCallback((input: Readonly<{ name?: string; draft?: string }> = {}) => {
    const handoffDraft = input.draft ?? draft
    if (creationInFlightRef.current) return
    if (preview) {
      openProject(createPreviewProjectRef(), handoffDraft)
      return
    }
    // An uncertain owner outcome cannot be converted into a fresh mutation by
    // reopening rail or welcome: both are retry affordances for this intent.
    const unresolvedIntent = creationIntentRef.current
    if (unresolvedIntent) {
      if (createdProjectRef.current === null) void runCreateProject(unresolvedIntent)
      else finishProjectNavigation(unresolvedIntent)
      return
    }
    const scope = renameScopeRef.current
    if (!scope?.active || scope.context.admitted === false) return
    const key = crypto.randomUUID()
    const suppliedName = input.name?.trim()
    const intent: ProjectCreationIntent = { key, name: suppliedName || `${t("firstSite.newProject")} ${key.slice(0, 8)}`, draft: handoffDraft,
      route: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      subject: scope.context.subject, navigationScope: scope }
    creationIntentRef.current = intent
    void runCreateProject(intent)
  }, [draft, finishProjectNavigation, openProject, preview, runCreateProject, t])

  const retryProjectCreation = useCallback(() => {
    const intent = creationIntentRef.current
    if (intent && !creationInFlightRef.current) {
      if (createdProjectRef.current === null) void runCreateProject(intent)
      else finishProjectNavigation(intent)
    }
  }, [finishProjectNavigation, runCreateProject])

  return {
    projectRename,
    projectInstruction,
    projectInstructionRequest,
    requestProjectInstructions,
    instructionAccess,
    projectInstructions,
    projectInstructionHistory,
    saveProjectInstructions,
    uploadProjectResource,
    listProjectResources,
    openProject,
    createProject,
    requestProjectRename,
    projectCreation,
    retryProjectCreation,
  }
}
