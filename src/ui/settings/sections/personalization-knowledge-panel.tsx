"use client";

import { useId, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

function KnowledgeDraft() {
  const t = useT();
  const reasonId = useId();
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
        <Textarea value={content} maxLength={2000} onChange={(event) => setContent(event.target.value)} placeholder={t("settings.knowledgeContentPlaceholder")} />
      </label>
      <output className={styles.personalizationCount}>{content.length}/2000</output>
      <p id={reasonId} className={styles.personalizationUnavailable}>{t("settings.knowledgeSaveUnavailable")}</p>
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
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.knowledgePanel}>
      <div className={styles.knowledgeToolbar}>
        <Input aria-label={t("settings.searchKnowledge")} placeholder={t("settings.searchKnowledge")} disabled aria-describedby={unavailableId} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button type="button"><Plus aria-hidden="true" />{t("settings.addKnowledge")}</Button></DialogTrigger>
          <DialogContent className={styles.personalizationDialog} closeLabel={t("shell.closeDialog")}>
            <DialogHeader>
              <DialogTitle>{t("settings.addKnowledgeTitle")}</DialogTitle>
              <DialogDescription>{t("settings.knowledgeSaveUnavailable")}</DialogDescription>
            </DialogHeader>
            {open ? <KnowledgeDraft /> : null}
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
