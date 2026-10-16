"use client";

import { useCallback, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { McpJsonImportFlow } from "./mcp-json-import-flow";
import { useConnectorCreationForm } from "./use-connector-creation-form";
import { useT } from "@/i18n/context";

import styles from "./mcp-create-dialog.module.css";

/**
 * Manus accepts one complete configuration document. The browser must not
 * enumerate servers, issue a registration loop, or show a per-item loading
 * screen: Platform validates and persists the document atomically.
 */
export function JsonMcpImportForm({
  flow,
  boundary,
  onCancel,
  onDone,
}: {
  flow: McpJsonImportFlow;
  boundary: ProjectReadBoundary;
  onCancel: () => void;
  onDone: () => Promise<void>;
}) {
  const t = useT();
  const [config, setConfig] = useState("");
  const clearDocument = useCallback(() => setConfig(""), []);
  const { state, completion, admitted, submitting, locked, editable, maySubmit, done } =
    useConnectorCreationForm(flow, boundary, onDone, clearDocument);
  const failed = state.kind === "unknown" || state.kind === "rejected";
  const completed = state.kind === "completed" || completion !== "idle";

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!maySubmit()) return;
    const confirmed = state.kind === "unknown" ? await flow.retry(boundary)
      : editable() && Boolean(config.trim()) && await flow.submit(config, boundary);
    if (confirmed) await done();
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
      {!admitted ? <p className="sr-only" role="status">{t("mcp.creationSession")}</p> : null}
      <Textarea
        autoFocus
        value={config}
        readOnly={locked}
        aria-label={t("mcp.jsonImportDescription")}
        aria-invalid={failed || undefined}
        aria-busy={submitting || undefined}
        onChange={(event) => {
          if (editable()) setConfig(event.target.value);
        }}
      />
      {failed ? (
        <p className={styles.compactDialogError} role="alert">
          {t(state.kind === "unknown" ? "mcp.jsonImportUnknown" : "mcp.jsonImportInvalid")}
        </p>
      ) : null}
      {completed ? <p role="status">{t("mcp.jsonImportConfirmed")}</p> : null}
      {completion === "retry" ? <p role="alert">{t("mcp.actionFailed")}</p> : null}
      <div className={styles.jsonImportActions}>
        <Button
          type="button"
          variant="ghost"
          className={styles.visuallyHiddenCancel}
          onClick={onCancel}
        >
          {t("mcp.cancel")}
        </Button>
        {completed ? <Button type="button" disabled={!admitted || completion === "closing"} onClick={() => void done()}>{t("mcp.creationDone")}</Button> : <Button type="submit" disabled={!admitted || !flow.available || submitting || (state.kind !== "unknown" && !config.trim())}>
          {t(state.kind === "unknown" ? "mcp.retryOriginal" : "mcp.jsonImportAction")}
        </Button>}
      </div>
    </form>
  );
}
