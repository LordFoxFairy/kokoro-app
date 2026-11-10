import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import YAML from "yaml"
import { restorePublic2819ProjectTaskContract } from "./bff-project-tasks-parent"
import { restorePublic2820InterruptSubmitContract } from "./bff-interrupt-submit-parent"
import { restorePublic2817AccountProfileReadContract } from "./bff-account-profile-read-parent"
import { restorePublic2816CustomApiSelectionContract } from "./bff-custom-api-selection-parent"

const raw = readFileSync("src/generated/bff-public-openapi.yaml", "utf8")
const hash = (source: string) => createHash("sha256").update(source).digest("hex")

it("restores the entire Public28.17 parent and preserves its 199 operations in order", () => {
  expect(hash(raw)).toBe("ea0b6ff7b4ea4a0348a4dd579c2440dca32e58c5958b2374e8555e02b74382a6")
  const parent = restorePublic2817AccountProfileReadContract(raw)
  expect(hash(parent)).toBe("ea0031103488daa1fcc0cca45fdd13f4d4061546ac4525c745ec47105649f7e7")
  const public2820 = restorePublic2820InterruptSubmitContract(raw)
  const public2819 = restorePublic2819ProjectTaskContract(public2820)
  expect(hash(public2819)).toBe("27032917fb272601b6da8ba9227bab5324ac305682a72c94adca72e4f9e25577")
  const publishedSpec = YAML.parse(public2820), currentSpec = YAML.parse(public2819), parentSpec = YAML.parse(parent)
  const operations = (spec: typeof currentSpec) => Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.entries(methods as Record<string, unknown>)
      .filter(([method]) => ["get", "post", "put", "patch", "delete", "head", "options", "trace"].includes(method))
      .map(([method]) => `${method.toUpperCase()} ${path}`))
  expect(publishedSpec.info.version).toBe("28.20.0")
  expect(operations(publishedSpec).filter(operation => !operations(currentSpec).includes(operation))).toEqual([
    "POST /v1/projects/{projectId}/tasks",
    "PATCH /v1/projects/{projectId}/tasks/{taskId}",
    "DELETE /v1/projects/{projectId}/tasks/{taskId}",
  ])
  expect(currentSpec.info.version).toBe("28.19.0")
  expect(parentSpec.info.version).toBe("28.17.0")
  expect(operations(currentSpec)).toHaveLength(200)
  expect(operations(parentSpec)).toHaveLength(199)
  expect(operations(parentSpec)).toEqual(operations(currentSpec).filter(operation => operation !== "GET /v1/account/profile"))
  expect(parentSpec.paths["/v1/account/profile"].patch).toEqual(currentSpec.paths["/v1/account/profile"].patch)
  expect(parentSpec.paths["/v1/account/profile"].get).toBeUndefined()
  expect(Object.keys(currentSpec.components.schemas).filter(name => !(name in parentSpec.components.schemas))).toEqual(["AccountProfileReadResponse"])
  expect(hash(restorePublic2816CustomApiSelectionContract(raw))).toBe("82485c2b7be17ad04f56d3656a58b42ea8d308c9dc22db5807a09ab706418a77")
})

it.each([
  ["new GET operation", raw.replace("operationId: readAccountProfile", "operationId: changedReadAccountProfile")],
  ["new schema", raw.replace("    AccountProfileReadResponse:\n", "    ChangedAccountProfileReadResponse:\n")],
  ["existing PATCH operation", raw.replace("operationId: updateAccountProfile", "operationId: changedUpdateAccountProfile")],
  ["unrelated operation", raw.replace("listTeamMembers", "changedListTeamMembers")],
  ["version", raw.replace("  version: 28.34.0\n", "  version: 28.23.0\n")],
  ["extra byte", raw + "\n"],
])("rejects %s drift before entering the historical parent chain", (_label, changed) => {
  expect(changed).not.toBe(raw)
  expect(() => restorePublic2817AccountProfileReadContract(changed)).toThrow()
  expect(() => restorePublic2816CustomApiSelectionContract(changed)).toThrow()
})
