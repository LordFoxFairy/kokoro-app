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

function sourceWithVisibleFocusContract(relativePath, source) {
  if (relativePath !== "src/ui/composer/composer.module.css") return source
  // Match the entire, specific two-rule media contract, not a file whitelist.
  // Remove only one input declaration; any other outline suppression stays banned.
  const handoff = /@media\s*\(forced-colors:\s*active\)\s*\{\s*\.wrap\s+\.composer:has\(\.input:focus-visible\)\s*\{\s*outline:\s*2px\s+solid\s+Highlight;\s*outline-offset:\s*2px;\s*box-shadow:\s*none;\s*\}\s*\.input:focus-visible\s*\{\s*outline:\s*none;\s*\}\s*\}/u
  return source.replace(handoff, (block) => block.replace(/outline:\s*none;/u, ""))
}

const hiddenOutline = /outline\s*:\s*(?:none|0(?:px)?)(?=\s*[;}])/iu
const composerPath = "src/ui/composer/composer.module.css"

describe("Composer forced-colors focus handoff contract", () => {
  const composerSource = readFileSync(path.join(root, composerPath), "utf8")
  const shellRule = ".wrap .composer:has(.input:focus-visible) { outline: 2px solid Highlight; outline-offset: 2px; box-shadow: none; }"

  it("permits only the input outline handoff backed by the same forced-colors shell", () => {
    expect(sourceWithVisibleFocusContract(composerPath, composerSource)).not.toMatch(hiddenOutline)
  })

  it.each([
    ["missing shell", (source) => source.replace(shellRule, "")],
    ["wrong shell selector", (source) => source.replace(shellRule, shellRule.replace(":focus-visible", ":focus"))],
    ["missing system outline", (source) => source.replace("outline: 2px solid Highlight;", "")],
    ["wrong system outline width", (source) => source.replace("outline: 2px solid Highlight;", "outline: 1px solid Highlight;")],
    ["wrong outline offset", (source) => source.replace("outline-offset: 2px;", "outline-offset: 0;")],
    ["missing shadow suppression", (source) => source.replace(shellRule, shellRule.replace("box-shadow: none;", ""))],
    ["wrong input selector", (source) => source.replace(".input:focus-visible { outline: none; }", ".input:focus { outline: none; }")],
    ["wrong media scope", (source) => source.replace("@media (forced-colors: active)", "@media (pointer: fine)")],
    ["extra normal outline suppression", (source) => `${source}\n.input { outline: none; }`],
    ["extra normal zero outline", (source) => `${source}\n.input { outline: 0; }`],
  ])("rejects %s", (_name, mutate) => {
    expect(sourceWithVisibleFocusContract(composerPath, mutate(composerSource))).toMatch(hiddenOutline)
  })

  it("does not permit the same handoff in another file", () => {
    expect(sourceWithVisibleFocusContract("src/components/ui/textarea.css", composerSource)).toMatch(hiddenOutline)
  })
})

describe("production CSS quality", () => {
  it("keeps production CSS free of important declarations and hidden outlines", () => {
    for (const { relativePath, source } of readProductionCss()) {
      expect(source, `${relativePath} contains !important`).not.toMatch(/!important\b/u)
      expect(sourceWithVisibleFocusContract(relativePath, source), `${relativePath} suppresses an outline without a focus contract`).not.toMatch(
        hiddenOutline,
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
