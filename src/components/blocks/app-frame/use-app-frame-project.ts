import { useCallback, useEffect, useState } from "react"

import { useT } from "@/i18n/context"
import { navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"
import { clearPendingDraft } from "@/ui/shell/use-draft"

import {
  createPreviewProjectRef,
  takePendingProjectDraft,
  writePendingProjectDraft,
} from "./app-frame-helpers"
import type { ProjectInstructionRevision, ProjectScheduledTaskInput } from "./app-frame.types"

export type AppFrameProjectOptions = {
  projectRef: string | undefined
  projectWorkspace: boolean
  preview: boolean
  mounted: boolean
  draft: string
  updateDraft: (value: string) => void
  clearDraft: () => void
  onOpenProject?: (projectRef: string, draft?: string) => void
}

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
}: AppFrameProjectOptions) {
  const t = useT()
  const [projectInstructions, setProjectInstructions] = useState("")
  const [projectInstructionHistory, setProjectInstructionHistory] = useState<readonly ProjectInstructionRevision[]>([])

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
    })
    return () => {
      active = false
    }
  }, [draft, mounted, projectRef, projectWorkspace, updateDraft])

  useEffect(() => {
    let active = true
    const load = async () => {
      await Promise.resolve()
      if (!projectRef) {
        if (active) setProjectInstructions("")
        if (active) setProjectInstructionHistory([])
        return
      }
      if (preview) {
        const value = window.localStorage.getItem(`kokoro.preview.project.${projectRef}.instructions`) ?? ""
        const historyValue = window.localStorage.getItem(`kokoro.preview.project.${projectRef}.instruction-history`)
        let history: ProjectInstructionRevision[] = []
        if (historyValue) {
          try {
            const parsed = JSON.parse(historyValue)
            if (Array.isArray(parsed)) history = parsed
          } catch {
            history = []
          }
        }
        if (history.length === 0 && value) {
          history = [{ id: "preview-current", instruction: value, updatedAt: Date.now(), actorName: t("firstSite.you"), current: true }]
        }
        if (active) setProjectInstructions(value)
        if (active) setProjectInstructionHistory(history)
        return
      }
      try {
        const [response, historyResponse] = await Promise.all([
          fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}`, { cache: "no-store" }),
          fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}/instruction-revisions`, { cache: "no-store" }),
        ])
        if (!response.ok) return
        const payload = await response.json() as {
          data?: { instruction?: unknown; project?: { instruction?: unknown } }
          instruction?: unknown
          project?: { instruction?: unknown }
        }
        const projection = payload.data ?? payload
        const value = projection.instruction ?? projection.project?.instruction
        if (active && typeof value === "string") setProjectInstructions(value)
        if (historyResponse.ok) {
          const historyPayload = await historyResponse.json() as { data?: { items?: unknown }; items?: unknown }
          const historyProjection = historyPayload.data ?? historyPayload
          if (active && Array.isArray(historyProjection.items)) {
            setProjectInstructionHistory(historyProjection.items as ProjectInstructionRevision[])
          }
        }
      } catch {
        // Mutation errors remain visible in the editor; a failed read keeps
        // the empty projection instead of inventing project instructions.
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [preview, projectRef, t])

  const saveProjectInstructions = useCallback(async (instructions: string) => {
    if (!projectRef) return
    if (preview) {
      window.localStorage.setItem(`kokoro.preview.project.${projectRef}.instructions`, instructions)
      const revision: ProjectInstructionRevision = { id: crypto.randomUUID(), instruction: instructions, updatedAt: Date.now(), actorName: t("firstSite.you"), current: true }
      setProjectInstructionHistory((current) => {
        const next = [revision, ...current.map((item) => ({ ...item, current: false }))]
        window.localStorage.setItem(`kokoro.preview.project.${projectRef}.instruction-history`, JSON.stringify(next))
        return next
      })
      setProjectInstructions(instructions)
      return
    }
    const response = await fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "Idempotency-Key": `project-instructions:${projectRef}:${crypto.randomUUID()}` },
      body: JSON.stringify({ instruction: instructions }),
    })
    if (!response.ok) throw new Error(`project_instruction_update_failed:${response.status}`)
    const revision: ProjectInstructionRevision = { id: crypto.randomUUID(), instruction: instructions, updatedAt: Date.now(), actorName: t("firstSite.you"), current: true }
    setProjectInstructionHistory((current) => [revision, ...current.map((item) => ({ ...item, current: false }))])
    setProjectInstructions(instructions)
  }, [preview, projectRef, t])

  const uploadProjectResources = useCallback(async (files: FileList) => {
    if (!projectRef || files.length === 0) return
    const body = new FormData()
    for (const file of Array.from(files)) body.append("files", file)
    const response = await fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}/resources`, {
      method: "POST",
      headers: { "Idempotency-Key": `project-resources:${projectRef}:${crypto.randomUUID()}` },
      body,
    })
    if (!response.ok) throw new Error(`project_resource_upload_failed:${response.status}`)
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

  const createProjectScheduledTask = useCallback(async (task: ProjectScheduledTaskInput) => {
    if (!projectRef) return
    const response = await fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}/scheduled-tasks`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": `project-scheduled:${projectRef}:${crypto.randomUUID()}` },
      body: JSON.stringify({
        title: task.title,
        prompt: task.prompt,
        frequency: task.frequency,
        time: task.time,
        expires_at: task.expiresAt,
        auto_approve: task.autoApprove,
      }),
    })
    if (!response.ok) throw new Error(`project_scheduled_task_create_failed:${response.status}`)
  }, [projectRef])

  const openProject = useCallback((nextProjectRef: string, handoffDraft?: string) => {
    // The preview adapter has no project-create endpoint. A fixed fixture ref
    // made the rail + appear inert after the first click because the browser
    // was already on the same route and any existing fixture draft won over
    // the handoff. Allocate a fresh opaque ref for every explicit “new
    // project” action; real hosts can still inject onOpenProject with their
    // server-created ref.
    const projectRefToOpen = nextProjectRef === "preview-project"
      ? createPreviewProjectRef()
      : nextProjectRef
    writePendingProjectDraft(projectRefToOpen, handoffDraft)
    // The direct inbox and the project overview intentionally share the
    // pending draft key until a project-scoped session exists. Clear that
    // source key before the mounted route transition, otherwise the project
    // handoff effect sees the old draft and refuses to apply the one-shot
    // project envelope. The envelope remains in sessionStorage if navigation
    // is interrupted and is consumed by the destination route.
    clearDraft()
    clearPendingDraft()
    if (onOpenProject) {
      onOpenProject(projectRefToOpen, handoffDraft)
      return
    }
    navigateMountedSurface(`/app/project/${encodeURIComponent(projectRefToOpen)}`)
  }, [clearDraft, onOpenProject])

  const createProject = useCallback(() => {
    openProject("preview-project", draft)
  }, [draft, openProject])

  return {
    projectInstructions,
    projectInstructionHistory,
    saveProjectInstructions,
    uploadProjectResources,
    setProjectSkillEnabled,
    createProjectScheduledTask,
    openProject,
    createProject,
  }
}
