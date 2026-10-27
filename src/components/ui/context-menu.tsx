"use client"

import type { ComponentProps } from "react"
import { ContextMenu as Primitive } from "radix-ui"
import { cn } from "@/lib/utils"
import { PortalSkin } from "@/components/ui/web-skin"

export const ContextMenu = Primitive.Root
export function ContextMenuTrigger({ onKeyDown, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      {...props}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented || !(event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))) return
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect.left, clientY: rect.bottom }))
      }}
    />
  )
}
export function ContextMenuContent({ className, children, ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <PortalSkin>
        <Primitive.Content
          data-slot="context-menu-content"
          className={cn(
            "z-50 min-w-40 max-h-(--radix-context-menu-content-available-height) overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
            className,
          )}
          {...props}
        >
          {children}
        </Primitive.Content>
      </PortalSkin>
    </Primitive.Portal>
  )
}
export function ContextMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      data-slot="context-menu-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm select-none outline-hidden focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  )
}
