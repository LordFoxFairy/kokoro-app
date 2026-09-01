import type { ReactNode } from "react"
import { useId, useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

import styles from "./composer.module.css"

export type MenuOption = {
  key: string
  label: string
  hint?: string
  icon?: ReactNode
}

type ComposerMenuProps = {
  triggerClassName: string
  /** Stable semantic hook for site skins that intentionally hide a control. */
  dataComposerControl?: "agent" | "model" | "mode"
  triggerLabel: string
  triggerTitle?: string
  trigger: ReactNode
  options: MenuOption[]
  selectedKey?: string
  onSelect: (key: string) => void
  align?: "start" | "end"
}

// Composer 选择器使用 shadcn DropdownMenu；布局仍复用 composer CSS，
// 菜单的键盘导航、Esc、焦点回收和单选语义交给 Radix。
export function ComposerMenu({
  triggerClassName,
  dataComposerControl,
  triggerLabel,
  triggerTitle,
  trigger,
  options,
  selectedKey,
  onSelect,
  align = "start",
}: ComposerMenuProps) {
  const [open, setOpen] = useState(false)
  const menuInstanceId = useId().replaceAll(":", "")

  const content = options.map((option) => (
    selectedKey !== undefined ? (
      <DropdownMenuRadioItem key={option.key} value={option.key}>
        {option.icon ? <span className={styles.menuItemIcon} aria-hidden>{option.icon}</span> : null}
        <span className={styles.menuItemLabel}>
          <span>{option.label}</span>
          {option.hint ? <span className={styles.menuItemHint} title={option.hint}>{option.hint}</span> : null}
        </span>
      </DropdownMenuRadioItem>
    ) : (
      <DropdownMenuItem key={option.key} onSelect={() => onSelect(option.key)}>
        {option.icon ? <span className={styles.menuItemIcon} aria-hidden>{option.icon}</span> : null}
        <span className={styles.menuItemLabel}>
          <span>{option.label}</span>
          {option.hint ? <span className={styles.menuItemHint} title={option.hint}>{option.hint}</span> : null}
        </span>
      </DropdownMenuItem>
    )
  ))

  return (
    <DropdownMenu open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen)
    }}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={triggerClassName}
          data-composer-control={dataComposerControl}
          data-composer-menu-id={menuInstanceId}
          data-composer-menu-trigger="true"
          // Keep the action and its current value in the accessible name. A
          // generic "Switch model" button is ambiguous when several
          // selectors share the same Composer footer; the visible text is
          // already the value, so this only makes that context available to
          // assistive technology without adding another visual label.
          aria-label={triggerTitle ? `${triggerLabel}: ${triggerTitle}` : triggerLabel}
          title={triggerTitle}
        >
          {trigger}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        // Composer menus open into the quiet space above the editor so they
        // never cover the site's primary action cards. Radix still flips when
        // the top edge is genuinely unavailable and applies collision padding.
        side="top"
        sideOffset={8}
        collisionPadding={12}
        className={styles.menuPopover}
        data-composer-menu-id={menuInstanceId}
        data-composer-menu-content="true"
      >
        {selectedKey !== undefined ? (
          <DropdownMenuRadioGroup value={selectedKey} onValueChange={onSelect}>
            <DropdownMenuGroup>{content}</DropdownMenuGroup>
          </DropdownMenuRadioGroup>
        ) : (
          <DropdownMenuGroup>{content}</DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
