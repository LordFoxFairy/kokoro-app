"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ImagePlus, Link2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  McpPrivateServerPrepare,
  McpPrivateServerRegistration,
} from "@/hub/mcp-connector.schema";
import { HubClientError, type HubClient } from "@/hub/client";
import { useT } from "@/i18n/context";

import styles from "./mcp-custom-form.module.css";
import { isMcpCustomHeaderName } from "./mcp-header-validation";
import { useMcpOAuthPopup } from "./use-mcp-oauth-popup";

type HeaderDraft = Readonly<{ id: string; name: string; value: string }>;
type PreparedRegistration =
  | McpPrivateServerRegistration
  | McpPrivateServerPrepare;

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
  client,
  onDone,
  onRegistered,
  onCancel,
}: {
  client: HubClient;
  onDone: () => Promise<void>;
  onRegistered?: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<HeaderDraft[]>([]);
  const [registration, setRegistration] = useState<PreparedRegistration | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
    !submitting;
  const stateLabel = useMemo(() => {
    if (registration?.server.prepare_status === "needs_oauth")
      return t("mcp.pending");
    if (registration?.server.prepare_status === "ready") return t("mcp.active");
    return t("mcp.error");
  }, [registration?.server.prepare_status, t]);

  const oauthPopup = useMcpOAuthPopup({
    onReload: () => void onDone(),
  });

  const beginAuthorization = async (
    prepared: PreparedRegistration,
  ): Promise<void> => {
    if (
      !client.beginMcpConnectorAuthorization ||
      prepared.server.prepare_status !== "needs_oauth"
    )
      throw new Error("private MCP authorization is unavailable");
    await oauthPopup(async (signal) => {
      const started = await client.beginMcpConnectorAuthorization!(
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

  const save = async (event?: FormEvent<HTMLFormElement>): Promise<void> => {
    event?.preventDefault();
    if (
      (registration === null && !canSubmit) ||
      !client.registerPrivateMcpServer ||
      !client.preparePrivateMcpServer
    )
      return;
    setError("");
    setSubmitting(true);
    try {
      const registered =
        registration ??
        (await client.registerPrivateMcpServer({
          display_name: name.trim(),
          server_url: url.trim(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(configuredHeaders.length
            ? {
                headers: configuredHeaders.map((header) => ({
                  name: header.name.trim().toLowerCase(),
                  value: header.value,
                })),
              }
            : {}),
        }));
      setRegistration(registered);
      // Register has already created the owner aggregate even if the following
      // remote Prepare fails. Refresh the underlying list now, while leaving
      // this result dialog open for retry/OAuth recovery.
      onRegistered?.();
      setHeaders((current) =>
        current.map((header) => ({ ...header, value: "" })),
      );
      const prepared = await client.preparePrivateMcpServer(
        registered.server.server_id,
        registered.server.state_version,
      );
      setRegistration(prepared);
      if (prepared.server.prepare_status === "ready") await onDone();
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
    const needsOAuth = registration.server.prepare_status === "needs_oauth";
    return (
      <section className={styles.customMcpResult} aria-live="polite">
        <DialogTitle className={styles.customMcpTitle}>
          {registration.server.display_name}
        </DialogTitle>
        <p>{stateLabel}</p>
        {error ? <p role="alert">{error}</p> : null}
        <footer>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("mcp.cancel")}
          </Button>
          {needsOAuth ? (
            <Button
              type="button"
              disabled={submitting || !client.beginMcpConnectorAuthorization}
              onClick={() => void beginAuthorization(registration)}
            >
              {t("settings.connect")}
            </Button>
          ) : null}
          {!needsOAuth && registration.server.prepare_status !== "ready" ? (
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void save()}
            >
              {submitting ? t("mcp.submitting") : t("mcp.retry")}
            </Button>
          ) : null}
        </footer>
      </section>
    );
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
      <div className={styles.customMcpFields}>
        <Field className={styles.customMcpField}>
          <FieldLabel htmlFor="custom-mcp-name">
            {t("mcp.customName")}
          </FieldLabel>
          <Input
            id="custom-mcp-name"
            autoFocus
            value={name}
            placeholder={t("mcp.customNamePlaceholder")}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field className={styles.customMcpField}>
          <FieldLabel htmlFor="custom-mcp-transport">
            {t("mcp.customTransport")}
          </FieldLabel>
          <Input
            id="custom-mcp-transport"
            aria-label={t("mcp.customTransport")}
            value="HTTP"
            readOnly
          />
        </Field>
        <Field className={`${styles.customMcpField} ${styles.customMcpWide}`}>
          <FieldLabel>图标</FieldLabel>
          <div className={styles.iconUploadRow}>
            <span className={styles.iconPreview} aria-hidden="true">
              <ImagePlus />
            </span>
            <div className={styles.iconUploadCopy}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={styles.uploadButton}
                disabled
              >
                上传
              </Button>
              <span>PNG 或 JPG，最大 1 MB。推荐尺寸 256×256 像素。</span>
            </div>
          </div>
        </Field>
        <Field className={`${styles.customMcpField} ${styles.customMcpWide}`}>
          <FieldLabel htmlFor="custom-mcp-notes">
            {t("mcp.customInstructions")} <span>{t("mcp.optional")}</span>
          </FieldLabel>
          <Textarea
            id="custom-mcp-notes"
            value={notes}
            placeholder={t("mcp.customInstructionsPlaceholder")}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={4000}
          />
        </Field>
        <Field className={`${styles.customMcpField} ${styles.customMcpWide}`}>
          <FieldLabel htmlFor="custom-mcp-url">
            {t("mcp.customServerUrl")}
          </FieldLabel>
          <div className={styles.urlInput}>
            <Link2 aria-hidden="true" />
            <Input
              id="custom-mcp-url"
              value={url}
              placeholder="https://mcp.yourserver.com/mcp"
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
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
                    autoComplete="off"
                    aria-label={t("mcp.customHeaderName", {
                      count: index + 1,
                    })}
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
                  />
                  <Input
                    value={header.value}
                    type="password"
                    autoComplete="new-password"
                    aria-label={t("mcp.customHeaderValue", {
                      count: index + 1,
                    })}
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
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    type="button"
                    onClick={() =>
                      setHeaders((current) =>
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
            onClick={() => setHeaders((current) => [...current, createHeader()])}
          >
            <Plus aria-hidden="true" />
            {t("mcp.customAddHeader")}
          </Button>
        </fieldset>
      </div>
      {error ? <p className={styles.customMcpError} role="alert">{error}</p> : null}
      <footer className={styles.customMcpActions}>
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? t("mcp.submitting") : t("mcp.save")}
        </Button>
      </footer>
    </form>
  );
}
