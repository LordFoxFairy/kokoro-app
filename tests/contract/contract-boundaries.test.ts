import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

async function exists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(root, relativePath))
    return true
  } catch {
    return false
  }
}

describe("v1 contract boundaries", () => {
  it("keeps domain schemas and path helpers in explicit bounded files", async () => {
    for (const relativePath of [
      "src/contract/http.ts",
      "src/contract/chat.ts",
      "src/contract/artifacts.ts",
      "src/contract/billing.ts",
      "src/contract/catalog.ts",
      "src/contract/scheduled.ts",
      "src/contract/paths.ts",
    ]) {
      expect(await exists(relativePath), relativePath).toBe(true)
    }
  })

  it("keeps the HTTP contract as a compatibility barrel", async () => {
    const source = await readFile(path.join(root, "src/contract/http.ts"), "utf8")
    expect(source).not.toContain("z.object")
    expect(source).not.toContain("function opaquePathSegment")
    expect(source).toContain('export * from "./chat"')
    expect(source).toContain('export * from "./paths"')
  })
})
