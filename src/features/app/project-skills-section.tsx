"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { Plus, Search, Puzzle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/context"
import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame.types"
import type { PersonalInstallation } from "@/hub/schemas"
import { ProjectContextSection } from "./project-context-card"
import { ProjectSkillAddMenu } from "./project-skill-add-menu"
import { ProjectSkillCard } from "./project-skill-card"
import { ProjectSkillSourcePicker } from "./project-skill-source-picker"
import { useProjectSkills, type ProjectSkillCommand } from "./use-project-skills"
import styles from "./project-skills.module.css"

type Props = Pick<EmptyStateProps, "projectDetail" | "projectReadBoundary" | "onOpenSettings" | "preview">
export function ProjectSkillsSection({
  projectDetail,
  projectReadBoundary,
  onOpenSettings,
  preview = false,
}: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const confirmationOpener = useRef<HTMLElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState("")
  const [source, setSource] = useState<"personal" | "official" | null>(null)
  const projectId = projectDetail?.status === "ready" ? projectDetail.data.id : null
  const model = useProjectSkills(preview ? null : projectId, projectReadBoundary, open)
  const [draft, setDraft] = useState({
    selection: model.facts?.selection ?? null,
    ids: model.facts?.selection.installation_ids ?? [],
  })
  const selection = model.facts?.selection ?? null
  if (draft.selection !== selection) setDraft({ selection, ids: selection?.installation_ids ?? [] })
  const ids = draft.selection === selection ? draft.ids : (selection?.installation_ids ?? [])
  const [confirmation, setConfirmation] = useState<{
    facts: typeof model.facts
    item: PersonalInstallation | null
    command: ProjectSkillCommand | "abandon"
  } | null>(null)
  if (confirmation && confirmation.facts !== model.facts) setConfirmation(null)
  const confirm = confirmation?.facts === model.facts ? confirmation : null
  const locked =
    !model.allowed || model.status !== "ready" || model.listStatus !== "ready" || model.pending !== null
  const changed = selection !== null && JSON.stringify(ids) !== JSON.stringify(selection.installation_ids)
  const settings = () => {
    setOpen(false)
    onOpenSettings?.("skills", opener.current, { skillsScope: "personal" })
  }
  const emptyContent = <div className={styles.emptyPanel}>
    <div className={styles.emptyGroup}>
      <Puzzle aria-hidden="true" />
      <div className={styles.emptyCopy}>
        <p className={styles.emptyTitle}>{t(query.trim() ? "skills.personal.empty" : "skills.personal.emptyState")}</p>
        {!query.trim() ? <p>{t("projectSkills.emptyHint")}</p> : null}
      </div>
      {!query.trim() ? <ProjectSkillAddMenu primary disabled={!model.allowed || model.pending !== null}
        onPick={setSource} {...(onOpenSettings ? { onManage: settings } : {})} /> : null}
    </div>
  </div>
  return (
    <>
      <section className={styles.section} data-context-section="skills" aria-label={t("firstSite.skills")}>
        <ProjectContextSection
          title={t("firstSite.skills")}
          description={t("projectSkills.description")}
          footerAction={{ label: t("firstSite.add"), icon: Plus }}
          emptyVisual={<Image className={styles.artwork} src="/site-assets/project-skills.svg" width={75} height={64} alt="" aria-hidden="true" />}
          showChevron
          onClick={(event) => {
            opener.current = event.currentTarget
            setOpen(true)
          }}
        />
      </section>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          ref={panel}
          className={styles.dialog}
          closeLabel={t("shell.closeDialog")}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (opener.current?.isConnected) opener.current.focus()
          }}
        >
          <header className={styles.header}>
            <DialogTitle className={styles.title}>{t("projectSkills.title")}</DialogTitle>
            <DialogDescription className={styles.hint}>
              {t("projectSkills.defaultHint")}
              {onOpenSettings ? (
                <>
                  {" "}
                  ·{" "}
                  <button type="button" onClick={settings}>
                    {t("projectSkills.viewMine")}
                  </button>
                </>
              ) : null}
            </DialogDescription>
          </header>
          {source === null ? (
            <div className={styles.toolbar}>
              <label className={styles.search}>
                <Search aria-hidden="true" />
                <Input
                  aria-label={t("skills.searchPlaceholder")}
                  placeholder={t("skills.searchPlaceholder")}
                  value={query}
                  disabled={
                    model.pending !== null || (!preview && (!model.allowed || model.status !== "ready"))
                  }
                  onChange={(event) => {
                    setQuery(event.target.value)
                    model.search(event.target.value)
                  }}
                />
              </label>
              <ProjectSkillAddMenu disabled={!model.allowed || model.pending !== null}
                onPick={setSource} {...(onOpenSettings ? { onManage: settings } : {})} />
            </div>
          ) : null}
          <div className={styles.body}>
            {model.pending ? (
              <div className={styles.feedback} role="alert">
                <p>
                  {model.acknowledged
                    ? model.busy
                      ? t("projectSkills.refreshing")
                      : t("projectSkills.ackReadFailed")
                    : model.busy
                      ? t("projectSkills.saving")
                      : t("projectSkills.unknown")}
                </p>
                <Button variant="outline" disabled={!model.allowed || model.busy} onClick={model.retry}>
                  {model.acknowledged ? t("projectSkills.reload") : t("projectSkills.retryOriginal")}
                </Button>
                {!model.busy ? (
                  <Button
                    variant="ghost"
                    disabled={!model.allowed}
                    onClick={(event) => {
                      confirmationOpener.current = event.currentTarget
                      setConfirmation({ facts: model.facts, item: null, command: "abandon" })
                    }}
                  >
                    {t("projectSkills.stopIntent")}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {source !== null && projectReadBoundary !== undefined ? (
              <ProjectSkillSourcePicker
                mode={source}
                boundary={projectReadBoundary}
                busy={model.pending !== null || !model.allowed}
                onBack={() => setSource(null)}
                onInstall={(sourceRef) => {
                  void model.execute({ kind: "install", sourceRef }).then((complete) => {
                    if (complete && model.isCurrent()) setSource(null)
                  })
                }}
              />
            ) : (
              <>
                {preview ? (
                  emptyContent
                ) : model.status === "blocked" || model.status === "loading" ? (
                  <p className={styles.empty} role="status">
                    {model.status === "blocked" ? t("projectSkills.checking") : t("projectSkills.loading")}
                  </p>
                ) : model.status === "error" ? (
                  <div className={styles.empty} role="alert">
                    <p>{t("projectSkills.readFailed")}</p>
                    {!model.pending ? (
                      <Button variant="outline" onClick={model.reload}>
                        {t("firstSite.retry")}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {model.listStatus === "loading" ? (
                      <p role="status">{t("projectSkills.loading")}</p>
                    ) : model.listStatus === "error" ? (
                      <div role="alert">
                        <p>{t("projectSkills.readFailed")}</p>
                        <Button variant="outline" onClick={() => model.search(query)}>
                          {t("firstSite.retry")}
                        </Button>
                      </div>
                    ) : model.facts?.items.length === 0 ? (
                      emptyContent
                    ) : (
                      <div className={styles.grid}>
                        {model.facts?.items.map((item) => (
                          <ProjectSkillCard
                            key={item.installation_id}
                            item={item}
                            selected={ids.includes(item.installation_id)}
                            protectedDefault={
                              selection?.installation_ids.includes(item.installation_id) === true
                            }
                            locked={locked}
                            limitReached={ids.length >= 16}
                            onSelect={(checked) =>
                              setDraft({
                                selection,
                                ids: checked
                                  ? [...ids, item.installation_id]
                                  : ids.filter((id) => id !== item.installation_id),
                              })
                            }
                            onEnabled={(enabled) => {
                              void model.execute({ kind: "enabled", id: item.installation_id, enabled })
                            }}
                            onRemove={(source) => {
                              confirmationOpener.current = source
                              setConfirmation({
                                facts: model.facts,
                                item,
                                command: { kind: "remove", id: item.installation_id },
                              })
                            }}
                            onUpdate={(source) => {
                              confirmationOpener.current = source
                              if (item.available_update)
                                setConfirmation({
                                  facts: model.facts,
                                  item,
                                  command: {
                                    kind: "update",
                                    id: item.installation_id,
                                    expectedSourceRef: item.source_ref,
                                    sourceRef: item.available_update.source_ref,
                                  },
                                })
                            }}
                          />
                        ))}
                      </div>
                    )}
                    {model.facts?.cursor ? (
                      <Button variant="outline" disabled={locked} onClick={model.loadMore}>
                        {t("projectSkills.loadMore")}
                      </Button>
                    ) : null}
                  </>
                )}
              </>
            )}
          </div>
          {source === null && ((model.facts?.items.length ?? 0) > 0 || ids.length > 0 || changed) ? (
            <footer className={styles.footer}>
              <span className={styles.hint}>{t("projectSkills.selectedCount", { count: ids.length })}</span>
              <Button
                variant="ghost"
                disabled={locked || ids.length === 0}
                onClick={() => setDraft({ selection, ids: [] })}
              >
                {t("projectSkills.clear")}
              </Button>
              <Button
                disabled={locked || !changed}
                onClick={() => {
                  void model.execute({ kind: "selection", ids })
                }}
              >
                {t("projectSkills.saveDefaults")}
              </Button>
            </footer>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirm !== null}
        onOpenChange={(value) => {
          if (!value) setConfirmation(null)
        }}
      >
        <DialogContent
          className={styles.confirm}
          closeLabel={t("shell.closeDialog")}
          onCloseAutoFocus={(event) => {
            if (!open) return
            const source = confirmationOpener.current
            const target = source?.isConnected && !source.matches(":disabled") ? source : panel.current
            if (!target?.isConnected) return
            event.preventDefault()
            target.focus({ preventScroll: true })
          }}
        >
          <DialogTitle>
            {confirm?.command === "abandon"
              ? t("projectSkills.stopIntent")
              : confirm?.command.kind === "update"
                ? t("projectSkills.update")
                : t("projectSkills.remove")}
          </DialogTitle>
          <DialogDescription>
            {confirm?.command === "abandon"
              ? t("projectSkills.stopWarning")
              : t("projectSkills.confirmChange", { name: confirm?.item?.display_name ?? "" })}
          </DialogDescription>
          {confirm && confirm.command !== "abandon" && confirm.command.kind === "update" ? (
            <p className={styles.pin}>
              {confirm.command.expectedSourceRef}
              <br />→ {confirm.command.sourceRef}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              {t("firstSite.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (confirm) {
                  if (confirm.command === "abandon") model.abandon()
                  else void model.execute(confirm.command)
                  setConfirmation(null)
                }
              }}
            >
              {t("projectSkills.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
