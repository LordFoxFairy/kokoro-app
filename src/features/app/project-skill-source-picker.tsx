"use client"

import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import { ChevronLeft, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createHubClient, createSkillInstallationClient } from "@/hub/client"
import { createManusSkillHubClient, retainManusSkillHubClient } from "@/ui/skills/manus-skill-client"
import { installationSourceSchema } from "@/hub/schemas"
import { useT } from "@/i18n/context"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import styles from "./project-skills.module.css"

type Source = { key: string; name: string; summary: string; sourceRef: string | null }
export function ProjectSkillSourcePicker({
  mode,
  boundary,
  busy,
  onBack,
  onInstall,
}: {
  mode: "personal" | "official"
  boundary: ProjectReadBoundary
  busy: boolean
  onBack: () => void
  onInstall: (sourceRef: string) => void
}) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [cursor, setCursor] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const subject = boundary.subject,
    admitted = boundary.admitted,
    generation = boundary.generation
  const token = useMemo(
    () => ({ mode, query, cursor, retry, subject, admitted, generation }),
    [mode, query, cursor, retry, subject, admitted, generation],
  )
  const base = useMemo(() => createHubClient(), [])
  const personal = useMemo(() => createSkillInstallationClient(), [])
  const official = useMemo(
    () => createManusSkillHubClient(base, { subject, admitted, generation }),
    [base, subject, admitted, generation],
  )
  const client = useMemo(() => ({ personal, official }), [personal, official])
  useLayoutEffect(() => retainManusSkillHubClient(official), [official])
  const [read, setRead] = useState<{
    token: typeof token
    items: Source[]
    next: string | null
    failed: boolean
  } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    if (!admitted || subject === null) return () => controller.abort()
    void (async () => {
      try {
        let items: Source[], next: string | null
        if (mode === "personal") {
          const page = await client.personal.list(
            {
              installed: true,
              limit: 50,
              ...(query.trim() ? { query: query.trim() } : {}),
              ...(cursor === null ? {} : { cursor }),
            },
            controller.signal,
          )
          items = page.data.map((item) => ({
            key: item.installation_id,
            name: item.display_name,
            summary: item.summary,
            sourceRef: item.source_status === "active" ? item.source_ref : null,
          }))
          next = page.meta?.next_cursor ?? null
        } else {
          const page = await client.official.listSkillCatalog({
            scope: "official",
            pageSize: 50,
            signal: controller.signal,
            ...(query.trim() ? { query: query.trim() } : {}),
            ...(cursor === null ? {} : { cursor }),
          })
          items = page.skills.map((item, index) => ({
            key: item.skill_id ?? `${item.name}:${index}`,
            name: item.name,
            summary: item.description,
            sourceRef: installationSourceSchema.safeParse(item.source_ref).success ? item.source_ref! : null,
          }))
          next = page.next_cursor ?? null
        }
        if (!controller.signal.aborted) setRead({ token, items, next, failed: false })
      } catch {
        if (!controller.signal.aborted) setRead({ token, items: [], next: null, failed: true })
      }
    })()
    return () => controller.abort()
  }, [admitted, subject, token, mode, query, cursor, client])
  const current = admitted && subject !== null && read?.token === token ? read : null
  return (
    <>
      <div className={styles.sourceHeading}>
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft aria-hidden="true" />
          {t("projectSkills.back")}
        </Button>
        <strong>{mode === "personal" ? t("projectSkills.fromMine") : t("projectSkills.fromOfficial")}</strong>
      </div>
      <input
        className={styles.sourceSearch}
        aria-label={t("skills.searchPlaceholder")}
        placeholder={t("skills.searchPlaceholder")}
        value={query}
        disabled={busy}
        onChange={(event) => {
          setQuery(event.target.value)
          setCursor(null)
        }}
      />
      {!current ? (
        <p role="status">{t("projectSkills.loading")}</p>
      ) : current.failed ? (
        <div role="alert">
          <p>{t("projectSkills.readFailed")}</p>
          <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
            {t("firstSite.retry")}
          </Button>
        </div>
      ) : (
        <>
          {current.items.length === 0 ? (
            <p className={styles.empty}>{t("firstSite.noSkills")}</p>
          ) : (
            <div className={styles.grid}>
              {current.items.map((item) => (
                <article className={styles.card} key={item.key}>
                  <h3>{item.name}</h3>
                  <p className={styles.summary}>{item.summary}</p>
                  <Button
                    variant="outline"
                    disabled={busy || item.sourceRef === null}
                    onClick={() => {
                      if (item.sourceRef !== null) onInstall(item.sourceRef)
                    }}
                  >
                    <Plus aria-hidden="true" />
                    {t("firstSite.add")}
                  </Button>
                  {item.sourceRef === null ? <small>{t("projectSkills.unavailable")}</small> : null}
                </article>
              ))}
            </div>
          )}
          {current.next ? (
            <Button variant="outline" disabled={busy} onClick={() => setCursor(current.next)}>
              {t("projectSkills.nextPage")}
            </Button>
          ) : null}
        </>
      )}
    </>
  )
}
