"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { BillingClientError } from "@/billing/client";
import { formatCredits } from "@/billing/format";
import { Button } from "@/components/ui/button";
import type { BillingSummary } from "@/contract/http";
import { useT } from "@/i18n/context";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { browserBillingClient } from "@/ui/shell/page-clients";

import styles from "./settings-sections.module.css";

type Result = { scope: string; attempt: number } & (
  | { phase: "ready"; summary: BillingSummary }
  | { phase: "error" | "missing_account" }
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
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
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
        const summary = await client.summary(controller.signal);
        if (isCurrent()) setResult({ scope, attempt, phase: "ready", summary });
      } catch (error) {
        if (isCurrent()) setResult({ scope, attempt, phase:
          error instanceof BillingClientError && error.reason === "missing_account"
            ? "missing_account" : "error" });
      }
    });
    return () => {
      if (current.current === controller) current.current = null;
      controller.abort();
    };
  }, [client, scope, attempt]);

  const visible = result?.scope === scope && result.attempt === attempt ? result : null;
  return <section className={styles.accountCreditSummary} aria-label={t("settings.creditsMenu")} aria-busy={scope !== null && visible === null}>
    {scope === null ? <p role="status">{t("settings.accountCreditsUnknown")}</p> : visible === null ? <p role="status">{t("billing.loading")}</p> : null}
    {visible?.phase === "error" ? <div role="alert" className={styles.accountCreditFeedback}>
      <p>{t("billing.loadError")}</p>
      <Button variant="outline" size="sm" type="button" onClick={() => setAttempt((value) => value + 1)}>{t("billing.retry")}</Button>
    </div> : null}
    {visible?.phase === "missing_account" ? <p role="status">{t("billing.missingAccount")}</p> : null}
    {visible?.phase === "ready" ? <>
      <dl className={styles.accountCreditNumbers}>
        <div><dt>{t("billing.balance")}</dt><dd>{formatCredits(visible.summary.available_micros)}</dd></div>
        <div><dt>{t("billing.held")}</dt><dd>{formatCredits(visible.summary.held_micros)}</dd></div>
      </dl>
      <p className={styles.accountCreditStatus} role="status" data-account-status={visible.summary.status}>{t(visible.summary.status === "disabled" ? "settings.accountCreditsDisabled" : "settings.accountCreditsActive")}</p>
    </> : null}
  </section>;
}
