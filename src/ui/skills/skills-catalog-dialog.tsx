import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Check,
  ChevronDown,
  ListFilter,
  Plus,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ManusSkillHubClient } from "./manus-skill-client";
import type { CatalogSkillCategory, SkillCard, SkillCatalog, SkillCatalogCard } from "@/hub/schemas";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { useResource } from "@/lib/query";
import { formatSkillDate } from "./skills-format";
import { toSkillActionCard } from "./skills-card-model";
import { mergeSkillCatalogPages, skillStateKey, skillSourceScope } from "./skills-pool-model";
import { SKILLS_CATALOG_KEY, skillResourceKey } from "./skills-resource-cache";
import { SkillCoverMedia } from "./skill-cover-media";
import styles from "./skills-panel.module.css";

type CatalogCategory = "all" | CatalogSkillCategory;

export type CatalogDetailProjection = Readonly<{
  skill: SkillCatalogCard | null;
  failed: boolean;
  busy: boolean;
  loadMore?: () => void;
  retry: () => void;
}>;

const CATALOG_CATEGORIES: readonly Readonly<{
  value: CatalogCategory;
  label: "skills.categoryAll" | "skills.categoryCoding" | "skills.categoryData" | "skills.categoryAutomation" | "skills.categoryBusiness" | "skills.categoryDesign" | "skills.categoryMedia" | "skills.categoryContent" | "skills.categoryApps";
}>[] = [
  { value: "all", label: "skills.categoryAll" },
  { value: "coding", label: "skills.categoryCoding" },
  { value: "data", label: "skills.categoryData" },
  { value: "automation", label: "skills.categoryAutomation" },
  { value: "business", label: "skills.categoryBusiness" },
  { value: "design", label: "skills.categoryDesign" },
  { value: "media", label: "skills.categoryMedia" },
  { value: "content", label: "skills.categoryContent" },
  { value: "apps", label: "skills.categoryApps" },
];

function hasCategory(skill: Pick<SkillCatalogCard, "categories">, category: CatalogCategory): boolean {
  return category === "all" || skill.categories?.includes(category) === true;
}

export function SkillCatalogDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  client,
  enabledOverrides,
  installedOverrides,
  busy,
  errorName,
  onOpenUpload,
  onOpenGithub,
  onSetEnabled,
  onOpenDetail,
  inline = false,
  preview = false,
  selectedDetailKey,
  onDetailProjection,
  detailReturnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  client: ManusSkillHubClient;
  preview?: boolean;
  selectedDetailKey?: string | null;
  onDetailProjection?: (projection: CatalogDetailProjection) => void;
  detailReturnFocusRef?: RefObject<HTMLElement | null>;
  enabledOverrides: ReadonlyMap<string, boolean>;
  installedOverrides: ReadonlyMap<string, boolean>;
  busy: string | null;
  errorName: string | null;
  onOpenUpload: (returnFocusRef?: RefObject<HTMLElement | null>) => void;
  onOpenGithub: (returnFocusRef?: RefObject<HTMLElement | null>) => void;
  onSetEnabled: (skill: SkillCard, enabled: boolean, stateKey?: string) => void;
  /** Catalog detail is available before installation; package inspection is
   * still gated by the owner-issued series and revision identity. */
  onOpenDetail: (skill: SkillCatalogCard, source: HTMLElement) => void;
  /** Renders inside Settings so its left navigation remains visible. */
  inline?: boolean;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setCommittedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const [scope, setScope] = useState<"all" | "official" | "third_party">(
    inline ? "all" : "official",
  );
  // Settings Explore is a catalog view, not the installed-skills scope picker.
  // Manus exposes server-classified categories directly on this reader list.
  const [category, setCategory] = useState<CatalogCategory>("all");
  const [categoriesFit, setCategoriesFit] = useState(false);
  const catalogControlsRef = useRef<HTMLDivElement | null>(null);
  const categoryMeasureRef = useRef<HTMLDivElement | null>(null);
  const categoryRowRef = useRef<HTMLDivElement | null>(null);
  const categoryMenuRef = useRef<HTMLButtonElement | null>(null);
  const categoryMenuOpenRef = useRef(false);
  const categoryFocusPendingRef = useRef(false);
  useLayoutEffect(() => {
    if (!inline) return;
    const controls = catalogControlsRef.current;
    const measure = categoryMeasureRef.current;
    if (!controls || !measure) return;
    let retired = false;
    const update = () => {
      if (retired) return;
      const fits = measure.scrollWidth > 0 && measure.scrollWidth <= controls.clientWidth;
      const focused = document.activeElement;
      if ((fits && (focused === categoryMenuRef.current || categoryMenuOpenRef.current)) ||
          (!fits && categoryRowRef.current?.contains(focused))) {
        categoryFocusPendingRef.current = true;
      }
      if (fits) categoryMenuOpenRef.current = false;
      setCategoriesFit(fits);
    };
    const observer = new ResizeObserver(update);
    observer.observe(controls);
    observer.observe(measure);
    const frame = window.requestAnimationFrame(update);
    void document.fonts?.ready.then(update);
    return () => {
      retired = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [inline, t]);
  useLayoutEffect(() => {
    if (!categoryFocusPendingRef.current) return;
    categoryFocusPendingRef.current = false;
    const target = categoriesFit
      ? categoryRowRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      : categoryMenuRef.current;
    target?.focus({ preventScroll: true });
  }, [categoriesFit]);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createActionHandledRef = useRef(false);
  const catalogSearchRef = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    if (selectedDetailKey && detailReturnFocusRef && !detailReturnFocusRef.current?.isConnected) {
      detailReturnFocusRef.current = catalogSearchRef.current;
    }
  }, [client, detailReturnFocusRef, selectedDetailKey]);
  const catalogCreateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const catalogMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef<{ controller: AbortController } | null>(null);
  const catalogFilters = useMemo(() => ({
    pageSize: 9,
    ...(!inline && scope !== "all" ? { scope } : {}),
    ...(committedQuery ? { query: committedQuery } : {}),
    ...(category === "all" ? {} : { category }),
  }), [category, committedQuery, inline, scope]);
  const catalogKey = skillResourceKey(SKILLS_CATALOG_KEY, client,
    JSON.stringify([inline ? "explore" : "dialog", 9, scope, committedQuery, category]));
  const catalog = useResource<SkillCatalog>(
    catalogKey,
    useCallback(() => client.listSkillCatalog({
      ...catalogFilters,
      ...(catalogFilters.scope === undefined && catalogFilters.query === undefined && catalogFilters.category === undefined ? { shuffle: true } : {}),
    }), [catalogFilters, client]),
  );
  // A query owns a distinct cache key, so swapping text used to clear a
  // confirmed directory and paint a whole new skeleton grid on every key
  // stroke. Keep the last owner response projected while the next owner read
  // is in flight; the same local query/category predicates below are applied
  // to it, so no stale card is presented as a search match. Once the response
  // arrives it atomically replaces this snapshot.
  const [lastConfirmedCatalog, setLastConfirmedCatalog] = useState<
    SkillCatalog | undefined
  >();
  // This is a derived render-state handoff, rather than an effect: when the
  // resource completes, React immediately re-renders once with the confirmed
  // page as both the current and future fallback. A later query can then keep
  // that page visible while its distinct resource key resolves.
  if (
    catalog.data !== undefined &&
    lastConfirmedCatalog !== catalog.data
  ) {
    setLastConfirmedCatalog(catalog.data);
  }
  const catalogBase = catalog.data ?? lastConfirmedCatalog;
  const catalogRefreshing = catalog.loading;
  const [pageState, setPageState] = useState<Readonly<{
    base: SkillCatalog | undefined;
    pages: readonly SkillCatalog[];
  }>>({ base: undefined, pages: [] });
  const [loadingMoreFor, setLoadingMoreFor] = useState<{ base: SkillCatalog; controller: AbortController }>();
  const [loadMoreFailedFor, setLoadMoreFailedFor] = useState<SkillCatalog | undefined>();
  const [factsClient, setFactsClient] = useState(client);
  if (factsClient !== client) {
    setFactsClient(client);
    setLastConfirmedCatalog(undefined);
    setPageState({ base: undefined, pages: [] });
    setLoadingMoreFor(undefined); setLoadMoreFailedFor(undefined);
    setCreateMenuOpen(false);
  }
  const additionalPages = useMemo(
    () => pageState.base === catalog.data ? pageState.pages : [],
    [catalog.data, pageState],
  );
  const displayedCatalog = useMemo(
    () => catalogBase === undefined
      ? undefined
      : mergeSkillCatalogPages([
          catalogBase,
          ...(catalog.data === undefined ? [] : additionalPages),
        ]),
    [additionalPages, catalog.data, catalogBase],
  );
  // Disconnect cannot retract an observer callback already queued by the
  // browser. Fence both the read boundary and its current next cursor before
  // an old callback can start another request or occupy the pending slot.
  const readOwner = useMemo(() => ({ key: catalogKey, base: catalog.data, cursor: displayedCatalog?.next_cursor, open }),
    [catalogKey, catalog.data, displayedCatalog?.next_cursor, open]);
  const currentReadOwner = useRef<typeof readOwner | null>(null);
  useLayoutEffect(() => {
    currentReadOwner.current = readOwner;
    return () => {
      currentReadOwner.current = null;
      loadingMoreRef.current?.controller.abort();
      loadingMoreRef.current = null;
    };
  }, [readOwner]);
  const loadingMore = loadingMoreFor?.base === catalog.data && loadingMoreFor !== undefined && !loadingMoreFor.controller.signal.aborted;
  const loadMoreFailed = catalog.data !== undefined && loadMoreFailedFor === catalog.data;
  const loadMore = useCallback(async () => {
    const base = catalog.data;
    const cursor = displayedCatalog?.next_cursor;
    if (!readOwner.open || currentReadOwner.current !== readOwner || base === undefined || cursor === null || cursor === undefined || loadingMoreRef.current !== null) return;
    const pending = { base, controller: new AbortController() };
    loadingMoreRef.current = pending;
    setLoadingMoreFor(pending);
    setLoadMoreFailedFor(undefined);
    try {
      const page = await client.listSkillCatalog({
        ...catalogFilters,
        cursor,
        signal: pending.controller.signal,
      });
      if (pending.controller.signal.aborted) return;
      if (page.next_cursor === cursor) {
        throw new Error("skill catalog cursor did not advance");
      }
      setPageState((current) => ({
        base,
        pages: current.base === base ? [...current.pages, page] : [page],
      }));
    } catch {
      if (!pending.controller.signal.aborted) setLoadMoreFailedFor(base);
    } finally {
      if (loadingMoreRef.current === pending) {
        loadingMoreRef.current = null;
        setLoadingMoreFor(undefined);
      }
    }
  }, [catalog.data, catalogFilters, client, displayedCatalog?.next_cursor, readOwner]);

  const { refetch: refetchCatalog } = catalog;
  const retry = useCallback(() => {
    if (readOwner.open && currentReadOwner.current === readOwner) refetchCatalog();
  }, [refetchCatalog, readOwner]);

  useLayoutEffect(() => {
    if (!selectedDetailKey || !onDetailProjection) return;
    const skill = catalog.data === undefined ? null : displayedCatalog?.skills.find(
      item => JSON.stringify([item.skill_id, item.revision_skill_id]) === selectedDetailKey,
    ) ?? null;
    onDetailProjection({
      skill,
      failed: loadMoreFailed || catalog.error !== undefined || catalog.data !== undefined && !displayedCatalog?.next_cursor,
      busy: catalog.loading || loadingMore,
      retry,
      ...(displayedCatalog?.next_cursor && catalog.data !== undefined ? { loadMore: () => void loadMore() } : {}),
    });
  }, [catalog.data, catalog.error, catalog.loading, displayedCatalog, loadMore, loadMoreFailed, loadingMore, onDetailProjection, retry, selectedDetailKey]);

  useEffect(() => {
    const target = catalogMoreRef.current;
    if (target === null || catalog.data === undefined || displayedCatalog?.next_cursor === null || displayedCatalog?.next_cursor === undefined) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "240px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [catalog.data, displayedCatalog?.next_cursor, loadMore]);

  useEffect(() => {
    if (!inline || !open) return;
    const frame = window.requestAnimationFrame(() =>
      catalogSearchRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [inline, open]);

  const selectCreateAction = (action: () => void, event?: Event) => {
    event?.preventDefault();
    if (createActionHandledRef.current) return;
    createActionHandledRef.current = true;
    setCreateMenuOpen(false);
    action();
    queueMicrotask(() => {
      createActionHandledRef.current = false;
    });
  };

  const focusCatalogSearch = (event: Event) => {
    event.preventDefault();
    catalogSearchRef.current?.focus({ preventScroll: true });
  };
  const normalized = query.trim().toLocaleLowerCase();
  const skills = displayedCatalog?.skills ?? [];
  // A confirmed live page is already matched by the owner (including indexed
  // content beyond these card fields). Local predicates are only a preview
  // rule or a temporary projection of the previous page during a new read.
  const filtered = !preview && catalog.data !== undefined ? skills : skills.filter((skill) => {
    const scopeMatches =
      inline ||
      scope === "all" ||
      skillSourceScope(skill.scope) ===
        (scope === "third_party" ? "thirdParty" : "official");
    return (
      scopeMatches &&
      hasCategory(skill, category) &&
      (normalized === "" ||
        skill.name.toLocaleLowerCase().includes(normalized) ||
        skill.description.toLocaleLowerCase().includes(normalized))
    );
  });
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCreateMenuOpen(false);
      setQuery("");
      setScope(inline ? "all" : "official");
      setCategory("all");
    }
    onOpenChange(nextOpen);
  };

  const selectedCategory = CATALOG_CATEGORIES.find((item) => item.value === category) ?? CATALOG_CATEGORIES[0]!;
  const scopeMenu = inline ? (
    <DropdownMenu onOpenChange={(value) => { categoryMenuOpenRef.current = value; }}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={styles.catalogScopeFilter}
          ref={categoryMenuRef}
          aria-label={t("skills.categoryAria")}
        >
          <ListFilter aria-hidden="true" />
          {t(selectedCategory.label)}
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={styles.catalogScopeFilterMenu}>
        <DropdownMenuGroup>
          {CATALOG_CATEGORIES.map(({ value, label }) => (
            <DropdownMenuItem
              key={value}
              onSelect={() => setCategory(value)}
              data-active={category === value || undefined}
            >
              {t(label)}
              {category === value ? <Check aria-hidden="true" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <div className={styles.catalogScope}>
      <Button
        type="button"
        variant="ghost"
        data-active={scope === "official"}
        onClick={() => setScope("official")}
      >
        {t("skills.filterOfficial")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        data-active={scope === "third_party"}
        onClick={() => setScope("third_party")}
      >
        {t("skills.filterThirdParty")}
      </Button>
    </div>
  );

  const catalogBody = (
    <>
      <div
        ref={catalogControlsRef}
        className={cn(styles.catalogControls, inline && styles.catalogInlineControls)}
        data-categories-fit={inline && categoriesFit || undefined}
      >
        <label className={styles.catalogSearch}>
          <Search aria-hidden="true" />
          <Input
            ref={catalogSearchRef}
            value={query}
            type="search"
            aria-label={t("skills.searchPlaceholder")}
            placeholder={t("skills.searchPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {!inline || !categoriesFit ? <div className={styles.catalogToolbar}>
          {scopeMenu}
          {!inline ? (
            <DropdownMenu
              modal={false}
              open={createMenuOpen}
              onOpenChange={setCreateMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  type="button"
                  className={styles.catalogCreate}
                  ref={catalogCreateTriggerRef}
                >
                  {t("skills.create")}
                  <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={(event) =>
                      selectCreateAction(
                        () => onOpenUpload(catalogCreateTriggerRef),
                        event,
                      )
                    }
                    onClick={() =>
                      selectCreateAction(() =>
                        onOpenUpload(catalogCreateTriggerRef),
                      )
                    }
                  >
                    <Upload aria-hidden="true" />
                    {t("skills.uploadSkill")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) =>
                      selectCreateAction(
                        () => onOpenGithub(catalogCreateTriggerRef),
                        event,
                      )
                    }
                    onClick={() =>
                      selectCreateAction(() =>
                        onOpenGithub(catalogCreateTriggerRef),
                      )
                    }
                  >
                    <Image
                      src="/assets/connectors/github.webp"
                      alt=""
                      width={16}
                      height={16}
                    />
                    {t("skills.importGithub")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div> : null}
        {inline ? (
          <>
            {categoriesFit ? (
              <div ref={categoryRowRef} className={styles.catalogCategoryRow} role="group" aria-label={t("skills.categoryAria")}>
                {CATALOG_CATEGORIES.map(({ value, label }) => (
                  <button key={value} type="button" className={styles.catalogCategoryButton} aria-pressed={category === value} onClick={() => setCategory(value)}>
                    {t(label)}
                  </button>
                ))}
              </div>
            ) : null}
            <div ref={categoryMeasureRef} className={styles.catalogCategoryMeasure} aria-hidden="true" inert>
              {CATALOG_CATEGORIES.map(({ value, label }) => (
                <span key={value} className={styles.catalogCategoryButton}>{t(label)}</span>
              ))}
            </div>
          </>
        ) : null}
      </div>
      {errorName ? (
        <Alert variant="destructive" className={styles.catalogFeedback}>
          <AlertDescription>{t("skills.addError")}</AlertDescription>
        </Alert>
      ) : null}
      {catalog.error !== undefined && displayedCatalog !== undefined ? (
        <div className={styles.catalogLoadError} role="alert">
          <p>{t("skills.loadError")}</p>
          <Button type="button" variant="outline" onClick={retry} disabled={catalog.loading}>
            {t("skills.retry")}
          </Button>
        </div>
      ) : null}
      <div
        className={styles.catalogGrid}
        data-testid="skills-catalog-scroll"
        aria-busy={catalogRefreshing || undefined}
      >
        {(displayedCatalog === undefined && catalog.error === undefined) || (catalog.data === undefined && catalog.loading && filtered.length === 0) ? (
          Array.from({ length: 4 }, (_, index) => (
            <Card
              className={styles.catalogCard}
              key={`catalog-loading-${index}`}
              aria-hidden="true"
            >
              <CardContent className={styles.catalogCardContent}>
                <Skeleton className={styles.catalogSkeletonTitle} />
                <Skeleton className={styles.catalogSkeletonDescription} />
                <Skeleton className={styles.catalogSkeletonMeta} />
              </CardContent>
            </Card>
          ))
        ) : catalog.error !== undefined && displayedCatalog === undefined ? (
          <div className={styles.catalogLoadError} role="alert">
            <p>{t("skills.loadError")}</p>
            <Button
              type="button"
              variant="outline"
              onClick={retry}
              disabled={catalog.loading}
              aria-busy={catalog.loading}
            >
              {catalog.loading ? <Spinner aria-hidden="true" /> : null}
              {catalog.loading ? t("skills.loading") : t("skills.retry")}
            </Button>
          </div>
        ) : filtered.length > 0 ? (
          filtered.map((skill) => {
            const stateKey = skillStateKey(skill.scope, skill.name, skill.skill_id);
            const enabledOverride = enabledOverrides.get(stateKey);
            const installedOverride = installedOverrides.get(stateKey);
            const enabled = enabledOverride ?? skill.enabled;
            const installed = installedOverride ?? skill.installed;
            const actionLabel = installed
              ? enabled
                ? t("skills.added")
                : t("skills.enable")
              : t("skills.add");
            const pending = busy === stateKey;
            return (
              <Card
                className={styles.catalogCard}
                key={stateKey}
              >
                <CardContent className={styles.catalogCardContent}>
                  <div className={styles.catalogCardRow}>
                    <div className={styles.catalogCover} aria-hidden="true">
                      <SkillCoverMedia
                        src={skill.cover_image}
                        identity={skillResourceKey("hub/skills/cover", client)}
                        sizes="112px"
                      />
                    </div>
                    <button
                      type="button"
                      className={styles.catalogCardCopy}
                      aria-label={`${t("skills.packageViewDetails")} ${skill.name}`}
                      disabled={catalog.data === undefined}
                      onClick={(event) => onOpenDetail(skill, event.currentTarget)}
                    >
                      <span className={styles.catalogCardName}>{skill.name}</span>
                      <p className={styles.catalogCardDescription}>
                        {skill.description}
                      </p>
                      {skill.updated_at ? (
                        <p className={styles.installedCardMeta}>
                          <ShieldCheck aria-hidden="true" />
                          {t("skills.updatedAt", {
                            date: formatSkillDate(skill.updated_at),
                          })}
                        </p>
                      ) : null}
                    </button>
                    <div className={styles.catalogCardAction}>
                      <Button
                        variant={installed && enabled ? "outline" : "default"}
                        aria-label={`${actionLabel} ${skill.name}`}
                        data-installed={installed || undefined}
                        disabled={catalog.data === undefined || busy !== null || (installed && enabled)}
                        aria-busy={pending}
                        type="button"
                        onClick={() =>
                          onSetEnabled(toSkillActionCard(skill), true, stateKey)
                        }
                      >
                        {pending ? <Spinner aria-hidden="true" /> : null}
                        {!pending && enabled ? <Check aria-hidden="true" /> : null}
                        {!pending && !enabled ? <Plus aria-hidden="true" /> : null}
                        {actionLabel}
                      </Button>
                      {errorName === stateKey ? (
                        <Alert
                          variant="destructive"
                          className={styles.catalogCardError}
                        >
                          <AlertDescription>
                            {t("skills.addError")}
                          </AlertDescription>
                        </Alert>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Empty
            className={styles.catalogEmpty}
            data-testid="skills-catalog-empty"
          >
            <EmptyHeader>
              <EmptyTitle>
                {normalized === "" ? t("skills.empty") : t("skills.noMatch")}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      {catalog.data !== undefined && displayedCatalog?.next_cursor ? (
        <div ref={catalogMoreRef} className={styles.catalogMore}>
          {loadingMore ? <Spinner aria-hidden="true" /> : null}
          {loadMoreFailed ? (
            <Button type="button" variant="outline" onClick={() => void loadMore()}>
              {t("skills.retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  if (inline) {
    return (
      <section
        className={styles.catalogInline}
        role="region"
        aria-label={t("skills.browse")}
      >
        {catalogBody}
      </section>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(styles.catalogDialog, "p-0 box-border")}
        closeLabel={t("skills.closeCatalog")}
        onOpenAutoFocus={focusCatalogSearch}
        onCloseAutoFocus={onCloseAutoFocus}
        onPointerDownOutside={(event) => {
          // The catalog's Create menu is portalled. Keep the catalog mounted
          // while the user chooses Upload or GitHub from that menu.
          if (
            (event.target instanceof Element &&
              event.target.closest('[data-slot="dropdown-menu-content"]')) ||
            document.querySelector(
              '[data-slot="dropdown-menu-content"][data-state="open"]',
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <DialogTitle className={styles.catalogTitle}>
          {t("skills.title")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("skills.subtitle")}
        </DialogDescription>
        {catalogBody}
      </DialogContent>
    </Dialog>
  );
}
