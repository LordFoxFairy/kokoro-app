"use client";

import { useRef, type RefObject } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { McpConnectorProvider } from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";

import type { McpCreateMode } from "./mcp-panel-model";
import { McpCategoryDropdown } from "./mcp-category-dropdown";
import { useMcpCategoryLayout } from "./use-mcp-category-layout";
import { McpProviderDirectory } from "./mcp-provider-directory";
import { McpSettingsToolbar } from "./mcp-settings-toolbar";
import { MCP_CATEGORY_MESSAGES, MCP_CATEGORY_OPTIONS } from "./mcp-projection-types";
import styles from "./mcp-projection-read.module.css";

export function McpProviderCatalogDialog({
  open,
  providers,
  addedProviderKeys,
  relationsComplete = false,
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
  addedProviderKeys?: ReadonlySet<string>;
  relationsComplete?: boolean;
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
  const hasResults = (providers?.length ?? 0) > 0;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { categoriesFit, setContainerElement, measureRef, categoryMenuRef, categoryMenuOpenRef } =
    useMcpCategoryLayout({ enabled: open, scopeRef: dialogRef, localeKey: t });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogRef}
        className={styles.catalogDialog}
        data-categories-fit={categoriesFit}
        overlayClassName={styles.editorOverlay ?? ""}
        closeLabel={t("mcp.cancel")}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const search = (
            event.currentTarget as HTMLElement | null
          )?.querySelector<HTMLInputElement>('input[type="search"]');
          const initialFocus = document.activeElement;
          window.requestAnimationFrame(() => {
            if (search?.isConnected && document.activeElement === initialFocus)
              search.focus({ preventScroll: true });
          });
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
        <div ref={setContainerElement} className={styles.catalogToolbar}>
          <div ref={measureRef} className={styles.categoryMeasure} aria-hidden="true" inert>
            <span data-selected={categoryFilter === "all"}>{t("mcp.categoryAll")}</span>
            {MCP_CATEGORY_OPTIONS.map(category => <span key={category} data-selected={categoryFilter === category}>{t(MCP_CATEGORY_MESSAGES[category])}</span>)}
          </div>
          <McpSettingsToolbar
            view="catalog"
            query={query}
            onQueryChange={onQueryChange}
            onBrowse={() => undefined}
            showBrowse={false}
            settingsLayout
            {...(onCreate ? { onCreate } : {})}
          >
            <div className={styles.catalogFilter}>
              {!categoriesFit ? <McpCategoryDropdown value={categoryFilter} onChange={onCategoryFilterChange}
                triggerRef={categoryMenuRef} onOpenChange={next => { categoryMenuOpenRef.current = next; }} /> : null}
            </div>
          </McpSettingsToolbar>
        </div>
        <div className={styles.catalogBody}>
          {error && !hasResults ? (
            <Alert variant="destructive" role="alert" className={styles.alert}>
              <AlertDescription>{t("mcp.loadError")}</AlertDescription>
              <Button type="button" variant="outline" onClick={onRetry}>
                {t("mcp.retry")}
              </Button>
            </Alert>
          ) : null}
            <McpProviderDirectory
              providers={providers ?? []}
              {...(addedProviderKeys ? { addedProviderKeys } : {})}
              relationsComplete={relationsComplete}
              showCompactFilter={false}
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
