"use client";

import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { HubClient } from "@/hub/client";

import styles from "./mcp-create-dialog.module.css";
import type { McpCreateMode } from "./mcp-panel-model";
import { CustomApiCreationForm, JsonMcpCreationForm, PrivateMcpCreationForm } from "./connector-command-context";

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
  onDone?: () => Promise<void>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const lifetime = useMemo(() => ({ client, mode, open }), [client, mode, open]);
  const committed = useRef<typeof lifetime | null>(null);
  const focusFrame = useRef<number | null>(null);
  useLayoutEffect(() => {
    committed.current = lifetime;
    return () => {
      if (committed.current === lifetime) committed.current = null;
      if (focusFrame.current !== null) window.cancelAnimationFrame(focusFrame.current);
      focusFrame.current = null;
    };
  }, [lifetime]);
  const changeOpen = (value: boolean): void => {
    if (lifetime.open && committed.current === lifetime) onOpenChange(value);
  };
  const close = (): void => changeOpen(false);
  const complete = async (): Promise<void> => {
    // A confirmed write still invalidates its original actor's projection.
    // Only dismissal belongs to this exact mounted window, not its successor.
    await onDone?.();
    close();
  };

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
          const target = returnFocusRef?.current;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
      >
        {mode === "custom-api" ? (
          <CustomApiCreationForm onCancel={close} onDone={complete} />
        ) : mode === "json" ? (
          <JsonMcpCreationForm onCancel={close} onDone={complete} />
        ) : (
          <PrivateMcpCreationForm mode={mode} onCancel={close} onDone={complete} />
        )}
      </DialogContent>
    </Dialog>
  );
}
