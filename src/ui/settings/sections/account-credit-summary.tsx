"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { BillingSummary as CreditSummaryCard } from "@/ui/billing/billing-summary";
import type { BillingSummary } from "@/contract/http";
import { useT } from "@/i18n/context";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { browserBillingClient, readBrowserAuthIndexSubject } from "@/ui/shell/page-clients";
import { useAccountReadSnapshots } from "../account-read-snapshots";

type Result = { scope: string } & (
  | { phase: "ready"; summary: BillingSummary }
  | { phase: "error" }
);

/** Same compact credit card, sharing the open Settings read without mounting history. */
export function AccountCreditSummary({ preview = false, readBoundary, onOpenPricing }: {
  preview?: boolean;
  onOpenPricing?: () => void;
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
  const readSummary = snapshots?.readSummary;
  let summarySubjectCurrent = readSummary === undefined;
  if (!summarySubjectCurrent) {
    try { summarySubjectCurrent = readBrowserAuthIndexSubject() === subject; } catch { /* An unreadable marker retires shared data. */ }
  }
  const [result, setResult] = useState<Result | null>(() => {
    const summary = summarySubjectCurrent && scope !== null && snapshots?.summary?.scope === scope && snapshots.summary.client === client ? snapshots.summary.value : null;
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
        const summary = await (readSummary ? readSummary(client) : client.summary(controller.signal, () => isCurrent() && readBrowserAuthIndexSubject() === subject));
        if (isCurrent()) {
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
  }, [client, scope, readSummary, subject]);

  const warm = summarySubjectCurrent && scope !== null && snapshots?.summary?.scope === scope && snapshots.summary.client === client ? snapshots.summary.value : null;
  const visible = summarySubjectCurrent ? (result?.scope === scope && result.phase === "ready" ? result.summary : warm) : null;
  const pending = scope !== null && summarySubjectCurrent && visible === null && result?.scope !== scope;
  return <>
    <CreditSummaryCard summary={visible === null ? { kind: pending ? "loading" : "error" } : { kind: "ready", summary: visible }} embedded retrying={false} onOpenPricing={onOpenPricing} />
    {scope === null || !summarySubjectCurrent ? <span className="sr-only" role="status">{t("settings.accountCreditsUnknown")}</span> : pending ? <span className="sr-only" role="status" aria-label={t("billing.loading")} /> : null}
    {visible === null ? null : <p className="sr-only" role="status" data-account-status={visible.status}>{t(visible.status === "disabled" ? "settings.accountCreditsDisabled" : "settings.accountCreditsActive")}</p>}
  </>;
}
