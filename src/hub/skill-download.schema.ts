import { z } from "zod"
import { downloadMetadataResponseSchema, skillDownloadErrorSchemas, type skillDownloadPolicy } from "@/generated/bff-project-skill-content"

// Same owner qualification; byte transport is separately qualified by its own operation.
const data = downloadMetadataResponseSchema.shape.data
export const skillDownloadSchema = data.extend({
  revision: data.shape.revision.refine(v => BigInt(v) <= BigInt("18446744073709551615")),
  download_info: data.shape.download_info.extend({ filename: data.shape.download_info.shape.filename.refine(value => !/[\\/\u0000-\u001f\u007f]/u.test(value)) }),
})
export type SkillDownload = z.infer<typeof skillDownloadSchema>
export type SkillDownloadQualifier = typeof skillDownloadPolicy.operations[number]["qualifier"]
export function skillDownloadErrorAllowed(status: number, code: string, qualifier: SkillDownloadQualifier = "installation"): boolean {
  return skillDownloadErrorSchemas.some(item => item.qualifier === qualifier && item.status === status && item.schema.shape.error.shape.code.safeParse(code).success)
}
export function skillDownloadErrorEnvelopeAllowed(qualifier: SkillDownloadQualifier, status: number, value: unknown): boolean {
  return skillDownloadErrorSchemas.some(item => item.qualifier === qualifier && item.status === status && item.schema.safeParse(value).success)
}
