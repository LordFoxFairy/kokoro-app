import { expect, it } from "vitest"
import { loadProjectGrantCommand, saveProjectGrantCommand, clearProjectGrantCommand } from "@/features/app/project-grant-command"

const scope = { tenant: "tenant", subject: "owner", projectId: "project-a" }
const intent = {
  operation: "set" as const,
  subjectId: "member",
  key: "original-key",
  version: "1",
  body: { role: "viewer" as const, expires_at: null },
  phase: "prepared" as const,
}
function memory() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}
it("restores the original grant command after remount without letting another actor, tenant or Project replace it", () => {
  const storage = memory()
  saveProjectGrantCommand(storage, scope, intent)
  saveProjectGrantCommand(storage, scope, { ...intent, phase: "attempted" })
  expect(loadProjectGrantCommand(storage, scope)).toEqual({ ...intent, phase: "attempted" })
  for (const other of [
    { ...scope, subject: "other" },
    { ...scope, tenant: "other" },
    { ...scope, projectId: "other" },
  ])
    expect(loadProjectGrantCommand(storage, other)).toBeNull()
  expect(() => saveProjectGrantCommand(storage, scope, { ...intent, key: "replacement" })).toThrow()
  clearProjectGrantCommand(storage, scope, intent)
  expect(loadProjectGrantCommand(storage, scope)).toBeNull()
})
it("fails before dispatch when the browser cannot retain and read back the command", () => {
  const storage = { ...memory(), setItem: () => undefined }
  expect(() => saveProjectGrantCommand(storage, scope, intent)).toThrow()
})
