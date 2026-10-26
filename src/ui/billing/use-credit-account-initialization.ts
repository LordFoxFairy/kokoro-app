"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { CreditAccountInitializationError, type BillingClient } from "@/billing/client"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

type Phase = "idle" | "preparing" | "confirmed" | "unknown" | "disabled"
type Participant = {
  active: boolean; generation: number; publish: (phase: Phase) => void; reconcile: () => void
}
type Intent = {
  phase: Phase; generation: number | null; controller: AbortController | null; participants: Set<Participant>
}
// Only dispatched intent survives views. No balance, credential, or admission is cached here.
const intents = new WeakMap<BillingClient, Map<string, Intent>>()

function intentFor(client: BillingClient, subject: string): Intent {
  let subjects = intents.get(client)
  if (!subjects) { subjects = new Map(); intents.set(client, subjects) }
  let intent = subjects.get(subject)
  if (!intent) { intent = { phase: "idle", generation: null, controller: null, participants: new Set() }; subjects.set(subject, intent) }
  return intent
}

function dispatch(client: BillingClient, intent: Intent, generation: number): void {
  if (intent.phase !== "idle") return
  const controller = new AbortController()
  intent.phase = "preparing"; intent.generation = generation; intent.controller = controller
  const current = () => intent.controller === controller && !controller.signal.aborted
  const publish = (phase: Phase) => {
    intent.phase = phase
    for (const participant of intent.participants) {
      if (!participant.active || participant.generation !== generation) continue
      participant.publish(phase)
      if (phase === "confirmed") participant.reconcile()
    }
  }
  publish("preparing")
  // The acknowledgement is deliberately discarded; every surviving view reads current owner data.
  void client.initializeCreditAccount(controller.signal).then(() => {
    if (current()) { intent.controller = null; publish("confirmed") }
  }, error => {
    if (current()) {
      intent.controller = null
      publish(error instanceof CreditAccountInitializationError && error.status === 403 && error.code === "billing_account_disabled" && !error.retryable ? "disabled" : "unknown")
    }
  })
}

/** Participating views retire independently; a dispatched command is never replayed by a remount. */
export function useCreditAccountInitialization({ client, preview = false, readBoundary, missing, onReconcile }: {
  client: BillingClient; preview?: boolean; readBoundary: ProjectReadBoundary | undefined
  missing: boolean; onReconcile: () => void
}): Phase {
  const subject = readBoundary?.subject, generation = readBoundary?.generation
  const enabled = !preview && readBoundary?.admitted === true && typeof subject === "string" && subject.trim() !== ""
    && typeof generation === "number" && Number.isSafeInteger(generation) && generation >= 0
  const scope = enabled ? JSON.stringify([subject, generation]) : null
  const [result, setResult] = useState<{ client: BillingClient; scope: string | null; phase: Phase } | null>(null)
  const current = useRef<{ intent: Intent; participant: Participant } | null>(null)

  useLayoutEffect(() => {
    if (!enabled || scope === null) return
    const intent = intentFor(client, subject)
    const participant: Participant = { active: true, generation, reconcile: onReconcile,
      publish: phase => { if (participant.active) setResult({ client, scope, phase }) } }
    intent.participants.add(participant); current.current = { intent, participant }
    queueMicrotask(() => {
      if (participant.active) participant.publish(intent.phase === "confirmed" || intent.phase === "preparing" && intent.generation !== generation ? "unknown" : intent.phase)
    })
    return () => {
      participant.active = false; intent.participants.delete(participant)
      if (current.current?.participant === participant) current.current = null
      if (intent.participants.size === 0 && intent.controller !== null) {
        const controller = intent.controller
        intent.controller = null; intent.phase = "unknown"; controller.abort()
      }
    }
  }, [client, enabled, subject, generation, scope, onReconcile])

  useEffect(() => {
    const registration = current.current
    if (enabled && missing && registration?.participant.active) dispatch(client, registration.intent, registration.participant.generation)
  }, [client, enabled, missing])
  return result?.client === client && result.scope === scope ? result.phase : "idle"
}
