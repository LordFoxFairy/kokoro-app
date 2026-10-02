"use client"

import type { WorkspaceHeaderIdentityProps } from "./workspace-header.types"

import { DEFAULT_BRAND } from "@/config/brand"

export function WorkspaceHeaderIdentity({
  brandName = DEFAULT_BRAND.name,
}: WorkspaceHeaderIdentityProps) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span data-slot="workspace-brand" className="truncate text-lg font-medium">{brandName}</span>
    </div>
  )
}
