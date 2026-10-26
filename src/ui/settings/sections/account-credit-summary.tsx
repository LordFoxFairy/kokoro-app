"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { formatCredits } from "@/billing/format";
import type { BillingSummary } from "@/contract/http";
import { useT } from "@/i18n/context";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { browserBillingClient, readBrowserAuthIndexSubject } from "@/ui/shell/page-clients";
import { useAccountReadSnapshots } from "../account-read-snapshots";

import styles from "./settings-sections.module.css";

type Result = { scope: string } & (
  | { phase: "ready"; summary: BillingSummary }
  | { phase: "error" }
);

/** The account overview owns one read, without mounting the ledger consumer. */
export function AccountCreditSummary({ preview = false, readBoundary }: {
  preview?: boolean;
  readBoundary: ProjectReadBoundary | undefined;
}) {
  const t = useT();
  const subject = readBoundary?.subject;
  const generation = readBoundary?.generation;
  const scope = !preview && readBoundary?.admitted === true &&
    typeof subject === "string" && subject.trim().length > 0 &&
    typeof generation === "number" && Number.isSafeInteger(generation) && generation >= 0
    ? JSON.stringify([subject, generation]) : null;
  const [client] = useState(() => browserBillingClient());
  const snapshots = useAccountReadSnapshots();
  const rememberSummary = snapshots?.rememberSummary;
  const [result, setResult] = useState<Result | null>(() => {
    const summary = scope !== null && snapshots?.summary?.scope === scope ? snapshots.summary.value : null;
    return summary && scope !== null ? { scope, phase: "ready", summary } : null;
  });
  const current = useRef<AbortController | null>(null);

  // Retire before the next scope can paint, including unmount into sign-in methods.
  useLayoutEffect(() => () => {
    const controller = current.current;
    current.current = null;
    controller?.abort();
  }, [scope]);

  useEffect(() => {
    if (scope === null) return;
    const controller = new AbortController();
    current.current = controller;
    const isCurrent = () => current.current === controller && !controller.signal.aborted;
    void Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      try {
        const summary = await client.summary(controller.signal, () => isCurrent() && readBrowserAuthIndexSubject() === subject);
        if (isCurrent()) {
          rememberSummary?.(scope, summary);
          setResult({ scope, phase: "ready", summary });
        }
      } catch {
        if (isCurrent()) setResult(previous => previous?.scope === scope && previous.phase === "ready" ? previous : { scope, phase: "error" });
      }
    });
    return () => {
      if (current.current === controller) current.current = null;
      controller.abort();
    };
  }, [client, scope, rememberSummary, subject]);

  const visible = result?.scope === scope && result.phase === "ready" ? result.summary : null;
  const pending = scope !== null && result?.scope !== scope;
  return <section className={styles.accountCreditSummary} aria-label={t("settings.creditsMenu")} aria-busy={pending}>
    {scope === null ? <span className="sr-only" role="status">{t("settings.accountCreditsUnknown")}</span> : pending ? <span className="sr-only" role="status" aria-label={t("billing.loading")} /> : null}
    <dl className={styles.accountCreditNumbers}>
      <div><dt>{t("billing.balance")}</dt><dd>{visible === null ? "—" : formatCredits(visible.available_micros)}</dd></div>
      <div><dt>{t("billing.held")}</dt><dd>{visible === null ? "—" : formatCredits(visible.held_micros)}</dd></div>
    </dl>
    {visible === null ? null : <p className={styles.accountCreditStatus} role="status" data-account-status={visible.status}>{t(visible.status === "disabled" ? "settings.accountCreditsDisabled" : "settings.accountCreditsActive")}</p>}
  </section>;
}
