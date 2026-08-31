import { createElement, type ComponentType, type SVGProps } from "react"
import { Clock, Coins, LibraryBig, MessageSquareMore, Puzzle, Users } from "lucide-react"
import type { SettingsTab } from "@/ui/settings/settings-modal"
import type { RuntimeFeatureFlag, RuntimeNavigationItem } from "@/system/runtime-navigation"

/**
 * The only place where manifest route keys become User Web actions.
 * Runtime data can select and rename these entries, but it cannot add code or
 * invent a destination. Rail and Command Menu both consume this registry.
 */
export type NavigationIcon = ComponentType<SVGProps<SVGSVGElement>>

type NavigationRoute = ({ settingsTab: SettingsTab; href?: never } | { href: string; settingsTab?: never }) & {
  /** Stable visual contract; runtime manifests provide labels, not icon code. */
  icon: NavigationIcon
}

function PluginsIcon(props: SVGProps<SVGSVGElement>) {
  return createElement(
    "svg",
    { "data-slot": "plugins-icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, ...props },
    createElement("circle", { cx: 8, cy: 8, r: 2.5 }),
    createElement("circle", { cx: 16, cy: 8, r: 2.5 }),
    createElement("circle", { cx: 8, cy: 16, r: 2.5 }),
    createElement("circle", { cx: 16, cy: 16, r: 2.5 }),
  )
}

const RUNTIME_NAVIGATION_REGISTRY: Readonly<Record<string, NavigationRoute>> = {
  agent: { href: "/app/agents", icon: MessageSquareMore },
  // The rail's library is a product surface, not the account data-management
  // tab. Keeping the route direct prevents a catalog click from opening an
  // unrelated settings dialog and matches Manus' dedicated `/app/library`.
  library: { href: "/app/library", icon: LibraryBig },
  skills: { href: "/app/skills", icon: Puzzle },
  mcp: { href: "/app/plugins", icon: PluginsIcon },
  scheduled: { href: "/app/scheduled?tab=calendar", icon: Clock },
  credits: { settingsTab: "credits", icon: Coins },
  team: { settingsTab: "team", icon: Users },
}

export function isRuntimeNavigationEnabled(
  item: RuntimeNavigationItem,
  featureFlags: readonly RuntimeFeatureFlag[] | undefined,
): boolean {
  if (item.key === "chat" || item.key === "current-surface") return false
  if (!item.featureFlag) return true
  return featureFlags?.find((flag) => flag.key === item.featureFlag)?.enabled ?? true
}

export function registeredNavigationRoute(key: string): NavigationRoute | undefined {
  return RUNTIME_NAVIGATION_REGISTRY[key]
}

export function navigationIcon(key: string): NavigationIcon {
  return RUNTIME_NAVIGATION_REGISTRY[key]?.icon ?? MessageSquareMore
}
