import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
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

function parseSource(filePath) {
  const kind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true, kind)
}

function importSpecifiers(filePath) {
  const specifiers = []
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text)
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments
      if (argument && ts.isStringLiteral(argument)) specifiers.push(argument.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(parseSource(filePath))
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
      .flatMap((filePath) => importSpecifiers(filePath)
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

    const violations = apiFiles.flatMap((filePath) => importSpecifiers(filePath)
      .filter((specifier) => {
        const resolved = resolveSourceImport(filePath, specifier)
        return resolved !== null && isWithin(uiRoot, resolved)
      })
      .map((specifier) => `${path.relative(root, filePath)} -> ${specifier}`))

    expect(violations).toEqual([])
  })

  it("keeps every ScheduledTask React module below the component review budget", () => {
    const violations = sourceFiles(uiRoot)
      .filter((filePath) => filePath.endsWith(".tsx"))
      .map((filePath) => ({
        file: path.relative(root, filePath),
        lines: readFileSync(filePath, "utf8").split(/\r?\n/u).length,
      }))
      .filter(({ lines }) => lines > 300)

    expect(violations).toEqual([])
  })

  it("keeps model imports inside the pure model layer", () => {
    const modelFiles = sourceFiles(modelRoot)
    expect(modelFiles.length, "feature model layer has no TypeScript source").toBeGreaterThan(0)

    const violations = modelFiles.flatMap((filePath) => importSpecifiers(filePath)
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
    const wildcardExports = parseSource(entryPath).statements
      .filter((statement) => ts.isExportDeclaration(statement) && !statement.exportClause)
      .map((statement) => statement.moduleSpecifier?.getText())
    expect(wildcardExports).toEqual([])
  })

  it("keeps every ScheduledTask function within the blocking complexity budget", () => {
    const violations = []
    for (const filePath of sourceFiles(featureRoot)) {
      const source = parseSource(filePath)
      function visit(node) {
        if (ts.isFunctionLike(node) && node.body) {
          const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
          const end = source.getLineAndCharacterOfPosition(node.end).line + 1
          if (end - start + 1 > 100) {
            const name = "name" in node && node.name ? node.name.getText(source) : "anonymous"
            violations.push(`${path.relative(root, filePath)}:${start}-${end} ${name}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(violations).toEqual([])
  })
})
