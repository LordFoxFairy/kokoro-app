import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const sourceRoot = path.join(root, "src")

function cssFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return cssFiles(filePath)
    return entry.name.endsWith(".css") ? [filePath] : []
  })
}

function readProductionCss() {
  return cssFiles(sourceRoot).map((filePath) => ({
    filePath,
    relativePath: path.relative(root, filePath),
    source: readFileSync(filePath, "utf8"),
  }))
}

function atRuleBlock(source, marker) {
  const markerStart = source.indexOf(marker)
  if (markerStart < 0) return ""
  const blockStart = source.indexOf("{", markerStart)
  if (blockStart < 0) return ""

  let depth = 0
  for (let index = blockStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1
    if (source[index] === "}") depth -= 1
    if (depth === 0) return source.slice(blockStart + 1, index)
  }
  return ""
}

describe("production CSS quality", () => {
  it("keeps production CSS free of important declarations and hidden outlines", () => {
    for (const { relativePath, source } of readProductionCss()) {
      expect(source, `${relativePath} contains !important`).not.toMatch(/!important\b/u)
      expect(source, `${relativePath} suppresses an outline without a focus contract`).not.toMatch(
        /outline\s*:\s*(?:none|0(?:px)?)(?=\s*[;}])/iu,
      )
    }
  })

  it("scopes reduced-motion overrides and covers animated or smooth-scrolling surfaces", () => {
    const files = readProductionCss()
    const reducedMotionMarker = "@media (prefers-reduced-motion: reduce)"
    const globals = files.find(({ relativePath }) => relativePath === "src/app/globals.css")
    expect(globals).toBeDefined()
    const globalReducedBlock = atRuleBlock(globals.source, reducedMotionMarker)
    expect(globalReducedBlock).toContain(":root")
    expect(globalReducedBlock).not.toMatch(/(?:^|,)\s*\*/u)

    for (const { relativePath, source } of files) {
      const hasMotionAnimation = /\banimation\s*:/u.test(source)
      const hasSmoothScroll = /scroll-behavior\s*:\s*smooth\b/u.test(source)
      if (!hasMotionAnimation && !hasSmoothScroll) continue

      expect(source, `${relativePath} lacks a reduced-motion rule`).toContain(reducedMotionMarker)
      const reducedBlock = atRuleBlock(source, reducedMotionMarker)
      expect(reducedBlock, `${relativePath} has an empty reduced-motion rule`).not.toBe("")
      expect(reducedBlock, `${relativePath} uses a wildcard reduced-motion selector`).not.toMatch(/(?:^|,)\s*\*/u)
      if (hasSmoothScroll) expect(reducedBlock, `${relativePath} keeps smooth scrolling in reduced motion`).toContain("scroll-behavior: auto")
    }
  })
})
