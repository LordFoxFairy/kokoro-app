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
import { updateProjectInstructions } from "@/features/app/project-list"
import type { ProjectInstructionRevision } from "./app-frame.types"

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
  const projectRename: ProjectRenameControl = {
    focusScopeToken: renameContext,
    available: renameAvailable,
    ...renameView,
    onOpen: () => {
      const scope = renameScopeRef.current
      if (!renameAvailable || !scope?.active || scope.context !== renameContext || scope.busy) return
      scope.route = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const retained = scope.intent
      setRenameView(retained ? { open: true, name: retained.rawInput, status: retained.readOnly ? "read-error" : "unknown",
        problem: retained.readOnly ? "read" : "unknown" } : { open: true, name: projectDetail.status === "ready" ? projectDetail.data.name : "", status: "idle", problem: null })
    },
    onClose: () => {
      const scope = renameScopeRef.current
      if (!scope?.active || scope.context !== renameContext || scope.busy) return
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
  const [previewProjection, setPreviewProjection] = useState<{ context: object; instruction: string; history: readonly ProjectInstructionRevision[] } | null>(null)
  const saveScopeRef = useRef<{ context: object; active: boolean; controllers: Set<AbortController> } | null>(null)
  useLayoutEffect(() => {
    const scope = { context: instructionContext, active: true, controllers: new Set<AbortController>() }
    saveScopeRef.current = scope
    return () => {
      scope.active = false
      for (const controller of scope.controllers) controller.abort()
      scope.controllers.clear()
    }
  }, [instructionContext])
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

  const saveProjectInstructions = useCallback(async (instructions: string) => {
    const saveScope = saveScopeRef.current
    if (!saveScope?.active || saveScope.context !== instructionContext || !projectRef) throw new DOMException("Aborted", "AbortError")
    if (preview) {
      window.localStorage.setItem(`kokoro.preview.project.${projectRef}.instructions`, instructions)
      const revision: ProjectInstructionRevision = { id: crypto.randomUUID(), instruction: instructions, updatedAt: Date.now(), actorName: t("firstSite.you"), current: true }
      const history = [revision, ...projectInstructionHistory.map((item) => ({ ...item, current: false }))]
      window.localStorage.setItem(`kokoro.preview.project.${projectRef}.instruction-history`, JSON.stringify(history))
      setPreviewProjection({ context: instructionContext, instruction: instructions, history })
      return
    }
    if (projectDetail.status !== "ready") throw new Error("project_not_available")
    const controller = new AbortController()
    saveScope.controllers.add(controller)
    try {
      await updateProjectInstructions(projectRef, instructions, `project-instructions:${projectRef}:${crypto.randomUUID()}`, controller.signal)
      if (!saveScope.active || controller.signal.aborted) throw new DOMException("Aborted", "AbortError")
      // Only the current owner GET supplies instruction/history after an ACK.
      refreshProject()
    } finally { saveScope.controllers.delete(controller) }
  }, [preview, projectRef, t, projectDetail, projectInstructionHistory, instructionContext, refreshProject])

  const uploadProjectResource = useCallback(async (file: File, idempotencyKey: string) => {
    if (!projectRef) throw new ProjectResourceUploadError("project_not_selected", false)
    return uploadProjectResourceRequest(projectRef, file, idempotencyKey)
  }, [projectRef])

  const listProjectResources = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    if (!projectRef) throw new Error("project_not_selected")
    return listProjectResourcesRequest(projectRef, cursor, signal)
  }, [projectRef])

  const setProjectSkillEnabled = useCallback(async (skill: string, enabled: boolean) => {
    if (!projectRef) return
    const response = await fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}/skills/${encodeURIComponent(skill)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "Idempotency-Key": `project-skill:${projectRef}:${skill}:${crypto.randomUUID()}` },
      body: JSON.stringify({ enabled }),
    })
    if (!response.ok) throw new Error(`project_skill_update_failed:${response.status}`)
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

  const createProject = useCallback((handoffDraft = draft) => {
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
    const intent: ProjectCreationIntent = { key, name: `${t("firstSite.newProject")} ${key.slice(0, 8)}`, draft: handoffDraft,
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
    projectInstructions,
    projectInstructionHistory,
    saveProjectInstructions,
    uploadProjectResource,
    listProjectResources,
    setProjectSkillEnabled,
    openProject,
    createProject,
    projectCreation,
    retryProjectCreation,
  }
}
