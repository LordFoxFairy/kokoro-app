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

// tenantId 只存在于服务端请求上下文，BFF 返回浏览器前先移除。
export type PublicRuntimeManifest = Omit<RuntimeManifest, "tenantId">

export function toPublicRuntimeManifest(manifest: RuntimeManifest): PublicRuntimeManifest {
  const publicManifest = { ...manifest } as Partial<RuntimeManifest>
  delete publicManifest.tenantId
  return publicManifest as PublicRuntimeManifest
}
