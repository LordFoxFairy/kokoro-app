import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

const requiredDocuments = [
  "README.md",
  "INDEX.md",
  "docs/INDEX.md",
  "docs/CURRENT.md",
  "docs/TECHNICAL_DESIGN.md",
  "docs/API_CONTRACT.md",
  "docs/DATA_MODEL.md",
  "docs/SECURITY.md",
  "docs/RELIABILITY.md",
  "docs/ACCEPTANCE.md",
  "docs/SLO.md",
  "docs/RUNBOOK.md",
  "docs/ADR/0001-browser-private-bff-agui-boundary.md",
  "docs/ADR/0002-repository-coupled-contract-provenance.md",
] as const

async function exists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(root, relativePath))
    return true
  } catch {
    return false
  }
}

describe("Web governance boundary", () => {
  it.each(requiredDocuments)("keeps %s as a checked-in governance entry", async (relativePath) => {
    expect(await exists(relativePath)).toBe(true)
  })

  it("marks every Web contract browser-private and outside Developer API", async () => {
    const contractReadme = await readFile(path.join(root, "contract/README.md"), "utf8")
    const normalized = contractReadme.toLowerCase()

    for (const field of ["owner", "visibility", "version", "generation", "breaking", "provenance"] as const) {
      expect(normalized, `missing contract metadata field ${field}`).toContain(field)
    }
    expect(normalized).toContain("browser-private")
    expect(contractReadme).toContain("Developer API")
    expect(contractReadme).toContain("不进入 Developer API")
    expect(await exists("contract/openapi")).toBe(false)
  })

  it("keeps Web free of database and Redis ownership", async () => {
    const packageSchema = z.object({
      dependencies: z.record(z.string()).optional(),
      devDependencies: z.record(z.string()).optional(),
    })
    const packageJson: unknown = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
    const parsed = packageSchema.parse(packageJson)
    const dependencies = { ...parsed.dependencies, ...parsed.devDependencies }

    expect(await exists("database")).toBe(false)
    for (const dependency of ["pg", "postgres", "ioredis", "redis", "prisma", "@prisma/client"] as const) {
      expect(dependencies).not.toHaveProperty(dependency)
    }
  })

  it("pins the safe TypeScript catch boundary explicitly", async () => {
    const source = await readFile(path.join(root, "tsconfig.json"), "utf8")
    expect(source).toMatch(/"strict"\s*:\s*true/u)
    expect(source).toMatch(/"useUnknownInCatchVariables"\s*:\s*true/u)
  })

  it("provides focused contract and architecture scripts", async () => {
    const packageSchema = z.object({
      scripts: z.object({
        contract: z.string().min(1),
        "test:architecture": z.string().min(1),
      }),
    })
    const packageJson: unknown = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))

    expect(packageSchema.parse(packageJson).scripts).toEqual({
      contract: "vitest run contract tests/contract",
      "test:architecture": "vitest run tests/architecture",
    })
  })
})
