import { z } from "zod"

export const runtimeManifestSchema = z.object({
  data: z.object({
    tenantId: z.string().min(1),
    productId: z.string().min(1),
    locale: z.string().min(1),
    navigation: z.array(z.unknown()),
    localeNamespaces: z.array(z.unknown()),
    theme: z.record(z.string(), z.unknown()).default({}),
    featureFlags: z.array(z.unknown()),
    references: z.array(z.unknown()),
    configVersion: z.string().min(1),
    releaseId: z.string().nullable(),
    digest: z.string().min(1),
  }),
})

// BFF transport is the canonical snake_case HTTP boundary. Keep the browser
// model camelCase, but make the conversion explicit at this repository edge.
export const bffRuntimeManifestSchema = z.object({
  tenant_id: z.string().min(1),
  product_id: z.string().min(1),
  locale: z.string().min(1),
  navigation: z.array(z.unknown()),
  locale_namespaces: z.array(z.unknown()),
  theme: z.record(z.string(), z.unknown()).default({}),
  feature_flags: z.array(z.unknown()),
  references: z.array(z.unknown()),
  config_version: z.string().min(1),
  release_id: z.string().nullable(),
  digest: z.string().min(1),
})

export const publicRuntimeManifestSchema = z.object({
  data: z.object({
    productId: z.string().min(1),
    locale: z.string().min(1),
    navigation: z.array(z.unknown()),
    localeNamespaces: z.array(z.unknown()),
    theme: z.record(z.string(), z.unknown()).default({}),
    featureFlags: z.array(z.unknown()),
    references: z.array(z.unknown()),
    configVersion: z.string().min(1),
    releaseId: z.string().nullable(),
    digest: z.string().min(1),
  }),
})

export type RuntimeManifest = z.infer<typeof runtimeManifestSchema>["data"]

export type BffRuntimeManifest = z.infer<typeof bffRuntimeManifestSchema>

export function fromBffRuntimeManifest(manifest: BffRuntimeManifest): RuntimeManifest {
  return {
    tenantId: manifest.tenant_id,
    productId: manifest.product_id,
    locale: manifest.locale,
    navigation: manifest.navigation,
    localeNamespaces: manifest.locale_namespaces,
    theme: manifest.theme,
    featureFlags: manifest.feature_flags,
    references: manifest.references,
    configVersion: manifest.config_version,
    releaseId: manifest.release_id,
    digest: manifest.digest,
  }
}

// tenantId 只存在于服务端请求上下文，BFF 返回浏览器前先移除。
export type PublicRuntimeManifest = Omit<RuntimeManifest, "tenantId">

export function toPublicRuntimeManifest(manifest: RuntimeManifest): PublicRuntimeManifest {
  const publicManifest = { ...manifest } as Partial<RuntimeManifest>
  delete publicManifest.tenantId
  return publicManifest as PublicRuntimeManifest
}
