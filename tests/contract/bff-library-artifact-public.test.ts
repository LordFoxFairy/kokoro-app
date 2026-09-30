import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { expect, it } from "vitest"
import YAML from "yaml"

const SNAPSHOT = resolve(process.cwd(), "src/generated/bff-public-openapi.yaml")
const OWNER_COMMIT = "571b51de2057905c74c78ac966c8cf5ac11eca93"
const OWNER_SHA256 = "f49023882315a4f46e46e95595a02eaa7bb85475d5f46d2b945bc0555edb0c90"

it("pins the BFF Artifact Product page, binary and two-part selector", async () => {
  const bytes = await readFile(SNAPSHOT)
  expect(OWNER_COMMIT).toBe("571b51de2057905c74c78ac966c8cf5ac11eca93")
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(OWNER_SHA256)
  const spec = YAML.parse(bytes.toString()) as {
    paths: Record<string, Record<string, Record<string, unknown>>>
    components: { schemas: Record<string, Record<string, unknown>> }
  }
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
