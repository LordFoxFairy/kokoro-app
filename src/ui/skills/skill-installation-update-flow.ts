import { HubClientError, type SkillInstallationClient } from "@/hub/client"
import {
  installationIdSchema,
  installationReceiptMatches,
  installationUpdateRequestSchema,
  type PersonalInstallation,
  type SkillCard,
} from "@/hub/schemas"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

type Kind =
  | "idle"
  | "selected"
  | "running"
  | "unknown"
  | "read_failed"
  | "read_needed"
  | "unavailable"
  | "completed"
export type SkillUpdateState = Readonly<{
  kind: Kind
  acknowledged: boolean
  current?: PersonalInstallation
  targetRevision?: string
  phase?: "read" | "update"
}>
type Intent = {
  readonly id: string
  readonly series: string
  readonly revision: string
  readonly body: Readonly<{ expected_source_ref: string; source_ref: string }>
  readonly key: string
  attempted: boolean
  acknowledged: boolean
}

/** In-memory, actor-owned command only. GET is never a substitute for an ACK. */
export function createSkillInstallationUpdateFlow(options: {
  client: Pick<SkillInstallationClient, "get" | "update">
  boundary: ProjectReadBoundary
  key?: () => string
}) {
  const { client } = options
  const actor = options.boundary.subject
  let boundary = { ...options.boundary }
  let retired = false
  let leases = 0
  let intent: Intent | undefined
  let active:
    { controller: AbortController; phase: "read" | "update" } | undefined
  let state: SkillUpdateState = { kind: "idle", acknowledged: false }
  const listeners = new Set<() => void>()
  const update = (next: SkillUpdateState) => {
    state = Object.freeze(next)
    for (const listener of listeners) listener()
  }
  const admitted = () =>
    !retired &&
    boundary.admitted &&
    actor !== null &&
    boundary.subject === actor
  const snapshot = (
    kind: Kind,
    current?: PersonalInstallation,
  ): SkillUpdateState => ({
    kind,
    acknowledged: intent?.acknowledged === true,
    ...(intent ? { targetRevision: intent.revision } : {}),
    ...(current ? { current } : {}),
  })
  const cancel = () => {
    const old = active
    active = undefined
    old?.controller.abort()
    if (intent)
      update(
        snapshot(
          intent.acknowledged
            ? "read_needed"
            : intent.attempted
              ? "unknown"
              : "selected",
        ),
      )
  }
  const canSelect = (current: PersonalInstallation, command: Intent) =>
    current.installed &&
    current.installation_id === command.id &&
    current.series_id === command.series &&
    current.source_ref === command.body.expected_source_ref &&
    current.available_update?.source_ref === command.body.source_ref &&
    current.available_update.revision === command.revision &&
    BigInt(command.revision) > BigInt(current.revision)
  const matches = (value: ProjectReadBoundary) =>
    !retired &&
    value.subject === boundary.subject &&
    value.admitted === boundary.admitted &&
    value.generation === boundary.generation
  const bind = (value: ProjectReadBoundary) => {
    if (retired) return
    if (value.subject !== actor) {
      retired = true
      boundary = { ...value }
      cancel()
      intent = undefined
      update({ kind: "idle", acknowledged: false })
      return
    }
    if (
      value.admitted === boundary.admitted &&
      value.generation === boundary.generation
    )
      return
    boundary = { ...value }
    cancel()
    // Admission changes must notify even with no command, so the first mounted
    // action never keeps the initial unadmitted render's closure.
    if (!intent) update({ kind: "idle", acknowledged: false })
  }
  const run = async (write: boolean, value: ProjectReadBoundary) => {
    const command = intent
    if (
      !matches(value) ||
      !admitted() ||
      active ||
      !command ||
      (write &&
        !command.attempted &&
        (state.kind !== "selected" ||
          !state.current ||
          !canSelect(state.current, command)))
    )
      return
    const running = {
      controller: new AbortController(),
      phase: "read" as "read" | "update",
    }
    active = running
    const { signal } = running.controller
    const current = () => {
      signal.throwIfAborted()
      if (!admitted() || active !== running || intent !== command)
        throw new Error("skill_update_retired")
    }
    try {
      if (write && !command.acknowledged) {
        command.attempted = true
        running.phase = "update"
        update({ ...snapshot("running"), phase: "update" })
        const receipt = await client.update(
          command.id,
          command.body,
          command.key,
          signal,
        )
        current()
        if (
          !installationReceiptMatches(
            "update",
            receipt,
            command.id,
            undefined,
            command.body.source_ref,
          ) ||
          receipt.installation.series_id !== command.series ||
          receipt.installation.revision !== command.revision
        )
          throw new HubClientError(
            "parse",
            "Skill update ACK binding mismatch",
            null,
            200,
          )
        command.acknowledged = true
      }
      running.phase = "read"
      update({ ...snapshot("running"), phase: "read" })
      const value = await client.get(command.id, signal)
      current()
      if (
        value.installation_id !== command.id ||
        value.series_id !== command.series
      )
        throw new HubClientError(
          "parse",
          "Skill update read binding mismatch",
          null,
          200,
        )
      update(
        snapshot(
          command.acknowledged
            ? "completed"
            : command.attempted
              ? "unknown"
              : canSelect(value, command)
                ? "selected"
                : "unavailable",
          value,
        ),
      )
    } catch {
      if (active === running)
        update(
          snapshot(
            command.acknowledged || !command.attempted
              ? "read_failed"
              : "unknown",
          ),
        )
    } finally {
      if (active === running) active = undefined
    }
  }
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,
    matches,
    bind,
    // Owner cleanup blocks old actions immediately; the microtask grace period
    // only accommodates React's setup/cleanup/setup probe, not actor reuse.
    retain: (value: ProjectReadBoundary) => {
      if (retired) return () => {}
      leases++
      bind(value)
      let released = false
      return () => {
        if (released) return
        released = true
        leases--
        if (leases !== 0) return
        bind({ ...boundary, admitted: false })
        queueMicrotask(() => {
          if (leases !== 0 || retired) return
          retired = true
          cancel()
          intent = undefined
          update({ kind: "idle", acknowledged: false })
        })
      }
    },
    cancel: (value: ProjectReadBoundary) => {
      if (matches(value)) cancel()
    },
    select: (card: SkillCard, value: ProjectReadBoundary) => {
      if (
        !matches(value) ||
        !admitted() ||
        active ||
        intent ||
        !installationIdSchema.safeParse(card.installation_id).success ||
        !installationIdSchema.safeParse(card.skill_id).success ||
        !card.available_update ||
        card.source_ref !== card.installed_source_ref
      )
        return false
      const body = installationUpdateRequestSchema.safeParse({
        expected_source_ref: card.source_ref,
        source_ref: card.available_update.source_ref,
      })
      const revision = card.available_update.revision
      if (
        !body.success ||
        body.data.expected_source_ref === body.data.source_ref ||
        !/^[1-9][0-9]{0,19}(?![\s\S])/u.test(revision) ||
        BigInt(revision) > BigInt("18446744073709551615")
      )
        return false
      intent = {
        id: card.installation_id!,
        series: card.skill_id!,
        revision,
        body: Object.freeze(body.data),
        key: (options.key ?? (() => crypto.randomUUID()))(),
        attempted: false,
        acknowledged: false,
      }
      update(snapshot("selected"))
      return true
    },
    readCurrent: (value: ProjectReadBoundary) => run(false, value),
    confirm: (value: ProjectReadBoundary) => run(true, value),
    // Explicitly forget local recovery intent only. This is neither an ACK nor
    // a rollback; a late response still belongs to the retired attempt.
    abandon: (value: ProjectReadBoundary, expected: SkillUpdateState) => {
      if (!matches(value) || !admitted() || active || expected !== state ||
        state.kind !== "unknown" || !intent?.attempted || intent.acknowledged)
        return false
      intent = undefined
      update({ kind: "idle", acknowledged: false })
      return true
    },
    reset: (value: ProjectReadBoundary) => {
      if (
        !matches(value) ||
        !admitted() ||
        active ||
        (intent?.attempted && !intent.acknowledged)
      )
        return false
      intent = undefined
      update({ kind: "idle", acknowledged: false })
      return true
    },
  }
}
export type SkillInstallationUpdateFlow = ReturnType<
  typeof createSkillInstallationUpdateFlow
>
