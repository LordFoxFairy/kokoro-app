import { DEFAULT_BRAND } from "@/config/brand"

export type RuntimeFeatureFlag = { key: string; enabled: boolean }

export type PreviewRuntimeManifest = {
  brand: { name: string; mark: string; logoUrl?: string }
  navigation: { key: string; label: string; icon: string; href?: string; featureFlag?: string }[]
  capabilities: { key: string; label: string; description: string }[]
  locale: string
  theme?: Record<string, string>
  featureFlags?: RuntimeFeatureFlag[]
  configVersion?: string
  digest?: string
}

export const PREVIEW_RUNTIME_MANIFEST: PreviewRuntimeManifest = {
  brand: DEFAULT_BRAND,
  navigation: [
    { key: "chat", label: "Chat", icon: "⌁" },
    { key: "library", label: "Library", icon: "▦" },
    { key: "skills", label: "Skills", icon: "✦" },
  ],
  capabilities: [
    { key: "research", label: "Research", description: "Search, compare and synthesize sources." },
    { key: "create", label: "Create", description: "Turn an idea into a polished deliverable." },
    { key: "automate", label: "Automate", description: "Build a repeatable workflow around your task." },
  ],
  locale: "en-US",
  theme: {},
  featureFlags: [],
  configVersion: "fixture",
  digest: "fixture",
}
