"use client";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import type { KnowledgeSession, KnowledgeState } from "./session";
import styles from "./knowledge.module.css";
export function KnowledgeFeedback({
  session,
  state,
  admitted,
  onAdopt,
}: {
  session: KnowledgeSession;
  state: KnowledgeState;
  admitted: boolean;
  onAdopt?: () => void;
}) {
  const t = useT();
  const keys = {
    loadFailed: "settings.knowledgeLoadFailed",
    unconfirmed: "settings.knowledgePending",
    conflict: "settings.knowledgeConflict",
    saved: "settings.saved",
    invalid: "settings.knowledgeInvalid",
  } as const;
  const message = state.pending
    ? state.pending.phase === "conflict"
      ? "conflict"
      : "unconfirmed"
    : state.message;
  if (!admitted || !message || state.pending?.phase === "saving") return null;
  return (
    <div className={styles.feedback} aria-live="polite">
      <p role="status">{t(keys[message])}</p>
      {state.pending ? (
        <div className={styles.recoveryActions}>
          <Button
            size="sm"
            variant="outline"
            disabled={state.verifying || state.loading}
            onClick={() => void session.verify()}
          >
            {t("settings.knowledgeCheck")}
          </Button>
          {state.pending.canAdopt ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={state.verifying || state.loading}
              onClick={() => {
                if (session.adoptCurrent()) onAdopt?.();
              }}
            >
              {t("settings.knowledgeAdopt")}
            </Button>
          ) : null}
        </div>
      ) : state.message === "loadFailed" ||
        !state.itemsReady ||
        !state.usageReady ? (
        <Button
          size="sm"
          variant="outline"
          disabled={state.loading}
          onClick={() => void session.load()}
        >
          {t("skills.retry")}
        </Button>
      ) : null}
    </div>
  );
}
