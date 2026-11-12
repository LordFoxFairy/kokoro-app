import { restorePublic2822ScheduledExecutionsContract } from "./bff-scheduled-executions-parent"
// Test-only exact Public28.21 -> Public28.20 inverse. Never a runtime fallback.
import { createHash } from "node:crypto"

const hash = (source: string) => createHash("sha256").update(source).digest("hex")
const field = "        interrupt_run_id:\n"
const delta = field + [
  "          type: string",
  "          minLength: 1",
  "          maxLength: 191",
  "          pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\\s\\S])'",
  "          description: >-",
  "            For an existing session, name its exact active Run to cancel while accepting this",
  "            FIFO successor. The same key and input return the original receipt. A stale target",
  "            or a Run already claimed by another interrupt returns 409 run_delivery_conflict",
  "            without accepting a new message. Acceptance does not prove cancellation or bypass FIFO.",
  "",
].join("\n")

const steerReceiptDelta = [
  "        message_id:\n",
  "          type: string\n",
  "          minLength: 1\n",
  "          description: Only present for run.steer; the BFF-owned user Message ID, not the client intent ID. Pending does not prove injection.\n",
].join("")

// Exact Public28.22 -> Public28.21; earlier owner proofs retain their old bytes.
export function restorePublic2821SteerReceiptContract(source: string): string {
  source = restorePublic2822ScheduledExecutionsContract(source)
  const version = "  version: 28.22.0\n"
  if (!source.includes(version)) {
    if (source.includes(steerReceiptDelta)) throw Error("Steer receipt Public28.22 version drift")
    return source
  }
  if (hash(source) !== "a3d71aa845265084f7965c06dc903e2a5bf24c47d23bceb9a19bcd5d991c08b4") throw Error("Steer receipt Public28.22 child drift")
  if (source.split(steerReceiptDelta).length !== 2) throw Error("Steer receipt Public28.22 exact delta drift")
  const parent = source.replace(steerReceiptDelta, "").replace(version, "  version: 28.21.0\n")
  if (hash(parent) !== "a5ea4bb0ef1458a536e3b54e01049267aec2913d147f2ad7bb99a481197d0525") throw Error("Steer receipt Public28.21 parent drift")
  return parent
}

export function restorePublic2820InterruptSubmitContract(source: string): string {
  source = restorePublic2821SteerReceiptContract(source)
  const version = "  version: 28.21.0\n"
  if (!/^  version: 28\.21\.0$/mu.test(source)) {
    if (source.includes(field)) throw Error("Interrupt submit Public28.21 version drift")
    return source
  }
  if (hash(source) !== "a5ea4bb0ef1458a536e3b54e01049267aec2913d147f2ad7bb99a481197d0525") {
    throw Error("Interrupt submit Public28.21 child drift")
  }
  if (source.split(delta).length !== 2) throw Error("Interrupt submit Public28.21 exact delta drift")
  const parent = source.replace(delta, "").replace(version, "  version: 28.20.0\n")
  if (hash(parent) !== "c5fc7225901fa5b815cdb7ee5286354d7c4cabed9919676e6e86651fb9910783") {
    throw Error("Interrupt submit Public28.20 parent drift")
  }
  return parent
}
