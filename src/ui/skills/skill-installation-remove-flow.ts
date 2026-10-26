import { type SkillInstallationClient } from "@/hub/client"
import { installationReceiptMatches, personalInstallationSchema, type PersonalInstallation } from "@/hub/schemas"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

type Kind = "idle" | "selected" | "running" | "unknown" | "read_needed" | "read_failed" | "unavailable" | "completed"
export type SkillRemoveState = Readonly<{
  kind: Kind
  acknowledged: boolean
  current?: PersonalInstallation
  phase?: "read" | "remove"
}>
type Intent = {
  target: Pick<PersonalInstallation, "installation_id" | "series_id" | "source_ref" | "revision">
  key: string
  attempted: boolean
  acknowledged: boolean
}

/** One actor's in-memory installation command, never a source-series deletion. */
export function createSkillInstallationRemoveFlow(options: {
  client: Pick<SkillInstallationClient, "get" | "remove">
  boundary: ProjectReadBoundary
  key?: () => string
}) {
  const actor = options.boundary.subject, listeners = new Set<() => void>()
  let boundary = { ...options.boundary }, retired = false, leases = 0
  let intent: Intent | undefined
  let active: { controller: AbortController } | undefined
  let state: SkillRemoveState = { kind: "idle", acknowledged: false }
  const publish = (kind: Kind, current?: PersonalInstallation, phase?: "read" | "remove") => {
    state = Object.freeze({ kind, acknowledged: intent?.acknowledged === true, ...(current ? { current } : {}), ...(phase ? { phase } : {}) })
    for (const listener of listeners) listener()
  }
  const matches = (value: ProjectReadBoundary) => !retired && value.subject === boundary.subject
    && value.admitted === boundary.admitted && value.generation === boundary.generation
  const admitted = () => !retired && boundary.admitted && actor !== null && boundary.subject === actor
  const pendingKind = () => intent?.acknowledged ? "read_needed" : intent?.attempted ? "unknown" : "selected"
  const cancel = () => {
    const previous = active; active = undefined; previous?.controller.abort()
    if (previous && intent) publish(pendingKind())
  }
  const bind = (value: ProjectReadBoundary) => {
    if (retired || matches(value)) return
    boundary = { ...value }; cancel()
    if (value.subject !== actor) { retired = true; intent = undefined; publish("idle") }
    else publish(intent ? pendingKind() : "idle")
  }
  const exact = (value: PersonalInstallation, command: Intent) => value.installation_id === command.target.installation_id
    && value.series_id === command.target.series_id && value.source_ref === command.target.source_ref && value.revision === command.target.revision
  const run = async (write: boolean, value: ProjectReadBoundary) => {
    const command = intent
    if (!matches(value) || !admitted() || !command || active
      || write && !command.attempted && (state.kind !== "selected" || !state.current || !state.current.installed || !exact(state.current, command))) return
    const request = { controller: new AbortController() }; active = request
    const current = () => active === request && intent === command && admitted() && !request.controller.signal.aborted
    try {
      if (write && !command.acknowledged) {
        command.attempted = true; publish("running", undefined, "remove")
        const receipt = await options.client.remove(command.target.installation_id, command.key, request.controller.signal)
        if (!current()) return
        if (!installationReceiptMatches("remove", receipt, command.target.installation_id)
          || receipt.installation.series_id !== command.target.series_id) throw Error("skill_remove_ack_mismatch")
        command.acknowledged = true
      }
      publish("running", undefined, "read")
      const installation = await options.client.get(command.target.installation_id, request.controller.signal)
      if (!current()) return
      if (installation.installation_id !== command.target.installation_id || installation.series_id !== command.target.series_id) {
        publish(command.attempted ? command.acknowledged ? "read_failed" : "unknown" : "unavailable")
        return
      }
      // A current GET can describe a subsequent reinstall, but never proves
      // our original removal ACK. There is no invented public pin CAS.
      publish(command.acknowledged ? "completed" : command.attempted ? "unknown"
        : exact(installation, command) && installation.installed ? "selected" : "unavailable", installation)
    } catch {
      if (current()) publish(command.attempted && !command.acknowledged ? "unknown" : "read_failed")
    } finally { if (active === request) active = undefined }
  }
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => state,
    matches,
    bind,
    retain: (value: ProjectReadBoundary) => {
      if (retired) return () => {}
      leases++; bind(value)
      let released = false
      return () => {
        if (released) return
        released = true; leases--
        if (leases !== 0) return
        bind({ ...boundary, admitted: false })
        queueMicrotask(() => {
          if (leases || retired) return
          retired = true; cancel(); intent = undefined; publish("idle")
        })
      }
    },
    select: (installation: PersonalInstallation, value: ProjectReadBoundary) => {
      if (!matches(value) || !admitted() || active || intent || !personalInstallationSchema.safeParse(installation).success || !installation.installed) return false
      intent = { target: Object.freeze({ installation_id: installation.installation_id, series_id: installation.series_id,
        source_ref: installation.source_ref, revision: installation.revision }), key: (options.key ?? (() => crypto.randomUUID()))(), attempted: false, acknowledged: false }
      publish("selected"); return true
    },
    readCurrent: (value: ProjectReadBoundary) => run(false, value),
    confirm: (value: ProjectReadBoundary) => run(true, value),
    cancel: (value: ProjectReadBoundary) => { if (matches(value)) cancel() },
    reset: (value: ProjectReadBoundary) => {
      if (!matches(value) || !admitted() || active || intent?.attempted && (!intent.acknowledged || state.kind !== "completed")) return false
      intent = undefined; publish("idle"); return true
    },
  }
}
export type SkillInstallationRemoveFlow = ReturnType<typeof createSkillInstallationRemoveFlow>
