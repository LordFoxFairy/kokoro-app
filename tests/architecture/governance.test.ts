import { access, readFile, readdir } from "node:fs/promises"
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

  it("keeps Web free of database ownership and restricts Redis to server-only IAM/RP and Product Session coordination", async () => {
    const packageSchema = z.object({
      dependencies: z.record(z.string()).optional(),
      devDependencies: z.record(z.string()).optional(),
    })
    const packageJson: unknown = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
    const parsed = packageSchema.parse(packageJson)
    const dependencies = { ...parsed.dependencies, ...parsed.devDependencies }

    expect(await exists("database")).toBe(false)
    for (const dependency of ["pg", "postgres", "ioredis", "prisma", "@prisma/client"] as const) {
      expect(dependencies).not.toHaveProperty(dependency)
    }
    expect(parsed.dependencies?.redis).toBe("5.12.1")
    expect(parsed.dependencies?.["next-auth"]).toBe("4.24.15")
    expect(parsed.dependencies?.["openid-client"]).toBe("5.7.1")
    const sourceRoot = path.join(root, "src")
    const entries = await readdir(sourceRoot, { recursive: true })
    const redisImports: string[] = []
    for (const entry of entries) {
      if (!/\.tsx?$/u.test(entry)) continue
      const source = await readFile(path.join(sourceRoot, entry), "utf8")
      if (/\b(?:from\s*["']redis["']|(?:import|require)\s*\(\s*["']redis["'])/u.test(source)) redisImports.push(entry)
    }
    expect(redisImports.sort()).toEqual([
      path.join("lib", "server", "iam-interaction-csrf.ts"),
      path.join("lib", "server", "oidc-rp-transaction.ts"),
      path.join("lib", "server", "product-session-store.ts"),
    ])
    for (const entry of redisImports) {
      expect(await readFile(path.join(sourceRoot, entry), "utf8")).not.toContain('"use client"')
    }
  })

  it("pins the safe TypeScript catch boundary explicitly", async () => {
    const source = await readFile(path.join(root, "tsconfig.json"), "utf8")
    expect(source).toMatch(/"strict"\s*:\s*true/u)
    expect(source).toMatch(/"useUnknownInCatchVariables"\s*:\s*true/u)
  })

  it("does not restore the legacy magic-link routes or the retired login error redirect", async () => {
    for (const route of [
      "src/app/api/auth/magic-link/request/route.ts",
      "src/app/api/auth/callback/route.ts",
    ]) {
      expect(await exists(route), route).toBe(false)
    }
    const sourceRoot = path.join(root, "src")
    const entries = await readdir(sourceRoot, { recursive: true })
    const redirects: string[] = []
    for (const entry of entries) {
      if (!/\.tsx?$/u.test(entry) || entry.startsWith(`generated${path.sep}`)) continue
      if ((await readFile(path.join(sourceRoot, entry), "utf8")).includes("/login?auth=")) redirects.push(entry)
    }
    expect(redirects).toEqual([])
  })

  it("does not expose legacy browser tenant switching", async () => {
    expect(await exists("src/app/api/team/switch/route.ts")).toBe(false)
    const teamUi = await readFile(path.join(root, "src/ui/team/team-panel.tsx"), "utf8")
    const teamClient = await readFile(path.join(root, "src/team/client.ts"), "utf8")
    expect(teamUi).not.toContain("SwitcherSection")
    expect(teamClient).not.toContain("switchTeam")
  })

  it.each(["ci.yml", "cloudflare.yml", "release-image.yml"])("runs %s tests with isolated Redis service", async (name) => {
    const workflow = await readFile(path.join(root, ".github", "workflows", name), "utf8")
    const verify = workflow.split(/\n  verify:\n/u)[1]?.split(/\n  (?:deploy|publish):\n/u)[0]
    expect(verify).toBeDefined()
    expect(verify).toContain("redis:7-alpine@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf")
    expect(verify).toContain("56379:6379")
    expect(verify).toContain("--health-cmd=\"redis-cli ping\"")
    expect(verify).toContain("KOKORO_WEB_REDIS_URL: redis://127.0.0.1:56379/9")
    expect(verify).toContain("pnpm test")
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
