import { describe, expect, it } from "vitest"

import {
  artifactContentPath,
  controlPath,
  controlReceiptPath,
  deliveryPath,
  eventsPath,
  messagesPath,
  renameSessionPath,
  sharePath,
  sharedSnapshotPath,
  snapshotPath,
} from "@/contract/http"

describe("opaque HTTP path segments", () => {
  it("encodes session, run, decision, hash, and share references exactly once", () => {
    const sessionId = "session/a?b#c%20"
    const runId = "run/a?b#c%20"
    const decisionId = "decision/a?b#c%20"
    const hash = "sha256/a?b#c%20"

    expect(messagesPath(sessionId)).toBe("/sessions/session%2Fa%3Fb%23c%2520/messages")
    expect(snapshotPath(sessionId)).toBe("/sessions/session%2Fa%3Fb%23c%2520")
    expect(eventsPath(sessionId)).toBe("/sessions/session%2Fa%3Fb%23c%2520/events")
    expect(renameSessionPath(sessionId)).toBe("/sessions/session%2Fa%3Fb%23c%2520/title")
    expect(deliveryPath(sessionId, hash)).toBe("/sessions/session%2Fa%3Fb%23c%2520/deliveries/sha256%2Fa%3Fb%23c%2520")
    expect(controlPath(sessionId, runId)).toBe("/sessions/session%2Fa%3Fb%23c%2520/runs/run%2Fa%3Fb%23c%2520/control")
    expect(controlReceiptPath(sessionId, runId, decisionId)).toBe("/sessions/session%2Fa%3Fb%23c%2520/runs/run%2Fa%3Fb%23c%2520/control/decision%2Fa%3Fb%23c%2520")
    expect(sharePath(sessionId)).toBe("/sessions/session%2Fa%3Fb%23c%2520/share")
    expect(sharedSnapshotPath("share/a?b#c%20")).toBe("/shared/share%2Fa%3Fb%23c%2520")
    expect(artifactContentPath(hash)).toBe("/artifacts/sha256%2Fa%3Fb%23c%2520")
  })
})
