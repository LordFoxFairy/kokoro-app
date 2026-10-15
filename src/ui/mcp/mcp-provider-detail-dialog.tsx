"use client";

import { useState, type RefObject } from "react";

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
import styles from "./mcp-projection-read.module.css";

export function McpProviderDetailDialog({
  provider,
  connection,
  actionId,
  actionError,
  returnFocusRef,
  onClose,
  onConnect,
  onReconnect,
  onToggleEnabled,
  onRemoveConnection,
  onPrompt,
}: {
  provider: McpConnectorProvider | null;
  /** Defined only when this detail was entered from an installed provider row. */
  connection?: McpConnector | null;
  actionId: string | null;
  actionError: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onConnect: (provider: McpConnectorProvider) => void;
  onReconnect?: (connection: McpConnector, provider: McpConnectorProvider) => void;
  onToggleEnabled?: (connection: McpConnector) => void;
  onRemoveConnection?: (connection: McpConnector) => void;
  onPrompt?: (prompt: string) => void;
}) {
  const t = useT();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const categoryLabel = (category: keyof typeof MCP_CATEGORY_MESSAGES) =>
    t(MCP_CATEGORY_MESSAGES[category]);
  const connected = connection !== null && connection !== undefined;
  return (
    <Dialog
      open={provider !== null}
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
                  {connected ? <span className={styles.connectionState} data-status={connection.status}>{t(`mcp.${connection.status}` as "mcp.pending")}</span> : <Button
                      type="button"
                      disabled={actionId !== null}
                      onClick={() => onConnect(provider)}
                    >
                      {actionId === `connect:${provider.provider_key}` ? <Spinner aria-hidden="true" /> : <Plus aria-hidden="true" />}
                      {t("settings.connect")}
                    </Button>}
                </div>
              </div>
            </header>
            <section className={styles.providerDetailBody}>
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
              {connected ? <section className={styles.connectedProviderManagement} aria-label="连接器管理">
                <h3>连接器详情</h3>
                <dl><div><dt>连接器类型</dt><dd>{provider.connection_server_id !== undefined ? "OAuth 连接器" : "应用连接器"}</dd></div><div><dt>UUID</dt><dd><code>{connection.connector_id}</code><Button type="button" size="icon" variant="ghost" aria-label="复制 UUID" onClick={() => void navigator.clipboard?.writeText(connection.connector_id)}><Copy aria-hidden="true" /></Button></dd></div></dl>
                <div className={styles.connectedProviderActions}>
                  {(connection.status === "pending" || connection.status === "error") && onReconnect ? <Button type="button" variant="outline" disabled={actionId !== null} onClick={() => onReconnect(connection, provider)}><Link2 aria-hidden="true" />{t("mcp.retry")}</Button> : null}
                  {onToggleEnabled ? <Button type="button" variant="outline" disabled={actionId !== null} onClick={() => onToggleEnabled(connection)}><Power aria-hidden="true" />{connection.enabled ? t("mcp.disable") : t("mcp.enable")}</Button> : null}
                  {onRemoveConnection ? confirmDisconnect ? <><Button type="button" variant="destructive" disabled={actionId !== null} onClick={() => onRemoveConnection(connection)}>确认断开</Button><Button type="button" variant="outline" disabled={actionId !== null} onClick={() => setConfirmDisconnect(false)}>{t("mcp.cancel")}</Button></> : <Button type="button" variant="ghost" className={styles.disconnectAction} disabled={actionId !== null} onClick={() => setConfirmDisconnect(true)}><Trash2 aria-hidden="true" />断开连接</Button> : null}
                </div>
              </section> : null}
            </section>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
