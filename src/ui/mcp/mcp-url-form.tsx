"use client";

import { useMemo, useState } from "react";
import type {
  McpPrivateServerPrepare,
  McpPrivateServerRegistration,
} from "@/hub/mcp-connector.schema";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ChevronDown, Link2, Plus, Settings2, Trash2 } from "lucide-react";
import { useT } from "@/i18n/context";
import { HubClientError, type HubClient } from "@/hub/client";

import styles from "./mcp-create-dialog.module.css";
import { useMcpOAuthPopup } from "./use-mcp-oauth-popup";

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

type PreparedRegistration =
  | McpPrivateServerRegistration
  | McpPrivateServerPrepare;
type HeaderDraft = Readonly<{ id: string; name: string; value: string }>;

function createHeaderDraft(): HeaderDraft {
  return { id: crypto.randomUUID(), name: "", value: "" };
}

/**
 * One private MCP intent has one deterministic owner sequence: Register then
 * Prepare. OAuth is only opened from the owner-issued Prepare result; this
 * form never rereads the server or scans connector pages after the popup.
 */
export function UrlMcpForm({
  client,
  onCancel,
  onDone,
  onRegistered,
  onAuthorizationNavigate,
  showTitle = true,
  title,
  showBeta = true,
  showHeaders = false,
  showOAuth = true,
}: {
  client: HubClient;
  onCancel: () => void;
  onDone: () => Promise<void>;
  onRegistered?: () => void;
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
  const [registration, setRegistration] = useState<PreparedRegistration | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
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
    !submitting;
  const requiresOAuth = registration?.server.prepare_status === "needs_oauth";
  const isReady = registration?.server.prepare_status === "ready";
  const submitLabel = useMemo(
    () => (submitting ? t("mcp.submitting") : t("mcp.save")),
    [submitting, t],
  );

  const beginOAuth = async (prepared: PreparedRegistration): Promise<void> => {
    if (
      !client.beginMcpConnectorAuthorization ||
      prepared.server.prepare_status !== "needs_oauth"
    )
      throw new Error("private MCP OAuth is unavailable");
    await startOAuthPopup(async (signal) => {
      const started = await client.beginMcpConnectorAuthorization(
        prepared.connector.connector_id,
        {
          server_id: prepared.server.server_id,
          expected_state_version: prepared.connector.state_version,
        },
        signal,
      );
      return {
        connectorId: prepared.connector.connector_id,
        authorizationUrl: started.authorization.authorization_url,
        expiresAt: started.authorization.expires_at,
      };
    });
  };

  const startOAuthPopup = useMcpOAuthPopup({
    ...(onAuthorizationNavigate ? { onAuthorizationNavigate } : {}),
    // The settings projection is the sole post-popup read owner.  Its parent
    // closes this dialog and refreshes exactly once for success/error/close.
    onReload: () => {
      void onDone();
    },
  });

  const registerAndPrepare = async (openOAuth: boolean): Promise<void> => {
    if (
      (registration === null && !canSubmit) ||
      !client.registerPrivateMcpServer ||
      !client.preparePrivateMcpServer
    )
      return;
    setError("");
    setSubmitting(true);
    try {
      const created =
        registration === null
          ? await client.registerPrivateMcpServer({
              display_name: name.trim(),
              server_url: url.trim(),
              ...(showHeaders && configuredHeaders.length
                ? {
                    headers: configuredHeaders.map((header) => ({
                      name: header.name.trim().toLowerCase(),
                      value: header.value,
                    })),
                  }
                : {}),
              ...(showOAuth && clientId.trim()
                ? {
                    oauth_client: {
                      client_id: clientId.trim(),
                      client_secret: clientSecret,
                    },
                  }
                : {}),
            })
          : registration;
      // Registration and preparation are distinct owner operations. Persist
      // the first confirmed result before starting the potentially remote
      // Prepare phase, so a timeout/failure retries that same server instead
      // of creating a second private aggregate.
      setRegistration(created);
      // A confirmed registration is visible to the owner before remote
      // preparation. Keep the form open for recovery but refresh its list.
      onRegistered?.();
      // Values are write-only: retain neither header secrets nor the OAuth
      // client secret after their one owner mutation has been issued.
      setHeaders((current) =>
        current.map((header) => ({ ...header, value: "" })),
      );
      setClientSecret("");
      const prepared = await client.preparePrivateMcpServer(
        created.server.server_id,
        created.server.state_version,
      );
      setRegistration(prepared);
      if (prepared.server.prepare_status === "ready") {
        await onDone();
        return;
      }
      if (openOAuth && prepared.server.prepare_status === "needs_oauth")
        await beginOAuth(prepared);
    } catch (cause) {
      setError(
        cause instanceof HubClientError &&
          cause.code === "mcp_personal_server_url_conflict"
          ? t("mcp.errDuplicateUrl")
          : t("mcp.error"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (registration !== null) {
    return (
      <section className={styles.urlMcpForm} aria-live="polite">
        {showTitle ? (
          <DialogTitle className={styles.urlMcpTitle}>
            {registration.server.display_name}
          </DialogTitle>
        ) : null}
        <p className={styles.urlWarning}>
          {requiresOAuth
            ? t("mcp.pending")
            : isReady
              ? t("mcp.active")
              : t("mcp.error")}
        </p>
        {error ? (
          <p className={styles.compactDialogError} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.urlMcpActions}>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onCancel}
          >
            {t("mcp.cancel")}
          </Button>
          <span />
          {requiresOAuth ? (
            <Button
              type="button"
              disabled={submitting || !client.beginMcpConnectorAuthorization}
              onClick={() => void beginOAuth(registration)}
            >
              {t("settings.connect")}
            </Button>
          ) : null}
          {isReady ? (
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void onDone()}
            >
              {t("mcp.save")}
            </Button>
          ) : null}
          {!requiresOAuth && !isReady ? (
            <Button
              type="button"
              disabled={submitting || !client.preparePrivateMcpServer}
              onClick={() => void registerAndPrepare(false)}
            >
              {submitLabel}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <form
      className={styles.urlMcpForm}
      onSubmit={(event) => {
        event.preventDefault();
        void registerAndPrepare(false);
      }}
    >
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
          placeholder={t("mcp.urlNamePlaceholder")}
          onChange={(event) => setName(event.target.value)}
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
            placeholder="https://mcp.yourserver.com/mcp"
            onChange={(event) => setUrl(event.target.value)}
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
                      placeholder={t("mcp.customHeaderNamePlaceholder")}
                      onChange={(event) =>
                        setHeaders((current) =>
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
                      placeholder={t("mcp.customHeaderValuePlaceholder")}
                      onChange={(event) =>
                        setHeaders((current) =>
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
                      disabled={headers.length === 1}
                      onClick={() =>
                        setHeaders((current) =>
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
                  onClick={() =>
                    setHeaders((current) => [
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
                onChange={(event) => setClientId(event.target.value)}
                autoComplete="off"
              />
              <Input
                id="url-mcp-client-secret"
                aria-label="OAuth Client Secret"
                placeholder="OAuth 客户端密钥"
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                autoComplete="new-password"
              />
            </>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className={styles.compactDialogError} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.urlWarning}>{t("mcp.urlWarning")}</p>
      <div className={styles.urlMcpActions}>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("mcp.cancel")}
        </Button>
        <span />
        <Button type="submit" variant="outline" disabled={!canSubmit}>
          {submitLabel}
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => void registerAndPrepare(true)}
        >
          {t("mcp.saveAndPublish")}
          <ChevronDown aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
