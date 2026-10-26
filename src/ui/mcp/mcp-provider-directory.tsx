"use client";

import { useId, useRef, type ReactNode } from "react";
import Image from "next/image";
import { Check, Link2, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { McpConnectorProvider } from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";

import {
  MCP_CATEGORY_MESSAGES,
  MCP_CATEGORY_OPTIONS,
  providerArtwork,
} from "./mcp-projection-types";
import { useMcpCategoryLayout } from "./use-mcp-category-layout";
import { McpCategoryDropdown } from "./mcp-category-dropdown";
import styles from "./mcp-projection-read.module.css";

type Category = keyof typeof MCP_CATEGORY_MESSAGES;

export function McpProviderDirectory({
  providers,
  query,
  onQueryChange,
  showSearch = false,
  showCompactFilter = true,
  presentation = "dialog",
  addedProviderKeys,
  relationsComplete = false,
  categoryFilter,
  onCategoryFilterChange,
  onSelectProvider,
  resultsPlaceholder,
  hasMore = false,
  loading = false,
  onLoadMore,
}: {
  providers: McpConnectorProvider[];
  hasMore?: boolean;
  loading?: boolean;
  onLoadMore?: () => void;
  /** Keep pure controls mounted while the owner result retires/revalidates. */
  resultsPlaceholder?: ReactNode;
  query: string;
  onQueryChange?: (value: string) => void;
  showSearch?: boolean;
  showCompactFilter?: boolean;
  presentation?: "plaza" | "dialog";
  addedProviderKeys?: ReadonlySet<string>;
  relationsComplete?: boolean;
  categoryFilter: "all" | Category;
  onCategoryFilterChange: (category: "all" | Category) => void;
  onSelectProvider: (
    provider: McpConnectorProvider,
    trigger: HTMLElement,
  ) => void;
}) {
  const t = useT();
  const statusId = useId();
  const directoryRef = useRef<HTMLDivElement | null>(null);
  const adaptive = presentation === "plaza" && showCompactFilter;
  const { categoriesFit, setContainerElement, measureRef, categoryMenuRef, categoryMenuOpenRef } =
    useMcpCategoryLayout({ enabled: adaptive, scopeRef: directoryRef, localeKey: t });
  const categoryLabel = (category: Category) =>
    t(MCP_CATEGORY_MESSAGES[category]);

  return (
    <div ref={directoryRef} className={styles.providerDirectory} data-presentation={presentation} data-categories-fit={categoriesFit}>
      <div ref={setContainerElement} className={styles.directoryControls}>
        {adaptive ? <div ref={measureRef} className={styles.categoryMeasure} aria-hidden="true" inert>
          <span data-selected={categoryFilter === "all"}>{t("mcp.categoryAll")}</span>
          {MCP_CATEGORY_OPTIONS.map(category => <span key={category} data-selected={categoryFilter === category}>{categoryLabel(category)}</span>)}
        </div> : null}
        {showSearch ? (
          <label className={styles.directorySearch}>
            <Search aria-hidden="true" />
            <span className="sr-only">{t("plugins.search")}</span>
            <input
              type="search"
              value={query}
              placeholder={t("plugins.search")}
              onChange={(event) => onQueryChange?.(event.target.value)}
            />
          </label>
        ) : null}
        <nav className={styles.categoryRail} aria-label={t("mcp.categoryAria")} inert={adaptive && !categoriesFit}>
          <button
            type="button"
            aria-pressed={categoryFilter === "all"}
            onClick={() => onCategoryFilterChange("all")}
          >
            {t("mcp.categoryAll")}
          </button>
          {MCP_CATEGORY_OPTIONS.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={categoryFilter === category}
              onClick={() => onCategoryFilterChange(category)}
            >
              {categoryLabel(category)}
            </button>
          ))}
        </nav>
        {showCompactFilter && (!adaptive || !categoriesFit) ? <div className={styles.compactFilter}>
          <McpCategoryDropdown value={categoryFilter} onChange={onCategoryFilterChange}
            triggerRef={categoryMenuRef} onOpenChange={next => { categoryMenuOpenRef.current = next; }} />
        </div> : null}
      </div>
      <section
        className={styles.providerSection}
        aria-label={t("mcp.provider")}
      >
        {resultsPlaceholder !== undefined ? resultsPlaceholder : providers.length === 0 && loading ? (
          <span className="sr-only" role="status">{t("mcp.loading")}</span>
        ) : providers.length === 0 ? (
          <div className={styles.emptyProvider}>
            <Link2 aria-hidden="true" />
            <p>{t(query.trim() || categoryFilter !== "all" ? "mcp.noMatch" : "mcp.noProviders")}</p>
          </div>
        ) : (
          <ul className={styles.providerGrid}>
            {providers.map((provider, index) => (
              <li
                key={provider.provider_key}
                className={styles.providerCard}
                data-testid={`mcp-provider-card-${provider.provider_key}`}
              >
                <button
                  type="button"
                  className={styles.providerDetailTrigger}
                  onClick={(event) =>
                    onSelectProvider(provider, event.currentTarget)
                  }
                  aria-label={provider.display_name}
                  aria-describedby={addedProviderKeys?.has(provider.provider_key) ? `${statusId}-${index}` : undefined}
                >
                  <span className={styles.providerLogo} aria-hidden="true">
                    <Image
                      src={providerArtwork(provider)}
                      alt=""
                      width={24}
                      height={24}
                      unoptimized
                    />
                  </span>
                  <span className={styles.providerCopy}>
                    <span className={styles.providerName}>
                      {provider.display_name}
                    </span>
                    {provider.description ? (
                      <span className={styles.providerDescription}>
                        {provider.description}
                      </span>
                    ) : null}
                  </span>
                  {addedProviderKeys?.has(provider.provider_key) ? <span id={`${statusId}-${index}`} className="sr-only">{t("skills.added")}</span> : null}
                  <span className={styles.providerAction} aria-hidden="true">
                    {addedProviderKeys?.has(provider.provider_key) ? <Check /> : relationsComplete ? <Plus /> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {hasMore && onLoadMore ? (
          <div className={styles.pagination}>
            <Button type="button" variant="outline" onClick={onLoadMore} disabled={loading} aria-busy={loading}>
              {t("rail.loadMore")}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
