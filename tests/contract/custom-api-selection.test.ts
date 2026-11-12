import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { expect, it } from "vitest"
import { messageCreateParamsSchema, parseSessionSnapshot, parseSharedSessionSnapshot } from "@/contract/chat"
import { restorePublic2816CustomApiSelectionContract } from "./bff-custom-api-selection-parent"
import { makeSnapshot } from "../core/fixtures"
it("consumes the exact formal full Public28.18 and restores every original Public28.16 byte", async () => {
  const raw = await readFile("src/generated/bff-public-openapi.yaml", "utf8"), hash = (value: string) => createHash("sha256").update(value).digest("hex")
  expect(hash(raw)).toBe("a26431d45ad96c4e80e6751d61e66a14b3933ae7c2ffb6f9e7df57fcc7e6808f")
  expect(hash(restorePublic2816CustomApiSelectionContract(raw))).toBe("82485c2b7be17ad04f56d3656a58b42ea8d308c9dc22db5807a09ab706418a77")
  for (const bad of [raw + "\n", raw.replace("selected_custom_api_profiles:", "unreviewed_profiles:"), raw.replace("getMessageFeedback", "wrongFeedback")]) expect(() => restorePublic2816CustomApiSelectionContract(bad)).toThrow()
})
it("strictly accepts only ordered safe API IDs and integer versions in both send and private restoration", () => {
  const refs = [{ profile_id: "same:id", expected_state_version: 2147483647 }]
  const input = { idempotency_key: "k", content: "hello", selected_mcp_connection_ids: ["same:id"], selected_custom_api_profiles: refs }
  expect(messageCreateParamsSchema.parse(input).selected_custom_api_profiles).toEqual(refs)
  const snapshot = { ...makeSnapshot(), composer_selection: { source_message_id: "original", selected_mcp_connection_ids: ["same:id"], selected_custom_api_profiles: refs } }
  expect(parseSessionSnapshot(snapshot).composer_selection?.selected_custom_api_profiles).toEqual(refs)
  expect(() => parseSharedSessionSnapshot(snapshot)).toThrow()
  for (const bad of [null, [{ profile_id: "a", expected_state_version: "7" }], [{ profile_id: "a", expected_state_version: 0 }], [{ profile_id: "a", expected_state_version: 2147483648 }], [{ profile_id: "a", expected_state_version: 1.1 }], [{ profile_id: "a\n", expected_state_version: 7 }], [{ ...refs[0], instructions: "not safe selection" }], [refs[0], { ...refs[0], expected_state_version: 7 }], Array.from({ length: 33 }, (_, i) => ({ profile_id: `api:${i}`, expected_state_version: 1 }))]) {
    expect(messageCreateParamsSchema.safeParse({ ...input, selected_custom_api_profiles: bad }).success).toBe(false)
    expect(() => parseSessionSnapshot({ ...snapshot, composer_selection: { ...snapshot.composer_selection, selected_custom_api_profiles: bad } })).toThrow()
  }
})
