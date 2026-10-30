import { customApiStateVersionWireSchema, selectedCustomApiProfilesWireSchema } from "@/generated/bff-tool-display"
/** Safe current-profile references only. Execution authority stays with Platform. */
export type CustomApiSelection = Readonly<{ profileId: string; expectedStateVersion: string }>
export type CustomApiSelectionRestore = Readonly<{ sessionId: string; sourceMessageId: string; profiles: readonly CustomApiSelection[] }>
export function customApiVersionIsSelectable(value: string): boolean {
  const version = Number(value)
  return String(version) === value && customApiStateVersionWireSchema.safeParse(version).success
}
export function freezeCustomApiSelection(values: readonly CustomApiSelection[]): readonly CustomApiSelection[] {
  if (!Array.isArray(values) || values.some(value => typeof value.profileId !== "string" || typeof value.expectedStateVersion !== "string" || !customApiVersionIsSelectable(value.expectedStateVersion))) throw Error("Invalid Custom API selection")
  selectedCustomApiProfilesWireSchema.parse(values.map(value => ({ profile_id: value.profileId, expected_state_version: Number(value.expectedStateVersion) })))
  return Object.freeze(values.map(({ profileId, expectedStateVersion }) => Object.freeze({ profileId, expectedStateVersion })))
}
