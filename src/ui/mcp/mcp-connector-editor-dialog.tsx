"use client";

import { type FormEvent, type RefObject } from "react";
import { Link2, Pencil, Power, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { McpConnectorProvider } from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";

import type { McpConnectorEditor } from "./mcp-projection-types";
import styles from "./mcp-projection-read.module.css";

export function McpConnectorEditorDialog({
  editor,
  displayName,
  description,
  actionId,
  actionError,
  deleteId,
  providersByKey,
  surfaceRef,
  returnFocusRef,
  onDisplayNameChange,
  onDescriptionChange,
  onSubmit,
  onClose,
  onDeleteIntent,
  onCancelDelete,
  onRetryAuthorization,
  onToggleEnabled,
  onDelete,
}: {
  editor: McpConnectorEditor | null;
  displayName: string;
  description: string;
  actionId: string | null;
  actionError: boolean;
  deleteId: string | null;
  providersByKey: Map<string, McpConnectorProvider>;
  surfaceRef: RefObject<HTMLElement | null>;
  returnFocusRef: RefObject<HTMLElement | null>;
  onDisplayNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    editor: McpConnectorEditor,
  ) => void;
  onClose: () => void;
  onDeleteIntent: (connectorId: string) => void;
  onCancelDelete: () => void;
  onRetryAuthorization: (connectorId: string, serverId: string) => void;
  onToggleEnabled: (editor: McpConnectorEditor) => void;
  onDelete: (editor: McpConnectorEditor) => void;
}) {
  const t = useT();
  const close = (event: Event) => {
    const returnFocus = returnFocusRef.current;
    const target = returnFocus?.isConnected
      ? returnFocus
      : surfaceRef.current?.querySelector<HTMLInputElement>(
          'input[type="search"]',
        );
    if (!target) return;
    event.preventDefault();
    window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
  };
  const connector = editor?.connector;
  const provider = connector
    ? providersByKey.get(connector.provider_key)
    : undefined;
  const serverId = connector
    ? (provider?.connection_server_id ?? connector.server_id)
    : undefined;
  const busy = connector ? actionId === connector.connector_id : false;
  const restarting = connector
    ? actionId === `reconnect:${connector.connector_id}`
    : false;

  return (
    <Dialog
      open={editor !== null}
      onOpenChange={(open) => {
        if (!open && actionId === null) onClose();
      }}
    >
      <DialogContent
        className={styles.editorDialog}
        overlayClassName={styles.editorOverlay ?? ""}
        closeLabel={t("mcp.cancel")}
        onCloseAutoFocus={close}
      >
        <DialogHeader className={styles.editorHeader}>
          <DialogTitle>{t("mcp.edit")}</DialogTitle>
          <DialogDescription>{t("mcp.description")}</DialogDescription>
        </DialogHeader>
        {editor && connector ? (
          <form
            className={styles.editorForm}
            onSubmit={(event) => onSubmit(event, editor)}
          >
            {actionError ? (
              <Alert
                variant="destructive"
                role="alert"
                className={styles.alert}
              >
                <AlertDescription>{t("mcp.actionFailed")}</AlertDescription>
              </Alert>
            ) : null}
            <div className={styles.field}>
              <Label htmlFor="mcp-display-name">{t("mcp.fieldName")}</Label>
              <Input
                id="mcp-display-name"
                value={displayName}
                onChange={(event) => onDisplayNameChange(event.target.value)}
                maxLength={100}
                required
                autoFocus
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="mcp-description">{t("mcp.description")}</Label>
              <Textarea
                id="mcp-description"
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                maxLength={1000}
              />
            </div>
            <div className={styles.managementActions}>
              {(connector.status === "pending" ||
                connector.status === "error") &&
              serverId ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={actionId !== null}
                  onClick={() =>
                    onRetryAuthorization(connector.connector_id, serverId)
                  }
                >
                  {restarting ? (
                    <Spinner aria-hidden="true" />
                  ) : (
                    <Link2 aria-hidden="true" />
                  )}
                  {t("mcp.retry")}
                </Button>
              ) : null}
              {connector.status === "active" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={actionId !== null}
                  onClick={() => onToggleEnabled(editor)}
                >
                  {busy ? (
                    <Spinner aria-hidden="true" />
                  ) : (
                    <Power aria-hidden="true" />
                  )}
                  {connector.enabled ? t("mcp.disable") : t("mcp.enable")}
                </Button>
              ) : null}
              {deleteId === connector.connector_id ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={actionId !== null}
                    onClick={() => onDelete(editor)}
                  >
                    {busy ? <Spinner aria-hidden="true" /> : null}
                    {t("mcp.deleteConfirm")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={actionId !== null}
                    onClick={onCancelDelete}
                  >
                    {t("mcp.cancel")}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.removeAction}
                  disabled={actionId !== null}
                  onClick={() => onDeleteIntent(connector.connector_id)}
                >
                  <Trash2 aria-hidden="true" />
                  {t("mcp.delete")}
                </Button>
              )}
            </div>
            <footer className={styles.editorActions}>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={actionId !== null}
              >
                {t("mcp.cancel")}
              </Button>
              <Button type="submit" disabled={actionId !== null}>
                {busy ? <Spinner aria-hidden="true" /> : null}
                <Pencil aria-hidden="true" />
                {t("mcp.saveChanges")}
              </Button>
            </footer>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
