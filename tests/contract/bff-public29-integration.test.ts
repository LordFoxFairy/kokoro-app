import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import YAML from "yaml"
import { expect, it } from "vitest"
import { restoreIntegrationBaseline, restoreIntegrationParent } from "./bff-public29-integration-parent"
import { restorePublic292PersonalContextContract } from "./bff-public293-personal-context-parent"
import { restorePublic291TeamPermissions, restorePublic290ShareMetadata } from "./bff-public292-team-permissions-parent"
import { restorePublic2816CustomApiSelectionContract } from "./bff-custom-api-selection-parent"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const source = restorePublic290ShareMetadata(readFileSync("src/generated/bff-public-openapi.yaml", "utf8"))
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


it("consumes the exact Public29.2 Team permissions correction through both immutable share and integration parents", () => {
  const current = restorePublic292PersonalContextContract(readFileSync("src/generated/bff-public-openapi.yaml", "utf8"))
  expect(hash(current)).toBe("df5a33d4fa33662e4f70967bf5db60033f71f29511bf5975aa2395d61abb3e9c")
  const parent = restorePublic291TeamPermissions(current)
  expect(hash(parent)).toBe("4e4ce620887b1a1a431a9346d0d259aa5bed3bd5af06f4428f11e9054173418e")
  expect(restorePublic291TeamPermissions(parent)).toBe(parent)
  expect(restorePublic290ShareMetadata(parent)).toBe(source)
  expect(restorePublic290ShareMetadata(current)).toBe(source)
  expect(restorePublic290ShareMetadata(source)).toBe(source)
  const spec = YAML.parse(current)
  expect(spec.info.version).toBe("29.2.0")
  const skill = spec.components.schemas.TeamRole.properties.permissions.properties.skill.items.enum
  expect(skill).toEqual(["create_draft", "create_version", "delete_series", "begin_upload", "complete_upload", "abort_upload", "validate_draft", "publish", "withdraw", "set_status", "install", "set_installation_enabled", "remove_installation", "update_draft", "discard_draft", "set_publication_audience"])
  const paths: Record<string, Record<string, { operationId?: string }>> = spec.paths
  const currentInventory = Object.entries(paths).flatMap(([path, resource]) => Object.entries(resource)
    .filter(([method]) => ["get", "post", "put", "patch", "delete", "head", "options"].includes(method))
    .map(([method, operation]) => ({ method: method.toUpperCase(), path, operation_id: operation.operationId })))
  expect(currentInventory).toHaveLength(201)
  expect(hash(JSON.stringify(currentInventory))).toBe("f3071be82ea28ddcc2ab7ddfe372031498bc629b8b4c32efd4f279697e8d6d14")
  expect(currentInventory.filter(operation => operation.operation_id !== "getSessionShareMetadata")).toEqual(inventory)
})

it("rejects future releases, unknown permissions and unrelated source drift before restoring historical bytes", () => {
  const current = readFileSync("src/generated/bff-public-openapi.yaml", "utf8")
  for (const changed of [current + "\n", current.replace("version: 29.3.0", "version: 29.3.1"),
    current.replace("create_version, delete_series, begin_upload", "create_version, unknown_action, begin_upload"),
    current.replace("required: [share]", "required: []"), current.replace("listTeamMembers", "changedUnrelatedOperation")]) {
    expect(changed).not.toBe(current)
    expect(() => restorePublic291TeamPermissions(changed)).toThrow()
    expect(() => restorePublic290ShareMetadata(changed)).toThrow()
    expect(() => restoreIntegrationParent(changed, "approved")).toThrow()
  }
})

it("restores the exact Public29.2 bytes before all historical proofs and retains the ordered201 operations", () => {
  const current = readFileSync("src/generated/bff-public-openapi.yaml", "utf8")
  expect(hash(current)).toBe("4f27adbea9a63c36d8b11e95c9dde342a6e8d662cab77cb42091384f3b17e333")
  const parent = restorePublic292PersonalContextContract(current)
  expect(hash(parent)).toBe("df5a33d4fa33662e4f70967bf5db60033f71f29511bf5975aa2395d61abb3e9c")
  expect(restorePublic292PersonalContextContract(parent)).toBe(parent)
  expect(restorePublic290ShareMetadata(parent)).toBe(source)
  expect(YAML.parse(current).paths).toEqual(YAML.parse(parent).paths)
  for (const corrupted of [current + "\n", current.replace("                - context_window_exceeded\n", ""),
    current.replace("context_window_exceeded", "unknown_capacity"),
    current.replace("                - context_window_exceeded\n", "                - context_window_exceeded\n                - context_window_exceeded\n"),
    current.replace("listTeamMembers", "changedUnrelatedOperation")]) {
    expect(corrupted).not.toBe(current)
    expect(() => restorePublic292PersonalContextContract(corrupted)).toThrow()
    expect(() => restorePublic290ShareMetadata(corrupted)).toThrow()
  }
})
