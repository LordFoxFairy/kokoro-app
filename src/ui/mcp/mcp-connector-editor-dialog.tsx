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
import type { McpManagementSummary } from "./mcp-management-commands";
import { McpManagementStatus } from "./mcp-management-status";
import styles from "./mcp-projection-read.module.css";

export function McpConnectorEditorDialog({
  editor,
  displayName,
  description,
  actionId,
  admitted,
  managementCommand,
  onResumeManagement,
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
  open,
  pendingError = false,
  onRetryPending,
}: {
  editor: McpConnectorEditor | null;
  open?: boolean;
  pendingError?: boolean;
  onRetryPending?: () => void;
  displayName: string;
  description: string;
  actionId: string | null;
  admitted: boolean;
  managementCommand: McpManagementSummary | undefined;
  onResumeManagement: () => void;
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
  const managementLocked = managementCommand !== undefined && managementCommand.kind !== "rejected";
  const locked = managementLocked || !admitted || actionId !== null;
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
      open={open ?? editor !== null}
      onOpenChange={(open) => {
        if (!open && (actionId === null || managementLocked)) onClose();
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
        <McpManagementStatus command={managementCommand} admitted={admitted} onResume={onResumeManagement} />
        {editor && connector ? (
          <form
            className={styles.editorForm}
            onSubmit={(event) => { event.preventDefault(); if (!locked) onSubmit(event, editor); }}
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
                readOnly={locked}
                id="mcp-display-name"
                value={displayName}
                onChange={(event) => { if (!locked) onDisplayNameChange(event.target.value); }}
                maxLength={100}
                required
                autoFocus
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="mcp-description">{t("mcp.description")}</Label>
              <Textarea
                readOnly={locked}
                id="mcp-description"
                value={description}
                onChange={(event) => { if (!locked) onDescriptionChange(event.target.value); }}
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
                  disabled={locked}
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
                  disabled={locked}
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
                    disabled={locked}
                    onClick={() => onDelete(editor)}
                  >
                    {busy ? <Spinner aria-hidden="true" /> : null}
                    {t("mcp.deleteConfirm")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={locked}
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
                  disabled={locked}
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
              >
                {t("mcp.cancel")}
              </Button>
              <Button type="submit" disabled={locked}>
                {busy ? <Spinner aria-hidden="true" /> : null}
                <Pencil aria-hidden="true" />
                {t("mcp.saveChanges")}
              </Button>
            </footer>
          </form>
        ) : pendingError ? <Alert variant="destructive" role="alert"><AlertDescription>{t("mcp.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={onRetryPending}>{t("mcp.retry")}</Button></Alert> : <span role="status">{t("mcp.loading")}</span>}
      </DialogContent>
    </Dialog>
  );
}
