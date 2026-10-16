"use client";

import type { GithubImported } from "./personal-skill-github-import-flow";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createSkillInstallationClient, type HubClient } from "@/hub/client";
import { Button } from "@/components/ui/button";
import { createSkillInstallationUpdateFlow } from "./skill-installation-update-flow";
import { SkillInstallationUpdateDialog } from "./skill-installation-update-dialog";
import type { SkillCard, SkillCatalogCard } from "@/hub/schemas";
import { isRequiredLockError } from "@/hub/rules";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { invalidate, useAsyncAction, useResource } from "@/lib/query";
import { subscribeResource } from "@/lib/query/resource-store";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { useOverlayClose } from "@/ui/shell/use-overlay-close";

import styles from "./skills-panel.module.css";
import { toInstalledCatalogCard, toSkillActionCard } from "./skills-card-model";
import { GithubImportDialog } from "./github-import-dialog";
import { ManusSkillDetailDialog } from "./manus-skill-detail-dialog";
import { type SkillsPool, skillStateKey } from "./skills-pool-model";
import type { SkillsScopeFilter } from "./skills-scope";
import { SkillsPoolTab } from "./skills-pool-tab";
import {
  SKILLS_CATALOG_KEY,
  SKILLS_KEY,
  skillResourceKey,
} from "./skills-resource-cache";
import { SkillUploadDialog } from "./skill-upload-dialog";
import { SKILL_CATALOG_RESOURCE_KEY } from "./manus-skill-client";

function isNestedOverlayPointerEvent(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-slot="dialog-content"]')) return true;
  if (target.closest('[data-slot="dropdown-menu-content"]')) return true;
  if (
    document.querySelector(
      '[data-slot="dropdown-menu-content"][data-state="open"]',
    )
  )
    return true;
  return (
    target.closest('[data-slot="dialog-overlay"]') !== null &&
    document.querySelectorAll('[data-slot="dialog-content"][data-state="open"]')
      .length > 1
  );
}

/**
 * Start the installed-Skills read as soon as an admitted app shell is ready.
 * The Settings tab later subscribes to this exact cache entry, preserving a
 * stable toolbar and avoiding a cold loading interchange during a tab click.
 */
export function warmSkillsPool(client: HubClient): () => void {
  const key = skillResourceKey(SKILLS_KEY, client);
  return subscribeResource(
    key,
    async (): Promise<SkillsPool> => {
      const [skills, quota] = await Promise.all([
        client.listSkillPool(),
        client.skillQuota().catch(() => null),
      ]);
      return { skills, quota };
    },
    () => undefined,
    false,
  );
}

type SkillsPanelProps = {
  readBoundary: ProjectReadBoundary;
  client: HubClient;
  preview?: boolean;
  brandName?: string;
  onClose: () => void;
  pinned: readonly string[];
  onTogglePin: (name: string) => void;
  onTrySkill?: (skill: SkillCard, prompt?: string) => boolean;
};

export function SkillsPanel({
  readBoundary,
  client,
  preview = false,
  brandName,
  onClose,
  pinned,
  onTogglePin,
  onTrySkill,
}: SkillsPanelProps) {
  const t = useT();
  const { open, requestClose, onCloseAutoFocus } = useOverlayClose(onClose);
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) requestClose();
      }}
    >
      <DialogContent
        className={cn(styles.panel, "p-0 box-border")}
        data-testid="skills-panel"
        closeLabel={t("skills.close")}
        closeButtonTestId="skills-close"
        onCloseAutoFocus={onCloseAutoFocus}
        onPointerDownOutside={(event) => {
          // Catalog/GitHub dialogs are portalled siblings of this content.
          // Radix otherwise reports their clicks as outside the parent and a
          // confirm/close action unexpectedly tears down the whole Settings
          // surface instead of returning to the skill list.
          if (isNestedOverlayPointerEvent(event)) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          requestClose();
        }}
      >
        <DialogTitle className="sr-only">{t("skills.title")}</DialogTitle>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>{t("skills.title")}</h2>
            <p className={styles.subtitle}>{t("skills.subtitle")}</p>
          </div>
        </header>
        <SkillsContent
          readBoundary={readBoundary}
          client={client}
          preview={preview}
          {...(brandName === undefined ? {} : { brandName })}
          pinned={pinned}
          onTogglePin={onTogglePin}
          {...(onTrySkill === undefined ? {} : { onTrySkill })}
        />
      </DialogContent>
    </Dialog>
  );
}

type SkillsContentProps = {
  readBoundary: ProjectReadBoundary;
  client: HubClient;
  preview?: boolean;
  brandName?: string;
  pinned: readonly string[];
  onTogglePin: (name: string) => void;
  onTrySkill?: (skill: SkillCard, prompt?: string) => boolean;
  embedded?: boolean;
  /** Opens the shared direct-chat Composer with the skill-creator prompt. */
  onCreateWithAi?: (prompt?: string) => void;
  /** Controlled Settings catalog route. It shares state with the Settings
   * heading so compact and desktop layouts cannot drift. */
  embeddedCatalogOpen?: boolean;
  onEmbeddedCatalogOpenChange?: (open: boolean) => void;
  catalogTriggerRef?: RefObject<HTMLButtonElement | null>;
  initialScope?: SkillsScopeFilter;
};

type SkillDetailSelection = Readonly<{
  skill: SkillCatalogCard;
  installationState: Readonly<{ installed: boolean; enabled: boolean }>;
}>;

function detailSelectionFor(
  skill: SkillCard | SkillCatalogCard,
): SkillDetailSelection | null {
  if ("installed" in skill) {
    return {
      skill,
      installationState: { installed: skill.installed, enabled: skill.enabled },
    };
  }
  if (skill.skill_id === undefined || skill.revision_skill_id === undefined) {
    return null;
  }
  return {
    skill: toInstalledCatalogCard(skill),
    installationState: { installed: true, enabled: skill.enabled === true },
  };
}

export function SkillsContent(props: SkillsContentProps) {
  const { admitted, subject, generation } = props.readBoundary;
  const t = useT();
  // Lives outside the generation-keyed facts subtree. Never keep a private ACK
  // or current installation here; the flow retires those on every recheck.
  const updateFlow = useMemo(() => createSkillInstallationUpdateFlow({ client: createSkillInstallationClient(), boundary: { admitted: false, subject, generation: 0 } }), [subject]);
  const updateState = useSyncExternalStore(updateFlow.subscribe, updateFlow.getSnapshot, updateFlow.getSnapshot);
  const [updateOpen, setUpdateOpen] = useState<{ subject: string | null; open: boolean }>({ subject: null, open: false });
  const updateReturnFocus = useRef<HTMLElement | null>(null);
  const updateFallbackFocus = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => updateFlow.retain({ admitted, subject, generation }), [updateFlow, admitted, subject, generation]);
  const updateCurrent = props.readBoundary.admitted && subject !== null && updateFlow.matches(props.readBoundary);
  useEffect(() => {
    if (!updateCurrent || !updateState.acknowledged) return;
    invalidate(skillResourceKey(SKILLS_KEY, props.client));
    invalidate(skillResourceKey(SKILLS_CATALOG_KEY, props.client));
    invalidate(SKILL_CATALOG_RESOURCE_KEY);
  }, [updateCurrent, updateState.acknowledged, props.client]);
  const updateLocked = () => updateFlow.getSnapshot().kind !== "idle";
  const openUpdate = (skill: SkillCard, source: HTMLElement) => {
    if (!updateCurrent || !updateFlow.select(skill, props.readBoundary)) return false;
    updateReturnFocus.current = source;
    setUpdateOpen({ subject, open: true });
    void updateFlow.readCurrent(props.readBoundary);
    return true;
  };
  return <>
    {updateCurrent && updateState.kind !== "idle" ? <div className={styles.updateNotice} role="status"><span>{t(updateState.acknowledged ? "skills.update.confirmedNotice" : "skills.update.pendingNotice")}</span><Button type="button" variant="outline" onClick={event => { updateReturnFocus.current = event.currentTarget; setUpdateOpen({ subject, open: true }); void updateFlow.readCurrent(props.readBoundary); }}>{t("skills.update.resume")}</Button></div> : null}
    <InstalledSkillsContent key={skillResourceKey(SKILLS_KEY, props.client)} {...props} onUpdateSkill={openUpdate} updateFallbackFocus={updateFallbackFocus} updateLocked={updateLocked} updatePending={updateState.kind !== "idle"} />
    <SkillInstallationUpdateDialog flow={updateFlow} boundary={props.readBoundary} state={updateState} admitted={updateCurrent} open={updateOpen.subject === subject && updateOpen.open} onOpenChange={open => { if (updateFlow.matches(props.readBoundary)) setUpdateOpen({ subject, open }); }} returnFocusRef={updateReturnFocus} fallbackFocusRef={updateFallbackFocus} />
  </>;
}

/**
 * The same installed-skill surface is used in preview and live sessions. The
 * client is the only data seam, so the live Settings page never falls back to
 * the older publisher-management layout with a different information model.
 */
function InstalledSkillsContent({
  readBoundary,
  client,
  preview = false,
  brandName,
  pinned,
  onTogglePin,
  onTrySkill,
  embedded = false,
  onCreateWithAi,
  embeddedCatalogOpen,
  onEmbeddedCatalogOpenChange,
  catalogTriggerRef,
  initialScope,
  onUpdateSkill,
  updateFallbackFocus,
  updateLocked,
  updatePending,
}: SkillsContentProps & { onUpdateSkill: (skill: SkillCard, source: HTMLElement) => boolean; updateFallbackFocus: RefObject<HTMLInputElement | null>; updateLocked: () => boolean; updatePending: boolean }) {
  const [githubOpen, setGithubOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const githubReturnFocusRef = useRef<HTMLElement | null>(null);
  const uploadReturnFocusRef = useRef<HTMLElement | null>(null);
  const detailReturnFocusRef = useRef<HTMLElement | null>(null);
  const [detailSelection, setDetailSelection] =
    useState<SkillDetailSelection | null>(null);
  const [githubImportNotice, setGithubImportNotice] =
    useState<GithubImported | null>(null);
  const [recentSkillKey, setRecentSkillKey] = useState<string | null>(null);
  const poolCreateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const invalidateSkills = useCallback(() => {
    // An imported/uploaded skill can also change the catalog's installed
    // projection. Refresh both surfaces so reopening Browse never shows a
    // stale Add action after the pool has already been updated.
    invalidate(skillResourceKey(SKILLS_KEY, client));
    invalidate(skillResourceKey(SKILLS_CATALOG_KEY, client));
  }, [client]);
  const handleGithubImported = useCallback(
    (result: GithubImported) => {
      invalidateSkills();
      // Keep the just-imported skill discoverable after the dialog closes. The
      // list may contain many cards and the imported personal card is otherwise
      // appended below the fold, which makes a successful import look like a
      // no-op to the user.
      setRecentSkillKey(result.skill_id);
      setGithubImportNotice(result);
    },
    [invalidateSkills],
  );
  // 池 + 配额合并读经查询层（模块缓存/去重/失活）：池只含「有效可用」项，配额缺失回退 null。
  const pool = useResource<SkillsPool>(
    skillResourceKey(SKILLS_KEY, client),
    useCallback(async (): Promise<SkillsPool> => {
      const [skills, quota] = await Promise.all([
        client.listSkillPool(),
        client.skillQuota().catch(() => null),
      ]);
      return { skills, quota };
    }, [client]),
  );
  // required 锁定集合：某技能 disable 撞 409 hub.skill_required 后记入，UI 据此锁 toggle。
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [enabledOverrides, setEnabledOverrides] = useState<
    Map<string, boolean>
  >(() => new Map());
  const [installedOverrides, setInstalledOverrides] = useState<
    Map<string, boolean>
  >(() => new Map());
  const mutationBusyRef = useRef(false);
  const mutationAttemptRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    // React development Strict Mode performs a mount/cleanup/remount probe.
    // Restore the liveness gate on the committed mount so a completed owner
    // mutation clears its pending UI state instead of leaving the toggle locked.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      mutationAttemptRef.current += 1;
    };
  }, []);

  const enabledAction = useAsyncAction(
    async ({ skill, enabled }: { skill: SkillCard; enabled: boolean }) => {
      if (skill.installation_id !== undefined) {
        await client.setSkillEnabled(skill.installation_id, enabled);
        return;
      }
      if (
        enabled &&
        skill.source_ref !== undefined &&
        client.installSkill !== undefined
      ) {
        await client.installSkill(skill.source_ref);
        return;
      }
      throw new Error("skill installation identity is unavailable");
    },
  );
  const onSetEnabled = useCallback(
    async (
      skill: SkillCard,
      enabled: boolean,
      stateKey = skillStateKey(skill.scope, skill.name, skill.skill_id),
    ) => {
      // One mutation owns the shared hub action slot. State is for rendering;
      // the ref closes the same-frame double-click window before React commits
      // the busy state.
      if (mutationBusyRef.current || updateLocked()) return;
      mutationBusyRef.current = true;
      const attempt = ++mutationAttemptRef.current;
      // 池内项恒为「已启用」：唯一动作是停用（停用后离池）。required 撞 409 → 锁定回滚。
      setBusy(stateKey);
      setDisableError(null);
      const outcome = await enabledAction.run({ skill, enabled });
      if (!mountedRef.current || attempt !== mutationAttemptRef.current) return;
      setBusy(null);
      if (outcome.ok) {
        setDetailSelection(current => {
          if (!current || current.skill.skill_id !== skill.skill_id || current.skill.revision_skill_id !== skill.revision_skill_id) return current;
          const source = skill.installation_id === undefined ? skill.source_ref : skill.installed_source_ref;
          const next = { ...current.skill, enabled, installed: enabled || current.installationState.installed };
          delete next.installed_source_ref;
          if (source !== undefined) next.installed_source_ref = source;
          return { skill: next, installationState: { installed: next.installed, enabled } };
        });
        setEnabledOverrides((current) =>
          new Map(current).set(stateKey, enabled),
        );
        if (enabled) {
          setInstalledOverrides((current) =>
            new Map(current).set(stateKey, true),
          );
        }
        invalidate(skillResourceKey(SKILLS_KEY, client)); // 成功→失活重取池（离池 + 配额回收）。
        invalidate(skillResourceKey(SKILLS_CATALOG_KEY, client));
      } else if (!enabled && isRequiredLockError(outcome.error)) {
        setLocked((prev) => new Set(prev).add(stateKey));
      } else {
        setDisableError(stateKey);
      }
      mutationBusyRef.current = false;
    },
    [client, enabledAction, updateLocked],
  );

  return (
    <>
      <div className={cn(styles.tabs, embedded && styles.embeddedTabs)}>
        <div
          className={cn(styles.body, embedded && styles.embeddedBody)}
          data-embedded={embedded || undefined}
        >
          <SkillsPoolTab
            preview={preview}
            searchInputRef={updateFallbackFocus}
            pool={pool.data ?? null}
            loading={pool.loading}
            failed={pool.error !== undefined && pool.data === undefined}
            refreshFailed={pool.error !== undefined && pool.data !== undefined}
            pinned={pinned}
            locked={locked}
            busy={updatePending ? "installation-update" : busy}
            onUpdateSkill={(skill, source) => {
              if (mutationBusyRef.current || !onUpdateSkill(skill, source)) return;
              setEnabledOverrides(new Map()); setInstalledOverrides(new Map()); setDetailSelection(null);
            }}
            expanded={expanded}
            client={client}
            onRetry={pool.refetch}
            onDisable={(skill, stateKey) =>
              onSetEnabled(skill, false, stateKey)
            }
            onSetEnabled={onSetEnabled}
            enabledOverrides={enabledOverrides}
            installedOverrides={installedOverrides}
            onTogglePin={onTogglePin}
            disableError={disableError}
            onToggleExpand={(stateKey) =>
              setExpanded((prev) => (prev === stateKey ? null : stateKey))
            }
            embedded={embedded}
            {...(brandName === undefined ? {} : { brandName })}
            onOpenUpload={(returnFocusRef) => {
              uploadReturnFocusRef.current =
                returnFocusRef?.current ?? poolCreateTriggerRef.current;
              setUploadOpen(true);
            }}
            createTriggerRef={poolCreateTriggerRef}
            onOpenGithub={(returnFocusRef) => {
              githubReturnFocusRef.current =
                returnFocusRef?.current ?? poolCreateTriggerRef.current;
              setGithubOpen(true);
            }}
            githubImportNotice={githubImportNotice}
            recentSkillKey={recentSkillKey}
            onDismissGithubImportNotice={() => setGithubImportNotice(null)}
            {...(onCreateWithAi === undefined ? {} : { onCreateWithAi })}
            onOpenDetail={(skill, source) => {
              detailReturnFocusRef.current = source;
              setDetailSelection(detailSelectionFor(skill));
            }}
            {...(embeddedCatalogOpen === undefined
              ? {}
              : { embeddedCatalogOpen })}
            {...(onEmbeddedCatalogOpenChange === undefined
              ? {}
              : { onEmbeddedCatalogOpenChange })}
            {...(catalogTriggerRef === undefined ? {} : { catalogTriggerRef })}
            {...(initialScope === undefined ? {} : { initialScope })}
          />
        </div>
      </div>
      <GithubImportDialog
        readBoundary={readBoundary}
        open={githubOpen}
        onOpenChange={setGithubOpen}
        returnFocusRef={githubReturnFocusRef}
        onImported={handleGithubImported}
      />
      <SkillUploadDialog
        readBoundary={readBoundary}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        returnFocusRef={uploadReturnFocusRef}
        onPublished={invalidateSkills}
      />
      {detailSelection !== null ? (
        <ManusSkillDetailDialog
          preview={preview}
          readBoundary={readBoundary}
          skill={detailSelection.skill}
          publisherLabel={brandName ?? "Kokoro"}
          categoryLabels={detailSelection.skill.categories ?? []}
          open
          installationState={detailSelection.installationState}
          onOpenChange={(open) => {
            if (!open) setDetailSelection(null);
          }}
          returnFocusRef={detailReturnFocusRef}
          onAdd={(skill) =>
            void onSetEnabled(
              toSkillActionCard(skill),
              true,
              skillStateKey(skill.scope, skill.name, skill.skill_id),
            )
          }
          onTry={(prompt) => {
            const detailSkill = toSkillActionCard(detailSelection.skill);
            if (onTrySkill?.(detailSkill, prompt)) { setDetailSelection(null); return true; }
            if (preview && !onTrySkill) { if (!pinned.includes(detailSkill.name)) onTogglePin(detailSkill.name); setDetailSelection(null); return true; }
            return false;
          }}
        />
      ) : null}
    </>
  );
}
