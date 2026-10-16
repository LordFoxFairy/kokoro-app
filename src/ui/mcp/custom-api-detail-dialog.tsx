"use client";

import { type FormEvent, type RefObject, useMemo, useState } from "react";
import { Copy, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";

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

import styles from "./custom-mcp-detail-dialog.module.css";
import { useMcpEditorSelection } from "./use-mcp-editor-selection";

type SecretDraft = { id: string; name: string; value: string };

/** Type-specific detail/editor for the Custom API owner aggregate. */
export function CustomApiDetailDialog({
  profile,
  actionError,
  busy,
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
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSave: (input: CustomApiUpdateInput) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [nameDraft, setName] = useState<string | null>(null);
  const [instructionsDraft, setInstructions] = useState<string | null>(null);
  const name = nameDraft ?? profile?.name ?? "";
  const instructions = instructionsDraft ?? profile?.instructions ?? "";
  const [facts, setFacts] = useState(profile);
  if (facts !== profile) { setFacts(profile); setDeleteArmed(false); }
  const [secrets, setSecrets] = useState<SecretDraft[]>([]);
  const ready = profile !== null;
  const locked = busy || !ready;
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
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || !profile) return;
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
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className={styles.dialog}
        closeLabel={t("mcp.cancel")}
        onCloseAutoFocus={closeFocus}
      >
        {editing ? (
          <form
            {...selectionProps}
            aria-busy={!ready && !pendingError}
            className={`${styles.configuration} ${styles.apiConfiguration}`}
            onSubmit={save}
          >
            <header className={styles.apiConfigurationHeader}>
              <div>
                <DialogTitle>编辑自定义 API</DialogTitle>
                <DialogDescription>
                  密钥值仅写入，不会再次显示。
                </DialogDescription>
              </div>
            </header>
            <div className={styles.apiConfigurationBody}>
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
                  readOnly={!ready}
                  id="custom-api-detail-name"
                  value={name}
                  maxLength={400}
                  onChange={(event) => ready && setName(event.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="custom-api-detail-instructions">
                  备注（可选）
                </Label>
                <Textarea
                  readOnly={!ready}
                  id="custom-api-detail-instructions"
                  value={instructions}
                  maxLength={4000}
                  onChange={(event) => ready && setInstructions(event.target.value)}
                />
              </div>
              <fieldset className={styles.headers}>
                <legend>密钥（环境变量）</legend>
                {(profile?.environment ?? []).map(({ name: environmentName }) => (
                  <div className={styles.existingHeader} key={environmentName}>
                    <span>{environmentName}</span>
                    <small>已配置</small>
                  </div>
                ))}
                {secrets.map((secret) => (
                  <div className={styles.headerDraft} key={secret.id}>
                    <Input
                      readOnly={!ready}
                      id={`api-secret-${secret.id}-name`}
                      aria-label="密钥名称"
                      value={secret.name}
                      onChange={(event) =>
                        ready && setSecrets((items) =>
                          items.map((item) =>
                            item.id === secret.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Input
                      readOnly={!ready}
                      id={`api-secret-${secret.id}-value`}
                      aria-label="密钥值"
                      type="password"
                      value={secret.value}
                      autoComplete="new-password"
                      onChange={(event) =>
                        ready && setSecrets((items) =>
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
                        ready && setSecrets((items) =>
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
              <Button
                type="button"
                variant="outline"
                disabled={locked}
                onClick={() => setEditing(false)}
              >
                {t("mcp.cancel")}
              </Button>
              <Button type="submit" disabled={locked || !valid}>
                {busy ? (
                  <Spinner aria-hidden="true" />
                ) : (
                  <Pencil aria-hidden="true" />
                )}
                {t("mcp.saveChanges")}
              </Button>
            </footer>
          </form>
        ) : !profile ? (
          <section className={styles.detail} aria-busy={!pendingError}>
            <header className={styles.detailHero}><DialogTitle>自定义 API</DialogTitle></header>
            <div className={styles.detailBody}>{pendingError ? <Alert variant="destructive" role="alert"><AlertDescription>{t("mcp.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={onRetry}>{t("mcp.retry")}</Button></Alert> : <span role="status">{t("mcp.loading")}</span>}</div>
          </section>
        ) : (
          <section className={`${styles.detail} ${styles.apiDetail}`}>
            <header className={styles.apiDetailHeader}>
              <span className={styles.icon}>
                <KeyRound aria-hidden="true" />
              </span>
              <div>
                <DialogTitle>{profile.name}</DialogTitle>
                <DialogDescription>自定义 API</DialogDescription>
              </div>
            </header>
            <div className={styles.apiDetailBody}>
              {actionError ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{t("mcp.actionFailed")}</AlertDescription>
                </Alert>
              ) : null}
              <dl className={styles.apiFacts}>
                <div>
                  <dt>备注</dt>
                  <dd>{profile.instructions ?? "—"}</dd>
                </div>
                <div>
                  <dt>UUID</dt>
                  <dd>
                    <code>{profile.profile_id}</code>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="复制 UUID"
                      onClick={() =>
                        void navigator.clipboard?.writeText(profile.profile_id)
                      }
                    >
                      <Copy aria-hidden="true" />
                    </Button>
                  </dd>
                </div>
                <div>
                  <dt>密钥</dt>
                  <dd>{profile.environment.length} 个已配置</dd>
                </div>
              </dl>
              <div className={styles.apiManagement}>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEditing(true)}
                >
                  <Pencil aria-hidden="true" />
                  编辑
                </Button>
              </div>
              {deleteArmed ? (
                <div className={styles.deleteConfirm}>
                  <span>确认删除此自定义 API？</span>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busy}
                    onClick={onDelete}
                  >
                    {t("mcp.deleteConfirm")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setDeleteArmed(false)}
                  >
                    {t("mcp.cancel")}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.apiRemove}
                  disabled={busy}
                  onClick={() => setDeleteArmed(true)}
                >
                  <Trash2 aria-hidden="true" />
                  {t("mcp.delete")}
                </Button>
              )}
            </div>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
