"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useLocale } from "@/i18n/context"
import { useSessionProbe } from "@/ui/auth/use-session-state"
import { createSkillShareClient } from "@/hub/skill-share-client"
import { shareIdSchema, type ShareSummary } from "@/hub/skill-share.schema"
import { createSkillInstallationClient } from "@/hub/client"
import type { PersonalInstallation } from "@/hub/schemas"
import { ManusSkillDetailDialog } from "@/ui/skills/manus-skill-detail-dialog"
import { SKILL_CATALOG_RESOURCE_KEY } from "@/ui/skills/manus-skill-client"
import { useRuntimeManifest } from "@/system/use-runtime-manifest"
import { invalidate } from "@/lib/query"

export default function SharedSkillPage() {
  const params = useParams<{ id: string }>(), router = useRouter()
  const { t } = useLocale(), probe = useSessionProbe(), { manifest } = useRuntimeManifest()
  const boundary = probe.projectReadBoundary
  const id = typeof params.id === "string" && shareIdSchema.safeParse(params.id).success ? params.id : null
  const identity = id && boundary.subject ? JSON.stringify([id, boundary.subject]) : null
  const liveIdentity = useRef(identity)
  const [attempt, setAttempt] = useState(0)
  const [view, setView] = useState<{ identity: string; summary?: ShareSummary; failed?: boolean }>({ identity: "" })
  const [installation, setInstallation] = useState<{ identity: string; value: PersonalInstallation | null; failed: boolean } | null>(null)
  const [writing, setWriting] = useState(false)
  const [writeFailed, setWriteFailed] = useState(false)
  const writeIntent = useRef<{ identity: string; source: string; series: string; key: string; installationId?: string } | null>(null)
  const writer = useRef<AbortController | null>(null)
  const [writeIdentity, setWriteIdentity] = useState(identity)
  if (writeIdentity !== identity) {
    setWriteIdentity(identity)
    setWriting(false)
    setWriteFailed(false)
  }

  useEffect(() => {
    liveIdentity.current = identity
    if (writeIntent.current?.identity !== identity) { writer.current?.abort(); writeIntent.current = null }
    return () => { writer.current?.abort() }
  }, [identity])

  useEffect(() => {
    if (!id || !identity || !boundary.admitted) return
    const controller = new AbortController()
    void (async () => {
      try {
        const client = createSkillShareClient()
        const resolved = await client.resolve(id, controller.signal)
        const summary = await client.summary(id, controller.signal)
        if (resolved.source_ref !== summary.source_ref || controller.signal.aborted) throw new Error("skill_response_invalid")
        if (liveIdentity.current !== identity) return
        setView({ identity, summary })
        const installationDeadline = new AbortController()
        const installationSignal = AbortSignal.any([controller.signal, installationDeadline.signal])
        const installationTimer = setTimeout(() => installationDeadline.abort(), 10_000)
        try {
          const installations = createSkillInstallationClient()
          const matches: PersonalInstallation[] = []
          let cursor: string | undefined
          const seen = new Set<string>()
          const end = Date.now() + 10_000
          do {
            if (Date.now() >= end) throw new Error("installation deadline")
            const page = await installations.list({ installed: true, limit: 100, ...(cursor === undefined ? {} : { cursor }) }, installationSignal)
            for (const row of page.data) if (row.series_id === summary.skill.series_id && row.installed) matches.push(row)
            cursor = page.meta?.next_cursor ?? undefined
            if (cursor !== undefined) { if (seen.has(cursor)) throw new Error("installation cursor repeated"); seen.add(cursor) }
          } while (cursor !== undefined)
          if (matches.length > 1) throw new Error("ambiguous installation")
          const found = matches[0] === undefined ? null : await installations.get(matches[0].installation_id, installationSignal)
          if (found && (found.series_id !== summary.skill.series_id || found.source_ref !== matches[0]!.source_ref || !found.installed)) throw new Error("installation identity changed")
          if (!controller.signal.aborted && liveIdentity.current === identity) setInstallation({ identity, value: found, failed: false })
        } catch {
          if (!controller.signal.aborted && liveIdentity.current === identity) setInstallation({ identity, value: null, failed: true })
        } finally { clearTimeout(installationTimer) }
      } catch {
        if (!controller.signal.aborted && liveIdentity.current === identity) setView({ identity, failed: true })
      }
    })()
    return () => { controller.abort(); writer.current?.abort() }
  }, [id, identity, boundary.admitted, attempt])

  const summary = view.identity === identity ? view.summary : undefined
  const fact = installation?.identity === identity ? installation : null
  const differentPin = fact?.value !== null && fact?.value !== undefined && fact.value.source_ref !== summary?.source_ref
  const add = async () => {
    if (!identity || !boundary.admitted || !summary || !fact || fact.failed || differentPin || writer.current || fact.value?.enabled) return
    let intent = writeIntent.current
    if (intent === null) {
      intent = { identity, source: summary.source_ref, series: summary.skill.series_id, key: crypto.randomUUID(), ...(fact.value ? { installationId: fact.value.installation_id } : {}) }
      writeIntent.current = intent
    }
    if (intent.identity !== identity || intent.source !== summary.source_ref) return
    const controller = new AbortController()
    writer.current = controller
    setWriting(true); setWriteFailed(false)
    try {
      const client = createSkillInstallationClient()
      const ack = intent.installationId === undefined ? await client.install(intent.source, intent.key, controller.signal) : await client.setEnabled(intent.installationId, true, intent.key, controller.signal)
      if (ack.installation.source_ref !== intent.source || ack.installation.series_id !== intent.series || !ack.installation.installed || !ack.installation.enabled) throw new Error("installation ACK binding")
      if (controller.signal.aborted || liveIdentity.current !== identity) return
      setInstallation({ identity, value: ack.installation, failed: false })
      writeIntent.current = null
      invalidate(SKILL_CATALOG_RESOURCE_KEY)
    } catch {
      if (!controller.signal.aborted && liveIdentity.current === identity) setWriteFailed(true)
    } finally {
      if (writer.current === controller) writer.current = null
      if (liveIdentity.current === identity) setWriting(false)
    }
  }

  if (id === null) return <main><p role="alert">{t("skills.shareUnavailable")}</p></main>
  if (probe.state === "anonymous") return <main><p>{t("skills.shareLogin")}</p><Link href={`/login?return_to=${encodeURIComponent(`/skills/shared/${encodeURIComponent(id)}`)}`}>{t("skills.shareSignIn")}</Link></main>
  if (!summary) return <main aria-busy={probe.state === "checking" || boundary.admitted && !view.failed}>
    <p role={probe.unavailable || view.failed ? "alert" : "status"}>{t(probe.unavailable || view.failed ? "skills.shareUnavailable" : "skills.detailLoading")}</p>
    {probe.unavailable ? <Button onClick={probe.retry}>{t("skills.packageRetry")}</Button> : view.failed ? <Button onClick={() => setAttempt(value => value + 1)}>{t("skills.packageRetry")}</Button> : null}
  </main>
  const category = { programming: "skills.categoryCoding", data: "skills.categoryData", automation: "skills.categoryAutomation", business: "skills.categoryBusiness", design: "skills.categoryDesign", media: "skills.categoryMedia", content: "skills.categoryContent", apps: "skills.categoryApps" } as const
  return <main>
    <ManusSkillDetailDialog readBoundary={boundary} skill={null} sharedSummary={summary} open busy={writing || !boundary.admitted || fact === null || fact.failed || differentPin}
      installationState={{ installed: Boolean(fact?.value?.installed && !differentPin), enabled: Boolean(fact?.value?.enabled && !differentPin) }} actionFailed={writeFailed}
      installationNotice={fact?.failed ? t("skills.shareInstallationUnavailable") : differentPin ? t("skills.shareOtherPin") : undefined} onRetryInstallation={fact?.failed ? () => setAttempt(value => value + 1) : undefined}
      publisherLabel={summary.skill.author?.display_name ?? (summary.skill.source_kind === "third_party" ? t("skills.community") : manifest.brand.name)}
      categoryLabels={summary.skill.category_keys.map(value => t(category[value]))} onAdd={add} onAddShared={() => void add()} onTry={() => false} onOpenChange={open => { if (!open) router.push("/app/skills") }} />
  </main>
}
