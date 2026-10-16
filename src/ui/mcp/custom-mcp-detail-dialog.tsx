"use client";

import { type FormEvent, type RefObject, useState } from "react";
import {
  ChevronDown,
  Copy,
  FolderOpen,
  Link2Off,
  Pencil,
  Send,
  Trash2,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type {
  McpConnector,
  McpPrivateServer,
} from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";

import styles from "./custom-mcp-detail-dialog.module.css";
import { isMcpCustomHeaderName } from "./mcp-header-validation";

type HeaderDraft = { id: string; name: string; value: string };

/**
 * Observed Manus custom MCP flow: a read-only detail first, then a separate
 * MCP configuration editor. It is intentionally not reused by API profiles or
 * OAuth provider cards.
 */
export function CustomMcpDetailDialog({
  connector,
  server,
  actionId,
  actionError,
  deleteId,
  returnFocusRef,
  onClose,
  onSaveConfiguration,
  onPrepare,
  onDisconnect,
  onDeleteIntent,
  onCancelDelete,
  onDelete,
  pendingError = false,
  onRetry,
}: {
  connector: McpConnector | null;
  server: McpPrivateServer | null;
  pendingError?: boolean;
  onRetry?: () => void;
  actionId: string | null;
  actionError: boolean;
  deleteId: string | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSaveConfiguration: (input: {
    display_name: string;
    notes: string;
    server_url: string;
    header_upserts: Array<{ name: string; value: string }>;
    header_removals: string[];
  }) => void;
  onPrepare: () => void;
  onDisconnect: () => void;
  onDeleteIntent: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  // Store only explicit user edits across a recheck, never the previous owner
  // projection. Untouched fields resolve from the newly admitted server.
  const [nameDraft, setName] = useState<string | null>(null);
  const [notesDraft, setNotes] = useState<string | null>(null);
  const [urlDraft, setServerUrl] = useState<string | null>(null);
  const name = nameDraft ?? server?.display_name ?? "";
  const notes = notesDraft ?? server?.notes ?? "";
  const serverUrl = urlDraft ?? server?.server_url ?? "";
  const [managementOpen, setManagementOpen] = useState(false);
  const [headers, setHeaders] = useState<HeaderDraft[]>([]);
  const [removedHeaders, setRemovedHeaders] = useState<string[]>([]);
  const busy = actionId === connector?.connector_id;
  const invalidHeaderName = headers.some(
    (item) => Boolean(item.name.trim()) && !isMcpCustomHeaderName(item.name),
  );
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !server || !connector ||
      !name.trim() ||
      !serverUrl.trim() ||
      invalidHeaderName ||
      headers.some((item) => !item.name.trim() || !item.value)
    )
      return;
    onSaveConfiguration({
      display_name: name.trim(),
      notes: notes.trim(),
      server_url: serverUrl.trim(),
      header_upserts: headers.map((item) => ({
        name: item.name.trim().toLowerCase(),
        value: item.value,
      })),
      header_removals: removedHeaders,
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
      onOpenChange={(next) => {
        if (!next && actionId === null) onClose();
      }}
    >
      <DialogContent
        className={styles.dialog}
        data-variant={editing ? "configuration" : "detail"}
        overlayClassName={styles.overlay ?? ""}
        closeLabel={t("mcp.cancel")}
        onCloseAutoFocus={closeFocus}
      >
        {!server || !connector ? (
          <section className={styles.detail} aria-busy={!pendingError}>
            <header className={styles.detailHero}><DialogTitle>{t("mcp.edit")}</DialogTitle></header>
            <div className={styles.detailBody}>
              {pendingError ? <Alert variant="destructive" role="alert"><AlertDescription>{t("mcp.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={onRetry}>{t("mcp.retry")}</Button></Alert> : <span role="status">{t("mcp.loading")}</span>}
            </div>
          </section>
        ) : editing ? (
          <form className={styles.configuration} onSubmit={save}>
            <div className={styles.configurationBody}>
              <header className={styles.configurationHeader}>
                <DialogTitle>MCP 配置</DialogTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void navigator.clipboard?.writeText(server.server_id)
                  }
                >
                  <Copy aria-hidden="true" />
                  复制 UUID
                </Button>
              </header>
              {actionError ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{t("mcp.actionFailed")}</AlertDescription>
                </Alert>
              ) : null}
              <div className={styles.configurationGrid}>
                <div className={styles.field}>
                  <Label htmlFor="custom-mcp-name">服务器名称</Label>
                  <Input
                    id="custom-mcp-name"
                    value={name}
                    maxLength={100}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <Label>传输类型</Label>
                  <div className={styles.staticValue} aria-label="传输类型 HTTP">
                    HTTP
                    <ChevronDown aria-hidden="true" />
                  </div>
                </div>
              </div>
              <div className={styles.iconField}>
                <Label>图标</Label>
                <div className={styles.iconUploadRow}>
                  <span className={styles.configurationIcon} aria-hidden="true">
                    {server.display_name.slice(0, 1)}
                  </span>
                  <span className={styles.uploadUnavailable}>上传</span>
                  <small>PNG 或 JPG，最大 1 MB。推荐尺寸 256×256 像素。</small>
                </div>
              </div>
              <div className={styles.field}>
                <Label htmlFor="custom-mcp-notes">
                  备注 <span className={styles.optional}>（可选）</span>
                </Label>
                <Textarea
                  id="custom-mcp-notes"
                  value={notes}
                  placeholder="提供 MCP 文档或说明，以告知 Kokoro 如何及何时使用此 MCP"
                  maxLength={4000}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="custom-mcp-server-url">服务器 URL</Label>
                <Input
                  id="custom-mcp-server-url"
                  type="url"
                  value={serverUrl}
                  onChange={(event) => setServerUrl(event.target.value)}
                  required
                />
              </div>
              <fieldset className={styles.headers}>
                <legend>
                  自定义 headers <span className={styles.optional}>（可选）</span>
                </legend>
                {server.headers
                  .filter((header) => !removedHeaders.includes(header.name))
                  .map((header) => (
                    <div className={styles.existingHeader} key={header.name}>
                      <span>{header.name}</span>
                      <small>已配置</small>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`移除 ${header.name}`}
                        onClick={() =>
                          setRemovedHeaders((items) => [...items, header.name])
                        }
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                {headers.map((header) => (
                  <div className={styles.headerDraft} key={header.id}>
                    <Input
                      aria-label="Header name"
                      value={header.name}
                      onChange={(event) =>
                        setHeaders((items) =>
                          items.map((item) =>
                            item.id === header.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Input
                      aria-label="Header value"
                      type="password"
                      value={header.value}
                      onChange={(event) =>
                        setHeaders((items) =>
                          items.map((item) =>
                            item.id === header.id
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
                      aria-label="移除新增 Header"
                      onClick={() =>
                        setHeaders((items) =>
                          items.filter((item) => item.id !== header.id),
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                {invalidHeaderName ? (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{t("mcp.errHeaderName")}</AlertDescription>
                  </Alert>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setHeaders((items) => [
                      ...items,
                      { id: crypto.randomUUID(), name: "", value: "" },
                    ])
                  }
                >
                  添加自定义 header
                </Button>
              </fieldset>
            </div>
            <footer className={styles.configurationFooter}>
              <DropdownMenu open={managementOpen} onOpenChange={setManagementOpen}>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={busy}>
                    管理
                    <ChevronDown aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className={styles.configurationMenu}>
                  <DropdownMenuItem disabled>编辑 JSON</DropdownMenuItem>
                  <DropdownMenuSeparator className={styles.managementDivider} />
                  <DropdownMenuItem
                    className={styles.dangerMenuItem}
                    disabled={busy}
                    onSelect={() => {
                      setEditing(false);
                      onDeleteIntent();
                    }}
                  >
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className={styles.configurationActions}>
                <Button type="button" variant="outline" disabled={busy} onClick={onPrepare}>
                  {busy ? <Spinner aria-hidden="true" /> : <Send aria-hidden="true" />}
                  试用一下
                </Button>
                <span className={styles.saveSplit}>
                  <Button type="submit" disabled={busy || invalidHeaderName}>
                    {busy ? <Spinner aria-hidden="true" /> : null}
                    保存
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" aria-label="保存选项" disabled={busy}>
                        <ChevronDown aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className={styles.configurationMenu}>
                      <DropdownMenuItem disabled>发布到项目</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
            </footer>
          </form>
        ) : (
          <section className={styles.detail}>
            <header className={styles.detailHero}>
              <span className={styles.icon} aria-hidden="true">
                {server.display_name.slice(0, 1)}
              </span>
              <DialogTitle>{server.display_name}</DialogTitle>
              <div className={styles.detailActions}>
                <Button type="button" disabled={busy} onClick={onPrepare}>
                  {busy ? (
                    <Spinner aria-hidden="true" />
                  ) : (
                    <Send aria-hidden="true" />
                  )}
                  试用一下
                </Button>
                <DropdownMenu open={managementOpen} onOpenChange={setManagementOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline">
                      管理
                      <ChevronDown aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className={styles.managementMenu}
                  >
                    <DropdownMenuItem disabled={busy} onSelect={onDisconnect}>
                      <Link2Off aria-hidden="true" />
                      断开连接
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className={styles.managementDivider} />
                    <DropdownMenuItem disabled>
                      <FolderOpen aria-hidden="true" />
                      发布到项目
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className={styles.managementDivider} />
                    <DropdownMenuItem onSelect={() => setEditing(true)}>
                      <Pencil aria-hidden="true" />
                      编辑配置
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className={styles.managementDivider} />
                    <DropdownMenuItem
                      className={styles.dangerMenuItem}
                      disabled={busy}
                      onSelect={onDeleteIntent}
                    >
                      <Trash2 aria-hidden="true" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            <div className={styles.detailBody}>
              {actionError ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{t("mcp.actionFailed")}</AlertDescription>
                </Alert>
              ) : null}
              <h3>详情</h3>
              <dl className={styles.facts}>
                <div>
                  <dt>分类</dt>
                  <dd>未分类</dd>
                </div>
                <div>
                  <dt>连接器类型</dt>
                  <dd>自定义 MCP</dd>
                </div>
                <div>
                  <dt>UUID</dt>
                  <dd>
                    <Button
                      type="button"
                      variant="ghost"
                      className={styles.uuid}
                      onClick={() =>
                        void navigator.clipboard?.writeText(server.server_id)
                      }
                    >
                      {server.server_id}
                      <Copy aria-hidden="true" />
                    </Button>
                  </dd>
                </div>
              </dl>
              {deleteId === connector.connector_id ? (
                <div className={styles.deleteConfirm}>
                  <span>确认删除此自定义 MCP？</span>
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
                    onClick={onCancelDelete}
                  >
                    {t("mcp.cancel")}
                  </Button>
                </div>
              ) : null}
            </div>
            <footer className={styles.feedback}>提供反馈</footer>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
