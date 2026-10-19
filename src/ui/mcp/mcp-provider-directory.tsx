"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Check, ChevronDown, Link2, ListFilter, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { McpConnectorProvider } from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";

import {
  MCP_CATEGORY_MESSAGES,
  MCP_CATEGORY_OPTIONS,
  providerArtwork,
} from "./mcp-projection-types";
import styles from "./mcp-projection-read.module.css";

type Category = keyof typeof MCP_CATEGORY_MESSAGES;

export function McpProviderDirectory({
  providers,
  query,
  onQueryChange,
  showSearch = false,
  presentation = "dialog",
  connectedProviderKeys,
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
  presentation?: "plaza" | "dialog";
  connectedProviderKeys?: ReadonlySet<string>;
  categoryFilter: "all" | Category;
  onCategoryFilterChange: (category: "all" | Category) => void;
  onSelectProvider: (
    provider: McpConnectorProvider,
    trigger: HTMLElement,
  ) => void;
}) {
  const t = useT();
  const categoryLabel = (category: Category) =>
    t(MCP_CATEGORY_MESSAGES[category]);

  return (
    <div className={styles.providerDirectory} data-presentation={presentation}>
      <div className={styles.directoryControls}>
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
        <nav className={styles.categoryRail} aria-label={t("mcp.categoryAria")}>
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
        <div className={styles.compactFilter}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={styles.filterTrigger}
              >
                <ListFilter aria-hidden="true" />
                {categoryFilter === "all"
                  ? t("mcp.categoryAll")
                  : categoryLabel(categoryFilter)}
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={styles.filterMenu}>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() => onCategoryFilterChange("all")}
                >
                  {t("mcp.categoryAll")}
                </DropdownMenuItem>
                {MCP_CATEGORY_OPTIONS.map((category) => (
                  <DropdownMenuItem
                    key={category}
                    onSelect={() => onCategoryFilterChange(category)}
                  >
                    {categoryLabel(category)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <section
        className={styles.providerSection}
        aria-label={t("mcp.provider")}
      >
        {resultsPlaceholder !== undefined ? resultsPlaceholder : providers.length === 0 ? (
          <div className={styles.emptyProvider}>
            <Link2 aria-hidden="true" />
            <p>{t(query.trim() || categoryFilter !== "all" ? "mcp.noMatch" : "mcp.noProviders")}</p>
          </div>
        ) : (
          <ul className={styles.providerGrid}>
            {providers.map((provider) => (
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
                >
                  <span className={styles.providerLogo} aria-hidden="true">
                    <Image
                      src={providerArtwork(provider)}
                      alt=""
                      fill
                      sizes="2.4rem"
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
                    {provider.category_keys.length > 0 ? (
                      <span className={styles.providerTags}>
                        {provider.category_keys.map((category) => (
                          <span key={category}>{categoryLabel(category)}</span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.providerAction} aria-hidden="true">
                    {connectedProviderKeys?.has(provider.provider_key) ? <Check /> : <Plus />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {hasMore && onLoadMore ? (
          <div className={styles.pagination}>
            <Button type="button" variant="outline" onClick={onLoadMore} disabled={loading} aria-busy={loading}>
              {t(loading ? "mcp.loading" : "rail.loadMore")}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
