"use client";

// 设置中心(WEB-FACE 面三):浮在工作区之上的模态卡片面板——左 tab 竖导航 + 右内容区,一次显一个 tab。
// 打开不再导航离开(语境原地保留),关闭走 shadcn Dialog 背幕/Esc/右上 ×。所有管理功能(账户/外观/对话/订阅/
// 技能/连接/作品/团队)统一此处 tab 切换,不再跳独立弹窗或整页。tab 内部自持(initialTab 决定初值,
// onTabChange 上抛给 shell 同步 URL `?settings=`),shell 重开切 tab 时 initialTab 变化即重置。
// 会话态由 AppFrame 保证（仅在信封有效时渲染），本组件不再自持匿名闸。
// 壳层只编排导航与面板；每个设置能力在 sections/ 或独立产品面板中维护。

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/context";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { browserHubClient, browserTeamClient } from "@/ui/shell/page-clients";
import type { SkillCard } from "@/hub/schemas";
import type { SkillsScopeFilter } from "@/ui/skills/skills-scope";
import styles from "./settings-modal.module.css";
import { useOverlayClose } from "@/ui/shell/use-overlay-close";
import { settingsSkillsViewFromLocation, type SettingsSkillsView } from "./settings-location";
import { useWarmMcpProjection } from "@/ui/mcp/use-mcp-projection";
import { warmCustomApiProjection } from "@/ui/mcp/use-custom-api-projection";

import { SettingsNavigation } from "./settings-navigation";
import { SettingsPanel } from "./settings-panel";
import { SETTINGS_TABS, type SettingsTab } from "./settings-types";

export type { SettingsTab } from "./settings-types";

function isFocusTargetAvailable(
  target: HTMLElement | null,
): target is HTMLElement {
  if (!target || !target.isConnected || target.hasAttribute("disabled")) {
    return false;
  }
  // The shell marks its stable return controls explicitly. During a portal
  // close their computed style can be empty for one frame, but they remain
  // the correct focus destination.
  if (target.hasAttribute("data-settings-return-target")) {
    return true;
  }
  // A hidden trigger is not a useful focus target after a shell transition.
  if (
    target.matches('[data-sidebar="trigger"], [data-slot="sidebar-trigger"]')
  ) {
    const rect = target.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  const style = window.getComputedStyle(target);
  return style.display !== "none" && style.visibility !== "hidden";
}

// 外部值(URL `?settings=`)归一到已知 tab。Manus 的公开深链使用
// `general`，而 User Web 内部面板名是 `appearance`；两者必须落到同一
// 个面板，不能因为复制 URL 后回退到「账户」。
export function normalizeSettingsTab(
  value: string | null | undefined,
): SettingsTab {
  if (value === "general") {
    return "appearance";
  }
  return SETTINGS_TABS.find((key) => key === value) ?? "account";
}

type SettingsModalProps = {
  // 服务端按 host 解析的站点品牌名(SITE-REAL);缺省回退 Kokoro。
  brandName?: string;
  preview?: boolean;
  onArchiveChanged?: (state: import("@/lib/archived-tasks.schema").ArchiveState) => void;
  readBoundary?: import("@/ui/auth/use-session-state").ProjectReadBoundary;
  // 打开时的初始 tab(shell 从入口/URL 传入);变化即重置内部 tab(支持重开切 tab)。
  initialTab: SettingsTab;
  /** Optional entry intent for the one shared Skills panel. */
  initialSkillsScope?: SkillsScopeFilter;
  onClose: () => void;
  /** Controlled Dialogs have no trigger in the shell; return focus to the invoking control. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Optional shell scope for fallback focus recovery when multiple sites are embedded. */
  focusScopeRef?: RefObject<HTMLElement | null>;
  // 内部切 tab 时上抛,供 shell 同步 URL `?settings=`(刷新/深链/可分享)。
  onTabChange?: (tab: SettingsTab, skillsView?: SettingsSkillsView) => void;
  onCreateSkillWithAi?: (prompt?: string) => void;
  onTrySkill?: (skill: SkillCard, prompt?: string) => boolean;
};

export function SettingsModal({
  brandName,
  preview = false,
  readBoundary,
  onArchiveChanged,
  initialTab,
  initialSkillsScope,
  onClose,
  onTabChange,
  returnFocusRef,
  focusScopeRef,
  onCreateSkillWithAi,
  onTrySkill,
}: SettingsModalProps) {
  const { t } = useLocale();
  const resolvedBrandName = brandName ?? "Kokoro";
  // `/settings/skills/personal` is the marketplace handoff URL used by Manus.
  // A reload keeps the same one-panel intent; direct Settings opens keep All.
  const [skillsView, setSkillsView] = useState<SettingsSkillsView>(initialSkillsScope ?? "all");
  useLayoutEffect(() => {
    let retired = false;
    const read = () => {
      if (!retired) setSkillsView(settingsSkillsViewFromLocation() ?? initialSkillsScope ?? "all");
    };
    queueMicrotask(read);
    window.addEventListener("popstate", read);
    window.addEventListener("hashchange", read);
    return () => {
      retired = true;
      window.removeEventListener("popstate", read);
      window.removeEventListener("hashchange", read);
    };
  }, [initialSkillsScope]);
  // Keep the mounted shell immediately responsive to a rail click, then
  // reconcile it with a deep link or outer-shell change. The previous
  // render-only value made the modal depend on parent navigation to reflect
  // a click, which broke standalone settings flows and caused a perceptible
  // delayed tab swap.
  const [localTab, setLocalTab] = useState<{
    source: SettingsTab;
    value: SettingsTab;
  }>(() => ({ source: initialTab, value: initialTab }));
  if (localTab.source !== initialTab) {
    setLocalTab({ source: initialTab, value: initialTab });
  }
  const tab = localTab.source === initialTab ? localTab.value : initialTab;
  const { open, requestClose } = useOverlayClose(onClose);
  const activeTabRef = useRef<HTMLButtonElement | null>(null);
  // Keep one injected Hub client for the lifetime of the settings surface.
  // Besides avoiding duplicate providers in one render, this makes the
  // resource cache's client scope stable when a test/site supplies a factory
  // instead of a process singleton.
  const hubClient = useMemo(() => browserHubClient({ preview }), [preview]);
  const teamClient = useMemo(() => browserTeamClient({ preview }), [preview]);
  useWarmMcpProjection({
    client: hubClient,
    readGeneration: preview ? 0 : readBoundary?.generation ?? 0,
    identity: preview
      ? "preview"
      : readBoundary?.admitted === true
        ? readBoundary.subject
        : null,
  });
  // Custom API profiles share the same Settings entry point as MCP rows. Warm
  // them here so opening the connector tab joins a settled owner read instead
  // of briefly showing an empty or loading collection.
  const connectorIdentity = preview
    ? "preview"
    : readBoundary?.admitted === true
      ? readBoundary.subject
      : null;
  useEffect(() => {
    if (connectorIdentity === null) return undefined;
    return warmCustomApiProjection({
      client: hubClient,
      identity: connectorIdentity,
      readGeneration: preview ? 0 : readBoundary?.generation ?? 0,
    });
  }, [connectorIdentity, hubClient, preview, readBoundary?.generation]);
  const selectTab = (next: SettingsTab): void => {
    setLocalTab({ source: initialTab, value: next });
    setSkillsView("all");
    onTabChange?.(next);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose();
        }}
      >
        <DialogContent
          className={cn(styles.dialogContent, "p-0 box-border")}
          data-testid="settings-modal"
          closeLabel={t("settings.close")}
          closeButtonTestId="settings-close"
          overlayClassName={styles.settingsOverlay ?? ""}
          onPointerDownOutside={(event) => {
            // Skills, connector and import dialogs are portalled outside this
            // content. Treat their content/overlay as an owned nested surface;
            // otherwise Radix bubbles the pointer as an outside click and
            // closes Settings when a nested action is merely being confirmed.
            const target = event.target;
            if (
              target instanceof Element &&
              (target.closest('[data-slot="dialog-content"]') !== null ||
                target.closest("[data-settings-compact-more-menu]") !== null ||
                // DropdownMenu content is portalled to document.body. Without
                // treating it as an owned child surface, selecting Skills →
                // Create → GitHub is seen as an outside click and the Settings
                // dialog unmounts before the repository dialog can open.
                target.closest('[data-slot="dropdown-menu-content"]') !==
                  null ||
                (target.closest('[data-slot="dialog-overlay"]') !== null &&
                  document.querySelectorAll(
                    '[data-slot="dialog-content"][data-state="open"]',
                  ).length > 1))
            ) {
              event.preventDefault();
            } else if (
              document.querySelector(
                '[data-slot="dropdown-menu-content"][data-state="open"]',
              ) !== null
            ) {
              // Radix can report a portalled menu item's pointer event with the
              // trigger/content boundary as the outside target. The open-menu
              // check is the stable guard: selecting an item must not tear down
              // Settings before its handoff callback opens the next surface.
              event.preventDefault();
            }
          }}
          onOpenAutoFocus={(event) => {
            // This controlled Dialog has no DialogTrigger for Radix to infer a
            // useful entry point from. Start keyboard users on the selected tab
            // instead of leaving focus on the rail trigger/body.
            event.preventDefault();
            // Let the browser reveal a deep-linked tab in the same scrolling
            // rail that owns keyboard focus. Preventing scroll here left the
            // selected Skills tab off-screen after a hard refresh.
            activeTabRef.current?.focus({ preventScroll: true });
            window.requestAnimationFrame(() => {
              const modal = activeTabRef.current?.closest('[data-testid="settings-modal"]');
              if (!modal?.contains(document.activeElement)) activeTabRef.current?.focus({ preventScroll: true });
            });
          }}
          onCloseAutoFocus={(event) => {
            const scope = focusScopeRef?.current ?? document;
            const fallback = scope.querySelector<HTMLElement>(
              '[data-settings-return-target="composer"]:not([disabled])',
            );
            const rememberedTarget = returnFocusRef?.current ?? null;
            const target = isFocusTargetAvailable(rememberedTarget)
              ? rememberedTarget
              : fallback;
            if (!target) {
              return;
            }
            event.preventDefault();
            target.focus({ preventScroll: true });
          }}
        >
          <DialogTitle className={styles.desktopTitle}>
            {t("settings.title")}
          </DialogTitle>
          <Tabs
            // Settings is one horizontal tab model; it does not switch layout
            // modes as the browser viewport changes.
            orientation="horizontal"
            value={tab}
            onValueChange={(value) => selectTab(value as SettingsTab)}
            className={styles.tabs}
          >
            <div className={styles.layout}>
              <SettingsNavigation
                brandName={resolvedBrandName}
                selectedTab={tab}
                activeTabRef={activeTabRef}
                onSelectTab={selectTab}
              />

              <SettingsPanel
                activeTab={tab}
                {...(onArchiveChanged === undefined ? {} : { onArchiveChanged })}
                skillsScope={skillsView === "explore" ? "all" : skillsView}
                onSkillsScopeChange={(scope) => {
                  setSkillsView(scope);
                  onTabChange?.("skills", scope);
                }}
                skillsCatalogOpen={skillsView === "explore"}
                onSkillsCatalogOpenChange={(catalogOpen) => {
                  const next = catalogOpen ? "explore" : "all";
                  setSkillsView(next);
                  onTabChange?.("skills", next);
                }}
                brandName={resolvedBrandName}
                preview={preview}
                {...(readBoundary === undefined ? {} : { readBoundary })}
                hubClient={hubClient}
                teamClient={teamClient}
                onSelectTab={selectTab}
                {...(onCreateSkillWithAi === undefined
                  ? {}
                  : { onCreateSkillWithAi })}
                {...(onTrySkill === undefined ? {} : { onTrySkill })}
              />
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
