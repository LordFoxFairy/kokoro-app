import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { describe, expect, it } from "vitest"
import YAML from "yaml"

import { messageRecordSchema } from "../../src/contract/chat"
import { BFF_CHAT_MESSAGE_ROLES } from "../../src/generated/bff-agent-failure"

const BFF_OWNER_COMMIT = "3c08a422f3a6aa3cf204c308716cfa64f6d61bb2"
const BFF_PUBLIC_OPENAPI_SHA256 = "5561450bd02e978bace1d4850c262aea645bad8fdf4ec46fd0cfffb6765c8ef6"
const BFF_PUBLIC_OPENAPI_VERSION = "4.0.0"
const ROOT = process.cwd()
const SNAPSHOT = resolve(ROOT, "src/generated/bff-public-openapi.yaml")
const GENERATOR = resolve(ROOT, "scripts/generate-bff-agent-failure.mjs")
const GENERATED = resolve(ROOT, "src/generated/bff-agent-failure.ts")

const CODES = [
  "token_budget_exceeded",
  "recursion_limit_exceeded",
  "assembly_failed",
  "enqueue_failed",
  "dispatch_exhausted",
  "contract_incompatible",
  "internal_error",
  "model_unavailable",
  "dependency_unavailable",
  "model_access_denied",
] as const
const TRUE_CODES = ["model_unavailable", "dependency_unavailable"] as const
const EXPECTED_TUPLES = [
  ...CODES.map((code) => ({ source: "agent" as const, code, retryable: false as const })),
  ...TRUE_CODES.map((code) => ({ source: "agent" as const, code, retryable: true as const })),
]

type InspectedFailureContract = {
  roles: readonly string[]
  tuples: readonly { source: string; code: string; retryable: boolean }[]
}

type FailureSpecFixture = {
  info: { version: string }
  components: {
    schemas: {
      ChatMessage: {
        required: string[]
        properties: {
          role: { enum: string[] }
          failure: {
            additionalProperties: boolean
            required: string[]
            properties: {
              source: { type: string; const: string }
              code: { enum: string[] }
              retryable: { type: string }
              [key: string]: unknown
            }
            if: { properties: { retryable: { const: boolean } } }
            then: { properties: { code: { enum: string[] } } }
          }
        }
        allOf: [
          {
            if: { required?: string[] }
            then: {
              required: string[]
              properties: {
                role: { const: string }
                status: { const: string }
                run_id: { minLength: number }
              }
            }
          },
        ]
      }
    }
  }
}

type FailureGenerator = {
  inspectBffAgentFailureContract(spec: unknown): InspectedFailureContract
  renderBffAgentFailureArtifact(contract: InspectedFailureContract): string
}

async function loadGenerator(): Promise<FailureGenerator> {
  expect(existsSync(GENERATOR), "the dedicated failure generator must exist").toBe(true)
  return (await import(/* @vite-ignore */ `${pathToFileURL(GENERATOR).href}?test=${Date.now()}`)) as FailureGenerator
}

async function readSpec(): Promise<FailureSpecFixture> {
  return YAML.parse(await readFile(SNAPSHOT, "utf8")) as FailureSpecFixture
}

function mutateSpec(spec: FailureSpecFixture, mutate: (draft: FailureSpecFixture) => void): FailureSpecFixture {
  const draft = structuredClone(spec)
  mutate(draft)
  return draft
}

const SEMANTIC_MUTANTS: readonly [string, (draft: FailureSpecFixture) => void][] = [
  ["public version", (draft) => { draft.info.version = "2.0.1" }],
  ["restored owner system role", (draft) => { draft.components.schemas.ChatMessage.properties.role.enum = ["user", "assistant", "system"] }],
  ["failure exact properties", (draft) => { draft.components.schemas.ChatMessage.properties.failure.properties.detail = { type: "string" } }],
  ["failure additional properties", (draft) => { draft.components.schemas.ChatMessage.properties.failure.additionalProperties = true }],
  ["failure required keys", (draft) => { draft.components.schemas.ChatMessage.properties.failure.required = ["source", "code"] }],
  ["failure closed code enum", (draft) => { draft.components.schemas.ChatMessage.properties.failure.properties.code.enum.pop() }],
  ["failure source", (draft) => { draft.components.schemas.ChatMessage.properties.failure.properties.source.const = "web" }],
  ["failure source type", (draft) => { draft.components.schemas.ChatMessage.properties.failure.properties.source.type = "number" }],
  ["retryable condition", (draft) => { draft.components.schemas.ChatMessage.properties.failure.if.properties.retryable.const = false }],
  ["retryable true codes", (draft) => { draft.components.schemas.ChatMessage.properties.failure.then.properties.code.enum = ["internal_error"] }],
  ["one-way presence guard", (draft) => { delete draft.components.schemas.ChatMessage.allOf[0].if.required }],
  ["run presence guard", (draft) => { draft.components.schemas.ChatMessage.allOf[0].then.required = [] }],
  ["assistant role guard", (draft) => { draft.components.schemas.ChatMessage.allOf[0].then.properties.role.const = "system" }],
  ["failed assistant guard", (draft) => { draft.components.schemas.ChatMessage.allOf[0].then.properties.status.const = "completed" }],
  ["nonempty run guard", (draft) => { draft.components.schemas.ChatMessage.allOf[0].then.properties.run_id.minLength = 0 }],
  ["one-way profile presence", (draft) => { draft.components.schemas.ChatMessage.required.push("failure") }],
]

describe("pinned BFF Agent failure public contract", () => {
  it("pins the exact owner public 3.0 OpenAPI bytes", async () => {
    const bytes = await readFile(SNAPSHOT)
    const spec = YAML.parse(bytes.toString("utf8")) as { info?: { version?: string } }

    expect(BFF_OWNER_COMMIT).toBe("3c08a422f3a6aa3cf204c308716cfa64f6d61bb2")
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(BFF_PUBLIC_OPENAPI_SHA256)
    expect(spec.info?.version).toBe(BFF_PUBLIC_OPENAPI_VERSION)
  })

  it("contains the closed owner profile and one-way Message presence guard", async () => {
    const chat = (await readSpec()).components.schemas.ChatMessage
    const failure = chat.properties.failure

    expect(chat.properties.role.enum).toEqual(["user", "assistant"])
    expect(failure, "public 3.0 ChatMessage.failure must be present").toBeDefined()
    expect(failure.required).toEqual(["source", "code", "retryable"])
    expect(failure.additionalProperties).toBe(false)
    expect(Object.keys(failure.properties)).toEqual(["source", "code", "retryable"])
    expect(failure.properties.source.const).toBe("agent")
    expect(failure.properties.code.enum).toEqual(CODES)
    expect(failure.properties.retryable.type).toBe("boolean")
    expect(failure.if.properties.retryable.const).toBe(true)
    expect(failure.then.properties.code.enum).toEqual(TRUE_CODES)
    expect(chat.allOf).toEqual([
      {
        if: { required: ["failure"] },
        then: {
          required: ["run_id"],
          properties: {
            role: { const: "assistant" },
            status: { const: "failed" },
            run_id: { type: "string", minLength: 1 },
          },
        },
      },
    ])
  })

  it("derives the exact 12 safe tuples with the owner two-role contract", async () => {
    const generator = await loadGenerator()
    const inspected = generator.inspectBffAgentFailureContract(await readSpec())

    expect(inspected.roles).toEqual(["user", "assistant"])
    expect(inspected.tuples).toEqual(EXPECTED_TUPLES)
  })

  it("keeps generated roles aligned with the runtime Message schema", () => {
    expect(BFF_CHAT_MESSAGE_ROLES).toEqual(["user", "assistant"])
    const record = { message_id: "message-1", content: "", status: "completed", created_at: "2026-10-01T00:00:00.000Z" }
    for (const role of BFF_CHAT_MESSAGE_ROLES) {
      expect(messageRecordSchema.safeParse({ ...record, role }).success).toBe(true)
    }
    expect(messageRecordSchema.safeParse({ ...record, role: "system" }).success).toBe(false)
  })

  it("keeps the checked-in derived artifact byte-identical to the pure renderer", async () => {
    const generator = await loadGenerator()
    const rendered = generator.renderBffAgentFailureArtifact(generator.inspectBffAgentFailureContract(await readSpec()))

    expect(rendered).toContain(BFF_OWNER_COMMIT)
    expect(rendered).toContain(BFF_PUBLIC_OPENAPI_SHA256)
    expect(rendered).toContain(BFF_PUBLIC_OPENAPI_VERSION)
    await expect(readFile(GENERATED, "utf8")).resolves.toBe(rendered)
  })

  it("imports without CLI work when argv points at a nonexistent caller", async () => {
    const before = await readFile(GENERATED)
    const nonexistentCaller = join(tmpdir(), `kokoro-bff-agent-failure-missing-${process.pid}`)
    expect(existsSync(nonexistentCaller)).toBe(false)

    const run = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", `await import(${JSON.stringify(pathToFileURL(GENERATOR).href)})`, nonexistentCaller],
      { cwd: ROOT, encoding: "utf8" },
    )
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0)
    await expect(readFile(GENERATED)).resolves.toEqual(before)
  })

  it("checks owner-byte and generated-artifact drift in a private fixture tree", async () => {
    expect(existsSync(GENERATOR), "the dedicated failure generator must exist").toBe(true)
    expect(existsSync(GENERATED), "the checked-in derived failure artifact must exist").toBe(true)

    const fixture = await mkdtemp(join(tmpdir(), "kokoro-bff-agent-failure-"))
    try {
      const fixtureGenerator = join(fixture, "scripts/generate-bff-agent-failure.mjs")
      const fixtureSnapshot = join(fixture, "src/generated/bff-public-openapi.yaml")
      const fixtureGenerated = join(fixture, "src/generated/bff-agent-failure.ts")
      await mkdir(dirname(fixtureGenerator), { recursive: true })
      await mkdir(dirname(fixtureSnapshot), { recursive: true })
      await Promise.all([
        copyFile(GENERATOR, fixtureGenerator),
        copyFile(SNAPSHOT, fixtureSnapshot),
        copyFile(GENERATED, fixtureGenerated),
      ])
      await symlink(resolve(ROOT, "node_modules"), join(fixture, "node_modules"), "dir")

      const run = () => spawnSync(process.execPath, [fixtureGenerator, "--check"], { cwd: fixture, encoding: "utf8" })
      expect(run().status).toBe(0)

      await writeFile(fixtureGenerated, `${await readFile(fixtureGenerated, "utf8")}\n`)
      expect(run().status).not.toBe(0)
      await copyFile(GENERATED, fixtureGenerated)

      await writeFile(fixtureSnapshot, `${await readFile(fixtureSnapshot, "utf8")}\n`)
      expect(run().status).not.toBe(0)
    } finally {
      await rm(fixture, { recursive: true, force: true })
    }
  })

  it.each(SEMANTIC_MUTANTS)("rejects the %s semantic mutant independently of the owner-byte digest", async (_name, mutate) => {
    const generator = await loadGenerator()
    const mutant = mutateSpec(await readSpec(), mutate)

    expect(() => generator.inspectBffAgentFailureContract(mutant)).toThrow()
  })
})
