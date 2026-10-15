import Image from "next/image";
import { useCallback, useRef, useState, type RefObject } from "react";
import {
  Check,
  ChevronDown,
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
import type { HubClient } from "@/hub/client";
import type { SkillCard, SkillCatalog } from "@/hub/schemas";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { useResource } from "@/lib/query";
import { formatSkillDate } from "./skills-format";
import { toSkillActionCard } from "./skills-card-model";
import { SKILLS_CATALOG_KEY, skillResourceKey } from "./skills-resource-cache";
import styles from "./skills-panel.module.css";

function skillScope(scope: string): "official" | "thirdParty" | "personal" {
  if (scope === "official") return "official";
  if (scope === "third_party" || scope === "third-party") return "thirdParty";
  return "personal";
}

function skillStateKey(scope: string, name: string): string {
  return `${scope}/${name}`;
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  client: HubClient;
  enabledOverrides: ReadonlyMap<string, boolean>;
  installedOverrides: ReadonlyMap<string, boolean>;
  busy: string | null;
  errorName: string | null;
  onOpenUpload: (returnFocusRef?: RefObject<HTMLElement | null>) => void;
  onOpenGithub: (returnFocusRef?: RefObject<HTMLElement | null>) => void;
  onSetEnabled: (skill: SkillCard, enabled: boolean, stateKey?: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"official" | "third_party">("official");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createActionHandledRef = useRef(false);
  const catalogSearchRef = useRef<HTMLInputElement | null>(null);
  const catalogCreateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const catalogKey = `${SKILLS_CATALOG_KEY}/${scope}/${query.trim().toLocaleLowerCase()}`;
  const catalog = useResource<SkillCatalog>(
    skillResourceKey(
      SKILLS_CATALOG_KEY,
      client,
      catalogKey.slice(`${SKILLS_CATALOG_KEY}/`.length),
    ),
    useCallback(async () => {
      // The catalog is cursor-paginated by Hub. The dialog owns one stable
      // scroll surface, so hydrate all bounded pages into that surface rather
      // than making the user discover a second invisible pagination control.
      // Stop on a repeated cursor defensively: a malformed upstream page must
      // never spin the browser forever.
      const pages: SkillCatalog[] = [];
      let cursor: string | undefined;
      const seenCursors = new Set<string>();
      for (let page = 0; ; page += 1) {
        const current = await client.listSkillCatalog(
          cursor === undefined ? { scope, query } : { scope, query, cursor },
        );
        pages.push(current);
        const next = current.next_cursor ?? null;
        if (next === null || seenCursors.has(next)) break;
        // A cursor loop is already guarded above. Keep a finite upper bound
        // only as a failed-request guard, rather than silently rendering a
        // partial catalog after an arbitrary twentieth page. A server that
        // legitimately exceeds this fixture-safe bound should surface the
        // normal catalog error and be fixed at the transport boundary.
        if (page >= 99) {
          throw new Error(
            "skill catalog pagination exceeded the supported page limit",
          );
        }
        seenCursors.add(next);
        cursor = next;
      }
      const skillsByKey = new Map<string, SkillCatalog["skills"][number]>();
      for (const page of pages) {
        for (const skill of page.skills) {
          skillsByKey.set(`${skill.scope}/${skill.name}`, skill);
        }
      }
      return { skills: [...skillsByKey.values()], next_cursor: null };
    }, [client, query, scope]),
  );
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
  const skills = catalog.data?.skills ?? [];
  const filtered = skills.filter((skill) => {
    const scopeMatches =
      skillScope(skill.scope) ===
      (scope === "third_party" ? "thirdParty" : "official");
    return (
      scopeMatches &&
      (normalized === "" ||
        skill.name.toLocaleLowerCase().includes(normalized) ||
        skill.description.toLocaleLowerCase().includes(normalized))
    );
  });
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCreateMenuOpen(false);
      setQuery("");
      setScope("official");
    }
    onOpenChange(nextOpen);
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(styles.catalogDialog, "p-0 box-border")}
        closeLabel={t("skills.closeCatalog")}
        onOpenAutoFocus={focusCatalogSearch}
        onCloseAutoFocus={onCloseAutoFocus}
        onPointerDownOutside={(event) => {
          // The catalog's Create menu is also portalled. Keep the catalog
          // mounted while the user chooses Upload or GitHub from that menu.
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
        <div className={styles.catalogToolbar}>
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
        </div>
        {errorName ? (
          <Alert variant="destructive" className={styles.catalogFeedback}>
            <AlertDescription>{t("skills.addError")}</AlertDescription>
          </Alert>
        ) : null}
        <div className={styles.catalogGrid} data-testid="skills-catalog-scroll">
          {catalog.data === undefined && catalog.error === undefined ? (
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
          ) : catalog.error !== undefined && catalog.data === undefined ? (
            <div className={styles.catalogLoadError} role="alert">
              <p>{t("skills.loadError")}</p>
              <Button
                type="button"
                variant="outline"
                onClick={catalog.refetch}
                disabled={catalog.loading}
                aria-busy={catalog.loading}
              >
                {catalog.loading ? <Spinner aria-hidden="true" /> : null}
                {catalog.loading ? t("skills.loading") : t("skills.retry")}
              </Button>
            </div>
          ) : filtered.length > 0 ? (
            filtered.map((skill) => {
              const stateKey = skillStateKey(skill.scope, skill.name);
              // The scope/name pair is the view identity. Do not fall back to
              // a bare name: an imported personal skill may share a name with
              // an official card and must not inherit its toggle state.
              const enabledOverride = enabledOverrides.get(stateKey);
              const installedOverride = installedOverrides.get(stateKey);
              // `installed` and `enabled` are different projections. A local
              // false override means the user disabled the skill; it must not
              // permanently turn the catalog action into a disabled Added
              // button.
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
                  key={`${skill.scope}/${skill.name}`}
                >
                  <CardContent className={styles.catalogCardContent}>
                    <div className={styles.catalogCardHead}>
                      <p>{skill.name}</p>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={`${actionLabel} ${skill.name}`}
                        data-installed={installed || undefined}
                        disabled={busy !== null || (installed && enabled)}
                        aria-busy={pending}
                        type="button"
                        onClick={() =>
                          onSetEnabled(toSkillActionCard(skill), true, stateKey)
                        }
                      >
                        {pending ? (
                          <Spinner aria-hidden="true" />
                        ) : enabled ? (
                          <Check aria-hidden="true" />
                        ) : (
                          <Plus aria-hidden="true" />
                        )}
                      </Button>
                    </div>
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
                <EmptyTitle>{t("skills.noMatch")}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
