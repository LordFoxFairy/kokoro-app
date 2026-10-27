import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { expect, it } from "vitest"
import YAML from "yaml"
import { modelCandidateSchema, modelCandidateListSchema } from "@/contract/catalog"
import { restorePublic20 } from "./bff-shared-model-parent"
import { restorePublic19 } from "./bff-system-connection-parent"

it("Public21 model decoder matches the closed publisher fields and preserves the complete Public20/Public19 oracle", async () => {
  const bytes = await readFile("src/generated/bff-public-openapi.yaml")
  const spec = YAML.parse(bytes.toString())
  const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex")
  expect(hash(bytes)).toBe("48aa9638d133223c9f78655e9398ddbb44159963f92a2db891a09212f3aa2726")
  expect(spec.info.version).toBe("28.4.0")
  const candidate = spec.components.schemas.ModelCandidate
  expect(candidate.additionalProperties).toBe(false)
  expect(Object.keys(modelCandidateSchema.shape).sort()).toEqual([...candidate.required].sort())
  expect(candidate.properties.name.maxLength).toBe(128)
  expect(candidate.properties.display_name.maxLength).toBe(255)
  expect(Object.keys(modelCandidateListSchema.shape).sort()).toEqual([...spec.components.schemas.ModelCandidateListResponse.properties.data.required].sort())
  const parent = restorePublic20(bytes)
  expect(hash(parent)).toBe("c5e89c7e56663d05d821c7c19115afb0cc913d617a35c6fd96162b13d201514f")
  expect(hash(restorePublic19(parent))).toBe("955412b680bf7a2529c4c35f553ff272d7361769ea95bb441ba820b552ffc564")
  for (const invalid of [Buffer.concat([bytes, Buffer.from("\n")]), Buffer.from(bytes.toString().replace("maxLength: 255", "maxLength: 256"))])
    expect(() => restorePublic20(invalid)).toThrow()
})
