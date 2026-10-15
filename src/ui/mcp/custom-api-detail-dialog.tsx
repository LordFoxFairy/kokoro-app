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
}: {
  profile: CustomApiProfile;
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
  const [name, setName] = useState(profile.name);
  const [instructions, setInstructions] = useState(profile.instructions ?? "");
  const [secrets, setSecrets] = useState<SecretDraft[]>([]);
  const configuredNames = useMemo(
    () => new Set(profile.environment.map(({ name }) => name)),
    [profile.environment],
  );
  const valid =
    name.trim().length > 0 &&
    secrets.every((item) => item.name.trim() && item.value) &&
    new Set(secrets.map((item) => item.name.trim())).size === secrets.length &&
    !secrets.some((item) => configuredNames.has(item.name.trim()));
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
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
              {actionError ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{t("mcp.actionFailed")}</AlertDescription>
                </Alert>
              ) : null}
              <div className={styles.field}>
                <Label htmlFor="custom-api-detail-name">名称</Label>
                <Input
                  id="custom-api-detail-name"
                  value={name}
                  maxLength={400}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="custom-api-detail-instructions">
                  备注（可选）
                </Label>
                <Textarea
                  id="custom-api-detail-instructions"
                  value={instructions}
                  maxLength={4000}
                  onChange={(event) => setInstructions(event.target.value)}
                />
              </div>
              <fieldset className={styles.headers}>
                <legend>密钥（环境变量）</legend>
                {profile.environment.map(({ name: environmentName }) => (
                  <div className={styles.existingHeader} key={environmentName}>
                    <span>{environmentName}</span>
                    <small>已配置</small>
                  </div>
                ))}
                {secrets.map((secret) => (
                  <div className={styles.headerDraft} key={secret.id}>
                    <Input
                      aria-label="密钥名称"
                      value={secret.name}
                      onChange={(event) =>
                        setSecrets((items) =>
                          items.map((item) =>
                            item.id === secret.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Input
                      aria-label="密钥值"
                      type="password"
                      value={secret.value}
                      autoComplete="new-password"
                      onChange={(event) =>
                        setSecrets((items) =>
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
                      aria-label="移除新增密钥"
                      onClick={() =>
                        setSecrets((items) =>
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
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                {t("mcp.cancel")}
              </Button>
              <Button type="submit" disabled={busy || !valid}>
                {busy ? (
                  <Spinner aria-hidden="true" />
                ) : (
                  <Pencil aria-hidden="true" />
                )}
                {t("mcp.saveChanges")}
              </Button>
            </footer>
          </form>
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
