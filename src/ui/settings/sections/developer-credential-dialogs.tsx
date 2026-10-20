"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

function ApiKeyDraft() {
  const t = useT();
  const reasonId = useId();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("never");
  return (
    <form className={styles.serviceDraft} onSubmit={(event) => event.preventDefault()}>
      <label><span>{t("settings.apiKeyName")}</span><Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("settings.apiKeyPlaceholder")} autoComplete="off" /></label>
      <label><span>{t("settings.expiresAt")}</span><Select value={expiry} onValueChange={setExpiry}>
        <SelectTrigger aria-label={t("settings.expiresAt")}><SelectValue /></SelectTrigger>
        <SelectContent className={styles.serviceSelectOptions} position="popper">
          <SelectItem value="never">{t("settings.expiry.never")}</SelectItem>
          <SelectItem value="1h">{t("settingsServices.expiry1h")}</SelectItem>
          <SelectItem value="24h">{t("settingsServices.expiry24h")}</SelectItem>
          <SelectItem value="7d">{t("settingsServices.expiry7d")}</SelectItem>
          <SelectItem value="180d">{t("settingsServices.expiry180d")}</SelectItem>
          <SelectItem value="360d">{t("settingsServices.expiry360d")}</SelectItem>
        </SelectContent>
      </Select></label>
      <p id={reasonId} className={styles.serviceAvailability}>{t("settingsServices.apiKeysUnavailable")}</p>
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
        <Button type="submit" disabled aria-describedby={reasonId}>{t("settingsServices.createAction")}</Button>
      </DialogFooter>
    </form>
  );
}

export function ApiKeyCreateDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline"><Plus aria-hidden="true" />{t("settingsServices.createApiKey")}</Button></DialogTrigger>
      <DialogContent className={`${styles.serviceDialog} ${styles.developerDialog}`} closeLabel={t("shell.closeDialog")}>
        <DialogHeader><DialogTitle>{t("settingsServices.createApiKey")}</DialogTitle><DialogDescription>{t("settingsServices.draftOnly")}</DialogDescription></DialogHeader>
        {open ? <ApiKeyDraft /> : null}
      </DialogContent>
    </Dialog>
  );
}

function WebhookDraft() {
  const t = useT();
  const reasonId = useId();
  const [url, setUrl] = useState("");
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  return (
    <form className={styles.serviceDraft} onSubmit={(event) => event.preventDefault()}>
      <label><span>URL</span><Input type="url" value={url} onChange={(event) => { setUrl(event.target.value); if (event.target.validity.valid) setInvalid(false); }} onBlur={(event) => setInvalid(event.target.value !== "" && !event.target.validity.valid)} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} placeholder={t("settings.webhookPlaceholder")} autoComplete="off" /></label>
      {invalid ? <p id={errorId} role="alert">{t("settingsServices.invalidUrl")}</p> : null}
      <p id={reasonId} className={styles.serviceAvailability}>{t("settingsServices.webhooksUnavailable")}</p>
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
        <Button type="submit" disabled aria-describedby={reasonId}>{t("firstSite.save")}</Button>
      </DialogFooter>
    </form>
  );
}

export function WebhookCreateDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline"><Plus aria-hidden="true" />{t("settingsServices.createWebhook")}</Button></DialogTrigger>
      <DialogContent className={`${styles.serviceDialog} ${styles.developerDialog}`} closeLabel={t("shell.closeDialog")}>
        <DialogHeader><DialogTitle>{t("settingsServices.createWebhook")}</DialogTitle><DialogDescription>{t("settingsServices.draftOnly")}</DialogDescription></DialogHeader>
        {open ? <WebhookDraft /> : null}
      </DialogContent>
    </Dialog>
  );
}
