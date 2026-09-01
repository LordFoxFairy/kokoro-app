"use client"

import { useLayoutEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"

import { AppFrame, type AppFrameProps } from "@/components/blocks/app-frame/app-frame"
import type { RuntimeNavigationItem } from "@/system/runtime-navigation"
import { useT } from "@/i18n/context"
import { KokoroProjectWorkspace } from "./kokoro-project-workspace"
import { KokoroDirectChatWelcome } from "./kokoro-welcome"
import { KokoroCommandMenu } from "./kokoro-command-menu"
import { KokoroPluginsSurface } from "./kokoro-plugins-surface"
import { KokoroAgentsSurface } from "./kokoro-agents-surface"
import { KokoroScheduledSurface } from "./kokoro-scheduled-surface"
import { KokoroLibrarySurface } from "./kokoro-library-surface"
import { KokoroSkillsSurface } from "./kokoro-skills-surface"
import { DEFAULT_BRAND } from "@/config/brand"

export type KokoroAppSurfaceProps = Omit<AppFrameProps, "chatHref"> & {
  /** The adapter owns preview/live route selection; callers do not repeat it. */
  chatHref?: string
}

export type KokoroAppRoute = {
  surface: "chat" | "project" | "plugins" | "agents" | "scheduled" | "library" | "skills"
  projectRef?: string
}
const DIRECT_ROUTE: KokoroAppRoute = { surface: "chat" }
type NativeSurfaceNavigation = { basePathname: string; pathname: string }

function decodeProjectRef(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment)
    return decoded.length > 0 ? decoded : null
  } catch {
    // A malformed encoded segment is not a valid project route. Let the
    // caller fall back to direct chat instead of passing an undecodable value
    // into the session and project BFF clients.
    return null
  }
}

/**
 * Keep pathname selection pure and independently testable. Query/hash state
 * belongs to the selected surface (for example `tab=calendar` and settings),
 * while this function only decides which stable AppFrame projection mounts.
 */
export function kokoroAppRoute(pathname: string): KokoroAppRoute {
  const projectRefSegment = /^\/app\/project\/([^/]+)\/?$/.exec(pathname)?.[1]
  const projectRef = projectRefSegment === undefined ? null : decodeProjectRef(projectRefSegment)
  if (projectRef) return { surface: "project", projectRef }
  if (/^\/app\/agents\/?$/.test(pathname)) return { surface: "agents" }
  if (/^\/app\/plugins\/?$/.test(pathname)) return { surface: "plugins" }
  if (/^\/app\/scheduled\/?$/.test(pathname)) return { surface: "scheduled" }
  if (/^\/app\/library\/?$/.test(pathname)) return { surface: "library" }
  if (/^\/app\/skills\/?$/.test(pathname)) return { surface: "skills" }
  return DIRECT_ROUTE
}

/**
 * The Kokoro product surface. It is intentionally product-owned:
 * another product can keep the same data/core packages and choose another surface
 * without inheriting Kokoro's information architecture.
 */
export function KokoroAppSurface(props: KokoroAppSurfaceProps) {
  // This state must follow App Router navigation. A direct conversation and a
  // project task use distinct engines, list scopes, and primary actions.
  const pathname = usePathname()
  const [nativeNavigation, setNativeNavigation] = useState<NativeSurfaceNavigation | null>(null)
  // Bind before the first painted frame. The rail is intentionally interactive
  // immediately after hydration; using a passive effect left a small window
  // where a fast click on “New task” could update history without updating the
  // mounted surface, making the action appear to do nothing.
  useLayoutEffect(() => {
    const syncSurfacePathname = () => setNativeNavigation({ basePathname: pathname, pathname: window.location.pathname })
    window.addEventListener("popstate", syncSurfacePathname)
    window.addEventListener("kokoro:surface-navigation", syncSurfacePathname)
    return () => {
      window.removeEventListener("popstate", syncSurfacePathname)
      window.removeEventListener("kokoro:surface-navigation", syncSurfacePathname)
    }
  }, [pathname])
  const t = useT()
  // Next's native history integration updates the address bar immediately, but
  // the App Router pathname can remain on the current RSC tree because these
  // route pages are intentionally empty shells. Use the event projection only
  // while the router still reports the pre-navigation pathname; a later
  // router.push automatically takes precedence without a reset effect.
  const surfacePathname = nativeNavigation?.basePathname === pathname
    ? nativeNavigation.pathname
    : pathname
  const route = kokoroAppRoute(surfacePathname)
  const standaloneSurface = route.surface === "agents"
    || route.surface === "plugins"
    || route.surface === "scheduled"
    || route.surface === "library"
    || route.surface === "skills"
  const previewNavigation = useMemo<readonly RuntimeNavigationItem[]>(() => [
    { key: "agent", label: t("rail.navAgent"), icon: "agent" },
    { key: "skills", label: t("rail.navSkills"), icon: "skills" },
    { key: "mcp", label: t("rail.navPlugins"), icon: "plugins" },
    { key: "scheduled", label: t("rail.navScheduled"), icon: "scheduled" },
    { key: "library", label: t("rail.navDatabase"), icon: "library" },
  ], [t])
  return (
    <AppFrame
      {...props}
      brandName={props.brandName ?? DEFAULT_BRAND.name}
      // `/app` is the canonical User Web route in both live and local preview
      // modes. Preview changes the transport, not the product URL.
      chatHref={props.chatHref ?? "/app"}
      // Preview owns the same navigation rhythm as the reference workbench;
      // an explicitly supplied live manifest always wins, including `[]`.
      navigation={props.navigation ?? previewNavigation}
      // Direct chat and project workbench have different initial compositions
      // in the reference: the inbox opens on the quiet 52px command rail,
      // while a project opens with its scoped navigation visible. This is not
      // a viewport guess; the same controlled rail can still be toggled and
      // persisted by the user, and the compact-desktop breakpoint below takes
      // care of narrowing the canvas without moving the icons through the
      // middle of the rail.
      desktopRailCollapsed={props.desktopRailCollapsed ?? route.surface !== "project"}
      projectWorkspace={route.surface === "project"}
      projectRef={route.projectRef}
      scheduledTaskClient={props.scheduledTaskClient}
      activeNavigationKey={route.surface === "chat" ? "chat" : route.surface === "project" ? "project" : route.surface === "agents" ? "agent" : route.surface === "plugins" ? "mcp" : route.surface}
      emptyState={route.surface === "agents" ? KokoroAgentsSurface : route.surface === "plugins" ? KokoroPluginsSurface : route.surface === "scheduled" ? KokoroScheduledSurface : route.surface === "library" ? KokoroLibrarySurface : route.surface === "skills" ? KokoroSkillsSurface : route.surface === "project" ? KokoroProjectWorkspace : KokoroDirectChatWelcome}
      hideWorkspaceHeader={route.surface === "plugins" || route.surface === "agents" || route.surface === "scheduled" || route.surface === "library" || route.surface === "skills"}
      // A direct chat is a standalone conversation. A project is a workspace:
      // its Composer creates a scoped task while context modules stay beside
      // the task list. The shared frame still owns draft and transport state.
      emptyStateOwnsComposer
      standaloneSurface={standaloneSurface}
      commandMenu={KokoroCommandMenu}
    />
  )
}
