import type { GithubImported } from "./personal-skill-github-import-flow";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  ChevronDown,
  CircleDot,
  Compass,
  Plus,
  Search,
  SquarePen,
  Upload,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { HubClient } from "@/hub/client";
import type { SkillCard, SkillCatalogCard } from "@/hub/schemas";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { SkillCatalogDialog, type CatalogDetailProjection } from "./skills-catalog-dialog";
import { formatBytes } from "./skills-format";
import { InstalledSkillCard } from "./skills-installed-card";
import { SkillRevisions } from "./skill-revisions";
import { type SkillsPool, skillStateKey, skillSourceScope } from "./skills-pool-model";
import type { SkillsScopeFilter } from "./skills-scope";
import styles from "./skills-panel.module.css";

const OFFICIAL_SCOPE = "official";

type ScopeFilter = SkillsScopeFilter;

type SkillCreateMenuItemsProps = {
  includeBrowse: boolean;
  brandName?: string;
  onBrowse: (event: Event) => void;
  onCreateWithAi?: (event: Event) => void;
  onRecordSkill?: (event: Event) => void;
  onUpload: (event: Event) => void;
  onImportGithub: (event: Event) => void;
};

/** Reused action list keeps the toolbar and personal empty state on one menu contract. */
function SkillCreateMenuItems({
  includeBrowse,
  brandName,
  onBrowse,
  onCreateWithAi,
  onRecordSkill,
  onUpload,
  onImportGithub,
}: SkillCreateMenuItemsProps) {
  const t = useT();
  return (
    <DropdownMenuGroup>
      {includeBrowse ? <DropdownMenuItem onSelect={onBrowse}>
        <Compass aria-hidden="true" />
        {t("skills.browse")}
      </DropdownMenuItem> : null}
      {onCreateWithAi ? <DropdownMenuItem onSelect={onCreateWithAi}>
        <SquarePen aria-hidden="true" />
        {brandName ? t("skills.createWithBrand", { brand: brandName }) : t("skills.createWithAi")}
      </DropdownMenuItem> : null}
      {onRecordSkill ? <DropdownMenuItem onSelect={onRecordSkill}>
        <CircleDot aria-hidden="true" />
        {t("skills.recordSkill")}
      </DropdownMenuItem> : null}
      <DropdownMenuItem onSelect={onUpload}>
        <Upload aria-hidden="true" />
        {t("skills.uploadSkill")}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onImportGithub}>
        <Image src="/assets/connectors/github.webp" alt="" width={16} height={16} />
        {t("skills.importGithub")}
      </DropdownMenuItem>
    </DropdownMenuGroup>
  );
}

export function SkillsPoolTab({
  pool,
  loading,
  failed,
  refreshFailed,
  pinned,
  locked,
  busy,
  expanded,
  client,
  onRetry,
  onDisable,
  onSetEnabled,
  enabledOverrides,
  installedOverrides,
  onTogglePin,
  disableError,
  onToggleExpand,
  embedded = false,
  onOpenUpload,
  onOpenGithub,
  createTriggerRef,
  githubImportNotice,
  recentSkillKey,
  onDismissGithubImportNotice,
  onCreateWithAi,
  brandName,
  onOpenDetail,
  onUpdateSkill,
  embeddedCatalogOpen,
  onEmbeddedCatalogOpenChange,
  catalogTriggerRef: suppliedCatalogTriggerRef,
  searchInputRef,
  selectedScope,
  onScopeChange,
  preview = false,
  selectedDetailKey,
  onDetailProjection,
  detailReturnFocusRef,
}: {
  pool: SkillsPool | null;
  loading: boolean;
  failed: boolean;
  refreshFailed: boolean;
  pinned: readonly string[];
  locked: Set<string>;
  busy: string | null;
  expanded: string | null;
  client: HubClient;
  preview?: boolean;
  selectedDetailKey?: string | null;
  onDetailProjection?: (projection: CatalogDetailProjection) => void;
  detailReturnFocusRef?: RefObject<HTMLElement | null>;
  onRetry: () => void;
  onDisable: (skill: SkillCard, stateKey: string) => void;
  onSetEnabled: (skill: SkillCard, enabled: boolean, stateKey?: string) => void;
  enabledOverrides: ReadonlyMap<string, boolean>;
  installedOverrides: ReadonlyMap<string, boolean>;
  onTogglePin: (name: string) => void;
  disableError: string | null;
  onToggleExpand: (stateKey: string) => void;
  embedded?: boolean;
  brandName?: string;
  onOpenUpload: (returnFocusRef?: RefObject<HTMLElement | null>) => void;
  onOpenGithub: (returnFocusRef?: RefObject<HTMLElement | null>) => void;
  createTriggerRef: RefObject<HTMLButtonElement | null>;
  githubImportNotice: GithubImported | null;
  recentSkillKey: string | null;
  onDismissGithubImportNotice: () => void;
  onCreateWithAi?: (prompt?: string) => void;
  onOpenDetail: (skill: SkillCard | SkillCatalogCard, source: HTMLElement) => void;
  onUpdateSkill: (skill: SkillCard, source: HTMLElement) => void;
  /** Settings owns the embedded catalog route so its heading and content
   * transition from one state source. Standalone Skills keeps local state. */
  embeddedCatalogOpen?: boolean;
  onEmbeddedCatalogOpenChange?: (open: boolean) => void;
  /** The Settings panel owns this ref so its shared back header restores focus. */
  catalogTriggerRef?: RefObject<HTMLButtonElement | null>;
  /** Stable keyboard return target when a completed update removes its trigger. */
  searchInputRef?: RefObject<HTMLInputElement | null>;
  /** Settings controls its shareable scope; standalone pools own local scope. */
  selectedScope?: SkillsScopeFilter;
  onScopeChange?: (scope: SkillsScopeFilter) => void;
}) {
  const t = useT();
  // 视图态:搜索词 / 范围筛选 / 停用二次确认(停用是破坏性——离池,先确认)。
  const [query, setQuery] = useState("");
  const [localScope, setLocalScope] = useState<ScopeFilter>("all");
  const scope = selectedScope ?? localScope;
  const setScope = onScopeChange ?? setLocalScope;
  const [confirming, setConfirming] = useState<string | null>(null);
  const [localCatalogOpen, setLocalCatalogOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createActionHandledRef = useRef(false);
  const catalogHandoffRef = useRef<(() => void) | null>(null);
  const [catalogHandoffVersion, setCatalogHandoffVersion] = useState(0);
  const disableTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>(
    {},
  );
  const confirmDisableRefs = useRef<Record<string, HTMLButtonElement | null>>(
    {},
  );
  const localSearchRef = useRef<HTMLInputElement | null>(null);
  const searchRef = searchInputRef ?? localSearchRef;
  const localCatalogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const catalogTriggerRef = suppliedCatalogTriggerRef ?? localCatalogTriggerRef;
  const [commandClient, setCommandClient] = useState(client);
  if (commandClient !== client) {
    setCommandClient(client);
    setConfirming(null);
    setCreateMenuOpen(false);
  }
  useLayoutEffect(() => {
    return () => { catalogHandoffRef.current = null; };
  }, [client]);

  const selectCreateAction = (action: () => void, event?: Event) => {
    // Radix closes a controlled menu after onSelect. Run the destination
    // transition in the same event so keyboard and click users get immediate
    // feedback, while the controlled `open=false` prevents a stale menu from
    // surviving beside the next surface.
    event?.preventDefault();
    if (createActionHandledRef.current) return;
    createActionHandledRef.current = true;
    setCreateMenuOpen(false);
    action();
    queueMicrotask(() => {
      createActionHandledRef.current = false;
    });
  };

  const restoreCatalogTriggerFocus = (event: Event) => {
    if (catalogTriggerRef.current === null) return;
    event.preventDefault();
    window.requestAnimationFrame(() => catalogTriggerRef.current?.focus());
  };

  const catalogOpen = embedded ? (embeddedCatalogOpen ?? false) : localCatalogOpen;
  const setCatalogOpen = useCallback((open: boolean) => {
    if (embedded) {
      onEmbeddedCatalogOpenChange?.(open);
      return;
    }
    setLocalCatalogOpen(open);
  }, [embedded, onEmbeddedCatalogOpenChange]);

  const queueCatalogHandoff = useCallback((handoff: () => void) => {
    catalogHandoffRef.current = handoff;
    setCatalogOpen(false);
    setCatalogHandoffVersion((version) => version + 1);
  }, [setCatalogOpen]);

  const finishCatalogHandoff = useCallback((event?: Event) => {
    const handoff = catalogHandoffRef.current;
    if (handoff === null) return false;
    event?.preventDefault();
    catalogHandoffRef.current = null;
    handoff();
    return true;
  }, []);

  useLayoutEffect(() => {
    if (catalogOpen) return;
    // Controlled Radix dialogs normally call onCloseAutoFocus after the
    // portal exits. The committed state is the fallback for environments
    // where Presence skips that callback (notably jsdom under load).
    const frame = window.requestAnimationFrame(() => finishCatalogHandoff());
    return () => window.cancelAnimationFrame(frame);
  }, [catalogOpen, catalogHandoffVersion, finishCatalogHandoff]);

  const handleCatalogCloseAutoFocus = (event: Event) => {
    if (finishCatalogHandoff(event)) return;
    restoreCatalogTriggerFocus(event);
  };

  // The Settings parent owns the embedded route state; the standalone page
  // owns its dialog state locally. Both entry points use this one transition.
  const openCatalog = useCallback(() => {
    setCatalogOpen(true);
  }, [setCatalogOpen]);
  const closeCatalog = useCallback(() => {
    setCatalogOpen(false);
  }, [setCatalogOpen]);

  // The destructive action is replaced inline. Explicitly move focus to the
  // confirmation control so the scroll viewport never becomes the active
  // element during the row re-render.
  useEffect(() => {
    if (confirming === null) return;
    const frame = window.requestAnimationFrame(() => {
      confirmDisableRefs.current[confirming]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [confirming]);

  // Keep the full Settings scaffold mounted while the first owner read is in
  // flight. Returning a standalone loading card made the dialog jump from a
  // blank body to a different layout between tabs. The controls and their
  // eventual list now keep one geometry; only card content reserves space.
  const initialLoad = pool === null && !failed;
  const initialFailure = pool === null && failed;
  const resolvedPool: SkillsPool = pool ?? { skills: [], quota: null };

  const q = query.trim().toLowerCase();
  const filtered = resolvedPool.skills.filter((skill) => {
    if (scope !== "all" && skillSourceScope(skill.scope) !== scope) return false;
    if (
      q !== "" &&
      !(
        skill.name.toLowerCase().includes(q) ||
        (skill.description ?? "").toLowerCase().includes(q)
      )
    ) {
      return false;
    }
    return true;
  });
  // Put the last successful GitHub import first without disturbing the
  // server's stable ordering for every other skill.
  if (recentSkillKey !== null) {
    filtered.sort((left, right) => {
      const leftRecent =
        left.revision_skill_id === recentSkillKey;
      const rightRecent =
        right.revision_skill_id === recentSkillKey;
      return Number(rightRecent) - Number(leftRecent);
    });
  }
  const hasSkills = resolvedPool.skills.length > 0;
  const scopeFilters: ScopeFilter[] = [
    "all",
    "personal",
    "official",
    "thirdParty",
  ];
  const scopeLabel: Record<ScopeFilter, string> = {
    all: t("skills.filterAll"),
    personal: t("skills.filterPersonal"),
    official: t("skills.filterOfficial"),
    thirdParty: t("skills.filterThirdParty"),
  };

  if (embedded && catalogOpen) {
    return (
      <SkillCatalogDialog
        {...(selectedDetailKey === undefined ? {} : { selectedDetailKey })}
        {...(onDetailProjection === undefined ? {} : { onDetailProjection })}
        {...(detailReturnFocusRef === undefined ? {} : { detailReturnFocusRef })}
        preview={preview}
        inline
        open
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          closeCatalog();
          window.requestAnimationFrame(() => catalogTriggerRef.current?.focus());
        }}
        onCloseAutoFocus={handleCatalogCloseAutoFocus}
        client={client}
        enabledOverrides={enabledOverrides}
        installedOverrides={installedOverrides}
        busy={busy}
        errorName={disableError}
        onOpenUpload={() => onOpenUpload(catalogTriggerRef)}
        onOpenGithub={() => onOpenGithub(catalogTriggerRef)}
        onSetEnabled={onSetEnabled}
        onOpenDetail={onOpenDetail}
      />
    );
  }

  return (
    <>
      {!embedded && resolvedPool.quota ? (
        <div className={styles.quota} data-testid="skills-quota">
          <span>
            {t("skills.quotaPackages", {
              used: resolvedPool.quota.package_count,
              max: resolvedPool.quota.max_packages,
            })}
          </span>
          <span>
            {t("skills.quotaBytes", {
              used: formatBytes(resolvedPool.quota.package_bytes),
              max: formatBytes(resolvedPool.quota.max_bytes),
            })}
          </span>
        </div>
      ) : null}

      {githubImportNotice ? (
        <Alert
          className={styles.importNotice}
          data-testid="github-import-notice"
          role="status"
          aria-live="polite"
        >
          <AlertDescription>
            {t("skills.githubImportNotice", { name: githubImportNotice.name })}
            <span className={styles.importNoticeRepository}>
              {githubImportNotice.repository}
            </span>
          </AlertDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={styles.importNoticeDismiss}
            aria-label={t("skills.dismissImportNotice")}
            onClick={onDismissGithubImportNotice}
          >
            <X aria-hidden="true" />
          </Button>
        </Alert>
      ) : null}

      {/* Keep entry points mounted for empty pools too, including standalone. */}
      <div
        className={cn(
          styles.filterBar,
          embedded && styles.embeddedFilterLayout,
        )}
      >
        <label
          className={cn(
            styles.searchField,
            embedded && styles.embeddedSearchField,
          )}
        >
          {embedded ? <Search aria-hidden="true" /> : null}
          <Input
            ref={searchRef}
            type="search"
            className={styles.search}
            value={query}
            placeholder={t("skills.searchPlaceholder")}
            aria-label={t("skills.searchPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className={styles.embeddedSkillActions}>
          <Button
            ref={catalogTriggerRef}
            variant="outline"
            type="button"
            className={styles.embeddedBrowse}
            onClick={openCatalog}
          >
            {t("skills.browse")}
          </Button>
          <DropdownMenu
            modal
            open={createMenuOpen}
            onOpenChange={setCreateMenuOpen}
          >
            <DropdownMenuTrigger asChild>
              <Button
                ref={createTriggerRef}
                variant="outline"
                type="button"
                className={styles.embeddedCreate}
              >
                {embedded ? <Plus aria-hidden="true" /> : null}
                {t("skills.create")}
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className={styles.createMenuContent}
            >
              <SkillCreateMenuItems
                includeBrowse={embedded}
                {...(brandName === undefined ? {} : { brandName })}
                onBrowse={(event) => selectCreateAction(openCatalog, event)}
                {...(onCreateWithAi === undefined ? {} : {
                  onCreateWithAi: (event) => selectCreateAction(onCreateWithAi, event),
                  onRecordSkill: (event) => selectCreateAction(() => onCreateWithAi(t("skills.recordPrompt")), event),
                })}
                onUpload={(event) => selectCreateAction(() => {
                  setCatalogOpen(false);
                  onOpenUpload(createTriggerRef);
                }, event)}
                onImportGithub={(event) => selectCreateAction(() => {
                  setCatalogOpen(false);
                  onOpenGithub(createTriggerRef);
                }, event)}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ToggleGroup
          type="single"
          value={scope}
          onValueChange={(value) => {
            if (value) setScope(value as ScopeFilter);
          }}
          className={cn(styles.filterSeg, embedded && styles.embeddedFilterSeg)}
          variant="outline"
          aria-label={t("skills.filterAria")}
        >
          {scopeFilters.map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className={styles.filterBtn}
            >
              {scopeLabel[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {refreshFailed ? (
        <Alert
          variant="destructive"
          className={styles.refreshFeedback}
          data-testid="skills-refresh-error"
        >
          <AlertDescription>
            <span>{t("skills.refreshError")}</span>
            <Button
              variant="outline"
              type="button"
              disabled={loading}
              aria-busy={loading}
              onClick={onRetry}
            >
              {loading ? <Spinner aria-hidden="true" /> : null}
              {loading ? t("skills.loading") : t("skills.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {initialFailure ? (
        <Alert
          variant="destructive"
          className={styles.refreshFeedback}
          data-testid="skills-load-error"
        >
          <AlertDescription>
            <span>{t("skills.loadError")}</span>
            <Button
              variant="outline"
              type="button"
              disabled={loading}
              aria-busy={loading}
              onClick={onRetry}
            >
              {loading ? <Spinner aria-hidden="true" /> : null}
              {t("skills.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : initialLoad ? (
        <div
          className={styles.loadingState}
          aria-busy="true"
          aria-label={t("skills.title")}
        >
          <Skeleton className={styles.loadingLine} aria-hidden="true" />
          <Skeleton className={styles.loadingLine} aria-hidden="true" />
          <Skeleton className={styles.loadingLineShort} aria-hidden="true" />
        </div>
      ) : !hasSkills ? (
        <Empty
          className={styles.emptyState}
          data-testid="skills-empty"
        >
          <EmptyHeader>
            <EmptyTitle>{t("skills.empty")}</EmptyTitle>
            <EmptyDescription>{t("skills.emptyGuide")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty className={styles.noMatch}>
          <EmptyDescription>{t("skills.noMatch")}</EmptyDescription>
        </Empty>
      ) : (
        <ul className={styles.list}>
          {filtered.map((skill) => {
            const isOfficial = skill.scope === OFFICIAL_SCOPE;
            const isThirdParty = skillSourceScope(skill.scope) === "thirdParty";
            const stateKey = skillStateKey(skill.scope, skill.name, skill.skill_id);
            const isLocked = locked.has(stateKey);
            const isPinned = pinned.includes(skill.name);
            const isConfirming = confirming === stateKey;
            // Keep local mutation state on the owner series: same-name cards
            // in the same scope are still independent installed Skills.
            const isEnabled =
              enabledOverrides.get(stateKey) ?? skill.enabled !== false;
            const detailAvailable =
              skill.source_status !== "deleted" &&
              skill.skill_id !== undefined &&
              skill.revision_skill_id !== undefined;
            if (embedded) {
              return (
                <li key={stateKey}>
                  <InstalledSkillCard
                    skill={skill}
                    enabled={isEnabled}
                    busy={busy !== null}
                    pending={busy === stateKey}
                    locked={isLocked}
                    detailAvailable={detailAvailable}
                    error={
                      disableError === stateKey
                        ? t("skills.disableError")
                        : null
                    }
                    onUpdate={(source) => onUpdateSkill(skill, source)}
                    onEnabledChange={(enabled) =>
                      onSetEnabled(skill, enabled, stateKey)
                    }
                    onOpenDetail={(source) => onOpenDetail(skill, source)}
                  />
                </li>
              );
            }
            return (
              <li key={stateKey}>
                <Collapsible
                  className={styles.itemDisclosure}
                  open={expanded === stateKey}
                  onOpenChange={(open) => {
                    if (open !== (expanded === stateKey)) {
                      onToggleExpand(stateKey);
                    }
                  }}
                >
                  <Card className={styles.item}>
                    <CardContent className={styles.itemContent}>
                      <div className={styles.itemMain}>
                        <div className={styles.itemHead}>
                          <Button
                            variant="ghost"
                            type="button"
                            className={cn(styles.name, styles.detailTrigger)}
                            title={
                              detailAvailable
                                ? skill.name
                                : t("skills.detailUnavailable")
                            }
                            disabled={!detailAvailable}
                            onClick={(event) =>
                              onOpenDetail(skill, event.currentTarget)
                            }
                          >
                            {skill.name}
                          </Button>
                          {skillSourceScope(skill.scope) !== "unknown" ? <Badge
                            variant="outline"
                            className={styles.badge}
                            data-scope={
                              isOfficial
                                ? "official"
                                : isThirdParty
                                  ? "third-party"
                                  : "own"
                            }
                          >
                            {isOfficial
                              ? t("skills.official")
                              : isThirdParty
                                ? t("skills.thirdParty")
                                : t("skills.own")}
                          </Badge> : null}
                          {isLocked ? (
                            <Badge
                              variant="outline"
                              className={styles.badge}
                              data-scope="required"
                              title={t("skills.requiredTip")}
                            >
                              {t("skills.requiredLock")}
                            </Badge>
                          ) : null}
                        </div>
                        <p className={styles.desc}>{skill.description}</p>
                      </div>
                      <div
                        className={cn(
                          styles.itemActions,
                          embedded && styles.embeddedItemActions,
                        )}
                      >
                        {skill.available_update ? <Button type="button" variant="outline" disabled={busy !== null || skill.source_status === "deleted"} onClick={event => onUpdateSkill(skill, event.currentTarget)}>{t("skills.update.available", { revision: skill.available_update.revision })}</Button> : null}
                        <Button
                          variant="outline"
                          type="button"
                          className={styles.pin}
                          data-active={isPinned}
                          aria-pressed={isPinned}
                          aria-label={`${isPinned ? t("skills.unpin") : t("skills.pin")} ${skill.name}`}
                          onClick={() => onTogglePin(skill.name)}
                        >
                          {isPinned ? t("skills.unpin") : t("skills.pin")}
                        </Button>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="outline"
                            type="button"
                            className={styles.ver}
                            aria-label={`${t("skills.revisions")} ${skill.name}`}
                            disabled={skill.source_status === "deleted"}
                          >
                            {t("skills.revisions")}
                          </Button>
                        </CollapsibleTrigger>
                        {/* 停用二次确认:首点入确认态,再点才真停用(破坏性——离池)。 */}
                        {isConfirming ? (
                          <span className={styles.confirmRow}>
                            <Button
                              variant="destructive"
                              type="button"
                              className={styles.confirmYes}
                              ref={(element) => {
                                confirmDisableRefs.current[stateKey] = element;
                              }}
                              aria-label={`${t("skills.confirmDisable")} ${skill.name}`}
                              disabled={busy !== null}
                              aria-busy={busy === stateKey}
                              onClick={() => {
                                setConfirming(null);
                                onDisable(skill, stateKey);
                                window.requestAnimationFrame(() =>
                                  searchRef.current?.focus(),
                                );
                              }}
                            >
                              {busy === stateKey ? (
                                <>
                                  <Spinner aria-hidden="true" />
                                  {t("skills.confirmDisable")}
                                </>
                              ) : (
                                t("skills.confirmDisable")
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              type="button"
                              className={styles.confirmNo}
                              aria-label={`${t("skills.cancel")} ${skill.name}`}
                              onClick={() => {
                                setConfirming(null);
                                window.requestAnimationFrame(() =>
                                  disableTriggerRefs.current[stateKey]?.focus(),
                                );
                              }}
                            >
                              {t("skills.cancel")}
                            </Button>
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            type="button"
                            className={styles.toggle}
                            ref={(element) => {
                              disableTriggerRefs.current[stateKey] = element;
                            }}
                            disabled={isLocked || busy !== null}
                            aria-busy={busy === stateKey}
                            aria-label={`${isLocked ? t("skills.requiredLock") : t("skills.disable")} ${skill.name}`}
                            onClick={() => setConfirming(stateKey)}
                          >
                            {busy === stateKey ? (
                              <Spinner aria-hidden="true" />
                            ) : null}
                            {isLocked
                              ? t("skills.requiredLock")
                              : t("skills.disable")}
                          </Button>
                        )}
                      </div>
                      {disableError === stateKey ? (
                        <Alert
                          variant="destructive"
                          className={styles.itemError}
                        >
                          <AlertDescription>
                            {t("skills.disableError")}
                          </AlertDescription>
                        </Alert>
                      ) : null}
                      {skill.source_status !== "deleted" ? <CollapsibleContent className={styles.revisionContent}>
                        <SkillRevisions
                          client={client}
                          scope={skill.scope}
                          name={skill.name}
                        />
                      </CollapsibleContent> : null}
                    </CardContent>
                  </Card>
                </Collapsible>
              </li>
            );
          })}
        </ul>
      )}
      {!embedded ? <SkillCatalogDialog
        {...(selectedDetailKey === undefined ? {} : { selectedDetailKey })}
        {...(onDetailProjection === undefined ? {} : { onDetailProjection })}
        {...(detailReturnFocusRef === undefined ? {} : { detailReturnFocusRef })}
        preview={preview}
        open={catalogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setCatalogOpen(false);
        }}
        onCloseAutoFocus={handleCatalogCloseAutoFocus}
        client={client}
        enabledOverrides={enabledOverrides}
        installedOverrides={installedOverrides}
        busy={busy}
        errorName={disableError}
        onOpenUpload={() => {
          // The outer Browse trigger is the only stable focus target after the
          // catalog portal unmounts. The catalog's own Create trigger is
          // intentionally not reused because it is about to disconnect.
          const focusRef = catalogTriggerRef;
          queueCatalogHandoff(() => onOpenUpload(focusRef));
        }}
        onOpenGithub={() => {
          const focusRef = catalogTriggerRef;
          queueCatalogHandoff(() => onOpenGithub(focusRef));
        }}
        onSetEnabled={onSetEnabled}
        onOpenDetail={onOpenDetail}
      /> : null}
    </>
  );
}
