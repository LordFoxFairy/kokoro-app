"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { HubClient } from "@/hub/client";
import { useT } from "@/i18n/context";

import styles from "./mcp-create-dialog.module.css";

/**
 * Manus accepts one complete configuration document. The browser must not
 * enumerate servers, issue a registration loop, or show a per-item loading
 * screen: Platform validates and persists the document atomically.
 */
export function JsonMcpImportForm({
  client,
  onCancel,
  onDone,
  onRegistered,
}: {
  client: HubClient;
  onCancel: () => void;
  onDone: () => Promise<void>;
  onRegistered?: () => void;
}) {
  const t = useT();
  const [config, setConfig] = useState("");
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting || !config.trim() || !client.importPrivateMcpJson) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setSubmitting(true);
    try {
      await client.importPrivateMcpJson(config);
      onRegistered?.();
      await onDone();
    } catch {
      // Keep the editor and its original document intact for a correction.
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className={styles.jsonImportForm}
      onSubmit={(event) => void submit(event)}
    >
      <DialogTitle className={styles.compactDialogTitle}>
        {t("mcp.jsonImportTitle")}
      </DialogTitle>
      <p className={styles.compactDialogDescription}>
        {t("mcp.jsonImportDescription")}
      </p>
      <Textarea
        autoFocus
        value={config}
        aria-label={t("mcp.jsonImportDescription")}
        aria-invalid={failed || undefined}
        aria-busy={submitting || undefined}
        onChange={(event) => {
          setConfig(event.target.value);
          setFailed(false);
        }}
      />
      {failed ? (
        <p className={styles.compactDialogError} role="alert">
          {t("mcp.jsonImportInvalid")}
        </p>
      ) : null}
      <div className={styles.jsonImportActions}>
        <Button
          type="button"
          variant="ghost"
          className={styles.visuallyHiddenCancel}
          onClick={onCancel}
        >
          {t("mcp.cancel")}
        </Button>
        <Button type="submit" disabled={!config.trim() || submitting}>
          {t("mcp.jsonImportAction")}
        </Button>
      </div>
    </form>
  );
}
