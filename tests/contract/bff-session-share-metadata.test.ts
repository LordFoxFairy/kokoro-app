import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { expect, it } from "vitest"
import YAML from "yaml"

it("current owner publishes native Session Share metadata and the full Team delete-series permission", async () => {
  const spec = YAML.parse(await readFile(resolve("src/generated/bff-public-openapi.yaml"), "utf8"))
  expect(spec.info.version).toBe("28.37.0")
  expect(spec.paths["/v1/sessions/{id}/share"].get.operationId).toBe("getSessionShareMetadata")
  expect(spec.components.schemas.TeamRole.properties.permissions.properties.skill.items.enum).toContain("delete_series")
  expect(spec.security[0]).toHaveProperty("issuerSessionCookie")
  expect(spec.paths["/v1/skill.list"].get.security).toEqual([{ serviceHeader: [], internalSecret: [], userBearer: [] }])
})
