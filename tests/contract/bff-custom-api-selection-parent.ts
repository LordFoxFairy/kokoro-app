// Test-only exact formal853ca Public28.17 -> whole28.16; never a runtime fallback.
import { createHash } from "node:crypto"
const hash = (source: string) => createHash("sha256").update(source).digest("hex")
// The API selection adds only two optional safe-ref fields; all parent bytes remain fixed.
export function restorePublic2816CustomApiSelectionContract(source: string) {
  if (!/^  version: 28\.17\.0$/mu.test(source)) return source
  if (hash(source) !== "ea0031103488daa1fcc0cca45fdd13f4d4061546ac4525c745ec47105649f7e7") throw Error("Custom API selection Public28.17 child drift")
  for (const field of [
    "        selected_custom_api_profiles:\n          type: array\n          maxItems: 32\n          uniqueItems: true\n          x-kokoro-unique-by: profile_id\n          description: Exact ordered Custom API profile/version references for this message. Omission or [] selects none. Selection is intent, not authorization; values and credentials are never included.\n          items:\n            type: object\n            additionalProperties: false\n            required: [profile_id, expected_state_version]\n            properties:\n              profile_id:\n                type: string\n                minLength: 1\n                maxLength: 191\n                pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\\s\\S])'\n              expected_state_version:\n                type: integer\n                minimum: 1\n                maximum: 2147483647\n",
    "                selected_custom_api_profiles:\n                  type: array\n                  maxItems: 32\n                  uniqueItems: true\n                  x-kokoro-unique-by: profile_id\n                  description: Exact ordered Custom API profile/version references for this message. Omission or [] selects none. Selection is intent, not authorization; values and credentials are never included.\n                  items:\n                    type: object\n                    additionalProperties: false\n                    required: [profile_id, expected_state_version]\n                    properties:\n                      profile_id:\n                        type: string\n                        minLength: 1\n                        maxLength: 191\n                        pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\\s\\S])'\n                      expected_state_version:\n                        type: integer\n                        minimum: 1\n                        maximum: 2147483647\n",
  ]) {
    if (source.split(field).length !== 2) throw Error("Custom API selection exact delta drift")
    source = source.replace(field, "")
  }
  source = source.replace("  version: 28.17.0\n", "  version: 28.16.0\n")
  if (hash(source) !== "82485c2b7be17ad04f56d3656a58b42ea8d308c9dc22db5807a09ab706418a77") throw Error("Custom API selection Public28.16 parent drift")
  return source
}
