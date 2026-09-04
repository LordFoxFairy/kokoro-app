import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const sourceRoot = path.join(root, "src")
const testRoot = path.join(root, "tests")
const featureRoot = path.join(sourceRoot, "features/scheduled-tasks")
const modelRoot = path.join(featureRoot, "model")
const apiRoot = path.join(featureRoot, "api")
const uiRoot = path.join(featureRoot, "ui")

const legacyOwnerFiles = [
  "src/features/app/scheduled-task-client.ts",
  "src/features/app/scheduled-task-editor.tsx",
  "src/features/app/scheduled-task-editor.module.css",
  "src/features/app/kokoro-scheduled-model.ts",
  "src/features/app/kokoro-scheduled-content.tsx",
  "src/features/app/kokoro-scheduled-surface.tsx",
  "src/features/app/kokoro-scheduled-surface.module.css",
  "src/features/app/kokoro-scheduled-calendar.module.css",
]

function sourceFiles(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [entryPath] : []
  })
}

function importSpecifiers(source) {
  const specifiers = []
  const expression = /\b(?:from\s+|import\s*\()\s*["']([^"']+)["']/gu
  for (const match of source.matchAll(expression)) {
    const specifier = match[1]
    if (specifier !== undefined) specifiers.push(specifier)
  }
  return specifiers
}

function resolveSourceImport(importer, specifier) {
  if (specifier.startsWith("@/")) return path.join(sourceRoot, specifier.slice(2))
  return specifier.startsWith(".") ? path.resolve(path.dirname(importer), specifier) : null
}

function isWithin(directory, candidate) {
  return candidate === directory || candidate.startsWith(`${directory}${path.sep}`)
}

describe("ScheduledTask feature boundaries", () => {
  it("owns the ScheduledTask implementation in one vertical feature slice", () => {
    expect(existsSync(path.join(featureRoot, "index.ts")), "feature public entry is missing").toBe(true)
    expect(existsSync(modelRoot), "feature model layer is missing").toBe(true)
    expect(existsSync(apiRoot), "feature API layer is missing").toBe(true)
    expect(existsSync(uiRoot), "feature UI layer is missing").toBe(true)

    for (const legacyFile of legacyOwnerFiles) {
      expect(existsSync(path.join(root, legacyFile)), `${legacyFile} must move into the feature slice`).toBe(false)
    }
  })

  it("requires consumers to import only the feature public entry", () => {
    const violations = [sourceRoot, testRoot].flatMap(sourceFiles)
      .filter((filePath) => !filePath.startsWith(`${featureRoot}${path.sep}`))
      .flatMap((filePath) => importSpecifiers(readFileSync(filePath, "utf8"))
        .filter((specifier) => {
          const resolved = resolveSourceImport(filePath, specifier)
          return resolved !== null && isWithin(featureRoot, resolved) && specifier !== "@/features/scheduled-tasks"
        })
        .map((specifier) => `${path.relative(root, filePath)} -> ${specifier}`))

    expect(violations).toEqual([])
  })

  it("keeps the API layer independent from UI", () => {
    const apiFiles = sourceFiles(apiRoot)
    expect(apiFiles.length, "feature API layer has no TypeScript source").toBeGreaterThan(0)

    const violations = apiFiles.flatMap((filePath) => importSpecifiers(readFileSync(filePath, "utf8"))
      .filter((specifier) => {
        const resolved = resolveSourceImport(filePath, specifier)
        return resolved !== null && isWithin(uiRoot, resolved)
      })
      .map((specifier) => `${path.relative(root, filePath)} -> ${specifier}`))

    expect(violations).toEqual([])
  })

  it("keeps model imports inside the pure model layer", () => {
    const modelFiles = sourceFiles(modelRoot)
    expect(modelFiles.length, "feature model layer has no TypeScript source").toBeGreaterThan(0)

    const violations = modelFiles.flatMap((filePath) => importSpecifiers(readFileSync(filePath, "utf8"))
      .filter((specifier) => {
        const resolved = resolveSourceImport(filePath, specifier)
        return resolved === null || !isWithin(modelRoot, resolved)
      })
      .map((specifier) => `${path.relative(root, filePath)} -> ${specifier}`))

    expect(violations).toEqual([])
  })

  it("uses explicit exports at the feature entry", () => {
    const entryPath = path.join(featureRoot, "index.ts")
    if (!existsSync(entryPath)) return
    const source = readFileSync(entryPath, "utf8")
    expect(source).not.toMatch(/export\s+\*/u)
  })
})
