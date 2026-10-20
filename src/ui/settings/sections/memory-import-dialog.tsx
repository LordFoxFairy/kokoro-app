"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Blocks, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

function MemoryImportDraft() {
  const t = useT();
  const reasonId = useId();
  const promptId = useId();
  const [response, setResponse] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const copyAttempt = useRef(0);
  const copying = useRef(false);
  useLayoutEffect(() => () => { copyAttempt.current += 1; }, []);
  const copyPrompt = async () => {
    if (copying.current) return;
    copying.current = true;
    const attempt = ++copyAttempt.current;
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(t("settings.memoryTransferPrompt"));
      if (copyAttempt.current === attempt) setCopyState("copied");
    } catch {
      if (copyAttempt.current === attempt) setCopyState("failed");
    } finally {
      if (copyAttempt.current === attempt) copying.current = false;
    }
  };
  return (
    <form className={styles.personalizationDraft} onSubmit={(event) => event.preventDefault()}>
      <section className={styles.memoryStep}>
        <div className={styles.memoryStepHeader}>
          <h3 id={promptId}><span aria-hidden="true">1</span>{t("settings.copyPrompt")}</h3>
          <Button variant="outline" type="button" disabled={copyState === "copying"} aria-busy={copyState === "copying"} onClick={() => void copyPrompt()}>
            <Copy aria-hidden="true" />{copyState === "copying" ? t("settings.memoryCopying") : t("settings.copyPrompt")}
          </Button>
        </div>
        <p>{t("settings.copyPromptHint")}</p>
        <pre className={styles.memoryPrompt} aria-labelledby={promptId}>{t("settings.memoryTransferPrompt")}</pre>
        {copyState === "copied" ? <p role="status">{t("settings.copied")}</p> : null}
        {copyState === "failed" ? <p role="alert">{t("settings.memoryCopyFailed")}</p> : null}
      </section>
      <section className={styles.memoryStep}>
        <h3><span aria-hidden="true">2</span>{t("settings.pasteResponse")}</h3>
        <p>{t("settings.pasteResponseHint")}</p>
        <Textarea aria-label={t("settings.pasteResponse")} placeholder={t("settings.pasteResponsePlaceholder")} value={response} onChange={(event) => setResponse(event.target.value)} />
      </section>
      <p id={reasonId} className={styles.personalizationUnavailable}>{t("settings.memoryImportUnavailable")}</p>
      <DialogFooter>
        <DialogClose asChild><Button variant="outline" type="button">{t("firstSite.cancel")}</Button></DialogClose>
        <Button type="submit" disabled aria-describedby={reasonId}>{t("settings.importMemoryAction")}</Button>
      </DialogFooter>
    </form>
  );
}

export function MemoryImportDialog({ triggerLabel, card = false }: { triggerLabel: string; card?: boolean }) {
  const t = useT();
  const unavailableId = useId();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{card ? (
        <Button type="button" variant="outline" className={styles.personalizationImport} aria-label={triggerLabel} aria-describedby={unavailableId}>
          <span className={styles.personalizationImportIcon}><Blocks aria-hidden="true" /></span>
          <span className={styles.personalizationImportCopy}>
            <strong>{t("settings.importFromAi")}</strong>
            <span>{t("settings.importFromAiHint")}</span>
            <span id={unavailableId}>{t("settings.personalizationMemoryUnavailable")}</span>
          </span>
          <ArrowRight aria-hidden="true" className={styles.personalizationImportArrow} />
        </Button>
      ) : <Button type="button" variant="outline">{triggerLabel}</Button>}</DialogTrigger>
      <DialogContent className={`${styles.personalizationDialog} ${styles.memoryDialog}`} closeLabel={t("shell.closeDialog")}>
        <DialogHeader>
          <DialogTitle>{t("settings.importMemory")}</DialogTitle>
          <DialogDescription>{t("settings.importMemoryDescription")}</DialogDescription>
        </DialogHeader>
        {open ? <MemoryImportDraft /> : null}
      </DialogContent>
    </Dialog>
  );
}
