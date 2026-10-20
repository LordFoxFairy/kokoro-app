"use client";

import { useId, useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

function KnowledgeDraft({ reasonId }: { reasonId: string }) {
  const t = useT();
  const countId = useId();
  const [name, setName] = useState("");
  const [when, setWhen] = useState("");
  const [content, setContent] = useState("");
  return (
    <form className={styles.personalizationDraft} onSubmit={(event) => event.preventDefault()}>
      <label>
        <span>{t("settings.knowledgeNameLabel")}</span>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("settings.knowledgeNamePlaceholder")} />
      </label>
      <label>
        <span>{t("settings.knowledgeWhenLabel")}</span>
        <Input value={when} onChange={(event) => setWhen(event.target.value)} placeholder={t("settings.knowledgeWhenPlaceholder")} />
      </label>
      <label>
        <span>{t("settings.knowledgeContentLabel")}</span>
        <div className={styles.knowledgeContent}>
          <Textarea aria-label={t("settings.knowledgeContentLabel")} aria-describedby={countId} value={content} maxLength={2000} onChange={(event) => setContent(event.target.value)} placeholder={t("settings.knowledgeContentPlaceholder")} />
          <output id={countId} className={styles.personalizationCount}>{content.length}/2000</output>
        </div>
      </label>
      <DialogFooter>
        <DialogClose asChild><Button variant="outline" type="button">{t("firstSite.cancel")}</Button></DialogClose>
        <Button type="submit" disabled aria-describedby={reasonId}>{t("settings.knowledgeSaveAction")}</Button>
      </DialogFooter>
    </form>
  );
}

export function PersonalizationKnowledgePanel() {
  const t = useT();
  const unavailableId = useId();
  const preferenceId = useId();
  const saveUnavailableId = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.knowledgePanel}>
      <div className={styles.knowledgePreference}>
        <div>
          <h3>{t("settings.useKnowledge")}</h3>
          <p>{t("settings.useKnowledgeHint")}</p>
          <p id={preferenceId} className={styles.personalizationUnavailable}>{t("settings.knowledgePreferenceUnavailable")}</p>
        </div>
        <button type="button" disabled className={styles.knowledgeUnknownToggle} aria-label={t("settings.knowledgePreferenceUnknown")} aria-describedby={preferenceId}><span aria-hidden="true" /></button>
      </div>
      <div className={styles.knowledgeToolbar}>
        <div className={styles.knowledgeSearch}><Search aria-hidden="true" /><Input aria-label={t("settings.searchKnowledge")} placeholder={t("settings.searchKnowledge")} disabled aria-describedby={unavailableId} /></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button type="button" variant="outline"><Plus aria-hidden="true" />{t("settings.addKnowledge")}</Button></DialogTrigger>
          <DialogContent className={`${styles.personalizationDialog} ${styles.knowledgeDialog}`} closeLabel={t("shell.closeDialog")} aria-describedby={saveUnavailableId}>
            <DialogHeader>
              <DialogTitle>{t("settings.addKnowledgeTitle")}</DialogTitle>
              <DialogDescription id={saveUnavailableId}>{t("settings.knowledgeSaveUnavailable")}</DialogDescription>
            </DialogHeader>
            {open ? <KnowledgeDraft reasonId={saveUnavailableId} /> : null}
          </DialogContent>
        </Dialog>
      </div>
      <div className={styles.knowledgeUnavailable}>
        <BookOpen aria-hidden="true" />
        <p id={unavailableId}>{t("settings.knowledgeUnavailable")}</p>
      </div>
    </div>
  );
}
