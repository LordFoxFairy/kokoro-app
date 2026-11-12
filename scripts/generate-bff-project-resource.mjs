import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, realpathSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const sourcePath = join(root, "src/generated/bff-public-openapi.yaml")
const outputPath = join(root, "src/generated/bff-project-resource.ts")
const libraryOutputPath = join(root, "src/generated/bff-library-file-delete.ts")
const artifactOutputPath = join(root, "src/generated/bff-library-artifact-mutations.ts")
const websiteOutputPath = join(root, "src/generated/bff-project-websites.ts")
const provenance = {
  ownerCommit: "0a2c98ae6b16e48849c96ccd5fb87c1dcc2b6e97",
  sourceSha256: "737688c79fa4fad8216168656d0fe7e4131b496ef2b506e424dbff82d7dca2c8",
  openapiVersion: "28.37.0",
}
const names = ["ProjectResourceItem", "ProjectResourceItemResponse", "ProjectResourceDeletionResponse", "ErrorEnvelope"]

export function inspectBffProjectResourceContract(spec) {
  assert.equal(spec.info.version, provenance.openapiVersion, "Project resource version drift")
  const item = spec.paths["/v1/projects/{projectId}/resources/{asset_id}"]
  const download = spec.paths["/v1/projects/{projectId}/resources/{asset_id}/download"].get
  assert.equal(item.get.operationId, "getProjectResource")
  assert.equal(item.delete.operationId, "deleteProjectResource")
  assert.equal(item.delete["x-kokoro-permission"], "project.update")
  assert.equal(item.delete["x-kokoro-idempotency"], "required")
  assert.equal(download.operationId, "downloadProjectResource")
  assert.equal(download.responses[200].content["*/*"].schema.format, "binary")
  const maximumBytes = download.responses[200].headers["Content-Length"].schema.maximum
  assert.equal(maximumBytes, 1073741824)
  const schemas = spec.components.schemas
  for (const name of names) assert.ok(schemas[name], `Missing ${name}`)
  const assetId = item.parameters.find((parameter) => parameter.name === "asset_id").schema
  return { schemas, maximumBytes, assetId }
}

// Deliberately limited to the scalar/closed-object vocabulary consumed by this slice.
// Unsupported owner schema constructs fail generation instead of being weakened.
function renderSchema(schema, schemas, ancestry = [], aliases = {}) {
  if (schema.$ref) {
    const name = schema.$ref.replace("#/components/schemas/", "")
    assert.ok(schemas[name] && !ancestry.includes(name), `Unsupported schema reference ${schema.$ref}`)
    return aliases[name] ?? renderSchema(schemas[name], schemas, [...ancestry, name], aliases)
  }
  if (schema.const !== undefined) return `z.literal(${JSON.stringify(schema.const)})`
  if (schema.type === "object") {
    assert.equal(schema.additionalProperties, false, "Project resource objects must remain closed")
    const properties = Object.entries(schema.properties).map(([key, value]) => {
      const rendered = renderSchema(value, schemas, ancestry, aliases)
      return `${JSON.stringify(key)}: ${rendered}${schema.required.includes(key) ? "" : ".optional()"}`
    })
    return `z.object({ ${properties.join(", ")} }).strict()`
  }
  if (schema.type === "array") {
    let rendered = `z.array(${renderSchema(schema.items, schemas, ancestry, aliases)})`
    if (schema.maxItems !== undefined) rendered += `.max(${schema.maxItems})`
    if (schema.uniqueItems === true) rendered += ".refine(values => new Set(values).size === values.length, \"Duplicate entries\")"
    return rendered
  }
  if (schema.type === "boolean") return "z.boolean()"
  assert.equal(schema.type, "string", "Unsupported Project resource scalar")
  if (schema.enum !== undefined) {
    assert.ok(schema.enum.length > 0 && schema.enum.every((value) => typeof value === "string"), "Unsupported enum")
    assert.equal(Object.keys(schema).sort().join(","), "enum,type", "Unsupported enum constraint")
    return `z.enum(${JSON.stringify(schema.enum)})`
  }
  let rendered = "z.string()"
  if (schema.minLength !== undefined) rendered += `.min(${schema.minLength})`
  if (schema.maxLength !== undefined) rendered += `.max(${schema.maxLength})`
  if (schema.pattern !== undefined) rendered += `.regex(new RegExp(${JSON.stringify(schema.pattern)}, "u"))`
  if (schema.format !== undefined) {
    assert.equal(schema.format, "date-time", "Unsupported Project resource string format")
    rendered += ".datetime({ offset: true })"
  }
  if (schema["x-kokoro-utf8-byte-limit"] !== undefined) {
    const limit = schema["x-kokoro-utf8-byte-limit"]
    assert.ok(Number.isSafeInteger(limit) && limit > 0)
    rendered += `.refine(value => new TextEncoder().encode(value).byteLength <= ${limit}, "UTF-8 byte limit exceeded")`
  }
  if (schema["x-kokoro-decimal-maximum"] !== undefined) {
    const maximum = schema["x-kokoro-decimal-maximum"]
    assert.ok(typeof maximum === "string" && /^[1-9][0-9]*$/u.test(maximum) && Number.isSafeInteger(Number(maximum)) && schema.pattern)
    rendered += `.refine(value => Number(value) <= ${maximum}, "Decimal maximum exceeded")`
  }
  return rendered
}

export function renderBffProjectResourceArtifact({ schemas, maximumBytes, assetId }) {
  return `// Generated by scripts/generate-bff-project-resource.mjs. Do not edit.\nimport { z } from "zod"\n\nexport const BFF_PROJECT_RESOURCE_PROVENANCE = ${JSON.stringify(provenance, null, 2)} as const\nexport const BFF_PROJECT_RESOURCE_MAX_BYTES = ${maximumBytes}\nexport const projectResourceAssetIdSchema = ${renderSchema(assetId, schemas)}\n\n${names.map((name) => `export const ${name === "ErrorEnvelope" ? "projectResourceErrorEnvelope" : name[0].toLowerCase() + name.slice(1)}Schema = ${renderSchema(schemas[name], schemas)}\n`).join("\n")}\n`
}

function libraryDeleteOwnerRules(operation, schemas, baseError) {
  return Object.fromEntries(Object.entries(operation.responses).filter(([status]) => status !== "200").map(([status, response]) => {
    const parts = response.content["application/json"].schema.allOf
    assert.equal(parts.length, 2)
    assert.deepEqual(parts[0], baseError)
    const fields = parts[1].properties.error.properties
    const codes = fields.code.enum
    assert.ok(codes.length && codes.every((code) => schemas[baseError.$ref.split("/").at(-1)].properties.error.properties.code.enum.includes(code)))
    const retryable = fields.retryable?.const
    assert.ok(retryable === undefined || typeof retryable === "boolean")
    return [status, retryable === undefined ? { codes } : { codes, retryable }]
  }))
}

export function renderBffLibraryFileDeletionArtifact(spec) {
  const operation = spec.paths["/v1/library/files/{asset_id}"]?.delete
  assert.equal(operation?.operationId, "deleteLibraryFile")
  assert.equal(operation["x-kokoro-idempotency"], "required")
  assert.equal(operation["x-kokoro-permission"], "storage.library.delete")
  assert.equal(operation.requestBody, undefined)
  const [asset, key] = operation.parameters
  assert.equal(operation.parameters.length, 2)
  assert.deepEqual([asset.in, asset.name, asset.required], ["path", "asset_id", true])
  assert.deepEqual([key.in, key.name, key.required], ["header", "Idempotency-Key", true])

  const schemas = spec.components.schemas
  const responseSchema = operation.responses["200"].content["application/json"].schema
  assert.equal(responseSchema.$ref, "#/components/schemas/LibraryFileDeletionResponse")
  const baseError = { $ref: "#/components/schemas/LibraryFileDeletionError" }
  const statusRules = libraryDeleteOwnerRules(operation, schemas, baseError)
  return `// Generated by scripts/generate-bff-project-resource.mjs. Do not edit.
import { z } from "zod"

export const BFF_LIBRARY_FILE_DELETE_PROVENANCE = ${JSON.stringify(provenance, null, 2)} as const
export const libraryFileAssetIdSchema = ${renderSchema(asset.schema, schemas)}
export const libraryFileDeleteKeySchema = ${renderSchema(key.schema, schemas)}
export const libraryFileDeleteResponseSchema = ${renderSchema(responseSchema, schemas)}
export const libraryFileDeleteErrorSchema = ${renderSchema(baseError, schemas)}

const ownerErrors: Readonly<Partial<Record<number, { codes: readonly string[]; retryable?: boolean }>>> = ${JSON.stringify(statusRules, null, 2)}

export function isLibraryFileDeleteOwnerError(status: number, code: string, retryable: boolean): boolean {
  const rule = ownerErrors[status]
  return rule !== undefined && rule.codes.includes(code) && (rule.retryable === undefined || rule.retryable === retryable)
}
`
}

export function renderBffLibraryArtifactMutations(spec) {
  const path = "/v1/library/artifacts/{conversation_id}/{artifact_id}"
  const retirement = spec.paths[path]?.delete
  const favorite = spec.paths[path + "/favorite"]?.put
  assert.equal(retirement?.operationId, "deleteLibraryArtifact")
  assert.equal(retirement["x-kokoro-idempotency"], "required")
  assert.equal(retirement.requestBody, undefined)
  assert.equal(favorite?.operationId, "setLibraryArtifactFavorite")
  assert.equal(favorite["x-kokoro-idempotency"], "natural")
  assert.equal(favorite.requestBody.required, true)
  const [conversation, artifact, key] = retirement.parameters
  assert.equal(retirement.parameters.length, 3)
  assert.deepEqual(retirement.parameters.map(({ in: kind, name, required }) => [kind, name, required]), [
    ["path", "conversation_id", true], ["path", "artifact_id", true], ["header", "Idempotency-Key", true],
  ])
  assert.deepEqual(favorite.parameters, [conversation, artifact])
  const schemas = spec.components.schemas
  const deleteAck = retirement.responses["200"].content["application/json"].schema
  const favoriteAck = favorite.responses["200"].content["application/json"].schema
  const favoriteInput = favorite.requestBody.content["application/json"].schema
  const error = { $ref: "#/components/schemas/LibraryArtifactDeletionError" }
  const statusRules = libraryDeleteOwnerRules(retirement, schemas, error)
  return `// Generated by scripts/generate-bff-project-resource.mjs. Do not edit.
import { z } from "zod"

export const BFF_LIBRARY_ARTIFACT_MUTATION_PROVENANCE = ${JSON.stringify(provenance, null, 2)} as const
export const libraryArtifactConversationIdSchema = ${renderSchema(conversation.schema, schemas)}
export const libraryArtifactIdSchema = ${renderSchema(artifact.schema, schemas)}
export const libraryArtifactDeleteKeySchema = ${renderSchema(key.schema, schemas)}
export const libraryArtifactDeleteResponseSchema = ${renderSchema(deleteAck, schemas)}
export const libraryArtifactDeleteErrorSchema = ${renderSchema(error, schemas)}
export const libraryArtifactFavoriteRequestSchema = ${renderSchema(favoriteInput, schemas)}
export const libraryArtifactFavoriteResponseSchema = ${renderSchema(favoriteAck, schemas)}

const ownerErrors: Readonly<Partial<Record<number, { codes: readonly string[]; retryable?: boolean }>>> = ${JSON.stringify(statusRules, null, 2)}

export function isLibraryArtifactDeleteOwnerError(status: number, code: string, retryable: boolean): boolean {
  const rule = ownerErrors[status]
  return rule !== undefined && rule.codes.includes(code) && (rule.retryable === undefined || rule.retryable === retryable)
}
`
}

export function renderBffProjectWebsitesArtifact(spec, source = provenance) {
  assert.equal(spec.info.version, source.openapiVersion, "Project websites version drift")
  const path = spec.paths["/v1/projects/{project_id}/websites"]
  const schemas = spec.components.schemas
  assert.equal(path.get.operationId, "getProjectWebsites")
  assert.equal(path.get["x-kokoro-permission"], "project.read")
  assert.equal(path.get.requestBody, undefined)
  assert.equal(path.put.operationId, "replaceProjectWebsites")
  assert.equal(path.put["x-kokoro-permission"], "project.update")
  assert.equal(path.put["x-kokoro-idempotency"], "natural")
  assert.equal(path.put.requestBody.required, true)
  assert.match(path.put.description, /at most 65536 bytes/u)
  assert.deepEqual(path.parameters, [{
    name: "project_id", in: "path", required: true,
    schema: { $ref: "#/components/schemas/ProjectWebsitesProjectId" },
  }])
  const put = path.put.requestBody.content["application/json"].schema
  assert.equal(put.$ref, "#/components/schemas/ReplaceProjectWebsitesRequest")
  const response = path.get.responses["200"].$ref
  assert.equal(response, "#/components/responses/ProjectWebsitesSuccess")
  assert.equal(path.put.responses["200"].$ref, response)
  const ack = spec.components.responses.ProjectWebsitesSuccess.content["application/json"].schema
  assert.equal(ack.$ref, "#/components/schemas/ProjectWebsitesResponse")
  const urls = schemas.ProjectWebsiteUrls
  const aliases = {
    ProjectWebsitesProjectId: "projectWebsitesProjectIdSchema",
    ProjectWebsitesStateVersion: "projectWebsitesStateVersionSchema",
    ProjectWebsiteUrls: "projectWebsiteUrlsSchema",
  }
  assert.equal(urls.uniqueItems, true)
  assert.equal(urls.maxItems, 16)
  assert.equal(urls.items["x-kokoro-utf8-byte-limit"], 2048)
  return `// Generated by scripts/generate-bff-project-resource.mjs. Do not edit.
import { z } from "zod"

export const BFF_PROJECT_WEBSITES_PROVENANCE = ${JSON.stringify(source, null, 2)} as const
export const PROJECT_WEBSITE_URL_LIMIT = ${urls.maxItems}
export const PROJECT_WEBSITE_URL_MAX_BYTES = ${urls.items["x-kokoro-utf8-byte-limit"]}
export const PROJECT_WEBSITES_BODY_LIMIT = 65536
export const projectWebsitesProjectIdSchema = ${renderSchema(schemas.ProjectWebsitesProjectId, schemas)}
export const projectWebsitesStateVersionSchema = ${renderSchema(schemas.ProjectWebsitesStateVersion, schemas)}
export const projectWebsiteUrlsSchema = ${renderSchema(urls, schemas)}
export const replaceProjectWebsitesRequestSchema = ${renderSchema(put, schemas, [], aliases)}
export const projectWebsitesResponseSchema = ${renderSchema(ack, schemas, [], aliases)}
export type ProjectWebsitesState = z.infer<typeof projectWebsitesResponseSchema>["data"]
`
}

async function main() {
  const mode = process.argv[2]
  assert.ok(mode === "--write" || mode === "--check", "expected --write or --check")
  const bytes = await readFile(sourcePath)
  assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.sourceSha256, "BFF Project resource owner digest drift")
  const spec = YAML.parse(bytes.toString("utf8"))
  const rendered = renderBffProjectResourceArtifact(inspectBffProjectResourceContract(spec))
  const library = renderBffLibraryFileDeletionArtifact(spec)
  const artifact = renderBffLibraryArtifactMutations(spec)
  const websites = renderBffProjectWebsitesArtifact(spec)
  if (mode === "--write") {
    await writeFile(outputPath, rendered)
    await writeFile(libraryOutputPath, library)
    await writeFile(artifactOutputPath, artifact)
    await writeFile(websiteOutputPath, websites)
  } else {
    assert.equal(await readFile(outputPath, "utf8"), rendered, "Generated Project resource decoder drift")
    assert.equal(await readFile(libraryOutputPath, "utf8"), library, "Generated Library deletion decoder drift")
    assert.equal(await readFile(artifactOutputPath, "utf8"), artifact, "Generated Artifact mutation decoder drift")
    assert.equal(await readFile(websiteOutputPath, "utf8"), websites, "Generated Project websites decoder drift")
  }
  process.stdout.write(`BFF resource artifacts ${mode.slice(2)} passed\n`)
}
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) await main()
