"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { PortalSkin } from "@/components/ui/web-skin"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  type,
  asChild,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  // With `asChild`, Radix merges Trigger props into the real control. Do not
  // overwrite the child's data-slot (SidebarTrigger, DialogTrigger, etc.) or
  // focus/layout queries lose the primitive's identity when it is wrapped in
  // a tooltip. The tooltip still retains its data-slot in the non-composed
  // case, while the child remains the source of truth for composed controls.
  return (
    <TooltipPrimitive.Trigger
      {...(asChild ? {} : { "data-slot": "tooltip-trigger" })}
      type={type ?? "button"}
      asChild={asChild}
      {...props}
    />
  )
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <PortalSkin>
        <TooltipPrimitive.Content
          data-slot="tooltip-content"
          sideOffset={sideOffset}
          className={cn(
            "z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
        </TooltipPrimitive.Content>
      </PortalSkin>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
