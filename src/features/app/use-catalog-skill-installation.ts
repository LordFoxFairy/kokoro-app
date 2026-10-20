import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createSkillInstallationClient, HubClientError } from "@/hub/client"
import type { PersonalInstallation, SkillCatalog, SkillCatalogCard } from "@/hub/schemas"
import { invalidate } from "@/lib/query"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

type Intent = Readonly<{ actionKey: string; seriesId: string; sourceRef: string; key: string; installationId?: string }>
type Facts = { catalog: SkillCatalog | undefined; installed: boolean; enabled: boolean; installed_source_ref: string }
type Scope = { context: object; controller: AbortController; running: boolean }

/** Actor-owned frozen intents outlive read rechecks, not the actor's mounted surface. */
export function useCatalogSkillInstallation(boundary: ProjectReadBoundary, catalog: SkillCatalog | undefined, catalogKey: string, actionIdentity: (skill: SkillCatalogCard) => string) {
  const { admitted, subject, generation } = boundary
  const context = useMemo(() => ({ admitted, subject, generation }), [admitted, subject, generation])
  const scopeRef = useRef<Scope | null>(null)
  const intents = useRef(new Map<string, Intent>())
  const intentActor = useRef(subject)
  const [state, setState] = useState<{ context: object; busy: string | null; error: string | null; added: string | null; facts: Readonly<Record<string, Facts>> }>({ context, busy: null, error: null, added: null, facts: {} })
  useLayoutEffect(() => {
    if (intentActor.current !== subject) { intents.current.clear(); intentActor.current = subject }
    const scope = { context, controller: new AbortController(), running: false }
    scopeRef.current = scope
    return () => { scope.controller.abort(); if (scopeRef.current === scope) scopeRef.current = null }
  }, [context, subject])
  const isCurrent = useCallback(() => admitted && subject !== null && scopeRef.current?.context === context && !scopeRef.current.controller.signal.aborted, [admitted, context, subject])
  const setEnabled = useCallback(async (skill: SkillCatalogCard) => {
    const scope = scopeRef.current
    if (!isCurrent() || !scope || scope.context !== context || scope.running || skill.installed && skill.enabled || !skill.skill_id) return
    const stateKey = actionIdentity(skill), seriesId = skill.skill_id
    const signal = scope.controller.signal
    const current = () => { signal.throwIfAborted(); if (scopeRef.current !== scope) throw Error("skill_read_retired") }
    const update = (patch: Partial<Omit<typeof state, "context">>) => {
      current()
      setState(value => ({ ...(value.context === context ? value : { context, busy: null, error: null, added: null, facts: {} }), ...patch }))
    }
    const previous = intents.current.get(seriesId)
    if (previous && previous.actionKey !== stateKey) { update({ error: stateKey }); return }
    scope.running = true
    update({ busy: stateKey, error: null })
    try {
      const client = createSkillInstallationClient()
      let intent = previous
      if (!intent) {
        if (skill.installed) {
          const matches: PersonalInstallation[] = [], ids = new Set<string>(), cursors = new Set<string>()
          let cursor: string | undefined
          for (let page = 0; ; page++) {
            const result = await client.list({ installed: true, limit: 100, ...(cursor === undefined ? {} : { cursor }) }, signal)
            current()
            for (const installation of result.data) {
              if (ids.has(installation.installation_id)) throw Error("duplicate installation identity")
              ids.add(installation.installation_id)
              if (installation.installed && installation.series_id === seriesId) matches.push(installation)
            }
            const next = result.meta?.next_cursor
            if (next === undefined) break
            if (page >= 99 || cursors.has(next)) throw Error("installation pagination exceeded its boundary")
            cursors.add(next); cursor = next
          }
          if (matches.length !== 1) throw Error("installation identity is not unique")
          const installation = matches[0]!
          intent = Object.freeze({ actionKey: stateKey, seriesId, sourceRef: installation.source_ref, installationId: installation.installation_id, key: crypto.randomUUID() })
        } else {
          if (!skill.revision_skill_id) throw Error("skill revision is unavailable")
          intent = Object.freeze({ actionKey: stateKey, seriesId, sourceRef: `skill:${skill.revision_skill_id}`, key: crypto.randomUUID() })
        }
        current()
        intents.current.set(seriesId, intent)
      }
      // A retired/unknown command is never implicitly replaced or replayed.
      // Only this explicit action can retry its original source and key.
      const receipt = intent.installationId === undefined ? await client.install(intent.sourceRef, intent.key, signal) : await client.setEnabled(intent.installationId, true, intent.key, signal)
      current()
      const installation = receipt.installation
      if (installation.source_ref !== intent.sourceRef || installation.series_id !== seriesId || !installation.installed || !installation.enabled) throw Error("installation ACK does not match the command")
      if (intents.current.get(seriesId) === intent) intents.current.delete(seriesId)
      setState(value => ({ ...(value.context === context ? value : { context, busy: null, error: null, added: null, facts: {} }), added: skill.name, facts: { ...(value.context === context ? value.facts : {}), [seriesId]: { catalog, installed: true, enabled: true, installed_source_ref: installation.source_ref } } }))
      invalidate(catalogKey)
    } catch (error) {
      if (scopeRef.current === scope && !signal.aborted) {
        // Only a validated, definitive rejection retires a frozen command.
        // In-progress/conflict, unknown transport and invalid ACK remain frozen.
        if (error instanceof HubClientError && error.reason === "http" && !error.retryable && error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 409) intents.current.delete(seriesId)
        update({ error: stateKey })
      }
    } finally {
      scope.running = false
      if (scopeRef.current === scope && !signal.aborted) update({ busy: null })
    }
  }, [actionIdentity, catalog, catalogKey, context, isCurrent])
  const visible = state.context === context ? state : null
  return { setEnabled, isCurrent, busy: visible?.busy ?? null, errorName: visible?.error ?? null, lastAddedSkill: visible?.added ?? null, installationFacts: visible?.facts ?? {} }
}
