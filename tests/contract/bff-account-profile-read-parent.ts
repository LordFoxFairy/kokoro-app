// Test-only exact Public28.18 -> whole28.17; never a runtime fallback.
import { createHash } from "node:crypto"
import { restorePublic2819ProjectTaskContract } from "./bff-project-tasks-parent"

const hash = (source: string) => createHash("sha256").update(source).digest("hex")

export function restorePublic2817AccountProfileReadContract(source: string) {
  source = restorePublic2819ProjectTaskContract(source)
  if (/^  version: 28\.19\.0$/mu.test(source)) {
    if (hash(source) !== "27032917fb272601b6da8ba9227bab5324ac305682a72c94adca72e4f9e25577") {
      throw Error("Context window Public28.19 child drift")
    }
    const failure = "                - context_window_exceeded\n"
    if (source.split(failure).length !== 3) throw Error("Context window Public28.19 exact delta drift")
    source = source.replaceAll(failure, "").replace("  version: 28.19.0\n", "  version: 28.18.0\n")
  }
  if (!/^  version: 28\.18\.0$/mu.test(source)) {
    if (source.includes("      operationId: readAccountProfile\n") || source.includes("    AccountProfileReadResponse:\n")) {
      throw Error("Account profile read Public28.18 version drift")
    }
    return source
  }
  if (hash(source) !== "35a86f91e44beb1aeb6b17eca41d3bfdc79f11a43633662113a1778b4fab6082") {
    throw Error("Account profile read Public28.18 child drift")
  }
  // The owner added only this GET and response schema. Preserve all other raw bytes.
  const get = /(?<=^  \/v1\/account\/profile:\n)    get:\n[\s\S]*?(?=^    patch:\n)/gmu
  const schema = /^    AccountProfileReadResponse:\n[\s\S]*?(?=^    AccountProfileError400:\n)/gmu
  for (const delta of [get, schema]) {
    if ([...source.matchAll(delta)].length !== 1) throw Error("Account profile read exact delta drift")
    source = source.replace(delta, "")
  }
  source = source.replace("  version: 28.18.0\n", "  version: 28.17.0\n")
  if (hash(source) !== "ea0031103488daa1fcc0cca45fdd13f4d4061546ac4525c745ec47105649f7e7") {
    throw Error("Account profile read Public28.17 parent drift")
  }
  return source
}
