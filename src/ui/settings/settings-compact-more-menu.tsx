"use client";

import { createPortal } from "react-dom";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Menu } from "lucide-react";

import type { SettingsTab } from "./settings-types";

type CompactMoreItem = {
  id: string;
  label: string;
  tab?: SettingsTab;
  disabled?: boolean;
};

type SettingsCompactMoreMenuProps = {
  label: string;
  items: readonly CompactMoreItem[];
  onSelectTab: (tab: SettingsTab) => void;
  triggerClassName: string;
  menuClassName: string;
  itemClassName: string;
};

/**
 * Compact Settings owns its overflow list instead of sharing the desktop rail.
 * That keeps the Manus-style floating menu independent from Radix Tabs' roving
 * focus model while retaining keyboard close and outside-click behaviour.
 */
export function SettingsCompactMoreMenu({
  label,
  items,
  onSelectTab,
  triggerClassName,
  menuClassName,
  itemClassName,
}: SettingsCompactMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuLayer, setMenuLayer] = useState<{
    host: HTMLElement;
    position: CSSProperties;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pendingFocus = useRef<"first" | "last" | null>(null);
  const menuId = useId();

  const closeMenu = useCallback((restoreFocus: boolean): void => {
    pendingFocus.current = null;
    setOpen(false);
    if (restoreFocus) {
      rootRef.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
    }
  }, []);

  const focusEdge = useCallback((edge: "first" | "last"): void => {
    const enabled = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="menuitem"]:not(:disabled)',
    );
    const item = edge === "last" ? enabled?.[enabled.length - 1] : enabled?.[0];
    item?.focus({ preventScroll: true });
  }, []);

  const openMenu = (edge: "first" | "last"): void => {
    pendingFocus.current = edge;
    if (open && menuRef.current) {
      focusEdge(edge);
      pendingFocus.current = null;
    }
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = (): void => {
      const trigger =
        rootRef.current?.querySelector<HTMLButtonElement>("button");
      const dialog = rootRef.current?.closest<HTMLElement>(
        '[data-testid="settings-modal"][data-slot="dialog-content"]',
      );
      if (!trigger || !dialog) return;

      const triggerRect = trigger.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const width = Math.min(144, Math.max(0, dialogRect.width - 16));
      setMenuLayer({
        host: dialog,
        // The menu belongs to this Dialog's focus scope. Position against the
        // same host, whose centering transform also contains fixed children.
        position: {
          position: "absolute",
          top: `${triggerRect.bottom - dialogRect.top + 4}px`,
          bottom: "8px",
          left: `${Math.max(8, dialogRect.width - 72 - width)}px`,
          right: "auto",
          width: `${width}px`,
          minWidth: `${width}px`,
        },
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open && menuRef.current && pendingFocus.current) {
      focusEdge(pendingFocus.current);
      pendingFocus.current = null;
    }
  }, [open, menuLayer, focusEdge]);

  useEffect(() => {
    if (!open || !menuLayer) return;

    const closeOnOutsidePointer = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        closeMenu(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        !(event.target instanceof Element) ||
        event.target.closest('[data-slot="dialog-content"]') !== menuLayer.host
      ) {
        return;
      }
      // Radix dismisses Dialog at document capture. This open menu owns only
      // Escape from its own Dialog scope, before that parent handler runs.
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open, menuLayer, closeMenu]);

  return (
    <div ref={rootRef} className="contents">
      <button
        type="button"
        className={triggerClassName}
        data-testid="settings-more"
        aria-label={label}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        onPointerDown={(event) => {
          event.stopPropagation();
          if (event.button === 0) {
            // Keep Radix's tab list from moving focus/scrolling the compact
            // rail while the independently-owned overflow surface opens.
            event.preventDefault();
            if (open) closeMenu(true);
            else {
              pendingFocus.current = null;
              setOpen(true);
            }
          }
        }}
        onClick={(event) => {
          event.stopPropagation();
          // Enter/Space and assistive activation produce a native detail=0
          // click. Pointer activation was already handled on pointerdown.
          if (event.detail === 0) {
            if (open) closeMenu(true);
            else openMenu("first");
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            openMenu(event.key === "ArrowUp" ? "last" : "first");
          }
        }}
      >
        <Menu aria-hidden="true" />
      </button>
      {open && menuLayer
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className={menuClassName}
              data-settings-compact-more-menu
              role="menu"
              style={menuLayer.position}
              onKeyDown={(event) => {
                if (
                  !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                ) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                const enabled = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    'button[role="menuitem"]:not(:disabled)',
                  ),
                );
                if (!enabled.length) return;
                const current = enabled.findIndex(
                  (item) => item === document.activeElement,
                );
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? enabled.length - 1
                      : event.key === "ArrowUp"
                        ? current <= 0
                          ? enabled.length - 1
                          : current - 1
                        : (current + 1) % enabled.length;
                enabled[next]?.focus({ preventScroll: true });
              }}
            >
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={itemClassName}
                  role="menuitem"
                  tabIndex={-1}
                  data-testid={`settings-more-${item.id}`}
                  disabled={item.disabled}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (item.disabled || !item.tab) return;
                    closeMenu(true);
                    onSelectTab(item.tab);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            menuLayer.host,
          )
        : null}
    </div>
  );
}
