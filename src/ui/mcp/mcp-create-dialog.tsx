"use client";

import { Button } from "@/components/ui/button";
import { McpProjectPublicationDialog } from "./mcp-project-publication-dialog";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { HubClient } from "@/hub/client";

import styles from "./mcp-create-dialog.module.css";
import type { McpCreateMode } from "./mcp-panel-model";
import { McpCreateDismissContext } from "./mcp-create-dismiss-context";
import { useMcpProjectPublicationCommands, CustomApiCreationForm, JsonMcpCreationForm, PrivateMcpCreationForm, useConnectorCommandBoundary } from "./connector-command-context";
import type { McpServerCreationCompletion } from "./mcp-server-creation-flow";
import { retireCreatedMcpDetail } from "./mcp-created-detail-handoff";
import { McpProjectionRead } from "./mcp-projection-read";

export function McpCreateDialog({
  client,
  mode,
  open,
  onOpenChange,
  onDone,
  returnFocusRef,
}: {
  client: HubClient;
  mode: McpCreateMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: (result?: McpServerCreationCompletion) => Promise<void>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const boundary = useConnectorCommandBoundary(client);
  const publication = useMcpProjectPublicationCommands(client);
  const publicationState = useSyncExternalStore(publication.subscribe, publication.getSnapshot, publication.getSnapshot);
  const lifetime = useMemo(() => ({ client, mode, open, subject: boundary.subject }), [client, mode, open, boundary.subject]);
  const committed = useRef<typeof lifetime | null>(null);
  const currentBoundary = useRef(boundary);
  useLayoutEffect(() => { currentBoundary.current = boundary; }, [boundary]);
  const [completed, setCompleted] = useState<{ lifetime: typeof lifetime; target: McpServerCreationCompletion } | null>(null);
  if (completed && completed.lifetime !== lifetime) { retireCreatedMcpDetail(completed.target); setCompleted(null); }
  useLayoutEffect(() => () => { if (completed) retireCreatedMcpDetail(completed.target); }, [completed]);
  const [publishing, setPublishing] = useState(false);
  const [publicationClosedFor, setPublicationClosedFor] = useState<typeof lifetime | null>(null);
  const handingOff = useRef(false);
  const focusFrame = useRef<number | null>(null);
  const dismissals = useRef(new Set<() => void>());
  const registerDismiss = useCallback((onDismiss: () => void) => {
    dismissals.current.add(onDismiss);
    return () => { dismissals.current.delete(onDismiss); };
  }, []);
  useLayoutEffect(() => {
    committed.current = lifetime;
    handingOff.current = false;
    return () => {
      if (committed.current === lifetime) committed.current = null;
      if (focusFrame.current !== null) window.cancelAnimationFrame(focusFrame.current);
      focusFrame.current = null;
    };
  }, [lifetime]);
  const changeOpen = (value: boolean): void => {
    if (lifetime.open && committed.current === lifetime) {
      if (!value) {
        if (completed) retireCreatedMcpDetail(completed.target);
        committed.current = null;
        dismissals.current.forEach(dismiss => dismiss());
        publication.dismiss();
      }
      onOpenChange(value);
    }
  };
  const close = (): void => changeOpen(false);
  const complete = async (target?: McpServerCreationCompletion, creationCurrent?: () => boolean): Promise<void> => {
    // A confirmed write still invalidates its original actor's projection.
    // Only dismissal belongs to this exact mounted window, not its successor.
    const current = () => committed.current === lifetime && lifetime.open && currentBoundary.current === boundary && boundary.admitted && boundary.subject !== null && creationCurrent?.() !== false;
    if (target && !current()) throw new Error("MCP creation handoff retired");
    if (target) await onDone?.(target);
    else await onDone?.();
    if (target) {
      if (!current()) throw new Error("MCP creation handoff retired");
      handingOff.current = true;
      setCompleted({ lifetime, target });
    } else close();
  };

  const publishCreated = async (target: McpServerCreationCompletion, current: () => boolean) => {
    if (!publication.available || !current() || !publication.open(target, boundary)) throw new Error("MCP publication handoff retired");
    setPublishing(true);
    await complete(target, current);
  };
  const resumed = mode === "url" && (publicationState.phase === "unknown" || publicationState.phase === "rejected") ? publicationState.target : null;
  const detail = completed?.lifetime === lifetime ? completed.target : resumed;
  if (detail && open && boundary.subject !== null) {
    if ((publishing || resumed !== null && publicationClosedFor !== lifetime) && publicationState.target) {
      return <McpProjectPublicationDialog client={client} commands={publication} boundary={boundary} target={publicationState.target} onSourceRead={() => retireCreatedMcpDetail(detail)} onClose={() => { setPublishing(false); setPublicationClosedFor(lifetime); if (!completed) setCompleted({ lifetime, target: detail }); }} />;
    }
    return <McpProjectionRead client={client} identity={boundary.subject} admitted={boundary.admitted}
      readGeneration={boundary.generation} initialView="connections"
      createdDetail={{ target: detail, onClose: close, ...(returnFocusRef ? { returnFocusRef } : {}) }} />;
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        className={cn(
          mode === "json"
            ? styles.jsonImportDialog
            : mode === "url"
              ? styles.urlMcpDialog
              : mode === "custom-api"
                ? styles.customApiDialog
              : styles.registerDialog,
          "p-0 box-border",
        )}
        closeLabel={t("mcp.cancel")}
        overlayClassName={styles.createDialogOverlay ?? ""}
        onOpenAutoFocus={(event) => {
          if (mode !== "form" && mode !== "custom-api") return;
          event.preventDefault();
          focusFrame.current = window.requestAnimationFrame(() => {
            focusFrame.current = null;
            if (committed.current !== lifetime) return;
            document.getElementById(
              mode === "custom-api" ? "custom-api-name" : "custom-mcp-name",
            )?.focus();
          });
        }}
        onCloseAutoFocus={(event) => {
          if (handingOff.current) { event.preventDefault(); return; }
          const target = returnFocusRef?.current;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <McpCreateDismissContext.Provider value={registerDismiss}>{mode === "custom-api" ? (
          <CustomApiCreationForm onCancel={close} onDone={complete} />
        ) : mode === "json" ? (
          <JsonMcpCreationForm onCancel={close} onDone={complete} />
        ) : (
          <><PrivateMcpCreationForm mode={mode} onCancel={close} onDone={complete} {...(mode === "url" && publication.available && publicationState.recovery === "ready" ? { onPublish: publishCreated } : {})} />{mode === "url" && publicationState.recovery === "error" ? <div role="alert"><p>{t("mcp.publishRecoveryError")}</p><Button variant="outline" onClick={() => void publication.restore(boundary)}>{t("mcp.publishRetryRead")}</Button></div> : null}</>
        )}</McpCreateDismissContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
