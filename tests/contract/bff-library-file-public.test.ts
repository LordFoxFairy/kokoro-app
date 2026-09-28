import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { expect, it } from "vitest"
import YAML from "yaml"

const SNAPSHOT = resolve(process.cwd(), "src/generated/bff-public-openapi.yaml")
const OWNER_COMMIT = "a67ae2d06b52202f349305ae3723f6e296c087a1"
const OWNER_SHA256 = "82df2303f9f86e9b4caa4b5965f930735740d8c044c955450e45406dc29cabb9"

it("pins the BFF owner Library file operation and distinct Asset wire", async () => {
  const bytes = await readFile(SNAPSHOT)
  expect(OWNER_COMMIT).toHaveLength(40)
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(OWNER_SHA256)
  const spec = YAML.parse(bytes.toString()) as {
    paths: Record<string, Record<string, unknown>>
    components: { schemas: Record<string, unknown> }
  }
  const get = spec.paths["/v1/library"]?.get as {
    operationId: string
    parameters: Array<{ name: string; required?: boolean; schema: Record<string, unknown> }>
    responses: Record<string, { content?: { "application/json": { schema: { $ref: string } } } }>
  }
  expect(get.operationId).toBe("listLibrary")
  expect(get.parameters.find((parameter) => parameter.name === "kind")).toMatchObject({ required: true, schema: { enum: ["file"] } })
  expect(get.parameters.find((parameter) => parameter.name === "limit")?.schema).toMatchObject({ minimum: 1, maximum: 100, default: 50 })
  expect(get.responses["200"]?.content?.["application/json"].schema.$ref).toBe("#/components/schemas/LibraryFileListResponse")
  expect(spec.components.schemas.LibraryFileListResponse).toMatchObject({
    properties: { data: { properties: { items: { items: { required: expect.arrayContaining(["kind", "asset_id", "scan_state"]) } } } } },
  })
})
