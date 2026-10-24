"use client";

import { type FormEvent, type RefObject, useMemo, useRef, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type {
  CustomApiProfile,
  CustomApiUpdateInput,
} from "@/hub/custom-api.schema";
import { useT } from "@/i18n/context";

import { connectorCommandMayResume, connectorCommandFailureMessage } from "./connector-command-failure";
import type { CustomApiManagementSummary } from "./custom-api-management-commands";

import styles from "./custom-api-detail-dialog.module.css";
import { useMcpEditorSelection } from "./use-mcp-editor-selection";

type SecretDraft = { id: string; name: string; value: string };

/** Type-specific detail/editor for the Custom API owner aggregate. */
export function CustomApiDetailDialog({
  profile,
  actionError,
  busy,
  admitted,
  command,
  canUpdate,
  canRemove,
  onResume,
  returnFocusRef,
  onClose,
  onSave,
  onDelete,
  pendingError = false,
  onRetry,
}: {
  profile: CustomApiProfile | null;
  pendingError?: boolean;
  onRetry?: () => void;
  actionError: boolean;
  busy: boolean;
  admitted: boolean;
  command: CustomApiManagementSummary | undefined;
  canUpdate: boolean;
  canRemove: boolean;
  onResume: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSave: (input: CustomApiUpdateInput) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const nameRef = useRef<HTMLInputElement>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [nameDraft, setName] = useState<string | null>(null);
  const [instructionsDraft, setInstructions] = useState<string | null>(null);
  const name = nameDraft ?? profile?.name ?? "";
  const instructions = instructionsDraft ?? profile?.instructions ?? "";
  const [facts, setFacts] = useState(profile);
  if (facts !== profile) { setFacts(profile); setDeleteArmed(false); }
  const [secrets, setSecrets] = useState<SecretDraft[]>([]);
  const ready = profile !== null && admitted;
  const unresolved = command?.kind === "running" || command?.kind === "unknown" || command?.kind === "completed";
  const locked = unresolved || busy || !ready;
  const [observedKind, setObservedKind] = useState(command?.kind);
  if (observedKind !== command?.kind) {
    setObservedKind(command?.kind);
    // The command core drops its secret body at ACK; drop this editor's copy too.
    if (command?.kind === "completed") { setSecrets([]); setName(null); setInstructions(null); }
  }
  const selectionProps = useMcpEditorSelection(ready);
  const configuredNames = useMemo(
    () => new Set(profile?.environment.map(({ name }) => name) ?? []),
    [profile],
  );
  const valid =
    name.trim().length > 0 &&
    secrets.every((item) => item.name.trim() && item.value) &&
    new Set(secrets.map((item) => item.name.trim())).size === secrets.length &&
    !secrets.some((item) => configuredNames.has(item.name.trim()));
  const changed = profile !== null && (name !== profile.name || instructions !== (profile.instructions ?? "") || secrets.length > 0);
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked || !canUpdate || !valid || !changed || !profile) return;
    onSave({
      expected_state_version: profile.state_version,
      name: name.trim(),
      ...(instructions.trim()
        ? { instructions: instructions.trim() }
        : { clear_instructions: true }),
      ...(secrets.length
        ? {
            environment_upserts: secrets.map(({ name: secretName, value }) => ({
              name: secretName.trim(),
              value,
            })),
          }
        : {}),
    });
  };
  const closeFocus = (event: Event) => {
    const target = returnFocusRef.current;
    if (!target?.isConnected) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
  };
  const commandStatus = (command && command.kind !== "rejected" && command.kind !== "running" ? <Alert role="status">
          <AlertDescription>{t(command.kind === "completed" ? "mcp.creationDone" : connectorCommandFailureMessage(command.failure, "mcp.recovery.outcome_unknown"))}</AlertDescription>
          {command.kind === "unknown" || command.kind === "completed" ? <Button type="button" variant="outline"
            disabled={!admitted || (command.kind === "unknown" && !connectorCommandMayResume(command.failure))} onClick={onResume}>
            {t(command.kind === "completed" ? "mcp.creationDone" : "mcp.retryOriginal")}
          </Button> : null}
        </Alert> : null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={styles.dialog}
        closeLabel={t("mcp.close")}
        onCloseAutoFocus={closeFocus}
        onOpenAutoFocus={(event) => {
          const field = nameRef.current;
          if (!field) return;
          event.preventDefault();
          field.focus({ preventScroll: true });
        }}
      >
          <form
            {...selectionProps}
            aria-busy={busy || command?.kind === "running" || (!ready && !pendingError)}
            className={styles.apiConfiguration}
            onSubmit={save}
          >
            <header className={styles.apiConfigurationHeader}>
              <div>
                <div className={styles.titleRow}>
                  <DialogTitle>编辑自定义 API</DialogTitle>
                  <Button type="button" variant="outline" size="sm" disabled={!ready}
                    onClick={() => { if (ready && profile) void navigator.clipboard?.writeText(profile.profile_id); }}>
                    <Copy aria-hidden="true" />复制 UUID
                  </Button>
                </div>
                <DialogDescription>
                  使用自定义 API 连接器集成任何支持密钥或令牌授权的外部服务。
                </DialogDescription>
              </div>
            </header>
            <div className={styles.apiConfigurationBody}>
              {commandStatus}
              {!ready ? pendingError ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{t("mcp.loadError")}</AlertDescription>
                  <Button type="button" variant="outline" onClick={onRetry} disabled={!onRetry}>
                    {t("mcp.retry")}
                  </Button>
                </Alert>
              ) : <span className="sr-only" role="status">{t("mcp.loading")}</span> : null}
              {actionError ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{t("mcp.actionFailed")}</AlertDescription>
                </Alert>
              ) : null}
              <div className={styles.field}>
                <Label htmlFor="custom-api-detail-name">名称</Label>
                <Input
                  readOnly={locked}
                  id="custom-api-detail-name"
                  ref={nameRef}
                  value={name}
                  maxLength={400}
                  onChange={(event) => !locked && setName(event.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="custom-api-detail-instructions">
                  备注（可选）
                </Label>
                <Textarea
                  readOnly={locked}
                  id="custom-api-detail-instructions"
                  value={instructions}
                  maxLength={4000}
                  onChange={(event) => !locked && setInstructions(event.target.value)}
                />
              </div>
              <fieldset className={styles.headers}>
                <legend>密钥（环境变量）</legend>
                <p className={styles.secretHint}>密钥值仅写入，不会再次显示。</p>
                {(profile?.environment ?? []).map(({ name: environmentName }) => (
                  <div className={styles.existingHeader} key={environmentName}>
                    <span>{environmentName}</span>
                    <small>已配置</small>
                  </div>
                ))}
                {secrets.map((secret) => (
                  <div className={styles.headerDraft} key={secret.id}>
                    <Input
                      readOnly={locked}
                      id={`api-secret-${secret.id}-name`}
                      aria-label="密钥名称"
                      value={secret.name}
                      onChange={(event) =>
                        !locked && setSecrets((items) =>
                          items.map((item) =>
                            item.id === secret.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Input
                      readOnly={locked}
                      id={`api-secret-${secret.id}-value`}
                      aria-label="密钥值"
                      type="password"
                      value={secret.value}
                      autoComplete="new-password"
                      onChange={(event) =>
                        !locked && setSecrets((items) =>
                          items.map((item) =>
                            item.id === secret.id
                              ? { ...item, value: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={locked}
                      aria-label="移除新增密钥"
                      onClick={() =>
                        !locked && setSecrets((items) =>
                          items.filter((item) => item.id !== secret.id),
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
                    setSecrets((items) => [
                      ...items,
                      { id: crypto.randomUUID(), name: "", value: "" },
                    ])
                  }
                >
                  <Plus aria-hidden="true" />
                  添加密钥
                </Button>
              </fieldset>
            </div>
            <footer className={styles.apiConfigurationFooter}>
              {deleteArmed ? <div className={styles.deleteConfirm}>
                <span>确认删除此自定义 API？</span>
                <Button type="button" variant="destructive" disabled={locked || !canRemove} onClick={onDelete}>{t("mcp.deleteConfirm")}</Button>
                <Button type="button" variant="outline" disabled={locked || !canRemove} onClick={() => setDeleteArmed(false)}>{t("mcp.cancel")}</Button>
              </div> : <Button type="button" variant="outline" className={styles.apiRemove} disabled={locked || !canRemove} onClick={() => setDeleteArmed(true)}>
                <Trash2 aria-hidden="true" />{t("mcp.delete")}
              </Button>}
              <div className={styles.actions}>
                <Button type="button" variant="outline" onClick={onClose}>{t("mcp.cancel")}</Button>
                <Button type="submit" disabled={locked || !canUpdate || !valid || !changed}>
                  {busy ? <Spinner aria-hidden="true" /> : null}{t("mcp.save")}
                </Button>
              </div>
            </footer>
          </form>
      </DialogContent>
    </Dialog>
  );
}
