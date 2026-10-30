"use client";

import type { McpIconClient } from "@/hub/mcp-icon-client";
import { useMcpIconDraft } from "./use-mcp-icon-draft";
import { McpIconPicker } from "./mcp-icon-picker";
import { connectorCommandFailureMessage } from "./connector-command-failure";

import { useCallback, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { McpServerCreationFlow, McpServerCreationCompletion } from "./mcp-server-creation-flow";
import { McpPreparationStatus } from "./mcp-preparation-status";
import { useMcpServerCreation } from "./use-mcp-server-creation";
import { useT } from "@/i18n/context";

import styles from "./mcp-custom-form.module.css";
import { isMcpCustomHeaderName } from "./mcp-header-validation";

type HeaderDraft = Readonly<{ id: string; name: string; value: string }>;

function createHeader(): HeaderDraft {
  return { id: crypto.randomUUID(), name: "", value: "" };
}

function isHttpsMcpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const loopbackDevelopment =
      process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
    return (
      value.trim() === value &&
      (url.protocol === "https:" || loopbackDevelopment) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.toString() === value
    );
  } catch {
    return false;
  }
}

/**
 * The custom MCP creation surface owns its own fields and interaction model.
 * It maps directly to the private-server V1 aggregate; it does not reuse the
 * URL-MCP form or a compatibility adapter.
 */
export function CustomMcpForm({
  flow,
  iconClient,
  boundary,
  onDone,
  onCancel,
}: {
  flow: McpServerCreationFlow;
  iconClient?: McpIconClient | undefined;
  boundary: ProjectReadBoundary;
  onDone: (result: McpServerCreationCompletion, current: () => boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"streamable_http" | "sse_compat">("streamable_http");
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<HeaderDraft[]>([]);
  const clearSecrets = useCallback(() => setHeaders(current => current.map(header => ({ ...header, value: "" }))), []);
  const creation = useMcpServerCreation(flow, boundary, onCancel, onDone, clearSecrets);
  const { state, completion, admitted, submitting, locked, editable, error, ready, needsOAuth } = creation;
  const displayedTransport = state.unknown === "register" ? flow.getRegistrationTransport() : transport;

  const icon = useMcpIconDraft(iconClient, boundary, locked, state.registered);

  const configuredHeaders = headers.filter((header) => header.name.trim());
  const partialHeader = headers.some(
    (header) => Boolean(header.name.trim()) !== Boolean(header.value),
  );
  const duplicateHeader =
    new Set(
      configuredHeaders.map((header) => header.name.trim().toLowerCase()),
    ).size !== configuredHeaders.length;
  const invalidHeaderName = configuredHeaders.some(
    (header) => !isMcpCustomHeaderName(header.name),
  );
  const invalidUrl = url.trim().length > 0 && !isHttpsMcpUrl(url.trim());
  const canSubmit =
    name.trim().length > 0 &&
    isHttpsMcpUrl(url.trim()) &&
    !partialHeader &&
    !duplicateHeader &&
    !invalidHeaderName &&
    !submitting && !locked && flow.available && icon.draft.canSave();
  const save = (event?: FormEvent<HTMLFormElement>): void => {
    event?.preventDefault();
    if (!canSubmit && !state.unknown && !state.registered) return;
    icon.draft.protectForSave();
    void creation.saveConfiguration({ ...icon.draft.change(), display_name: name.trim(), server_url: url.trim(), transport,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(configuredHeaders.length ? { headers: configuredHeaders.map(header => ({ name: header.name.trim().toLowerCase(), value: header.value })) } : {}),
    });
  };

  const hasPreparationStatus = state.preparationView?.kind === "unknown" || Boolean(state.preparationView?.retired);
  const recoveryRequired = Boolean(state.preparationView?.retired) || error || state.unknown !== null || completion === "retry";
  const legacyConnection = state.registered && state.intent !== "configure" && state.intent !== "publish";
  if ((state.registered || completion !== "idle") && (recoveryRequired || legacyConnection)) {
    return <section className={styles.customMcpResult} aria-live="polite">
      <DialogTitle className={styles.customMcpTitle}>{state.facts?.server.display_name ?? (state.name || name)}</DialogTitle>
      {!admitted ? <p className="sr-only" role="status">{t("mcp.creationSession")}</p> : <p>{submitting ? t("mcp.submitting") : ready ? t("mcp.active") : t("mcp.pending")}</p>}
      {(error || state.unknown) && !hasPreparationStatus ? <p role="alert">{t(state.registrationRejection === "url_conflict" ? "mcp.serverUrlConflict" : connectorCommandFailureMessage(creation.failure, state.unknown ? "mcp.serverCreateUnknown" : "mcp.error"))}</p> : null}
      <McpPreparationStatus view={creation.preparationView} history={creation.history} disabled={!admitted || submitting}
        onCheck={() => void creation.checkPreparation()} onStop={() => void creation.stopWaiting()} onReconnect={() => void creation.reconnect()} />
      <footer>
        <Button type="button" variant="outline" onClick={() => { icon.draft.cancel(); creation.cancel(); }}>{t("mcp.cancel")}</Button>
        {needsOAuth ? <Button type="button" disabled={!admitted || submitting || Boolean(state.unknown)} onClick={() => void creation.authorize()}>{t("settings.connect")}</Button> : null}
        {ready && !state.unknown || completion !== "idle" ? <Button type="button" disabled={!admitted || submitting || !creation.mayResume} onClick={() => void creation.done()}>{t("mcp.creationDone")}</Button> : !hasPreparationStatus && (!needsOAuth || state.unknown) ? <Button type="button" disabled={!admitted || submitting || !creation.mayResume} onClick={() => save()}>{t(state.unknown ? creation.mayResume ? "mcp.retryOriginal" : "mcp.recovery.inspectRequired" : "mcp.retry")}</Button> : null}
      </footer>
    </section>;
  }

  return (
    <form
      className={styles.customMcpForm}
      data-testid="custom-mcp-form"
      autoComplete="off"
      onSubmit={(event) => void save(event)}
    >
      <DialogTitle className={styles.customMcpTitle}>
        {t("mcp.registerDialogTitle")}
      </DialogTitle>
      {!admitted ? <p className="sr-only" role="status">{t("mcp.creationSession")}</p> : null}
      <div className={styles.customMcpFields}>
        <Field className={styles.customMcpField}>
          <FieldLabel htmlFor="custom-mcp-name">
            {t("mcp.customName")}
          </FieldLabel>
          <Input
            id="custom-mcp-name"
            autoFocus
            value={name}
            readOnly={locked}
            placeholder={t("mcp.customNamePlaceholder")}
            onChange={(event) => { if (editable()) setName(event.target.value); }}
          />
        </Field>
        <Field className={styles.customMcpField}>
          <FieldLabel htmlFor="custom-mcp-transport">
            {t("mcp.customTransport")}
          </FieldLabel>
          <Select value={displayedTransport ?? ""} disabled={locked} onValueChange={value => { if (editable() && (value === "streamable_http" || value === "sse_compat")) setTransport(value); }}>
            <SelectTrigger id="custom-mcp-transport" aria-label={t("mcp.customTransport")}><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent><SelectItem value="streamable_http">HTTP</SelectItem><SelectItem value="sse_compat">SSE</SelectItem></SelectContent>
          </Select>
        </Field>
        <Field className={`${styles.customMcpField} ${styles.customMcpWide}`}>
          <McpIconPicker draft={icon.draft} state={icon.state} disabled={locked} />
        </Field>
        <Field className={`${styles.customMcpField} ${styles.customMcpWide}`}>
          <FieldLabel htmlFor="custom-mcp-notes">
            {t("mcp.customInstructions")} <span>{t("mcp.optional")}</span>
          </FieldLabel>
          <Textarea
            id="custom-mcp-notes"
            value={notes}
            readOnly={locked}
            placeholder={t("mcp.customInstructionsPlaceholder")}
            onChange={(event) => { if (editable()) setNotes(event.target.value); }}
            maxLength={4000}
          />
        </Field>
        <Field className={`${styles.customMcpField} ${styles.customMcpWide}`}>
          <FieldLabel htmlFor="custom-mcp-url">
            {t("mcp.customServerUrl")}
          </FieldLabel>
          <Input
            id="custom-mcp-url"
            value={url}
            readOnly={locked}
            placeholder="https://mcp.yourserver.com/mcp"
            onChange={(event) => { if (editable()) setUrl(event.target.value); }}
          />
          {invalidUrl ? (
            <p className={styles.customMcpUrlValidation} role="alert">
              {t("mcp.errInvalid")}
            </p>
          ) : null}
        </Field>
        <fieldset className={`${styles.customMcpField} ${styles.customMcpWide}`}>
          <legend>
            {t("mcp.customHeaders")} <span>{t("mcp.optional")}</span>
          </legend>
          {headers.length > 0 ? (
            <div className={styles.headerRows}>
              {headers.map((header, index) => (
                <div className={styles.headerRow} key={header.id}>
                  <Input
                    value={header.name}
            readOnly={locked}
                    autoComplete="off"
                    aria-label={t("mcp.customHeaderName", {
                      count: index + 1,
                    })}
                    placeholder={t("mcp.customHeaderNamePlaceholder")}
                    onChange={(event) =>
                      editable() && setHeaders((current) =>
                        current.map((candidate) =>
                          candidate.id === header.id
                            ? { ...candidate, name: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                  />
                  <Input
                    value={header.value}
            readOnly={locked}
                    type="password"
                    autoComplete="new-password"
                    aria-label={t("mcp.customHeaderValue", {
                      count: index + 1,
                    })}
                    placeholder={t("mcp.customHeaderValuePlaceholder")}
                    onChange={(event) =>
                      editable() && setHeaders((current) =>
                        current.map((candidate) =>
                          candidate.id === header.id
                            ? { ...candidate, value: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    type="button"
                    disabled={locked}
                    onClick={() =>
                      editable() && setHeaders((current) =>
                        current.filter((candidate) => candidate.id !== header.id),
                      )
                    }
                    aria-label={`${t("mcp.customRemoveHeader")} ${index + 1}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          {invalidHeaderName ? (
            <p className={styles.customMcpUrlValidation} role="alert">
              {t("mcp.errHeaderName")}
            </p>
          ) : null}
          <Button
            variant="outline"
            type="button"
            className={styles.addHeaderButton}
            disabled={locked}
            onClick={() => { if (editable()) setHeaders((current) => [...current, createHeader()]); }}
          >
            <Plus aria-hidden="true" />
            {t("mcp.customAddHeader")}
          </Button>
        </fieldset>
      </div>
      {(error || state.unknown) && !hasPreparationStatus ? <p className={styles.customMcpError} role="alert">{t(state.registrationRejection === "url_conflict" ? "mcp.serverUrlConflict" : connectorCommandFailureMessage(creation.failure, state.unknown ? "mcp.serverCreateUnknown" : "mcp.error"))}</p> : null}
      <footer className={styles.customMcpActions}>
        <Button type="submit" className="relative" aria-busy={submitting || undefined} disabled={!admitted || submitting || !creation.mayResume || (!state.unknown && !canSubmit)}>
          <span className={submitting ? "invisible" : undefined} aria-hidden={submitting || undefined}>{t(state.unknown ? creation.mayResume ? "mcp.retryOriginal" : "mcp.recovery.inspectRequired" : "mcp.save")}</span>
          {submitting ? <><span className="absolute inset-0 flex items-center justify-center" aria-hidden="true"><Spinner /></span><span className="sr-only" role="status">{t("mcp.submitting")}</span></> : null}
        </Button>
      </footer>
    </form>
  );
}
