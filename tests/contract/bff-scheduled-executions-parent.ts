import { restorePublic2823MessageResourceContract } from "./bff-message-resource-parent"
import { createHash } from "node:crypto"
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

export function restorePublic2822ScheduledExecutionsContract(source: string): string {
  source = restorePublic2823MessageResourceContract(source)
  if (!/^  version: 28\.23\.0$/mu.test(source)) return source
  if (hash(source) !== "0abd300ffc5d50d3aefa19832a32feb53ea358933bcc4df655202517554a7504") throw Error("Scheduled executions Public28.23 child drift")
  const parent = source
    .replace(/^  \/v1\/scheduled-tasks\/executions:\n[\s\S]*?(?=^  \/v1\/scheduled-tasks\/\{id\}:)/mu, "")
    .replace(/^    ScheduledTaskExecution:\n[\s\S]*?(?=^    ScheduledTaskLocalDate:)/mu, "")
    .replace(
      "      parameters:\n        - in: query\n          name: project_id\n          description: Exact visible Project filter; omitted lists the current subject's tasks.\n          schema: { type: string, minLength: 1, maxLength: 191 }\n",
      "",
    )
    .replace("  version: 28.23.0\n", "  version: 28.22.0\n")
  if (hash(parent) !== "a3d71aa845265084f7965c06dc903e2a5bf24c47d23bceb9a19bcd5d991c08b4") throw Error("Scheduled executions complete Public28.22 parent drift")
  return parent
}
