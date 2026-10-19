"use client";

import type { RefObject } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { McpConnectorProvider } from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";

import type { McpCreateMode } from "./mcp-panel-model";
import { McpProviderDirectory } from "./mcp-provider-directory";
import { McpSettingsToolbar } from "./mcp-settings-toolbar";
import type { MCP_CATEGORY_MESSAGES } from "./mcp-projection-types";
import styles from "./mcp-projection-read.module.css";

export function McpProviderCatalogDialog({
  open,
  providers,
  loading,
  hasMore,
  onLoadMore,
  error,
  query,
  categoryFilter,
  returnFocusRef,
  onOpenChange,
  onQueryChange,
  onCategoryFilterChange,
  onRetry,
  onSelectProvider,
  onCreate,
}: {
  open: boolean;
  providers?: McpConnectorProvider[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  error: boolean;
  query: string;
  categoryFilter: "all" | keyof typeof MCP_CATEGORY_MESSAGES;
  returnFocusRef: RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (value: string) => void;
  onCategoryFilterChange: (
    category: "all" | keyof typeof MCP_CATEGORY_MESSAGES,
  ) => void;
  onRetry: () => void;
  onSelectProvider: (
    provider: McpConnectorProvider,
    trigger: HTMLElement,
  ) => void;
  onCreate?: (mode: McpCreateMode, returnTarget?: HTMLElement | null) => void;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={styles.catalogDialog}
        overlayClassName={styles.editorOverlay ?? ""}
        closeLabel={t("mcp.cancel")}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const search = (
            event.currentTarget as HTMLElement | null
          )?.querySelector<HTMLInputElement>('input[type="search"]');
          window.requestAnimationFrame(() =>
            search?.focus({ preventScroll: true }),
          );
        }}
        onCloseAutoFocus={(event) => {
          const returnFocus = returnFocusRef.current;
          if (!returnFocus?.isConnected) return;
          event.preventDefault();
          window.requestAnimationFrame(() =>
            returnFocus.focus({ preventScroll: true }),
          );
        }}
      >
        <header className={styles.catalogHeader}>
          <DialogTitle>{t("connectorCatalog.title")}</DialogTitle>
        </header>
        <div className={styles.catalogToolbar}>
          <McpSettingsToolbar
            view="catalog"
            query={query}
            onQueryChange={onQueryChange}
            onBrowse={() => undefined}
            showBrowse={false}
            {...(onCreate ? { onCreate } : {})}
          />
        </div>
        <div className={styles.catalogBody}>
          {error ? (
            <Alert variant="destructive" role="alert" className={styles.alert}>
              <AlertDescription>{t("mcp.loadError")}</AlertDescription>
              <Button type="button" variant="outline" onClick={onRetry}>
                {t("mcp.retry")}
              </Button>
            </Alert>
          ) : null}
            <McpProviderDirectory
              providers={providers ?? []}
              hasMore={hasMore}
              loading={loading}
              onLoadMore={onLoadMore}
              {...(providers === undefined ? { resultsPlaceholder: loading ? <div className={styles.pendingCatalog} aria-busy="true"><span className="sr-only" role="status">{t("mcp.loading")}</span></div> : null } : {})}
              query={query}
              onQueryChange={onQueryChange}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={onCategoryFilterChange}
              onSelectProvider={onSelectProvider}
            />
        </div>
      </DialogContent>
    </Dialog>
  );
}
