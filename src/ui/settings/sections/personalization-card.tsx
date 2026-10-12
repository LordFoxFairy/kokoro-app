"use client"

import { useRef, useState } from "react"
import { ChevronRight, CircleHelp, Copy, LayoutGrid, Plus, Search } from "lucide-react"

import { useT } from "@/i18n/context"
import { mutationHeaders } from "@/lib/client/mutation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyMedia } from "@/components/ui/empty"

import styles from "./settings-sections.module.css"

function readPreviewPersonalizationField(key: "nickname" | "occupation" | "about" | "instructions"): string {
  if (typeof window === "undefined") return ""
  const raw = window.localStorage.getItem("kokoro.personalization.preview")
  if (!raw) return ""
  try {
    const saved = JSON.parse(raw) as Partial<Record<typeof key, string>>
    return saved[key] ?? ""
  } catch {
    return ""
  }
}

export function PersonalizationCard({ preview = false }: { preview?: boolean }) {
  const t = useT()
  const [section, setSection] = useState<"profile" | "knowledge">("profile")
  const [nickname, setNickname] = useState(() => preview ? readPreviewPersonalizationField("nickname") : "")
  const [occupation, setOccupation] = useState(() => preview ? readPreviewPersonalizationField("occupation") : "")
  const [about, setAbout] = useState(() => preview ? readPreviewPersonalizationField("about") : "")
  const [instructions, setInstructions] = useState(() => preview ? readPreviewPersonalizationField("instructions") : "")
  const [knowledgeQuery, setKnowledgeQuery] = useState("")
  const [knowledgeOpen, setKnowledgeOpen] = useState(false)
  const [knowledgeName, setKnowledgeName] = useState("")
  const [knowledgeWhen, setKnowledgeWhen] = useState("")
  const [knowledgeContent, setKnowledgeContent] = useState("")
  const [knowledgeSaving, setKnowledgeSaving] = useState(false)
  const [knowledgeEntries, setKnowledgeEntries] = useState<Array<{ id: string; name: string; when: string; content: string }>>([])
  const knowledgeReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState("")
  const [importCopied, setImportCopied] = useState(false)
  const [importing, setImporting] = useState(false)
  const importReturnFocusRef = useRef<HTMLButtonElement | null>(null)

  const persist = async (): Promise<void> => {
    const payload = { nickname, occupation, about, instructions }
    if (preview) {
      window.localStorage.setItem("kokoro.personalization.preview", JSON.stringify(payload))
      return
    }
    try {
      await fetch("/api/hub/preferences/personalization", {
        method: "PATCH",
        headers: mutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(payload),
      })
    } catch {
      // Inputs remain editable; the next blur retries with the complete draft.
    }
  }

  const saveKnowledge = async (): Promise<void> => {
    if (!knowledgeName.trim() || !knowledgeWhen.trim() || !knowledgeContent.trim() || knowledgeSaving) return
    const entry = {
      id: `knowledge-${Date.now()}`,
      name: knowledgeName.trim(),
      when: knowledgeWhen.trim(),
      content: knowledgeContent.trim(),
    }
    setKnowledgeSaving(true)
    try {
      if (!preview) {
        const response = await fetch("/api/hub/preferences/knowledge", {
          method: "POST",
          headers: mutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ name: entry.name, usage_context: entry.when, content: entry.content }),
        })
        if (!response.ok) return
      }
      setKnowledgeEntries((entries) => [...entries, entry])
      setKnowledgeOpen(false)
      setKnowledgeName("")
      setKnowledgeWhen("")
      setKnowledgeContent("")
    } finally {
      setKnowledgeSaving(false)
    }
  }

  const importMemory = async (): Promise<void> => {
    if (!importText.trim() || importing) return
    setImporting(true)
    try {
      if (!preview) {
        const response = await fetch("/api/hub/preferences/personalization/imports", {
          method: "POST",
          headers: mutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ content: importText.trim() }),
        })
        if (!response.ok) return
      }
      setImportOpen(false)
      setImportText("")
    } finally {
      setImporting(false)
    }
  }

  const visibleKnowledge = knowledgeEntries.filter((entry) => {
    const query = knowledgeQuery.trim().toLocaleLowerCase()
    return !query || `${entry.name} ${entry.when} ${entry.content}`.toLocaleLowerCase().includes(query)
  })

  return (
    <div className={styles.personalization} data-testid="settings-personalization">
      <div className={styles.personalizationTabs} role="tablist" aria-label={t("settings.personalizationTitle")}>
        <Button type="button" variant="ghost" role="tab" aria-selected={section === "profile"} data-active={section === "profile"} onClick={() => setSection("profile")}>{t("settings.personalProfile")}</Button>
        <Button type="button" variant="ghost" role="tab" aria-selected={section === "knowledge"} data-active={section === "knowledge"} onClick={() => setSection("knowledge")}>{t("settings.knowledge")}<CircleHelp aria-hidden="true" /></Button>
      </div>
      {section === "profile" ? (
        <div className={styles.personalizationProfile}>
          <button type="button" className={styles.memoryImportCard} onClick={(event) => {
            importReturnFocusRef.current = event.currentTarget
            setImportOpen(true)
          }}>
            <span className={styles.memoryImportIcon}><LayoutGrid aria-hidden="true" /></span>
            <span><strong>{t("settings.importFromAi")}</strong><small>{t("settings.importFromAiHint")}</small></span>
            <ChevronRight aria-hidden="true" />
          </button>
          <div className={styles.profileColumns}>
            <label><span>{t("settings.nickname")}</span><Input aria-label={t("settings.nickname")} placeholder={t("settings.nicknamePlaceholder")} value={nickname} onChange={(event) => setNickname(event.target.value)} onBlur={() => void persist()} /></label>
            <label><span>{t("settings.occupation")}</span><Input aria-label={t("settings.occupation")} placeholder={t("settings.occupationPlaceholder")} value={occupation} onChange={(event) => setOccupation(event.target.value)} onBlur={() => void persist()} /></label>
          </div>
          <label className={styles.profileTextarea}><span>{t("settings.aboutYou")}</span><Textarea aria-label={t("settings.aboutYou")} placeholder={t("settings.aboutYouPlaceholder")} value={about} onChange={(event) => setAbout(event.target.value)} onBlur={() => void persist()} /></label>
          <p className={styles.profileHint}>{t("settings.aboutYouHint")}</p>
          <label className={styles.profileTextarea}><span>{t("settings.customInstructions")}</span><Textarea aria-label={t("settings.customInstructions")} placeholder={t("settings.customInstructionsPlaceholder")} value={instructions} onChange={(event) => setInstructions(event.target.value)} onBlur={() => void persist()} /></label>
          <Button type="button" variant="outline" className={styles.importMemoryButton} onClick={(event) => {
            importReturnFocusRef.current = event.currentTarget
            setImportOpen(true)
          }}>{t("settings.importMemory")}</Button>
        </div>
      ) : (
        <div className={styles.personalizationKnowledge}>
          <div className={styles.knowledgeToolbar}>
            <label className={styles.knowledgeSearch}>
              <Search aria-hidden="true" />
              <Input value={knowledgeQuery} onChange={(event) => setKnowledgeQuery(event.target.value)} aria-label={t("settings.searchKnowledge")} placeholder={t("settings.searchKnowledge")} />
            </label>
            <Button type="button" variant="outline" size="sm" onClick={(event) => {
              knowledgeReturnFocusRef.current = event.currentTarget
              setKnowledgeOpen(true)
            }}><Plus aria-hidden="true" />{t("settings.addKnowledge")}</Button>
          </div>
          {visibleKnowledge.length === 0 ? (
            <Empty className={styles.knowledgeEmpty}>
              <EmptyMedia><Search aria-hidden="true" /></EmptyMedia>
              <EmptyDescription>{t("settings.noKnowledge")}</EmptyDescription>
            </Empty>
          ) : (
            <div className={styles.knowledgeList}>
              {visibleKnowledge.map((entry) => <article key={entry.id}><strong>{entry.name}</strong><span>{entry.when}</span></article>)}
          </div>
          )}
        </div>
      )}
      <Dialog open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
        <DialogContent
          className={styles.knowledgeDialog}
          closeLabel={t("shell.closeDialog")}
          onCloseAutoFocus={(event) => {
            const target = knowledgeReturnFocusRef.current
            if (!target?.isConnected) return
            event.preventDefault()
            window.requestAnimationFrame(() => {
              if (target.isConnected) target.focus({ preventScroll: true })
            })
          }}
        >
          <DialogTitle>{t("settings.addKnowledgeTitle")}</DialogTitle>
          <FieldGroup className={styles.knowledgeForm}>
            <Field><FieldLabel htmlFor="knowledge-name">{t("settings.knowledgeNameLabel")}</FieldLabel><Input id="knowledge-name" autoFocus value={knowledgeName} onChange={(event) => setKnowledgeName(event.target.value)} placeholder={t("settings.knowledgeNamePlaceholder")} /></Field>
            <Field><FieldLabel htmlFor="knowledge-when">{t("settings.knowledgeWhenLabel")}</FieldLabel><Input id="knowledge-when" value={knowledgeWhen} onChange={(event) => setKnowledgeWhen(event.target.value)} placeholder={t("settings.knowledgeWhenPlaceholder")} /></Field>
            <Field><FieldLabel htmlFor="knowledge-content">{t("settings.knowledgeContentLabel")}</FieldLabel><Textarea id="knowledge-content" maxLength={2000} value={knowledgeContent} onChange={(event) => setKnowledgeContent(event.target.value)} placeholder={t("settings.knowledgeContentPlaceholder")} /><span className={styles.knowledgeCount}>{knowledgeContent.length} / 2000</span></Field>
          </FieldGroup>
          <DialogFooter className={styles.knowledgeFooter}>
            <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
            <Button type="button" disabled={!knowledgeName.trim() || !knowledgeWhen.trim() || !knowledgeContent.trim() || knowledgeSaving} onClick={() => void saveKnowledge()}>{knowledgeSaving ? <Spinner aria-hidden="true" /> : null}{t("firstSite.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent
          className={styles.importMemoryDialog}
          closeLabel={t("shell.closeDialog")}
          onCloseAutoFocus={(event) => {
            const target = importReturnFocusRef.current
            if (!target?.isConnected) return
            event.preventDefault()
            window.requestAnimationFrame(() => {
              if (target.isConnected) target.focus({ preventScroll: true })
            })
          }}
        >
          <DialogTitle>{t("settings.importMemory")}</DialogTitle>
          <p className={styles.importMemoryDescription}>{t("settings.importMemoryDescription")}</p>
          <div className={styles.importMemorySteps}>
            <section className={styles.importMemoryStep}>
              <span className={styles.importStepNumber}>1</span>
              <div className={styles.importStepContent}>
                <div className={styles.importStepHead}><div><strong>{t("settings.copyPrompt")}</strong><p>{t("settings.copyPromptHint")}</p></div><Button type="button" size="sm" onClick={() => void navigator.clipboard.writeText(t("settings.memoryTransferPrompt")).then(() => setImportCopied(true))}><Copy aria-hidden="true" />{importCopied ? t("settings.copied") : t("settings.copyUserId")}</Button></div>
                <div className={styles.importPrompt}>
                  <div className={styles.importPromptScroller} tabIndex={0} aria-label={t("settings.copyPrompt")}>
                    <p>{t("settings.memoryTransferPrompt")}</p>
                  </div>
                  <span className={styles.importPromptFade} aria-hidden="true" />
                </div>
              </div>
            </section>
            <section className={styles.importMemoryStep}>
              <span className={styles.importStepNumber}>2</span>
              <div className={styles.importStepContent}>
                <div className={styles.importStepHead}><div><strong>{t("settings.pasteResponse")}</strong><p>{t("settings.pasteResponseHint")}</p></div></div>
                <Textarea value={importText} onChange={(event) => setImportText(event.target.value)} aria-label={t("settings.pasteResponse")} placeholder={t("settings.pasteResponsePlaceholder")} />
              </div>
            </section>
          </div>
          <DialogFooter className={styles.importMemoryFooter}><DialogClose asChild><Button variant="outline" type="button">{t("firstSite.cancel")}</Button></DialogClose><Button type="button" disabled={!importText.trim() || importing} onClick={() => void importMemory()}>{importing ? <Spinner aria-hidden="true" /> : null}{t("settings.importMemoryAction")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
