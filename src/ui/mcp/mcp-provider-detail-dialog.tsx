"use client";

import { McpAvailabilityStatus } from "./mcp-availability-status";

import { useState, type ReactNode, type RefObject } from "react";

import Image from "next/image";
import { Copy, Link2, MessageCircle, Plus, Power, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { McpConnector, McpConnectorProvider } from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";

import {
  formatProviderDate,
  MCP_CATEGORY_MESSAGES,
  providerArtwork,
} from "./mcp-projection-types";
import type { McpManagementSummary } from "./mcp-management-commands";
import type { ProviderCreationSummary } from "./provider-creation-commands";
import { connectorCommandMayResume, connectorCommandFailureMessage } from "./connector-command-failure";
import { McpManagementStatus } from "./mcp-management-status";
import styles from "./mcp-projection-read.module.css";
import { McpProviderConnectionPicker, type McpProviderConnectionLookup } from "./mcp-provider-connection-picker";

export function McpProviderDetailDialog({
  provider,
  connection,
  connectionLookup,
  onSelectConnection,
  actionId,
  admitted,
  creationCommand,
  onResumeCreation,
  managementCommand,
  onResumeManagement,
  actionError,
  returnFocusRef,
  onClose,
  onConnect,
  onReconnect,
  onEditConnection,
  onToggleEnabled,
  onRemoveConnection,
  onPrompt,
  open,
  pendingError = false,
  readFeedback,
}: {
  provider: McpConnectorProvider | null;
  open?: boolean;
  pendingError?: boolean;
  readFeedback?: ReactNode | undefined;
  /** An admitted installed row or an exact selected locator; never an inferred provider-key binding. */
  connection?: McpConnector | null;
  connectionLookup?: McpProviderConnectionLookup;
  onSelectConnection?: (connection: McpConnector) => void;
  actionId: string | null;
  admitted: boolean;
  creationCommand?: ProviderCreationSummary | undefined;
  onResumeCreation?: () => void;
  managementCommand: McpManagementSummary | undefined;
  onResumeManagement: () => void;
  actionError: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onConnect: (provider: McpConnectorProvider) => void;
  onReconnect?: (connection: McpConnector, provider: McpConnectorProvider) => void;
  onEditConnection?: (connection: McpConnector) => void;
  onToggleEnabled?: (connection: McpConnector) => void;
  onRemoveConnection?: (connection: McpConnector) => void;
  onPrompt?: (prompt: string) => void;
}) {
  const t = useT();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [facts, setFacts] = useState(provider);
  if (facts !== provider) { setFacts(provider); setConfirmDisconnect(false); }
  const categoryLabel = (category: keyof typeof MCP_CATEGORY_MESSAGES) =>
    t(MCP_CATEGORY_MESSAGES[category]);
  const managementLocked = managementCommand !== undefined && managementCommand.kind !== "rejected";
  const creationLocked = creationCommand !== undefined && creationCommand.kind !== "rejected";
  const locked = managementLocked || !admitted || actionId !== null;
  const connected = connection !== null && connection !== undefined;
  return (
    <Dialog
      open={open ?? provider !== null}
      onOpenChange={(open) => {
        if (!open) {
          setConfirmDisconnect(false);
          onClose();
        }
      }}
    >
      <DialogContent
        className={styles.providerDetailDialog}
        overlayClassName={styles.editorOverlay ?? ""}
        closeLabel={t("mcp.cancel")}
        data-detail-layout="manus"
        onCloseAutoFocus={(event) => {
          const returnFocus = returnFocusRef.current;
          if (!returnFocus?.isConnected) return;
          event.preventDefault();
          window.requestAnimationFrame(() =>
            returnFocus.focus({ preventScroll: true }),
          );
        }}
      >
        {readFeedback}
        {provider ? (
          <>
            <header
              className={styles.providerDetailHeader}
              data-has-logo="true"
            >
              <span
                className={styles.providerDetailLogo}
                data-testid="mcp-provider-detail-logo"
                aria-hidden="true"
              >
                <Image
                  src={providerArtwork(provider)}
                  alt=""
                  fill
                  sizes="4rem"
                  unoptimized
                />
              </span>
              <div className={styles.providerDetailCopy}>
                {provider.category_keys.length > 0 ? (
                  <div className={styles.providerDetailChips}>
                    {provider.category_keys.slice(0, 2).map((category) => (
                      <span key={category}>{categoryLabel(category)}</span>
                    ))}
                  </div>
                ) : null}
                <DialogTitle>{provider.display_name}</DialogTitle>
                {provider.author || provider.updated_at ? (
                  <div className={styles.providerDetailMeta}>
                    {provider.author ? <span>{provider.author}</span> : null}
                    {provider.updated_at ? (
                      <span>
                        {t("skills.updatedAt", {
                          date: formatProviderDate(provider.updated_at),
                        })}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className={styles.providerDetailActions}>
                  {!connected && (creationLocked || (connectionLookup && (!connectionLookup.complete || connectionLookup.error || connectionLookup.connections.length > 0))) ? null : connected ? <McpAvailabilityStatus availability={connection.availability} className={styles.connectionState} /> : <Button
                      type="button"
                      disabled={locked || creationLocked}
                      onClick={() => onConnect(provider)}
                    >
                      {actionId === `connect:${provider.provider_key}` ? <Spinner aria-hidden="true" /> : <Plus aria-hidden="true" />}
                      {t("settings.connect")}
                    </Button>}
                </div>
              </div>
            </header>
            <section className={styles.providerDetailBody}>
              {!connected && connectionLookup && onSelectConnection ? <McpProviderConnectionPicker lookup={connectionLookup} onSelect={onSelectConnection} /> : null}
              {creationLocked ? <Alert role="status">
                <AlertDescription>{t(creationCommand.kind === "completed" ? "mcp.providerCreateConfirmed" : creationCommand.kind === "running" ? "mcp.loading" : connectorCommandFailureMessage(creationCommand.failure, "mcp.recovery.outcome_unknown"))}</AlertDescription>
                {creationCommand.kind === "unknown" || creationCommand.kind === "completed" ? <Button type="button" variant="outline"
                  disabled={locked || !connectorCommandMayResume(creationCommand.failure)} onClick={onResumeCreation}>
                  {t(creationCommand.kind === "completed" ? "mcp.continueProviderConnection" : connectorCommandMayResume(creationCommand.failure) ? "mcp.retryOriginal" : "mcp.recovery.inspectRequired")}
                </Button> : null}
              </Alert> : null}
              <McpManagementStatus command={managementCommand} admitted={admitted} onResume={onResumeManagement} />
              {actionError ? (
                <Alert
                  variant="destructive"
                  role="alert"
                  className={styles.alert}
                >
                  <AlertDescription>{t("mcp.actionFailed")}</AlertDescription>
                </Alert>
              ) : null}
              {provider.description ? (
                <DialogDescription className={styles.providerSummary}>
                  {provider.description}
                </DialogDescription>
              ) : null}
              {provider.example_prompts.length > 0 ? (
                <section
                  className={styles.examplePromptSection}
                  aria-labelledby="mcp-example-prompts"
                >
                  <h3 id="mcp-example-prompts">{t("mcp.examplePrompts")}</h3>
                  <ul className={styles.examplePromptList}>
                    {provider.example_prompts.map((prompt) => (
                      <li key={prompt}>
                        <button
                          type="button"
                          onClick={() => {
                            onPrompt?.(prompt);
                            onClose();
                          }}
                        >
                          <MessageCircle aria-hidden="true" />
                          <span>{prompt}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {connected ? <section className={styles.connectedProviderManagement} aria-label={t("mcp.connectionManagement")}>
                <h3>{t("mcp.connectionDetails")}</h3>
                <dl><div><dt>{t("mcp.detailConnectorType")}</dt><dd>{t(provider.connection_server_id !== undefined ? "mcp.oauthConnector" : "mcp.appConnector")}</dd></div><div><dt>UUID</dt><dd><code>{connection.connector_id}</code><Button type="button" size="icon" variant="ghost" aria-label={t("connectorCatalog.copyUuid")} onClick={() => void navigator.clipboard?.writeText(connection.connector_id)}><Copy aria-hidden="true" /></Button></dd></div></dl>
                <div className={styles.connectedProviderActions}>
                  {!connection.server_id && connection.status !== "revoked" && onEditConnection ? <Button type="button" variant="outline" disabled={locked || creationLocked} onClick={() => onEditConnection(connection)}>{t("mcp.edit")}</Button> : null}
                  {provider.connection_server_id !== undefined && (connection.status === "active" || connection.status === "pending" || connection.status === "error") && onReconnect ? <Button type="button" variant="outline" disabled={locked} onClick={() => onReconnect(connection, provider)}><Link2 aria-hidden="true" />{t(connection.status === "active" ? "thread.reconnect" : "mcp.retry")}</Button> : null}
                  {onToggleEnabled ? <Button type="button" variant="outline" disabled={locked} onClick={() => onToggleEnabled(connection)}><Power aria-hidden="true" />{connection.enabled ? t("mcp.disable") : t("mcp.enable")}</Button> : null}
                  {onRemoveConnection ? confirmDisconnect ? <><Button type="button" variant="destructive" disabled={locked} onClick={() => onRemoveConnection(connection)}>{t("mcp.confirmDisconnect")}</Button><Button type="button" variant="outline" disabled={locked} onClick={() => setConfirmDisconnect(false)}>{t("mcp.cancel")}</Button></> : <Button type="button" variant="ghost" className={styles.disconnectAction} disabled={locked} onClick={() => setConfirmDisconnect(true)}><Trash2 aria-hidden="true" />{t("mcp.disconnectConnection")}</Button> : null}
                </div>
              </section> : null}
            </section>
          </>
        ) : (
          <section className={styles.providerDetailBody} aria-busy={!pendingError}>
            <McpManagementStatus command={managementCommand} admitted={admitted} onResume={onResumeManagement} />
            <DialogTitle>{t("rail.navPlugins")}</DialogTitle>
            {!readFeedback ? <span className={pendingError ? undefined : "sr-only"} role="status">{t(pendingError ? "mcp.loadError" : "mcp.loading")}</span> : null}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
