"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

type AccountServiceKind = "email" | "delete";
type AccountServiceIdentity = Readonly<{ name: string | null; email: string | null; subject: string }>;

export function AccountServiceDetailsDialog({ kind, confirmedEmail, identity }: { kind: AccountServiceKind; confirmedEmail: string | null; identity: AccountServiceIdentity | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const title = t(kind === "email" ? "settings.changeEmailTitle" : "settings.deleteAccount");
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline">{t(kind === "email" ? "settings.changeEmail" : "settings.deleteAccount")}</Button></DialogTrigger>
    <DialogContent className={`${styles.accountServiceDialog} ${kind === "email" ? styles.accountEmailVerification : styles.accountDeletion}`} closeLabel={t("shell.closeDialog")}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{t(kind === "email" ? "settings.changeEmailSecurity" : "settings.deleteWarningPermanent")}</DialogDescription></DialogHeader>
      {open ? <AccountServiceDraft kind={kind} confirmedEmail={confirmedEmail} identity={identity} /> : null}
    </DialogContent>
  </Dialog>;
}

function AccountServiceDraft({ kind, confirmedEmail, identity }: { kind: AccountServiceKind; confirmedEmail: string | null; identity: AccountServiceIdentity | null }) {
  const t = useT();
  const id = useId();
  const [code, setCode] = useState("");
  return <div className={styles.accountServiceBody}>
    {kind === "email" ? <div className={styles.accountVerifySection}>
      <label htmlFor={`${id}-code`}>{t("settings.verifyIdentity")}</label>
      <p>{confirmedEmail ? t("settings.verifyIdentityHint", { email: confirmedEmail }) : t("settingsServices.confirmedEmailUnknown")}</p>
      <div className={styles.accountVerifyCode}>
        <Input id={`${id}-code`} aria-label={t("settings.verificationCode")} placeholder={t("settings.verificationCode")} value={code} onChange={(event) => setCode(event.target.value)} aria-describedby={`${id}-reason`} autoComplete="off" />
        <Button type="button" variant="ghost" disabled aria-describedby={`${id}-reason`}>{t("settings.send")}</Button>
      </div>
    </div> : <div className={styles.accountDeleteIdentity}>
      <span className={styles.accountDeleteAvatar} aria-hidden="true">{identity?.name?.trim().slice(0, 1).toUpperCase() || "K"}</span>
      <div><strong>{identity?.name || "Kokoro"}</strong><span>Kokoro</span><span>{identity ? identity.email ?? identity.subject : t("settingsServices.identityUnavailable")}</span></div>
    </div>}
    <p id={`${id}-reason`} className={styles.accountServiceReason}>{t("settingsServices.accountServiceUnavailable")}</p>
    <DialogFooter>
      <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
      <Button type="button" variant={kind === "delete" ? "destructive" : "default"} disabled aria-describedby={`${id}-reason`}>{t(kind === "delete" ? "settings.deleteAccount" : "settingsServices.next")}</Button>
    </DialogFooter>
  </div>;
}
