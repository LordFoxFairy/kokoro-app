"use client";

import { connectorCommandFailureMessage } from "./connector-command-failure";

import { useCallback, useState } from "react";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { McpServerCreationFlow, McpServerCreationCompletion } from "./mcp-server-creation-flow";
import { useMcpServerCreation } from "./use-mcp-server-creation";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ChevronDown, Link2, Plus, Settings2, Trash2 } from "lucide-react";
import { useT } from "@/i18n/context";

import styles from "./mcp-create-dialog.module.css";

function isMcpEndpointUrl(value: string): boolean {
  try {
    const endpoint = new URL(value);
    const loopbackDevelopment =
      process.env.NODE_ENV !== "production" &&
      endpoint.protocol === "http:" &&
      (endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1" || endpoint.hostname === "[::1]");
    return (
      value.trim() === value &&
      (endpoint.protocol === "https:" || loopbackDevelopment) &&
      endpoint.hostname.length > 0 &&
      endpoint.username === "" &&
      endpoint.password === "" &&
      endpoint.search === "" &&
      endpoint.hash === "" &&
      endpoint.toString() === value
    );
  } catch {
    return false;
  }
}

type HeaderDraft = Readonly<{ id: string; name: string; value: string }>;

function createHeaderDraft(): HeaderDraft {
  return { id: crypto.randomUUID(), name: "", value: "" };
}

/**
 * URL creation keeps its own fields while the actor-owned workflow coordinates
 * Register, fresh exact reads, Prepare and OAuth reconciliation. No connector
 * page scan or popup notification substitutes for current owner facts.
 */
export function UrlMcpForm({
  flow,
  boundary,
  onCancel,
  onDone,
  onPublish,
  onAuthorizationNavigate,
  showTitle = true,
  title,
  showBeta = true,
  showHeaders = false,
  showOAuth = true,
}: {
  flow: McpServerCreationFlow;
  boundary: ProjectReadBoundary;
  onCancel: () => void;
  onDone: (result: McpServerCreationCompletion, current: () => boolean) => Promise<void>;
  onPublish?: (result: McpServerCreationCompletion, current: () => boolean) => Promise<void>;
  onAuthorizationNavigate?: (url: string) => void;
  showTitle?: boolean;
  title?: string;
  showBeta?: boolean;
  /** URL MCP exposes only OAuth in advanced settings; custom MCP opts into headers. */
  showHeaders?: boolean;
  showOAuth?: boolean;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [headers, setHeaders] = useState<HeaderDraft[]>(() => [
    createHeaderDraft(),
  ]);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const clearSecrets = useCallback(() => { setHeaders(current => current.map(header => ({ ...header, value: "" }))); setClientSecret(""); }, []);
  const creation = useMcpServerCreation(flow, boundary, onCancel, onDone, clearSecrets, onAuthorizationNavigate, onPublish);
  const { state, completion, admitted, submitting, locked, editable, error, ready: isReady, needsOAuth: requiresOAuth } = creation;
  const configuredHeaders = headers.filter((header) => header.name.trim());
  const headerIsPartial =
    showHeaders &&
    headers.some(
      (header) =>
        (header.name.trim().length === 0) !== (header.value.length === 0),
    );
  const duplicateHeader =
    showHeaders &&
    new Set(
      configuredHeaders.map((header) => header.name.trim().toLowerCase()),
    ).size !== configuredHeaders.length;
  const oauthIsPartial =
    showOAuth &&
    (clientId.trim().length === 0) !== (clientSecret.length === 0);
  const invalidUrl = url.trim().length > 0 && !isMcpEndpointUrl(url.trim());
  const canSubmit =
    name.trim().length > 0 &&
    isMcpEndpointUrl(url.trim()) &&
    !headerIsPartial &&
    !duplicateHeader &&
    !oauthIsPartial &&
    !submitting && !locked && flow.available;
  const registerAndPrepare = async (publish: boolean): Promise<void> => {
    if (!canSubmit && !state.unknown && !state.registered) return;
    const save = publish || state.publishRequested ? creation.saveForPublication : creation.save;
    await save({ display_name: name.trim(), server_url: url.trim(),
      ...(showHeaders && configuredHeaders.length ? { headers: configuredHeaders.map(header => ({ name: header.name.trim().toLowerCase(), value: header.value })) } : {}),
      ...(showOAuth && clientId.trim() ? { oauth_client: { client_id: clientId.trim(), client_secret: clientSecret } } : {}),
    });
  };
  const submitLabel = t(submitting ? "mcp.submitting" : state.unknown ? creation.mayResume ? "mcp.retryOriginal" : "mcp.recovery.inspectRequired" : "mcp.save");

  if (state.registered || completion !== "idle") {
    return <section className={styles.urlMcpForm} aria-live="polite">
      {showTitle ? <DialogTitle className={styles.urlMcpTitle}>{state.facts?.server.display_name ?? (state.name || name)}</DialogTitle> : null}
      {!admitted ? <p className="sr-only" role="status">{t("mcp.creationSession")}</p> : <p className={styles.urlWarning}>{submitting ? t("mcp.submitting") : isReady ? t("mcp.active") : t("mcp.pending")}</p>}
      {error || state.unknown ? <p className={styles.compactDialogError} role="alert">{t(state.registrationRejection === "url_conflict" ? "mcp.serverUrlConflict" : connectorCommandFailureMessage(creation.failure, state.unknown ? "mcp.serverCreateUnknown" : "mcp.error"))}</p> : null}
      <div className={styles.urlMcpActions}>
        <Button type="button" variant="outline" onClick={creation.cancel}>{t("mcp.cancel")}</Button><span />
        {requiresOAuth ? <Button type="button" disabled={!admitted || submitting || Boolean(state.unknown)} onClick={() => void creation.authorize()}>{t("settings.connect")}</Button> : null}
        {isReady && !state.unknown || completion !== "idle" ? <Button type="button" disabled={!admitted || submitting || !creation.mayResume} onClick={() => void creation.done()}>{t("mcp.creationDone")}</Button> : !requiresOAuth || state.unknown ? <Button type="button" disabled={!admitted || submitting || !creation.mayResume} onClick={() => void registerAndPrepare(false)}>{submitLabel}</Button> : null}
      </div>
    </section>;
  }

  return (
    <form
      className={styles.urlMcpForm}
      onSubmit={(event) => {
        event.preventDefault();
        void registerAndPrepare(false);
      }}
    >
      {!admitted ? <p className="sr-only" role="status">{t("mcp.creationSession")}</p> : null}
      {showTitle ? (
        <DialogTitle className={styles.urlMcpTitle}>
          {title ?? t("mcp.urlTitle")}
          {showBeta ? <span>{t("connectorCatalog.beta")}</span> : null}
        </DialogTitle>
      ) : null}
      <Field className={styles.urlMcpField}>
        <FieldLabel htmlFor="url-mcp-name">
          {t("mcp.customName")}
          <span>*</span>
        </FieldLabel>
        <Input
          id="url-mcp-name"
          autoFocus
          value={name}
          readOnly={locked}
          placeholder={t("mcp.urlNamePlaceholder")}
          onChange={(event) => { if (editable()) setName(event.target.value); }}
        />
      </Field>
      <Field className={styles.urlMcpField}>
        <FieldLabel htmlFor="url-mcp-url">
          {t("mcp.customServerUrl")}
          <span>*</span>
        </FieldLabel>
        <div className={styles.urlInput}>
          <Link2 aria-hidden="true" />
          <Input
            id="url-mcp-url"
            value={url}
          readOnly={locked}
            placeholder="https://mcp.yourserver.com/mcp"
            onChange={(event) => { if (editable()) setUrl(event.target.value); }}
          />
        </div>
        {invalidUrl ? (
          <p className={styles.compactDialogError} role="alert">
            {t("mcp.errInvalid")}
          </p>
        ) : null}
      </Field>
      <button
        type="button"
        className={styles.advancedToggle}
        aria-expanded={advanced}
        onClick={() => setAdvanced((value) => !value)}
      >
        <Settings2 aria-hidden="true" />
        <span>{t("mcp.advancedSettings")}</span>
        <small>{t("mcp.optional")}</small>
        <ChevronDown aria-hidden="true" />
      </button>
      {advanced ? (
        <div className={styles.advancedFields}>
          {showHeaders ? (
            <>
              <fieldset className={styles.headerFields}>
                <legend>{t("mcp.customHeaders")}</legend>
                {headers.map((header, index) => (
                  <div key={header.id} className={styles.headerRow}>
                    <Input
                      aria-label={t("mcp.customHeaderName", {
                        count: index + 1,
                      })}
                      value={header.name}
          readOnly={locked}
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
                      autoComplete="off"
                    />
                    <Input
                      aria-label={t("mcp.customHeaderValue", {
                        count: index + 1,
                      })}
                      type="password"
                      value={header.value}
          readOnly={locked}
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
                      autoComplete="new-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${t("mcp.customRemoveHeader")} ${index + 1}`}
                      disabled={locked || headers.length === 1}
                      onClick={() =>
                        editable() && setHeaders((current) =>
                          current.length === 1
                            ? current
                            : current.filter(
                                (candidate) => candidate.id !== header.id,
                              ),
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={locked}
                  onClick={() =>
                    editable() && setHeaders((current) => [
                      ...current,
                      createHeaderDraft(),
                    ])
                  }
                >
                  <Plus aria-hidden="true" /> {t("mcp.customAddHeader")}
                </Button>
              </fieldset>
            </>
          ) : null}
          {showOAuth ? (
            <>
              <Input
                id="url-mcp-client-id"
                aria-label="OAuth Client ID"
                placeholder="OAuth 客户端 ID"
                value={clientId}
          readOnly={locked}
                onChange={(event) => { if (editable()) setClientId(event.target.value); }}
                autoComplete="off"
              />
              <Input
                id="url-mcp-client-secret"
                aria-label="OAuth Client Secret"
                placeholder="OAuth 客户端密钥"
                type="password"
                value={clientSecret}
          readOnly={locked}
                onChange={(event) => { if (editable()) setClientSecret(event.target.value); }}
                autoComplete="new-password"
              />
            </>
          ) : null}
        </div>
      ) : null}
      {error || state.unknown ? (
        <p className={styles.compactDialogError} role="alert">
          {t(state.registrationRejection === "url_conflict" ? "mcp.serverUrlConflict" : connectorCommandFailureMessage(creation.failure, state.unknown ? "mcp.serverCreateUnknown" : "mcp.error"))}
        </p>
      ) : null}
      <p className={styles.urlWarning}>{t("mcp.urlWarning")}</p>
      <div className={styles.urlMcpActions}>
        <Button type="button" variant="outline" onClick={creation.cancel}>
          {t("mcp.cancel")}
        </Button>
        <span />
        <Button type="submit" variant="outline" disabled={!admitted || submitting || !creation.mayResume || (!state.unknown && !canSubmit)}>
          {submitLabel}
        </Button>
        <Button
          type="button"
          disabled={!onPublish || !admitted || submitting || !creation.mayResume || (!state.unknown && !canSubmit)}
          onClick={() => void registerAndPrepare(true)}
        >
          {t("mcp.saveAndPublish")}
          <ChevronDown aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
