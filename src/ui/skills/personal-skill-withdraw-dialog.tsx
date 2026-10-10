"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/context"
import { HubClientError } from "@/hub/client"
import { withdrawPersonalSkillRequestSchema, type ManagedPersonalSkill } from "@/hub/schemas"
import type { SkillPublishClient } from "@/hub/skill-publish-client"

export function PersonalSkillWithdrawDialog({ skill, client, open, admitted, onOpenChange, onConfirmed, onReadCurrent }: {
  skill: ManagedPersonalSkill
  client: Pick<SkillPublishClient, "withdraw">
  open: boolean
  admitted: boolean
  onOpenChange: (open: boolean) => void
  onReadCurrent?: (() => void) | undefined
  onConfirmed: () => void
}) {
  const t = useT()
  const [reason, setReason] = useState("")
  const [state, setState] = useState<"idle" | "busy" | "unknown" | "rejected" | "success">("idle")
  const [intent, setIntent] = useState<{ body: { reason: string; expected_state_version: string }; key: string } | null>(null)
  const flight = useRef<AbortController | null>(null)
  const [lastFlight, setLastFlight] = useState<AbortController | null>(null)
  const visibleState = state === "busy" && lastFlight?.signal.aborted ? "unknown" : state
  const retire = () => { flight.current?.abort(); flight.current = null }
  useEffect(() => () => { flight.current?.abort(); flight.current = null }, [])
  useEffect(() => { if (!admitted || !open) { flight.current?.abort(); flight.current = null } }, [admitted, open])
  const submit = async () => {
    if (!admitted || flight.current || state === "success" || state === "rejected") return
    let currentIntent = intent
    if (!currentIntent) {
      const parsed = withdrawPersonalSkillRequestSchema.safeParse({ reason, expected_state_version: skill.product.state_version })
      if (!parsed.success) return
      currentIntent = { body: Object.freeze(parsed.data), key: `withdraw_${crypto.randomUUID()}` }
      setIntent(currentIntent)
    }
    const controller = new AbortController(); flight.current = controller; setLastFlight(controller); setState("busy")
    try {
      await client.withdraw(skill.skill_id, currentIntent.body, currentIntent.key, controller.signal)
      if (flight.current !== controller || controller.signal.aborted) return
      setState("success"); onConfirmed()
    } catch (error) {
      if (flight.current !== controller) return
      const rejected = error instanceof HubClientError && error.reason === "http" && ([400, 401, 403, 404, 412, 413].includes(error.status ?? 0) || error.status === 409 && error.code === "skill_idempotency_conflict")
      setState(rejected ? "rejected" : "unknown")
    } finally { if (flight.current === controller) flight.current = null }
  }
  const close = () => { if (flight.current) setState("unknown"); retire(); onOpenChange(false) }
  return <Dialog open={open} onOpenChange={(value) => { if (!value) close() }}><DialogContent><DialogTitle>{t("skills.lifecycle.withdraw")}</DialogTitle><DialogDescription>{t("skills.lifecycle.withdrawWarning")}</DialogDescription>
    <label htmlFor="personal-withdraw-reason">{t("skills.lifecycle.reason")}</label><Textarea id="personal-withdraw-reason" value={intent?.body.reason ?? reason} disabled={!admitted || intent !== null} maxLength={4096} onChange={event => setReason(event.target.value)} />
    {visibleState !== "idle" ? <p role={visibleState === "unknown" || visibleState === "rejected" ? "alert" : "status"}>{t(visibleState === "success" ? "skills.lifecycle.withdrawSuccess" : visibleState === "busy" ? "skills.loading" : visibleState === "unknown" ? "skills.lifecycle.unknown" : "skills.lifecycle.rejected")}</p> : null}
    {visibleState === "rejected" && onReadCurrent ? <Button type="button" onClick={onReadCurrent}>{t("skills.personal.checkCurrent")}</Button> : null}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>{t("skills.cancel")}</Button><Button type="button" disabled={!admitted || visibleState === "busy" || visibleState === "success" || visibleState === "rejected" || !intent && !reason.trim()} onClick={() => void submit()}>{t(visibleState === "unknown" ? "skills.retry" : "skills.lifecycle.confirmWithdraw")}</Button></div>
  </DialogContent></Dialog>
}
