"use client";

import { createPortal } from "react-dom";
import {
  type CSSProperties,
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
  const menuId = useId();

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

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="contents">
      <button
        type="button"
        className={triggerClassName}
        data-testid="settings-more"
        aria-label={label}
        aria-controls={menuId}
        aria-expanded={open}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (event.button === 0) {
            // Keep Radix's tab list from moving focus/scrolling the compact
            // rail while the independently-owned overflow surface opens.
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
        onClick={(event) => {
          event.stopPropagation();
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
            >
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={itemClassName}
                  role="menuitem"
                  data-testid={`settings-more-${item.id}`}
                  disabled={item.disabled}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!item.tab) return;
                    setOpen(false);
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
