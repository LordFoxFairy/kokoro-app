"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/i18n/context"
import { createTeamClient, type TeamMember } from "@/team/client"
import { projectAccessCall, ProjectAccessError, type ProjectGrant } from "@/features/app/project-access-client"
import {
  loadProjectGrantCommand,
  saveProjectGrantCommand,
  clearProjectGrantCommand,
  type ProjectGrantIntent,
  type ProjectGrantScope,
} from "@/features/app/project-grant-command"
import type { ProjectAccessModel } from "@/features/app/use-project-access"

/** URL locates a Project. Only a committed owner grant shares its data. */
export function WorkspaceHeaderProjectShare({ model }: { model?: ProjectAccessModel | undefined }) {
  const t = useT(),
    tenant = model?.boundary?.tenant,
    subject = model?.boundary?.subject,
    projectId = model?.projectId
  const scope = useMemo(() => (tenant && subject && projectId ? { tenant, subject, projectId } : null), [tenant, subject, projectId])
  if (!model || !scope || !model.boundary?.admitted)
    return (
      <Button variant="ghost" size="sm" disabled>
        {t("share.button")}
      </Button>
    )
  return <ProjectShareWorkspace key={JSON.stringify([tenant, subject, projectId, model.boundary.generation])} model={model} scope={scope} />
}
function ProjectShareWorkspace({ model, scope }: { model: ProjectAccessModel; scope: ProjectGrantScope }) {
  const t = useT(),
    owner = model.access?.role === "owner",
    context = model.context
  const [open, setOpen] = useState(false),
    [subject, setSubject] = useState(""),
    [role, setRole] = useState<"viewer" | "editor">("viewer")
  const [expiry, setExpiry] = useState(""),
    [problem, setProblem] = useState(false),
    [busy, setBusy] = useState(false)
  const [intent, setIntent] = useState<ProjectGrantIntent | null>(null)
  const readKey = useMemo(() => ({ context, open, owner }), [context, open, owner])
  const [result, setResult] = useState<{ key: typeof readKey; members: TeamMember[]; grants: ProjectGrant[]; error: boolean } | null>(null)
  const live = useRef<object | null>(context),
    command = useRef<AbortController | null>(null)
  useEffect(() => {
    live.current = context
    return () => {
      live.current = null
      command.current?.abort()
    }
  }, [context])
  useEffect(() => {
    if (!open || !owner) return
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 10000)
    let current = true
    const active = () => current && !controller.signal.aborted && live.current === context
    void Promise.resolve()
      .then(async () => {
        const restored = loadProjectGrantCommand(window.sessionStorage, scope)
        if (active()) setIntent(restored)
        const client = createTeamClient(),
          members: TeamMember[] = [],
          grants: ProjectGrant[] = []
        const memberIds = new Set<string>(),
          grantIds = new Set<string>()
        let cursor: string | undefined
        for (let page = 0; page < 20; page++) {
          const next = await client.listMembers({ limit: 100, ...(cursor ? { cursor } : {}), signal: controller.signal })
          controller.signal.throwIfAborted()
          for (const member of next.items) {
            if (memberIds.has(member.user_id)) throw Error("duplicate_member")
            memberIds.add(member.user_id)
            if (member.user_id !== scope.subject) members.push(member)
          }
          if (next.nextCursor === null) break
          if (next.nextCursor === cursor || page === 19) throw Error("member_page_budget")
          cursor = next.nextCursor
        }
        cursor = undefined
        for (let page = 0; page < 20; page++) {
          const next = await projectAccessCall(scope.projectId, "list", controller.signal, undefined, cursor)
          if (!Array.isArray(next.data) || !("next_cursor" in next.meta)) throw Error("invalid_grant_page")
          for (const grant of next.data) {
            if (grantIds.has(grant.subject_id)) throw Error("duplicate_grant")
            grantIds.add(grant.subject_id)
            grants.push(grant)
          }
          if (next.meta.next_cursor === null) break
          if (next.meta.next_cursor === cursor || page === 19) throw Error("grant_page_budget")
          cursor = next.meta.next_cursor
        }
        if (active()) setResult({ key: readKey, members, grants, error: false })
      })
      .catch(() => {
        if (current && live.current === context) setResult({ key: readKey, members: [], grants: [], error: true })
      })
      .finally(() => clearTimeout(timer))
    return () => {
      current = false
      controller.abort()
      clearTimeout(timer)
    }
  }, [open, owner, context, readKey, scope])
  const visible = result?.key === readKey ? result : null,
    ready = visible !== null && !visible.error
  const members = visible?.members ?? [],
    grants = visible?.grants ?? []
  const execute = async (frozen: ProjectGrantIntent) => {
    if (!model.isCurrent() || !owner || busy || command.current !== null || live.current !== context) return
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 10000)
    command.current = controller
    setBusy(true)
    setProblem(false)
    let dispatched = false,
      previouslyAttempted = true
    const active = () => !controller.signal.aborted && live.current === context && model.isCurrent()
    try {
      const previous = loadProjectGrantCommand(window.sessionStorage, scope)
      if (previous?.phase === "rejected") return
      previouslyAttempted = previous?.phase === "attempted"
      const attempted = { ...frozen, phase: "attempted" as const }
      saveProjectGrantCommand(window.sessionStorage, scope, attempted)
      if (!active()) return
      setIntent(attempted)
      dispatched = true
      await projectAccessCall(scope.projectId, frozen.operation, controller.signal, frozen)
      if (!active()) return
      clearProjectGrantCommand(window.sessionStorage, scope, frozen)
      setIntent(null)
      model.refresh()
    } catch (error) {
      if (active()) {
        if (
          dispatched &&
          !previouslyAttempted &&
          error instanceof ProjectAccessError &&
          ((error.status === 400 && error.code === "invalid_project_grant_request") ||
            (error.status === 404 && error.code === "project_not_found") ||
            (error.status === 409 && ["project_access_version_conflict", "project_grantee_not_eligible"].includes(error.code ?? "")))
        ) {
          try {
            const rejected = { ...frozen, phase: "rejected" as const }
            saveProjectGrantCommand(window.sessionStorage, scope, rejected)
            setIntent(rejected)
          } catch {
            /* Keep the original pending command when storage is unavailable. */
          }
        }
        setProblem(true)
      }
    } finally {
      clearTimeout(timer)
      if (command.current === controller) command.current = null
      if (live.current === context) setBusy(false)
    }
  }
  const start = (operation: "set" | "revoke", subjectId = subject) => {
    if (intent || !ready || !owner || !model.access || !subjectId) return
    const instant = expiry === "" ? null : Date.parse(expiry)
    if (instant !== null && (!Number.isFinite(instant) || instant <= Date.now())) {
      setProblem(true)
      return
    }
    const frozen: ProjectGrantIntent = {
      operation,
      subjectId,
      key: crypto.randomUUID(),
      version: model.access.access_version,
      body: { role, expires_at: instant === null ? null : new Date(instant).toISOString() },
      phase: "prepared",
    }
    try {
      saveProjectGrantCommand(window.sessionStorage, scope, frozen)
      setIntent(frozen)
      void execute(frozen)
    } catch {
      setProblem(true)
    }
  }
  const finish = () => {
    if (intent?.phase !== "rejected" || !model.isCurrent()) return
    try {
      clearProjectGrantCommand(window.sessionStorage, scope, intent)
      setIntent(null)
      setProblem(false)
      model.refresh()
    } catch {
      setProblem(true)
    }
  }
  const field = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={!owner}
        onClick={() => {
          setProblem(false)
          setOpen(true)
        }}
      >
        {t("share.button")}
      </Button>
      <Dialog open={open && owner} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
          <DialogTitle>{t("share.projectTitle")}</DialogTitle>
          <p>{t("projectAccess.hint")}</p>
          {problem || visible?.error ? (
            <p role="alert">{t("projectAccess.unavailable")}</p>
          ) : !ready ? (
            <p role="status">{t("mcp.loading")}</p>
          ) : null}
          <div className="grid min-w-0 gap-4">
            <label className="grid min-w-0 gap-2">
              {t("projectAccess.member")}
              <select
                className={field}
                value={subject}
                disabled={!ready || busy || intent !== null}
                onChange={(event) => setSubject(event.target.value)}
              >
                <option value="">—</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.display_name || member.user_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-2">
              {t("projectAccess.role")}
              <select
                className={field}
                value={role}
                disabled={busy || intent !== null}
                onChange={(event) => setRole(event.target.value as "viewer" | "editor")}
              >
                <option value="viewer">{t("projectAccess.viewer")}</option>
                <option value="editor">{t("projectAccess.editor")}</option>
              </select>
            </label>
            <label className="grid min-w-0 gap-2">
              {t("projectAccess.expiry")}
              <input
                className={field}
                type="datetime-local"
                value={expiry}
                disabled={busy || intent !== null}
                onChange={(event) => setExpiry(event.target.value)}
              />
            </label>
            <Button disabled={!ready || !subject || busy || intent !== null} onClick={() => start("set")}>
              {t("projectAccess.grant")}
            </Button>
          </div>
          <ul className="grid min-w-0 gap-2">
            {grants.map((grant) => (
              <li key={grant.subject_id} className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 break-words">
                  {members.find((member) => member.user_id === grant.subject_id)?.display_name || grant.subject_id} ·{" "}
                  {t(`projectAccess.${grant.role}`)} · {grant.revoked_at ? t("projectAccess.revoked") : (grant.expires_at ?? "—")}
                </span>
                <Button
                  variant="ghost"
                  disabled={busy || intent !== null || grant.revoked_at !== null}
                  onClick={() => start("revoke", grant.subject_id)}
                >
                  {t("projectAccess.revoke")}
                </Button>
              </li>
            ))}
          </ul>
          {intent ? (
            <div className="grid gap-2" role="status">
              <p>{t(intent.phase === "rejected" ? "projectAccess.rejected" : "projectAccess.unknown")}</p>
              <p className="min-w-0 break-words">
                {members.find((member) => member.user_id === intent.subjectId)?.display_name || intent.subjectId} ·{" "}
                {t(`projectAccess.${intent.body.role}`)} · {intent.version}
              </p>
              <Button disabled={busy} onClick={() => (intent.phase === "rejected" ? finish() : void execute(intent))}>
                {t(intent.phase === "rejected" ? "projectAccess.finish" : "projectAccess.resume")}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
