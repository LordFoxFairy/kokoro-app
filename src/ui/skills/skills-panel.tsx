"use client";

import type { GithubImported } from "./personal-skill-github-import-flow";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createSkillInstallationClient, type HubClient } from "@/hub/client";
import { Button } from "@/components/ui/button";
import { createSkillInstallationUpdateFlow } from "./skill-installation-update-flow";
import { SkillInstallationUpdateDialog } from "./skill-installation-update-dialog";
import { createSkillInstallationRemoveFlow } from "./skill-installation-remove-flow";
import { SkillInstallationRemoveDialog } from "./skill-installation-remove-dialog";
import type { PersonalInstallation, SkillCard, SkillCatalogCard } from "@/hub/schemas";
import { isRequiredLockError } from "@/hub/rules";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { invalidate, useResource } from "@/lib/query";
import { subscribeResource } from "@/lib/query/resource-store";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { useOverlayClose } from "@/ui/shell/use-overlay-close";

import styles from "./skills-panel.module.css";
import { toInstalledCatalogCard, toSkillActionCard } from "./skills-card-model";
import { GithubImportDialog } from "./github-import-dialog";
import { PersonalSkillManagement, type PersonalSkillSelection } from "./personal-skill-management";
import type { PersonalSkillOperation } from "./personal-skill-actions";
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
import type { CatalogDetailProjection } from "./skills-catalog-dialog";
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
  selectedScope?: SkillsScopeFilter;
  onScopeChange?: (scope: SkillsScopeFilter) => void;
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
  return <ActorSkillsContent key={JSON.stringify([props.preview ?? false, props.readBoundary.subject])} {...props} />;
}

function ActorSkillsContent(props: SkillsContentProps) {
  const { admitted, subject, generation } = props.readBoundary;
  const t = useT();
  // Lives outside the generation-keyed facts subtree. Never keep a private ACK
  // or current installation here; the flow retires those on every recheck.
  const updateFlow = useMemo(() => createSkillInstallationUpdateFlow({ client: createSkillInstallationClient(), boundary: { admitted: false, subject, generation: 0 } }), [subject]);
  const updateState = useSyncExternalStore(updateFlow.subscribe, updateFlow.getSnapshot, updateFlow.getSnapshot);
  const removeFlow = useMemo(() => createSkillInstallationRemoveFlow({ client: createSkillInstallationClient(), boundary: { admitted: false, subject, generation: 0 } }), [subject]);
  const removeState = useSyncExternalStore(removeFlow.subscribe, removeFlow.getSnapshot, removeFlow.getSnapshot);
  const [removeOpen, setRemoveOpen] = useState<{ subject: string | null; open: boolean }>({ subject: null, open: false });
  const removeReturnFocus = useRef<HTMLElement | null>(null);
  const cardRemoveRead = useRef<AbortController | null>(null);
  const cardRemoveReadOwner = useMemo(() => ({ admitted, subject, generation, client: props.client }), [admitted, subject, generation, props.client]);
  const [cardRemoveReadState, setCardRemoveReadState] = useState<{ owner: typeof cardRemoveReadOwner; kind: "idle" | "reading" | "failed" }>({ owner: cardRemoveReadOwner, kind: "idle" });
  const cardRemoveReadKind = cardRemoveReadState.owner === cardRemoveReadOwner ? cardRemoveReadState.kind : "idle";
  useLayoutEffect(() => () => { const request = cardRemoveRead.current; cardRemoveRead.current = null; request?.abort(); }, [cardRemoveReadOwner]);
  const [updateOpen, setUpdateOpen] = useState<{ subject: string | null; open: boolean }>({ subject: null, open: false });
  const [personalSelection, setPersonalSelection] = useState<PersonalSkillSelection | null>(null);
  const updateReturnFocus = useRef<HTMLElement | null>(null);
  const updateFallbackFocus = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => updateFlow.retain({ admitted, subject, generation }), [updateFlow, admitted, subject, generation]);
  useLayoutEffect(() => removeFlow.retain({ admitted, subject, generation }), [removeFlow, admitted, subject, generation]);
  const updateCurrent = props.readBoundary.admitted && subject !== null && updateFlow.matches(props.readBoundary);
  const removeCurrent = props.readBoundary.admitted && subject !== null && removeFlow.matches(props.readBoundary);
  const invalidateUpdateViews = useCallback(() => {
    invalidate(skillResourceKey(SKILLS_KEY, props.client));
    invalidate(skillResourceKey(SKILLS_CATALOG_KEY, props.client));
    invalidate(SKILL_CATALOG_RESOURCE_KEY);
  }, [props.client]);
  useEffect(() => {
    if (updateCurrent && updateState.acknowledged) invalidateUpdateViews();
  }, [updateCurrent, updateState.acknowledged, invalidateUpdateViews]);
  useEffect(() => {
    if (removeCurrent && removeState.acknowledged) invalidateUpdateViews();
  }, [removeCurrent, removeState.acknowledged, invalidateUpdateViews]);
  const updateLocked = () => cardRemoveRead.current !== null || personalSelection !== null || updateFlow.getSnapshot().kind !== "idle" || removeFlow.getSnapshot().kind !== "idle";
  const openUpdate = (skill: SkillCard, source: HTMLElement) => {
    if (updateLocked() || !updateCurrent || !updateFlow.select(skill, props.readBoundary)) return false;
    updateReturnFocus.current = source;
    setUpdateOpen({ subject, open: true });
    void updateFlow.readCurrent(props.readBoundary);
    return true;
  };
  const managePersonal = (operation: PersonalSkillOperation, installation: PersonalInstallation) => {
    if (props.preview || !updateCurrent || updateLocked()) return;
    setPersonalSelection({ operation, source_ref: installation.source_ref, series_id: installation.series_id, revision: installation.revision });
  };
  const openRemove = (installation: PersonalInstallation, source: HTMLElement | null) => {
    if (props.preview || !removeCurrent || updateLocked() || !removeFlow.select(installation, props.readBoundary)) return false;
    removeReturnFocus.current = source;
    setRemoveOpen({ subject, open: true });
    return true;
  };
  const openRemoveFromCard = async (skill: SkillCard, source: HTMLElement, isCurrentTarget: () => boolean) => {
    if (props.preview || !removeCurrent || updateLocked() || !isCurrentTarget() || !skill.installation_id || !skill.skill_id
      || skill.source_ref !== `skill:${skill.revision_skill_id}`) return;
    const boundary = props.readBoundary, request = new AbortController();
    cardRemoveRead.current = request; setCardRemoveReadState({ owner: cardRemoveReadOwner, kind: "reading" });
    const current = () => cardRemoveRead.current === request && !request.signal.aborted && removeFlow.matches(boundary) && isCurrentTarget();
    let failed = false;
    try {
      const installation = await createSkillInstallationClient().get(skill.installation_id, request.signal);
      if (!current()) return;
      if (!installation.installed || installation.installation_id !== skill.installation_id || installation.series_id !== skill.skill_id
        || installation.source_ref !== skill.source_ref || skill.installed_source_ref !== undefined && skill.installed_source_ref !== installation.source_ref) throw Error("Removal card target changed");
      // Release only this read slot before entering the existing exact Remove
      // intent. There is no await between release and select/open.
      cardRemoveRead.current = null; setCardRemoveReadState({ owner: cardRemoveReadOwner, kind: "idle" });
      openRemove(installation, source);
    } catch { failed = current(); }
    finally {
      if (cardRemoveRead.current === request) { cardRemoveRead.current = null; setCardRemoveReadState({ owner: cardRemoveReadOwner, kind: failed ? "failed" : "idle" }); }
    }
  };
  return <>
    {cardRemoveReadKind === "reading" ? <p className="sr-only" role="status">{t("skills.detailLoading")}</p> : null}
    {cardRemoveReadKind === "failed" ? <p role="alert">{t("skills.update.checkFailed")}</p> : null}
    {personalSelection !== null ? <PersonalSkillManagement key={JSON.stringify(personalSelection)} selection={personalSelection} boundary={props.readBoundary} onReleased={() => setPersonalSelection(null)} onConfirmed={() => { if(personalSelection.operation === "delete")setPersonalSelection(null); invalidateUpdateViews(); }} onSelectPublished={selection => { if (updateCurrent) setPersonalSelection(selection); }} returnFocusRef={updateFallbackFocus} /> : null}
    {updateCurrent && updateState.kind !== "idle" ? <div className={styles.updateNotice} role="status"><span>{t(updateState.acknowledged ? "skills.update.confirmedNotice" : "skills.update.pendingNotice")}</span><Button type="button" variant="outline" onClick={event => { updateReturnFocus.current = event.currentTarget; setUpdateOpen({ subject, open: true }); void updateFlow.readCurrent(props.readBoundary); }}>{t("skills.update.resume")}</Button></div> : null}
    {removeCurrent && removeState.kind !== "idle" ? <div className={styles.updateNotice} role="status"><span>{t("skills.lifecycle.pending")}</span><Button type="button" variant="outline" onClick={() => setRemoveOpen({ subject, open: true })}>{t("skills.lifecycle.resume")}</Button></div> : null}
    <InstalledSkillsContent {...props} onUpdateSkill={openUpdate} onRemoveSkill={openRemove} onRemoveInstalledCard={openRemoveFromCard} updateFallbackFocus={updateFallbackFocus} updateLocked={updateLocked} updatePending={cardRemoveReadKind === "reading" || updateState.kind !== "idle" || removeState.kind !== "idle"} onManagePersonal={managePersonal} personalManagementBusy={cardRemoveReadKind === "reading" || personalSelection !== null || updateState.kind !== "idle" || removeState.kind !== "idle"} />
    <SkillInstallationUpdateDialog flow={updateFlow} boundary={props.readBoundary} state={updateState} admitted={updateCurrent} open={updateOpen.subject === subject && updateOpen.open} onOpenChange={open => { if (updateFlow.matches(props.readBoundary)) setUpdateOpen({ subject, open }); }} onAbandoned={invalidateUpdateViews} returnFocusRef={updateReturnFocus} fallbackFocusRef={updateFallbackFocus} />
    <SkillInstallationRemoveDialog flow={removeFlow} boundary={props.readBoundary} state={removeState} open={removeOpen.subject === subject && removeOpen.open}
      onOpenChange={open => { if (removeFlow.matches(props.readBoundary)) setRemoveOpen({ subject, open }); }} returnFocusRef={removeReturnFocus} fallbackFocusRef={updateFallbackFocus} />
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
  selectedScope,
  onScopeChange,
  onUpdateSkill,
  updateFallbackFocus,
  updateLocked,
  updatePending,
  onManagePersonal,
  personalManagementBusy,
  onRemoveSkill,
  onRemoveInstalledCard,
}: SkillsContentProps & { onManagePersonal: (operation: PersonalSkillOperation, installation: PersonalInstallation) => void; personalManagementBusy: boolean; onUpdateSkill: (skill: SkillCard, source: HTMLElement) => boolean; onRemoveSkill: (installation: PersonalInstallation, source: HTMLElement | null) => boolean; onRemoveInstalledCard: (skill: SkillCard, source: HTMLElement, isCurrentTarget: () => boolean) => Promise<void>; updateFallbackFocus: RefObject<HTMLInputElement | null>; updateLocked: () => boolean; updatePending: boolean }) {
  // Importers retire their own facts/work on every admission/generation change.
  // Keep only window intent here; the actor-keyed parent clears it on switch.
  const [githubOpen, setGithubOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const githubReturnFocusRef = useRef<HTMLElement | null>(null);
  const uploadReturnFocusRef = useRef<HTMLElement | null>(null);
  const detailReturnFocusRef = useRef<HTMLElement | null>(null);
  // Only the exact locator and open intent survive a same-actor recheck.
  // Selected cards, installation projections and callbacks never do.
  const [detailIntent, setDetailIntent] = useState<{ key: string; source: "pool" | "catalog" } | null>(null);
  const liveDetailWindow = useRef(detailIntent);
  useLayoutEffect(() => {
    liveDetailWindow.current = detailIntent;
    return () => { liveDetailWindow.current = null; };
  }, [detailIntent]);
  const [catalogDetail, setCatalogDetail] = useState<{ client: HubClient; value: CatalogDetailProjection } | null>(null);
  const [detailActionFact, setDetailActionFact] = useState<{ key: string; installed: boolean; enabled: boolean; source: string | undefined } | null>(null);
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
  const owner = useMemo(() => ({ client, admitted: readBoundary.admitted, subject: readBoundary.subject, generation: readBoundary.generation }), [client, readBoundary.admitted, readBoundary.subject, readBoundary.generation]);
  const liveOwner = useRef<typeof owner | null>(null);
  const [factsOwner, setFactsOwner] = useState(owner);
  if (factsOwner !== owner) {
    setFactsOwner(owner);
    setCatalogDetail(null); setDetailActionFact(null);
    setLocked(new Set()); setBusy(null); setDisableError(null);
    setEnabledOverrides(new Map()); setInstalledOverrides(new Map());
    setExpanded(null); setGithubImportNotice(null); setRecentSkillKey(null);
  }
  const currentPool = useRef(pool.data);
  useLayoutEffect(() => { currentPool.current = pool.data; }, [pool.data]);
  const mutationBusyRef = useRef(false);
  const mutationAttemptRef = useRef(0);
  // A committed owner owns the command slot. Cleanup also fences unmount
  // and React StrictMode replay, without carrying a retired pending action.
  useLayoutEffect(() => {
    liveOwner.current = owner;
    mutationBusyRef.current = false;
    return () => {
      if (liveOwner.current === owner) liveOwner.current = null;
      mutationAttemptRef.current += 1;
    };
  }, [owner]);

  const receiveCatalogDetail = useCallback((value: CatalogDetailProjection) => {
    // A committed child reports only this client's read projection. Keeping
    // its owner alongside it prevents a retired projection becoming current.
    setCatalogDetail({ client, value });
  }, [client]);

  const onSetEnabled = useCallback(
    async (
      skill: SkillCard,
      enabled: boolean,
      stateKey = skillStateKey(skill.scope, skill.name, skill.skill_id),
      detailWindow?: NonNullable<typeof detailIntent>,
    ) => {
      // One mutation owns the shared hub action slot. State is for rendering;
      // the ref closes the same-frame double-click window before React commits
      // the busy state.
      if (liveOwner.current !== owner || (!preview && (!owner.admitted || owner.subject === null)) || mutationBusyRef.current || updateLocked()) return;
      // A withdrawn/disabled/quarantined source may still have an installation.
      // Keep disabling possible; enabling requires an available source.
      if (enabled && skill.source_status !== undefined && skill.source_status !== "active") return;
      mutationBusyRef.current = true;
      const attempt = ++mutationAttemptRef.current;
      // 池内项恒为「已启用」：唯一动作是停用（停用后离池）。required 撞 409 → 锁定回滚。
      setBusy(stateKey);
      setDisableError(null);
      let outcome: { ok: true } | { ok: false; error: unknown };
      try {
        if (skill.installation_id !== undefined) await client.setSkillEnabled(skill.installation_id, enabled);
        else if (enabled && skill.source_ref !== undefined && client.installSkill !== undefined) await client.installSkill(skill.source_ref);
        else throw new Error("skill installation identity is unavailable");
        outcome = { ok: true };
      } catch (error) { outcome = { ok: false, error }; }
      if (liveOwner.current !== owner || attempt !== mutationAttemptRef.current) return;
      setBusy(null);
      if (outcome.ok) {
        // Pool ACKs and a retired detail window must not override a fresh read.
        if (detailWindow !== undefined && liveDetailWindow.current === detailWindow) {
          setDetailActionFact({ key: JSON.stringify([skill.skill_id, skill.revision_skill_id]), installed: true, enabled,
            source: skill.installation_id === undefined ? skill.source_ref : skill.installed_source_ref });
        }
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
    [client, owner, preview, updateLocked],
  );

  const admitted = preview || readBoundary.admitted && readBoundary.subject !== null;
  const { refetch: refetchPool } = pool;
  const retryPool = useCallback(() => {
    if (liveOwner.current === owner && (preview || owner.admitted && owner.subject !== null)) refetchPool();
  }, [owner, refetchPool, preview]);
  const selectedPoolSkill = detailIntent?.source === "pool" && admitted
    ? pool.data?.skills.find(skill => JSON.stringify([skill.skill_id, skill.revision_skill_id]) === detailIntent.key) : undefined;
  const catalogProjection = admitted && catalogDetail?.client === client ? catalogDetail.value : null;
  const selected = detailIntent?.source === "pool" ? selectedPoolSkill ? detailSelectionFor(selectedPoolSkill) : null
    : catalogProjection?.skill ? detailSelectionFor(catalogProjection.skill) : null;
  const detailSelection = selected === null ? null : (() => {
    if (!detailActionFact || detailActionFact.key !== detailIntent?.key) return selected;
    const skill = { ...selected.skill, installed: detailActionFact.installed, enabled: detailActionFact.enabled };
    delete skill.installed_source_ref;
    if (detailActionFact.source !== undefined) skill.installed_source_ref = detailActionFact.source;
    return { skill, installationState: { installed: skill.installed, enabled: skill.enabled } };
  })();
  useLayoutEffect(() => {
    if (detailIntent && !detailReturnFocusRef.current?.isConnected) detailReturnFocusRef.current = updateFallbackFocus.current;
  }, [client, detailIntent, updateFallbackFocus]);

  return (
    <>
      <div className={cn(styles.tabs, embedded && styles.embeddedTabs)}>
        <div
          className={cn(styles.body, embedded && styles.embeddedBody)}
          data-embedded={embedded || undefined}
        >
          <SkillsPoolTab
            preview={preview}
            selectedDetailKey={detailIntent?.source === "catalog" ? detailIntent.key : null}
            onDetailProjection={receiveCatalogDetail}
            detailReturnFocusRef={detailReturnFocusRef}
            searchInputRef={updateFallbackFocus}
            pool={admitted ? pool.data ?? null : null}
            loading={!admitted || pool.loading}
            failed={admitted && pool.error !== undefined && pool.data === undefined}
            refreshFailed={admitted && pool.error !== undefined && pool.data !== undefined}
            pinned={pinned}
            locked={locked}
            busy={updatePending ? "installation-update" : busy}
            onRemoveInstalledSkill={(skill, source) => {
              const exact = () => liveOwner.current === owner && admitted && source.isConnected && liveDetailWindow.current === null
                && currentPool.current?.skills.some(value => value.installation_id === skill.installation_id && value.skill_id === skill.skill_id
                  && value.source_ref === skill.source_ref && value.revision_skill_id === skill.revision_skill_id) === true;
              if (mutationBusyRef.current || updateLocked() || !exact()) return;
              void onRemoveInstalledCard(skill, source, exact);
            }}
            onUpdateSkill={(skill, source) => {
              if (mutationBusyRef.current || !onUpdateSkill(skill, source)) return;
              setEnabledOverrides(new Map()); setInstalledOverrides(new Map()); setDetailIntent(null);
            }}
            expanded={expanded}
            client={client}
            onRetry={retryPool}
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
              if (liveOwner.current !== owner || !admitted) return;
              detailReturnFocusRef.current = source;
              const selection = detailSelectionFor(skill);
              if (!selection) return;
              setDetailActionFact(null);
              setDetailIntent({ key: JSON.stringify([selection.skill.skill_id, selection.skill.revision_skill_id]), source: "installed" in skill ? "catalog" : "pool" });
              if ("installed" in skill) setCatalogDetail({ client, value: { skill, failed: false, busy: false, retry: () => {
                if (liveOwner.current === owner) invalidate(skillResourceKey(SKILLS_CATALOG_KEY, client));
              } } });
            }}
            {...(embeddedCatalogOpen === undefined
              ? {}
              : { embeddedCatalogOpen })}
            {...(onEmbeddedCatalogOpenChange === undefined
              ? {}
              : { onEmbeddedCatalogOpenChange })}
            {...(catalogTriggerRef === undefined ? {} : { catalogTriggerRef })}
            {...(selectedScope === undefined ? {} : { selectedScope })}
            {...(onScopeChange === undefined ? {} : { onScopeChange })}
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
      {detailIntent !== null ? (
        <ManusSkillDetailDialog
          key={JSON.stringify([detailIntent.source, detailIntent.key])}
          detailSource={detailIntent.source === "pool" ? "installation" : "catalog"}
          preview={preview}
          readBoundary={readBoundary}
          skill={detailSelection?.skill ?? null}
          pending={detailSelection === null}
          pendingFailed={admitted && (detailIntent.source === "pool" ? pool.error !== undefined || pool.data !== undefined : catalogProjection?.failed === true)}
          pendingBusy={!admitted || (detailIntent.source === "pool" ? pool.loading : catalogProjection?.busy !== false)}
          {...(admitted && catalogProjection?.loadMore ? { onLoadMore: catalogProjection.loadMore } : {})}
          onRetryPending={admitted ? detailIntent.source === "pool" ? retryPool : catalogProjection?.retry : undefined}
          publisherLabel={brandName ?? "Kokoro"}
          categoryLabels={detailSelection?.skill.categories ?? []}
          open
          {...(detailSelection && (detailIntent.source !== "pool" || detailActionFact?.key === detailIntent.key) ? { installationState: detailSelection.installationState } : {})}
          onOpenChange={(open) => {
            if (!open) { setDetailActionFact(null); setDetailIntent(null); }
          }}
          returnFocusRef={detailReturnFocusRef}
          personalManagementBusy={personalManagementBusy}
          onManagePersonal={(operation, installation) => {
            if (liveOwner.current !== owner || !admitted || personalManagementBusy) return;
            onManagePersonal(operation, installation);
            setDetailActionFact(null); setDetailIntent(null);
          }}
          onRemoveInstallation={installation => {
            if (liveOwner.current !== owner || !admitted || mutationBusyRef.current || !onRemoveSkill(installation, detailReturnFocusRef.current)) return;
            setEnabledOverrides(new Map()); setInstalledOverrides(new Map()); setDetailIntent(null);
          }}
          onAdd={(skill) =>
            void onSetEnabled(
              toSkillActionCard(skill),
              true,
              skillStateKey(skill.scope, skill.name, skill.skill_id),
              detailIntent,
            )
          }
          onTry={(prompt, selection) => {
            if (!detailSelection || liveOwner.current !== owner || !admitted) return false;
            const original = detailSelection.skill;
            if (selection.skill_id !== original.skill_id || selection.revision_skill_id !== original.revision_skill_id
              || selection.source_ref !== original.source_ref || selection.installed_source_ref !== original.installed_source_ref
              || selection.installation_id !== original.installation_id) return false;
            const detailSkill = toSkillActionCard(selection);
            if (onTrySkill?.(detailSkill, prompt)) { setDetailActionFact(null); setDetailIntent(null); return true; }
            if (preview && !onTrySkill) { if (!pinned.includes(detailSkill.name)) onTogglePin(detailSkill.name); setDetailIntent(null); return true; }
            return false;
          }}
        />
      ) : null}
    </>
  );
}
