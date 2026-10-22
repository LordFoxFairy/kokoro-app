import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { expect, it } from "vitest"
import YAML from "yaml"
import { restoreModelDiscoveryParent } from "./bff-model-discovery-parent"
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
it("pins only the formal provider discovery GET and preserves the complete Public22.2 parent", async () => {
  const bytes = await readFile("src/generated/bff-public-openapi.yaml")
  expect(digest(bytes)).toBe("727159cea88e9f70ca3d1127306e8a6a6bcaa568398de8b0d8fec1cce6b3fae3")
  const spec = YAML.parse(bytes.toString())
  expect(spec.info.version).toBe("22.3.0")
  const path = spec.paths["/v1/admin/model-providers/{provider_id}/upstream-models"]
  expect(Object.keys(path)).toEqual(["get"])
  expect(path.get.operationId).toBe("listAdminModelProviderUpstreamModels")
  expect(path.get.requestBody).toBeUndefined()
  expect(path.get["x-kokoro-permission"]).toBe("admin.model_configuration.read")
  const parent = restoreModelDiscoveryParent(bytes)
  expect(digest(parent)).toBe("365d61aa5b3b4c01a178f077914e03b5fdbaeebc95fe740b9be46ca8fadc3205")
  const old = YAML.parse(parent.toString())
  expect(old.info.version).toBe("22.2.0")
  const methods = new Set(["get", "post", "put", "patch", "delete", "head", "options"])
  const count = (value: typeof spec) => Object.values(value.paths).flatMap(item => Object.keys(item as object).filter(method => methods.has(method))).length
  expect(count(spec)).toBe(182)
  expect(count(old)).toBe(181)
  expect(old.paths["/v1/admin/model-providers/{provider_id}/upstream-models"]).toBeUndefined()
  for (const changed of [Buffer.concat([bytes, Buffer.from("\n")]), Buffer.from(bytes.toString().replace("listAdminModelProviderUpstreamModels", "arbitraryProxy")), Buffer.from(bytes.toString().replace("  version: 22.3.0", "  version: 22.2.0"))]) expect(() => restoreModelDiscoveryParent(changed)).toThrow()
})
