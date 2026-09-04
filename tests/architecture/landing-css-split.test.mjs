import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const marketingRoot = path.join(root, "src/ui/marketing")
const landingSource = path.join(marketingRoot, "landing-page.tsx")

const landingStyleModules = [
  "landing-page.module.css",
  "landing-page-hero.module.css",
  "landing-page-showcase.module.css",
  "landing-page-capability-art.module.css",
  "landing-page-faq.module.css",
  "landing-page-footer.module.css",
]

describe("landing CSS boundaries", () => {
  it("keeps each landing responsibility in a local CSS module below the size budget", () => {
    for (const fileName of landingStyleModules) {
      const filePath = path.join(marketingRoot, fileName)
      expect(existsSync(filePath), `${fileName} is missing`).toBe(true)
      if (!existsSync(filePath)) continue

      const lineCount = readFileSync(filePath, "utf8").split(/\r?\n/u).filter((line, index, lines) => index < lines.length - 1 || line !== "").length
      expect(lineCount, `${fileName} exceeds the 500-line CSS Module budget`).toBeLessThan(500)
    }
  })

  it("imports every split stylesheet from the landing entry", () => {
    const source = readFileSync(landingSource, "utf8")
    for (const fileName of landingStyleModules) {
      expect(source, `${fileName} is not imported by landing-page.tsx`).toContain(`./${fileName}`)
    }
  })
})
