import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import YAML from "yaml"
import { expect, it } from "vitest"
import { restoreIntegrationBaseline, restoreIntegrationParent } from "./bff-public29-integration-parent"
import { restorePublic2816CustomApiSelectionContract } from "./bff-custom-api-selection-parent"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const source = readFileSync("src/generated/bff-public-openapi.yaml", "utf8")
const inventoryText = readFileSync("tests/contract/fixtures/bff-public29-operations.json", "utf8")
const inventory = (JSON.parse(inventoryText) as { operations: { method: string; path: string; operation_id: string }[] }).operations

it("consumes the fixed committed Public29 artifact and its full ordered 200-operation inventory", () => {
  expect(hash(source)).toBe("258bde9c39f785667cb205976e1547d1cf2c9662a5a2d7f356c4b11e807fcaf7")
  expect(hash(inventoryText)).toBe("a1c961ea35d228f1eb48e01db6b81106a359a38b77c8ad7c419e53fc913bb28e")
  const proof = readFileSync("tests/contract/fixtures/task-b-bff-integration-public.json", "utf8")
  expect(hash(proof)).toBe("654acd8470ed49b5e5ccb683aac718506011c4a03052d56d3fd86a2905293bbf")
  expect(JSON.parse(proof)).toMatchObject({ owner_commit: "7e4ab1cee8f8d45a34902176cd15a10f3c4b22cb", owner_proof_sha256: "325b2b27a2d034a0d91d0013453335590ae4a4cede005767c917c8e43fdbd40a" })
  expect(JSON.parse(proof)).not.toHaveProperty("schema")
  const spec = YAML.parse(source)
  expect(spec.info.version).toBe("29.0.0")
  expect(inventory).toHaveLength(200)
  expect(Object.values(spec.paths).flatMap(path => Object.keys(path as object).filter(method => ["get", "post", "put", "patch", "delete", "head", "options"].includes(method)))).toHaveLength(200)
  for (const operation of inventory) expect(spec.paths[operation.path][operation.method.toLowerCase()].operationId).toBe(operation.operation_id)
})

it.each([
  ["approved", "ea0031103488daa1fcc0cca45fdd13f4d4061546ac4525c745ec47105649f7e7", 199],
  ["rss", "6574930b3a893a208596e6f27c2f9e09122e759d111a7fdbf2d54c294efc0e8f", 168],
] as const)("restores the complete distinct %s parent without resigning its historical proof", (parent, digest, count) => {
  const restored = restoreIntegrationParent(source, parent)
  expect(hash(restored)).toBe(digest)
  expect(restoreIntegrationParent(restored, parent)).toBe(restored)
  expect(restoreIntegrationBaseline(inventory, parent)).toHaveLength(count)
  expect(() => restoreIntegrationBaseline([...inventory].reverse(), parent)).toThrow()
  for (const corrupted of [source + "\n", source.replace("listTeamMembers", "otherOperation"), source.replace("ScheduledRssCondition:", "OtherRssCondition:")]) {
    expect(corrupted).not.toBe(source)
    expect(() => restoreIntegrationParent(corrupted, parent)).toThrow()
  }
})

it("enters the sealed approved parent chain only after the full integration inverse", () => {
  expect(hash(restorePublic2816CustomApiSelectionContract(source))).toBe("82485c2b7be17ad04f56d3656a58b42ea8d308c9dc22db5807a09ab706418a77")
  expect(() => restoreIntegrationParent("openapi: unknown\n", "approved")).toThrow()
})
