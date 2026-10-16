import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { ArrowUpRight } from "lucide-react";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";

import { SettingsCompactMoreMenu } from "./settings-compact-more-menu";
import {
  COMPACT_PRIMARY_TABS,
  type SettingsNavigationEntry,
} from "./settings-navigation-model";
import type { SettingsTab } from "./settings-types";
import styles from "./settings-modal.module.css";

type SettingsNavigationRailProps = {
  entries: readonly SettingsNavigationEntry[];
  selectedTab: SettingsTab;
  activeTabRef: RefObject<HTMLButtonElement | null>;
  onSelectTab: (tab: SettingsTab) => void;
  moreLabel: string;
  unavailableId: string;
  isFiltered: boolean;
  groupLabel: (entry: SettingsNavigationEntry) => string | null;
};

/**
 * The rail is the sole owner of selection visibility and compact overflow.
 * It consumes the same navigation model as the desktop rail: no duplicated
 * tabs, scroll offsets, or independent compact labels.
 */
export function SettingsNavigationRail({
  entries,
  selectedTab,
  activeTabRef,
  onSelectTab,
  moreLabel,
  unavailableId,
  isFiltered,
  groupLabel,
}: SettingsNavigationRailProps) {
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<HTMLButtonElement | null>(null);
  const setSelectedTabRef = useCallback(
    (node: HTMLButtonElement | null) => {
      activeTabRef.current = node;
      setActiveTab(node);
    },
    [activeTabRef],
  );
  const compactOverflowItems = entries.filter(
    (entry) => entry.kind !== "tab" || !COMPACT_PRIMARY_TABS.has(entry.key),
  );

  useLayoutEffect(() => {
    const list = tabListRef.current;
    // Prefer the mounted tab reference supplied by the modal. Radix updates
    // its data-state after mounting, so a one-time query can race a deep-link
    // render and leave the selected compact tab outside the scroll viewport.
    const active =
      activeTab ??
      activeTabRef.current ??
      list?.querySelector<HTMLButtonElement>('[data-state="active"]') ??
      null;
    if (!list || !active) return;

    let frame: number | undefined;
    let settledFrame: number | undefined;
    const reveal = (): void => {
      const listRect = list.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const hasHorizontalOverflow =
        list.scrollWidth > list.clientWidth ||
        activeRect.left < listRect.left ||
        activeRect.right > listRect.right;
      if (hasHorizontalOverflow) {
        const left = activeRect.left - listRect.left + list.scrollLeft;
        const right = activeRect.right - listRect.left + list.scrollLeft;
        const maxScroll = Math.max(0, list.scrollWidth - list.clientWidth);
        const itemOffsets = Array.from(
          list.querySelectorAll<HTMLElement>(
            '[data-slot="tabs-trigger"], [data-testid^="settings-placeholder-"]',
          ),
        ).map(
          (item) =>
            item.getBoundingClientRect().left -
            listRect.left +
            list.scrollLeft,
        );
        const snapFromStart = (wanted: number): number => {
          return Math.min(
            maxScroll,
            itemOffsets.reduce(
              (nearest, offset) => (offset <= wanted ? offset : nearest),
              0,
            ),
          );
        };
        const snapFromEnd = (wanted: number): number =>
          Math.min(
            maxScroll,
            itemOffsets.find((offset) => offset >= wanted) ?? maxScroll,
          );
        if (left < list.scrollLeft) list.scrollLeft = snapFromStart(left);
        else if (right > list.scrollLeft + list.clientWidth)
          list.scrollLeft = snapFromEnd(right - list.clientWidth);

        // A browser focus reveal is permitted to stop part way through a
        // label. Move one whole item earlier whenever that happens so the
        // rail never begins with a detached CJK character such as “捷键”.
        const items = Array.from(
          list.querySelectorAll<HTMLElement>(
            '[data-slot="tabs-trigger"], [data-testid^="settings-placeholder-"]',
          ),
        );
        const leadingPartialIndex = items.findIndex((item) => {
          const rect = item.getBoundingClientRect();
          return rect.left < listRect.left && rect.right > listRect.left;
        });
        const precedingItem =
          leadingPartialIndex > 0 ? items[leadingPartialIndex - 1] : undefined;
        if (precedingItem !== undefined) {
          const precedingRect = precedingItem.getBoundingClientRect();
          list.scrollLeft += precedingRect.left - listRect.left;
        }
        return;
      }
      const edge = 4;
      if (activeRect.top < listRect.top + edge)
        list.scrollTop += activeRect.top - listRect.top - edge;
      else if (activeRect.bottom > listRect.bottom - edge)
        list.scrollTop += activeRect.bottom - listRect.bottom + edge;
    };
    const scheduleReveal = (): void => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        reveal();
      });
    };

    // Width is finalized after the modal and font layout settle. Observing the
    // actual scroll viewport makes deep links and hard reloads deterministic,
    // without relying on a viewport breakpoint duplicated from CSS.
    const observer = new ResizeObserver(scheduleReveal);
    // Dialog autofocus performs the browser's native nearest-item scroll.
    // Follow that focus event by one frame to snap it to a full label boundary
    // (rather than leaving the first character of “快捷键” outside the rail).
    const onActiveFocus = (): void => scheduleReveal();
    active.addEventListener("focus", onActiveFocus);
    observer.observe(list);
    observer.observe(active);
    scheduleReveal();
    // A second layout pass handles font loading and portal placement before
    // the Dialog open-autofocus lifecycle completes.
    settledFrame = window.requestAnimationFrame(() => {
      settledFrame = window.requestAnimationFrame(scheduleReveal);
    });
    return () => {
      active.removeEventListener("focus", onActiveFocus);
      observer.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (settledFrame !== undefined) window.cancelAnimationFrame(settledFrame);
    };
  }, [activeTab, activeTabRef, selectedTab]);

  return (
    <div className={styles.tabRail}>
      <TabsList ref={tabListRef} className={styles.tabList} variant="line">
        {entries.map((entry) => {
          const label = groupLabel(entry);
          const Icon = entry.icon;
          const itemKey = entry.kind === "tab" ? entry.key : entry.id;
          const compactPrimary =
            entry.kind === "tab" && COMPACT_PRIMARY_TABS.has(entry.key);
          return (
            <Fragment key={itemKey}>
              {entry.group === "support" && !isFiltered ? (
                <div className={styles.supportDivider} aria-hidden="true" />
              ) : label ? (
                <div className={styles.sectionLabel} aria-hidden="true">
                  {label}
                </div>
              ) : null}
              {entry.kind === "tab" ? (
                <TabsTrigger
                  value={entry.key}
                  className={styles.tab}
                  ref={
                    entry.key === selectedTab ? setSelectedTabRef : undefined
                  }
                  id={`settings-tab-${entry.key}`}
                  data-testid={`settings-tab-${entry.key}`}
                  data-compact-primary={compactPrimary ? "true" : "false"}
                  data-settings-team={entry.key === "team" ? "true" : undefined}
                >
                  <Icon aria-hidden="true" />
                  <span className={styles.tabLabel}>{entry.label}</span>
                </TabsTrigger>
              ) : (
                <div
                  className={styles.placeholderTab}
                  data-testid={`settings-placeholder-${entry.id}`}
                  data-compact-primary="false"
                  aria-disabled="true"
                  aria-describedby={unavailableId}
                >
                  <Icon aria-hidden="true" />
                  <span className={styles.tabLabel}>{entry.label}</span>
                  {entry.id === "help" ? (
                    <ArrowUpRight
                      className={styles.helpExternal}
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              )}
            </Fragment>
          );
        })}
      </TabsList>
      <SettingsCompactMoreMenu
        label={moreLabel}
        items={compactOverflowItems.map((entry) => ({
          id: entry.kind === "tab" ? entry.key : entry.id,
          label: entry.label,
          ...(entry.kind === "tab" ? { tab: entry.key } : { disabled: true }),
        }))}
        onSelectTab={onSelectTab}
        triggerClassName={styles.compactMoreTrigger ?? ""}
        menuClassName={styles.compactMoreMenu ?? ""}
        itemClassName={styles.compactMoreMenuItem ?? ""}
      />
    </div>
  );
}
