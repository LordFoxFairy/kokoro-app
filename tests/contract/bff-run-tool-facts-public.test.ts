import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { expect, it } from "vitest"
import { restorePublic2810ToolFactsContract } from "./bff-run-tool-facts-parent"
import { restorePublic289MessageActionsContract } from "./bff-answer-actions-parent"
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
it("consumes the fixed whole Public28.12 and restores its complete untouched Public28.10 parent before existing inverses", async () => {
  const raw = await readFile("src/generated/bff-public-openapi.yaml", "utf8")
  expect(hash(raw)).toBe("ea0031103488daa1fcc0cca45fdd13f4d4061546ac4525c745ec47105649f7e7")
  expect(hash(restorePublic2810ToolFactsContract(raw))).toBe("9e6a8dddea847ecfd2905f378f4f76022b6cc49a1a4352a2e7abb4e73b3f1328")
  expect(hash(restorePublic289MessageActionsContract(raw))).toBe("b438a749c919d24c4e0f1dadfdbcbbb11e0ac755f5785c543a661336c2cbb354")
  for (const changed of [raw + "\n", raw.replace("version: 28.17.0", "version: 28.18.0"), raw.replace("        tool_facts:", "        other_facts:"), raw.replace("listTeamMembers", "unrelatedOperationChanged")]) {
    expect(changed).not.toBe(raw)
    expect(() => restorePublic2810ToolFactsContract(changed)).toThrow()
  }
})
