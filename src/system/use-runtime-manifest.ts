"use client"

import { useCallback, useEffect, useState } from "react"

import { PREVIEW_RUNTIME_MANIFEST, type PreviewRuntimeManifest, type RuntimeFeatureFlag } from "./preview-runtime"
import { publicRuntimeManifestSchema } from "./runtime-manifest"

function navigationItems(input: readonly unknown[]): PreviewRuntimeManifest["navigation"] {
  const items = input.flatMap((value) => Array.isArray(value) ? value : [value]).flatMap((value, index) => {
    if (typeof value !== "object" || value === null) return []
    const item = value as Record<string, unknown>
    const key = typeof item.key === "string" ? item.key : typeof item.id === "string" ? item.id : `item-${index}`
    const label = typeof item.label === "string" ? item.label : typeof item.title === "string" ? item.title : null
    if (!label || item.enabled === false || item.visible === false) return []
    const candidateHref = typeof item.href === "string"
      ? item.href
      : typeof item.route === "string"
        ? item.route
        : typeof item.path === "string"
          ? item.path
          : undefined
    // Runtime navigation is tenant-controlled presentation data, not a second
    // redirect mechanism. Reject protocol-relative URLs (`//host`) so a site
    // manifest cannot turn a same-origin nav item into an external redirect.
    const href = candidateHref?.startsWith("/") && !candidateHref.startsWith("//") ? candidateHref : undefined
    if (candidateHref !== undefined && href === undefined) return []
    const featureFlag = typeof item.featureFlag === "string" ? item.featureFlag : undefined
    // href is validated only to reject unsafe config; the browser projection
    // intentionally drops it because navigation is resolved by routeKey.
    return [{ key, label, icon: typeof item.icon === "string" ? item.icon : "•", ...(featureFlag ? { featureFlag } : {}) }]
  })
  // Empty live configuration is meaningful: do not silently reintroduce the
  // Kokoro fixture menu into another site's tenant surface. Preview starts
  // from PREVIEW_RUNTIME_MANIFEST before this projection runs.
  return items
}

function cssThemeValue(value: unknown): value is string {
  // CSS custom properties are intentionally a narrow data boundary. Permit
  // colors, lengths and font stacks, but never accept declaration separators
  // or block delimiters from a tenant manifest.
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= 256
    && !/[;{}]/u.test(value)
}

function cssTheme(input: Readonly<Record<string, unknown>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => THEME_TOKENS.has(key) && cssThemeValue(value)),
  ) as Record<string, string>
}

function brandLogoUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined
  // A leading double slash is protocol-relative and therefore external in a
  // browser; only accept a same-origin absolute path for tenant logos.
  if (value.startsWith("/") && !value.startsWith("//")) return value
  try {
    return new URL(value).protocol === "https:" ? value : undefined
  } catch {
    return undefined
  }
}

function brandText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  return trimmed.slice(0, maxLength)
}

function featureFlags(input: readonly unknown[]): RuntimeFeatureFlag[] {
  return input.flatMap((value) => Array.isArray(value) ? value : [value]).flatMap((value) => {
    if (typeof value === "string") return [{ key: value, enabled: true }]
    if (typeof value !== "object" || value === null) return []
    const flag = value as Record<string, unknown>
    const key = typeof flag.key === "string" ? flag.key : typeof flag.name === "string" ? flag.name : null
    if (!key) return []
    return [{ key, enabled: flag.enabled !== false }]
  })
}

function capabilities(input: readonly unknown[]): PreviewRuntimeManifest["capabilities"] {
  const values = input.flatMap((value) => Array.isArray(value) ? value : [value]).flatMap((value) => {
    if (typeof value !== "object" || value === null) return []
    const record = value as Record<string, unknown>
    return Array.isArray(record.capabilities) ? record.capabilities : [record]
  })
  const items = values.flatMap((value) => {
    if (typeof value !== "object" || value === null) return []
    const record = value as Record<string, unknown>
    const key = typeof record.key === "string" ? record.key : typeof record.id === "string" ? record.id : null
    const label = typeof record.label === "string" ? record.label : typeof record.name === "string" ? record.name : typeof record.title === "string" ? record.title : null
    const description = typeof record.description === "string" ? record.description : ""
    return key && label ? [{ key, label, description }] : []
  })
  // Runtime references are site-owned. An empty list means the site has not
  // published capability cards, not that Kokoro's cards should leak into it.
  return items
}

export type RuntimeManifestSource = "loading" | "live" | "preview" | "error"

const THEME_TOKENS = new Set([
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground",
  "muted", "muted-foreground", "accent", "accent-foreground", "destructive",
  "destructive-foreground", "border", "input", "ring", "radius", "fontSans", "fontSerif",
])

// Runtime manifest uses the cross-package camelCase contract for typography;
// CSS Modules consume the existing shadcn variable names.
const THEME_CSS_VARIABLES: Readonly<Record<string, string>> = {
  fontSans: "--font-geist-sans",
  fontSerif: "--font-serif",
}

function mergeManifest(input: unknown): PreviewRuntimeManifest | null {
  const parsed = publicRuntimeManifestSchema.safeParse(input)
  if (!parsed.success) return null

  const name = brandText(parsed.data.data.theme.brandName, 120)
  const mark = brandText(parsed.data.data.theme.brandMark, 8)
  const logoUrl = brandLogoUrl(parsed.data.data.theme.brandLogoUrl)

  return {
    ...PREVIEW_RUNTIME_MANIFEST,
    brand: {
      name: name ?? PREVIEW_RUNTIME_MANIFEST.brand.name,
      mark: mark ?? PREVIEW_RUNTIME_MANIFEST.brand.mark,
      ...(logoUrl ? { logoUrl } : {}),
    },
    locale: parsed.data.data.locale,
    navigation: navigationItems(parsed.data.data.navigation),
    capabilities: capabilities(parsed.data.data.references),
    theme: cssTheme(parsed.data.data.theme),
    featureFlags: featureFlags(parsed.data.data.featureFlags),
    configVersion: parsed.data.data.configVersion,
    digest: parsed.data.data.digest,
  }
}

export function useRuntimeManifest(options: { preview?: boolean } = {}): {
  manifest: PreviewRuntimeManifest
  source: RuntimeManifestSource
  retry: () => void
  retrying: boolean
} {
  // Local/test fixtures opt into the same deterministic manifest without
  // requiring a backend service. An explicit prop still wins for AppGate,
  // which switches from preview to live after the session probe succeeds.
  const preview = options.preview ?? (
    process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SESSION_PREVIEW === "1"
  )
  const [manifest, setManifest] = useState(PREVIEW_RUNTIME_MANIFEST)
  const [source, setSource] = useState<RuntimeManifestSource>(preview ? "preview" : "loading")
  const [attempt, setAttempt] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const retry = useCallback(() => {
    setRetrying(true)
    setSource("loading")
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    if (preview) return
    // Keep the document language aligned with the tenant/product runtime
    // without exposing tenant identity or requiring a second config channel.
    document.documentElement.lang = manifest.locale
  }, [manifest.locale, preview])

  useEffect(() => {
    document.title = `${manifest.brand.name} Web`
  }, [manifest.brand.name])

  useEffect(() => {
    // Apply the same skin to marketing, login and workspace surfaces. Only the
    // small allow-list above is accepted as a CSS variable boundary.
    const applied: string[] = []
    for (const [key, value] of Object.entries(manifest.theme ?? {})) {
      if (THEME_TOKENS.has(key) && value) {
        const variable = THEME_CSS_VARIABLES[key] ?? `--${key}`
        document.documentElement.style.setProperty(variable, value)
        applied.push(variable)
      }
    }
    return () => {
      for (const variable of applied) document.documentElement.style.removeProperty(variable)
    }
  }, [manifest.theme])

  useEffect(() => {
    if (preview) return
    const controller = new AbortController()

    const locale = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US"
    const query = new URLSearchParams({ product_id: "kokoro", locale, surface_id: "user-web" })
    void Promise.resolve().then(() => fetch(`/api/system/runtime-manifest?${query.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }))
      .then(async (response) => {
        if (!response.ok) throw new Error(`runtime manifest ${response.status}`)
        return response.json() as Promise<unknown>
      })
      .then((payload) => {
        const next = mergeManifest(payload)
        if (!next) throw new Error("invalid runtime manifest")
        setManifest(next)
        setSource("live")
        setRetrying(false)
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === "AbortError") return
        // A live tenant must never be presented as a fixture after a backend
        // failure. The preview transport is opt-in and never silently replaces
        // a failed live tenant manifest.
        setSource("error")
        setRetrying(false)
      })

    return () => controller.abort()
  }, [attempt, preview])

  // Preview can be the first render while the session probe is undecided. When
  // authentication switches this hook to live mode, project the stale preview
  // source as loading until the tenant manifest resolves. This avoids painting
  // mock navigation/theme for one frame without a state update inside an effect.
  const visibleSource: RuntimeManifestSource = preview
    ? "preview"
    : source === "preview"
      ? "loading"
      : source

  return { manifest, source: visibleSource, retry, retrying }
}
