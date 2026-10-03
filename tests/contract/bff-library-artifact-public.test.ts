import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { expect, it } from "vitest"
import YAML from "yaml"

const SNAPSHOT = resolve(process.cwd(), "src/generated/bff-public-openapi.yaml")
const OWNER_COMMIT = "a68cbe55cde709f9b21f3d5803bfbd3ca5d14e2b"
const OWNER_SHA256 = "76d524d731b10d1cd4b16db4dae957701bf5c5d82a3cd915a42bc57617746ebe"
const OWNER_VERSION = "7.0.0"

it("pins the BFF Artifact Product page, binary and two-part selector", async () => {
  const bytes = await readFile(SNAPSHOT)
  expect(OWNER_COMMIT).toBe("a68cbe55cde709f9b21f3d5803bfbd3ca5d14e2b")
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(OWNER_SHA256)
  const spec = YAML.parse(bytes.toString()) as {
    info: { version: string }
    paths: Record<string, Record<string, Record<string, unknown>>>
    components: { schemas: Record<string, Record<string, unknown>> }
  }
  expect(spec.info.version).toBe(OWNER_VERSION)
  const list = spec.paths["/v1/library"]?.get
  expect(list?.operationId).toBe("listLibrary")
  expect(list?.parameters).toContainEqual(expect.objectContaining({ name: "kind", required: true, schema: { type: "string", enum: ["file", "artifact"] } }))
  expect(spec.components.schemas.LibraryListResponse).toMatchObject({
    properties: { data: { oneOf: [
      { $ref: "#/components/schemas/LibraryEmptyPage" },
      { $ref: "#/components/schemas/LibraryFilePage" },
      { $ref: "#/components/schemas/LibraryArtifactPage" },
    ] } },
  })
  expect(spec.components.schemas.LibraryEmptyPage).toMatchObject({ properties: { items: { maxItems: 0 }, next_cursor: { type: ["string", "null"] } } })
  expect(spec.components.schemas.LibraryArtifactPage).toMatchObject({ properties: { items: { minItems: 1, items: { $ref: "#/components/schemas/LibraryArtifactItem" } } } })
  const detail = spec.paths["/v1/library/artifacts/{conversation_id}/{artifact_id}"]?.get
  const content = spec.paths["/v1/library/artifacts/{conversation_id}/{artifact_id}/content"]?.get
  expect(detail?.operationId).toBe("getLibraryArtifact")
  expect(content?.operationId).toBe("downloadLibraryArtifact")
  expect(content?.parameters).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "conversation_id", in: "path", required: true }),
    expect.objectContaining({ name: "artifact_id", in: "path", required: true }),
  ]))
  expect(content?.responses).toHaveProperty("200.headers.Content-Length.schema.maximum", 1_073_741_824)
  expect(content?.responses).toHaveProperty("200.headers.Referrer-Policy.schema.const", "no-referrer")
  expect(content?.responses).toHaveProperty("200.content.*/*.schema.format", "binary")
})
