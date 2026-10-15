"use client";

import type { RefObject } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { HubClient } from "@/hub/client";

import styles from "./mcp-create-dialog.module.css";
import type { McpCreateMode } from "./mcp-panel-model";
import { CustomMcpForm } from "./mcp-custom-form";
import { JsonMcpImportForm } from "./mcp-json-import-form";
import { UrlMcpForm } from "./mcp-url-form";
import { CustomApiForm } from "./custom-api-form";

export function McpCreateDialog({
  client,
  mode,
  open,
  onOpenChange,
  onDone,
  onRegistered,
  returnFocusRef,
}: {
  client: HubClient;
  mode: McpCreateMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => Promise<void>;
  /** A private-server aggregate may persist before remote Prepare completes. */
  onRegistered?: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const close = (): void => onOpenChange(false);
  const complete = async (): Promise<void> => {
    await onDone?.();
    close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          window.requestAnimationFrame(() =>
            document.getElementById(
              mode === "custom-api" ? "custom-api-name" : "url-mcp-name",
            )?.focus(),
          );
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
      >
        {mode === "custom-api" ? (
          <CustomApiForm client={client} onCancel={close} onDone={complete} />
        ) : mode === "json" ? (
          <JsonMcpImportForm
            client={client}
            onCancel={close}
            onDone={complete}
            {...(onRegistered === undefined ? {} : { onRegistered })}
          />
        ) : mode === "url" ? (
          <UrlMcpForm
            client={client}
            onCancel={close}
            onDone={complete}
            {...(onRegistered === undefined ? {} : { onRegistered })}
          />
        ) : (
          <CustomMcpForm
            client={client}
            onDone={complete}
            {...(onRegistered === undefined ? {} : { onRegistered })}
            onCancel={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
