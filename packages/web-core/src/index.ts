/** Cross-product contracts. This package has no React, CSS, network, or product dependency. */

export type ResourceState<T> =
  | { status: "idle" }
  | { status: "loading"; previous?: T }
  | { status: "ready"; data: T; receivedAt: number }
  | { status: "empty"; receivedAt: number }
  | { status: "error"; code: string; requestId?: string; retryable: boolean; previous?: T }

export type ActionState =
  | { status: "idle" }
  | { status: "pending"; commandId: string }
  | { status: "success"; commandId: string; completedAt: number }
  | { status: "error"; commandId: string; code: string; requestId?: string; retryable: boolean }

export type ThemeTokens = {
  background: string
  foreground: string
  card: string
  popover: string
  primary: string
  primaryForeground: string
  secondary: string
  muted: string
  mutedForeground: string
  accent: string
  border: string
  input: string
  ring: string
  destructive: string
  destructiveForeground: string
  radius: string
  fontSans?: string
  fontSerif?: string
}

export type NavigationItem = {
  routeKey: string
  labelKey: string
  iconKey: string
  capabilityKey?: string
  featureFlagKey?: string
  order: number
}

export type RuntimeManifest = {
  productId: string
  locale: string
  navigation: NavigationItem[]
  theme: Partial<ThemeTokens>
  featureFlags: ReadonlyArray<{ key: string; enabled: boolean }>
  configVersion: string
  releaseId: string | null
  digest: string
}

export function isResourceReady<T>(state: ResourceState<T>): state is Extract<ResourceState<T>, { status: "ready" }> {
  return state.status === "ready"
}
