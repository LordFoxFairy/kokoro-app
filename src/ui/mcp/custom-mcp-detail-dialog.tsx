"use client";

import type { McpIconClient } from "@/hub/mcp-icon-client";
import type { McpIconSaveChange } from "@/hub/mcp-icon.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { useMcpIconDraft } from "./use-mcp-icon-draft";
import { McpIconPicker } from "./mcp-icon-picker";
import { McpBoundIcon } from "./mcp-bound-icon";
import { McpAvailabilityStatus } from "./mcp-availability-status";

import { connectorCommandMayResume, connectorCommandFailureMessage, type ConnectorCommandFailure } from "./connector-command-failure";

import { type FormEvent, type RefObject, useState } from "react";
import {
  ChevronDown,
  Copy,
  FolderOpen,
  Link2Off,
  Link2,
  Pencil,
  Plus,
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

import type { McpManagementSummary } from "./mcp-management-commands";
import { McpManagementStatus } from "./mcp-management-status";
import styles from "./custom-mcp-detail-dialog.module.css";
import { canAuthorizePrivateMcp } from "./private-mcp-oauth-binding";
import { useMcpEditorSelection } from "./use-mcp-editor-selection";
import { isMcpCustomHeaderName } from "./mcp-header-validation";

type HeaderDraft = { id: string; name: string; value: string };

/**
 * Observed Manus custom MCP flow: a read-only detail first, then a separate
 * MCP configuration editor. It is intentionally not reused by API profiles or
 * OAuth provider cards.
 */
export function CustomMcpDetailDialog({
  iconClient, iconBoundary,
  connector,
  server,
  actionId,
  admitted,
  managementCommand,
  configurationSaved,
  onResumeManagement,
  actionError,
  deleteId,
  returnFocusRef,
  onClose,
  onSaveConfiguration,
  onPrepare,
  onTrial,
  onPublish,
  publicationAvailable = false,
  publicationRecoveryError = false,
  onRetryPublicationRecovery,
  onAuthorize,
  authorizationBusy = false,
  onDisconnect,
  onDeleteIntent,
  onCancelDelete,
  onDelete,
  preparationState = "idle",
  preparationFailure,
  preparationCanResume,
  preparationCanInspect = false,
  preparationRecoveryReady = true,
  preparationRecoveryError = false,
  onRetryPreparationRecovery,
  pendingError = false,
  onRetry,
}: {
  iconClient?: McpIconClient | undefined;
  iconBoundary?: ProjectReadBoundary | undefined;
  connector: McpConnector | null;
  server: McpPrivateServer | null;
  preparationState?: "idle" | "running" | "unknown" | "rejected" | "completed";
  preparationFailure?: ConnectorCommandFailure | undefined;
  preparationCanResume?: boolean;
  preparationCanInspect?: boolean;
  preparationRecoveryReady?: boolean;
  preparationRecoveryError?: boolean;
  onRetryPreparationRecovery?: () => void;
  pendingError?: boolean;
  onRetry?: () => void;
  actionId: string | null;
  admitted: boolean;
  managementCommand: McpManagementSummary | undefined;
  /** A confirmed save in this exact editor window, not a projection refresh. */
  configurationSaved?: object;
  onResumeManagement: () => void;
  actionError: boolean;
  deleteId: string | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSaveConfiguration: (input: McpIconSaveChange & {
    display_name: string;
    notes: string;
    server_url: string;
    header_upserts: Array<{ name: string; value: string }>;
    header_removals: string[];
  }) => void;
  onPrepare: () => void;
  onTrial?: () => boolean;
  /** Publishes the admitted saved definition, never the configuration draft. */
  onPublish?: () => void;
  publicationAvailable?: boolean;
  publicationRecoveryError?: boolean;
  onRetryPublicationRecovery?: () => void;
  onAuthorize: () => void;
  authorizationBusy?: boolean;
  onDisconnect: () => void;
  onDeleteIntent: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const ready = admitted && server !== null && connector !== null;
  const currentServer = ready ? server : null;
  const [editing, setEditing] = useState(false);
  const [trialError, setTrialError] = useState(false);
  // Store only explicit user edits across a recheck, never the previous owner
  // projection. Untouched fields resolve from the newly admitted server.
  const [nameDraft, setName] = useState<string | null>(null);
  const [notesDraft, setNotes] = useState<string | null>(null);
  const [urlDraft, setServerUrl] = useState<string | null>(null);
  const name = nameDraft ?? currentServer?.display_name ?? "";
  const notes = notesDraft ?? currentServer?.notes ?? "";
  const serverUrl = urlDraft ?? currentServer?.server_url ?? "";
  const [managementOpen, setManagementOpen] = useState(false);
  const [headers, setHeaders] = useState<HeaderDraft[]>([]);
  const [removedHeaders, setRemovedHeaders] = useState<string[]>([]);
  const [submittedFields, setSubmittedFields] = useState<{ name: string; notes: string; serverUrl: string } | null>(null);
  const [observedSave, setObservedSave] = useState(configurationSaved);
  const [savedFactsPending, setSavedFactsPending] = useState(false);
  if (observedSave !== configurationSaved) {
    setObservedSave(configurationSaved);
    if (configurationSaved) {
      // The command's transient completed notification may be batched with
      // finish(). This window-bound receipt still retires write-only drafts.
      setHeaders([]);
      setRemovedHeaders([]);
      // These are values the user explicitly submitted, not owner facts/CAS.
      // Retain them only as the confirmed command's draft while re-reading;
      // an unrelated admission recheck still masks untouched owner fields.
      if (submittedFields) {
        setName(submittedFields.name);
        setNotes(submittedFields.notes);
        setServerUrl(submittedFields.serverUrl);
        setSubmittedFields(null);
      }
      setSavedFactsPending(true);
    }
  }
  if (savedFactsPending && ready) {
    // Preserve explicit non-secret input while the post-save read is pending;
    // only the newly admitted owner facts can rebase the editable fields.
    setSavedFactsPending(false);
    setName(null);
    setNotes(null);
    setServerUrl(null);
  }
  const managementLocked = managementCommand !== undefined && managementCommand.kind !== "rejected";
  const busy = authorizationBusy || actionId === connector?.connector_id || managementCommand?.kind === "running";
  const [observedKind, setObservedKind] = useState(managementCommand?.kind);
  if (observedKind !== managementCommand?.kind) {
    setObservedKind(managementCommand?.kind);
    if (managementCommand?.kind === "completed") { setHeaders([]); setRemovedHeaders([]); }
  }
  const managementStatus = <McpManagementStatus command={managementCommand} admitted={admitted} onResume={onResumeManagement} />;
  const locked = managementLocked || busy || !ready || !preparationRecoveryReady || preparationState === "unknown" || preparationState === "completed";
  const icon = useMcpIconDraft(iconClient, iconBoundary ?? { subject: null, admitted: false, generation: 0 }, locked, configurationSaved, currentServer);
  const mayResumePreparation = preparationCanResume ?? connectorCommandMayResume(preparationFailure);
  const prepareLabel = preparationState === "unknown" ? t(mayResumePreparation ? "mcp.retryOriginal" : "mcp.recovery.inspectRequired") : preparationState === "completed" ? t("mcp.creationDone") : t("settings.connect");
  const needsAuthorization = ready && canAuthorizePrivateMcp(connector, server) &&
    preparationState !== "running" && preparationState !== "completed";
  // Reauthorization is a distinct explicit owner operation, not an ACK or a
  // replacement for an unknown Prepare. Keep its original recovery reachable.
  const trialAvailable = ready && preparationRecoveryReady && server.availability === "available" && connector.availability === "available" &&
    server.prepare_status === "ready" && Boolean(server.connection_id) && connector.enabled && connector.status === "active" &&
    (preparationState === "idle" || preparationState === "rejected");
  const configurationDirty = editing && (
    name !== (currentServer?.display_name ?? "") || notes !== (currentServer?.notes ?? "") ||
    serverUrl !== (currentServer?.server_url ?? "") || headers.length > 0 || removedHeaders.length > 0 || icon.state.dirty || icon.state.kind === "running" || icon.state.kind === "unknown"
  );
  const primaryAction = () => trialAvailable ? <Button type="button" variant={editing ? "outline" : "default"}
    disabled={managementLocked || busy || configurationDirty || !onTrial} onClick={() => setTrialError(onTrial?.() !== true)}>
    <Send aria-hidden="true" />试用一下
  </Button> : <><Button type="button" variant={editing ? "outline" : "default"}
    disabled={managementLocked || busy || !ready || !preparationRecoveryReady || preparationState === "running" || (!needsAuthorization && !mayResumePreparation && !preparationCanInspect)}
    onClick={needsAuthorization ? onAuthorize : onPrepare}>
    {busy ? <Spinner aria-hidden="true" /> : needsAuthorization ? <Link2 aria-hidden="true" /> : <Send aria-hidden="true" />}
    {needsAuthorization ? t(connector?.status === "active" ? "thread.reconnect" : "settings.connect") : prepareLabel}
  </Button>{needsAuthorization && preparationState === "unknown" ? <Button type="button" variant="outline"
    disabled={managementLocked || busy || !preparationRecoveryReady || (!mayResumePreparation && !preparationCanInspect)} onClick={onPrepare}>
    {prepareLabel}
  </Button> : null}</>;
  const recoveryStatus = !preparationRecoveryReady ? <Alert role="status">
    <AlertDescription>{t(preparationRecoveryError ? "mcp.loadError" : "mcp.loading")}</AlertDescription>
    {preparationRecoveryError ? <Button type="button" variant="outline" disabled={!admitted || !onRetryPreparationRecovery} onClick={onRetryPreparationRecovery}>{t("mcp.retry")}</Button> : null}
  </Alert> : null;
  const selectionProps = useMcpEditorSelection(ready);
  const invalidHeaderName = headers.some(
    (item) => Boolean(item.name.trim()) && !isMcpCustomHeaderName(item.name),
  );
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      locked || !icon.draft.canSave() || !server || !connector ||
      !name.trim() ||
      !serverUrl.trim() ||
      invalidHeaderName ||
      headers.some((item) => !item.name.trim() || !item.value)
    )
      return;
    setSubmittedFields({ name, notes, serverUrl });
    icon.draft.protectForSave();
    onSaveConfiguration({
      ...icon.draft.change(),
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

  const operationStatus = <>
    {preparationState === "unknown" ? <Alert role="alert"><AlertDescription>{t(connectorCommandFailureMessage(preparationFailure, "mcp.serverCreateUnknown"))}</AlertDescription></Alert> : null}
    {trialError ? <Alert variant="destructive" role="alert"><AlertDescription>{t("mcp.tryUnavailable")}</AlertDescription></Alert> : null}
  </>;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && (managementLocked || actionId === null || preparationState === "running")) { icon.draft.cancel(); onClose(); }
      }}
    >
      <DialogContent
        className={styles.dialog}
        data-variant={editing ? "configuration" : "detail"}
        overlayClassName={styles.overlay ?? ""}
        closeLabel={t("mcp.cancel")}
        onCloseAutoFocus={closeFocus}
      >
        {!editing ? operationStatus : null}
        {editing ? (
          <form
            {...selectionProps}
            className={styles.configuration}
            onSubmit={save}
            aria-busy={!ready && !pendingError}
          >
            <header className={styles.configurationHeader}>
              <DialogTitle>MCP 配置</DialogTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={locked}
                onClick={() =>
                  currentServer && void navigator.clipboard?.writeText(currentServer.server_id)
                }
              >
                <Copy aria-hidden="true" />
                <span className={styles.configurationButtonLabel}>复制 UUID</span>
              </Button>
            </header>
            <div className={styles.configurationBody}>
              {operationStatus}
              {managementStatus}
              {!ready ? pendingError ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{t("mcp.loadError")}</AlertDescription>
                  <Button type="button" variant="outline" onClick={onRetry} disabled={!onRetry}>
                    {t("mcp.retry")}
                  </Button>
                </Alert>
              ) : <span className="sr-only" role="status">{t("mcp.loading")}</span> : null}
              {recoveryStatus}
              {actionError ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{t("mcp.actionFailed")}</AlertDescription>
                </Alert>
              ) : null}
              <div className={styles.configurationGrid}>
                <div className={styles.field}>
                  <Label htmlFor="custom-mcp-name">服务器名称</Label>
                  <Input
                    readOnly={locked}
                    id="custom-mcp-name"
                    value={name}
                    maxLength={100}
                    onChange={(event) => !locked && setName(event.target.value)}
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
              <McpIconPicker draft={icon.draft} state={icon.state} current={currentServer?.icon} disabled={locked} />
              <div className={styles.field}>
                <Label htmlFor="custom-mcp-notes">
                  备注 <span className={styles.optional}>（可选）</span>
                </Label>
                <Textarea
                  readOnly={locked}
                  id="custom-mcp-notes"
                  value={notes}
                  placeholder="提供 MCP 文档或说明，以告知 Kokoro 如何及何时使用此 MCP"
                  maxLength={4000}
                  onChange={(event) => !locked && setNotes(event.target.value)}
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="custom-mcp-server-url">服务器 URL</Label>
                <Input
                  readOnly={locked}
                  id="custom-mcp-server-url"
                  type="url"
                  value={serverUrl}
                  onChange={(event) => !locked && setServerUrl(event.target.value)}
                  required
                />
              </div>
              <fieldset className={styles.headers}>
                <legend>
                  自定义 headers <span className={styles.optional}>（可选）</span>
                </legend>
                {(currentServer?.headers ?? [])
                  .filter((header) => header.configured && header.status === "active" && !removedHeaders.includes(header.name))
                  .map((header) => (
                    <div className={styles.existingHeader} key={header.name}>
                      <span>{header.name}</span>
                      <small>已配置</small>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={locked}
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
                      readOnly={locked}
                      id={`mcp-header-${header.id}-name`}
                      aria-label="Header name"
                      value={header.name}
                      onChange={(event) =>
                        !locked && setHeaders((items) =>
                          items.map((item) =>
                            item.id === header.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Input
                      readOnly={locked}
                      id={`mcp-header-${header.id}-value`}
                      aria-label="Header value"
                      type="password"
                      value={header.value}
                      onChange={(event) =>
                        !locked && setHeaders((items) =>
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
                      disabled={locked}
                      aria-label="移除新增 Header"
                      onClick={() =>
                        !locked && setHeaders((items) =>
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
                  disabled={locked}
                  onClick={() =>
                    setHeaders((items) => [
                      ...items,
                      { id: crypto.randomUUID(), name: "", value: "" },
                    ])
                  }
                >
                  <Plus aria-hidden="true" />
                  <span className={styles.configurationButtonLabel}>添加自定义 header</span>
                </Button>
              </fieldset>
            </div>
            <footer className={styles.configurationFooter}>
              <DropdownMenu open={managementOpen} onOpenChange={setManagementOpen}>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={locked}>
                    管理
                    <ChevronDown aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className={styles.configurationMenu}>
                  <DropdownMenuItem disabled>编辑 JSON</DropdownMenuItem>
                  <DropdownMenuSeparator className={styles.managementDivider} />
                  <DropdownMenuItem
                    className={styles.dangerMenuItem}
                    disabled={locked}
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
                {primaryAction()}
                <span className={styles.saveSplit}>
                  <Button type="submit" disabled={locked || invalidHeaderName || !icon.draft.canSave()}>
                    {busy ? <Spinner aria-hidden="true" /> : null}
                    保存
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" aria-label="保存选项" disabled={locked}>
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
        ) : !server || !connector ? (
          <section className={styles.detail} aria-busy={!pendingError}>
            <header className={styles.detailHero}><DialogTitle>{t("mcp.edit")}</DialogTitle></header>
            <div className={styles.detailBody}>
              {managementStatus}
              {pendingError ? <Alert variant="destructive" role="alert"><AlertDescription>{t("mcp.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={onRetry}>{t("mcp.retry")}</Button></Alert> : <span role="status">{t("mcp.loading")}</span>}
            </div>
          </section>
        ) : (
          <section className={styles.detail}>
            <header className={styles.detailHero}>
              <span className={styles.icon} aria-hidden="true">
                <McpBoundIcon icon={currentServer?.icon} alt="" fallback={server.display_name.slice(0, 1)} />
              </span>
              <DialogTitle>{server.display_name}</DialogTitle>
              <McpAvailabilityStatus availability={server.availability} />
              <div className={styles.detailActions}>
                {primaryAction()}
                <DropdownMenu open={managementOpen} onOpenChange={setManagementOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" disabled={managementLocked}>
                      管理
                      <ChevronDown aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className={styles.managementMenu}
                  >
                    <DropdownMenuItem disabled={managementLocked || busy} onSelect={onDisconnect}>
                      <Link2Off aria-hidden="true" />
                      断开连接
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className={styles.managementDivider} />
                    <DropdownMenuItem disabled={locked || preparationState === "running" || !publicationAvailable || !onPublish} onSelect={() => onPublish?.()}>
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
                      disabled={managementLocked || busy}
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
              {managementStatus}
              {recoveryStatus}
              {publicationRecoveryError ? <Alert variant="destructive" role="alert">
                <AlertDescription>{t("mcp.publishRecoveryError")}</AlertDescription>
                <Button type="button" variant="outline" disabled={!ready || !onRetryPublicationRecovery} onClick={() => onRetryPublicationRecovery?.()}>
                  {t("mcp.publishRetryRead")}
                </Button>
              </Alert> : null}
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
                    disabled={managementLocked || busy}
                    onClick={onDelete}
                  >
                    {t("mcp.deleteConfirm")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={managementLocked || busy}
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
