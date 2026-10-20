"use client";

import { useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

function WorkflowDraft() {
  const t = useT();
  const reasonId = useId();
  const domainId = useId();
  const [suffix, setSuffix] = useState("");
  const [instructions, setInstructions] = useState("");
  return (
    <form className={styles.serviceDraft} onSubmit={(event) => event.preventDefault()}>
      <label><span>{t("settingsServices.workflowSuffix")}</span><span className={styles.mailAddressDraft}><span>{t("settingsServices.mailPrefixPending")}</span><Input aria-label={t("settingsServices.workflowSuffix")} value={suffix} onChange={(event) => setSuffix(event.target.value)} placeholder={t("settingsServices.workflowSuffixPlaceholder")} aria-describedby={domainId} autoComplete="off" /><span>{t("settingsServices.mailDomainPending")}</span></span></label>
      <p id={domainId}>{t("settingsServices.workflowAddressUnavailable")}</p>
      <label><span>{t("settingsServices.workflowInstructions")}</span><Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder={t("settingsServices.workflowInstructionsPlaceholder")} /></label>
      <p id={reasonId} className={styles.serviceAvailability}>{t("settingsServices.mailUnavailable")}</p>
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
        <Button type="submit" disabled aria-describedby={reasonId}>{t("settingsServices.createAction")}</Button>
      </DialogFooter>
    </form>
  );
}

export function MailWorkflowDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" aria-label={t("settingsServices.addWorkflow")}><Plus aria-hidden="true" />{t("settingsServices.add")}</Button></DialogTrigger>
      <DialogContent className={`${styles.serviceDialog} ${styles.mailWorkflowDialog}`} closeLabel={t("shell.closeDialog")}>
        <DialogHeader><DialogTitle>{t("settingsServices.addWorkflow")}</DialogTitle><DialogDescription>{t("settingsServices.draftOnly")}</DialogDescription></DialogHeader>
        {open ? <WorkflowDraft /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SenderDraft({ onCancel, formRef, inputRef, id }: { onCancel: () => void; formRef: RefObject<HTMLFormElement | null>; inputRef: RefObject<HTMLInputElement | null>; id: string }) {
  const t = useT();
  const reasonId = useId();
  const [email, setEmail] = useState("");
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  return (
    <form id={id} ref={formRef} aria-label={t("settingsServices.addSender")} className={`${styles.serviceDraft} ${styles.mailSenderForm}`} onSubmit={(event) => event.preventDefault()}>
      <label><span>{t("settingsServices.senderEmail")}</span><Input ref={inputRef} type="email" value={email} onChange={(event) => { setEmail(event.target.value); if (event.target.validity.valid) setInvalid(false); }} onBlur={(event) => setInvalid(event.target.value !== "" && !event.target.validity.valid)} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} autoComplete="off" /></label>
      {invalid ? <p id={errorId} role="alert">{t("settingsServices.invalidEmail")}</p> : null}
      <p id={reasonId} className={styles.serviceAvailability}>{t("settingsServices.mailUnavailable")}</p>
      <div className={styles.mailSenderActions}>
        <Button type="button" variant="outline" onClick={onCancel}>{t("firstSite.cancel")}</Button>
        <Button type="submit" disabled aria-describedby={reasonId}>{t("firstSite.save")}</Button>
      </div>
    </form>
  );
}

export function MailSenderEditor() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancel = () => { setOpen(false); triggerRef.current?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      const form = formRef.current;
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented || !form || !(event.target instanceof Node) || !form.contains(event.target) || !form.contains(document.activeElement)) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [open]);
  return (
    <div className={styles.mailSenderControl}>
      <Button ref={triggerRef} type="button" variant="outline" aria-label={t("settingsServices.addSender")} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((current) => !current)}><Plus aria-hidden="true" />{t("settingsServices.addSender")}</Button>
      {open ? <SenderDraft id={id} formRef={formRef} inputRef={inputRef} onCancel={cancel} /> : null}
    </div>
  );
}

function MailboxDraft() {
  const t = useT();
  const reasonId = useId();
  const domainId = useId();
  const [prefix, setPrefix] = useState("");
  return (
    <form className={styles.serviceDraft} onSubmit={(event) => event.preventDefault()}>
      <label><span>{t("settingsServices.emailPrefix")}</span><span className={styles.mailAddressDraft}><Input aria-label={t("settingsServices.emailPrefix")} value={prefix} onChange={(event) => setPrefix(event.target.value)} aria-describedby={domainId} autoComplete="off" /><span>{t("settingsServices.mailDomainPending")}</span></span></label>
      <p id={domainId}>{t("settingsServices.workflowAddressUnavailable")}</p>
      <p id={reasonId} className={styles.serviceAvailability}>{t("settingsServices.mailUnavailable")}</p>
      <DialogFooter><DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose><Button type="submit" disabled aria-describedby={reasonId}>{t("firstSite.save")}</Button></DialogFooter>
    </form>
  );
}

export function MailboxSettingsDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" aria-label={t("settingsServices.mailSettings")}><Pencil aria-hidden="true" />{t("settingsServices.mailSettings")}</Button></DialogTrigger>
      <DialogContent className={`${styles.serviceDialog} ${styles.mailboxDialog}`} closeLabel={t("shell.closeDialog")}>
        <DialogHeader><DialogTitle>{t("settingsServices.mailboxSettingsTitle")}</DialogTitle><DialogDescription>{t("settingsServices.draftOnly")}</DialogDescription></DialogHeader>
        {open ? <MailboxDraft /> : null}
      </DialogContent>
    </Dialog>
  );
}
