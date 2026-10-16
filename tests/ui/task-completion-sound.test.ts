import { afterEach, describe, expect, it, vi } from "vitest"
import { completionSoundState, playTaskCompletionSound, retireCompletionSound, unlockCompletionSound } from "@/ui/notifications/task-completion-sound"

const identity = "sound-fixture"
afterEach(() => { retireCompletionSound(identity); vi.unstubAllGlobals(); vi.useRealTimers() })
function audioFixture() {
  const start = vi.fn(), stop = vi.fn(), disconnect = vi.fn()
  const oscillator = { frequency: { value: 0 }, connect: vi.fn(), disconnect, start, stop, onended: null }
  const gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect }
  const context = { state: "suspended", currentTime: 1, destination: {}, onstatechange: null, resume: vi.fn(async () => { context.state = "running" }), close: vi.fn(async () => { context.state = "closed" }), createOscillator: vi.fn(() => oscillator), createGain: vi.fn(() => gain) }
  const constructor = vi.fn(function AudioFixture() { return context })
  vi.stubGlobal("AudioContext", constructor)
  return { context, constructor, start, stop }
}
describe("owned task completion audio lifecycle", () => {
  it("does not construct or resume audio from saved preference or delivery", () => {
    const fixture = audioFixture()
    expect(completionSoundState(identity)).toBe("locked")
    expect(playTaskCompletionSound(identity)).toBe(false)
    expect(fixture.constructor).not.toHaveBeenCalled()
    expect(fixture.context.resume).not.toHaveBeenCalled()
  })
  it("starts create/resume synchronously during gesture and plays one bounded tone after unlock", async () => {
    const fixture = audioFixture()
    const promise = unlockCompletionSound(identity, () => true)
    expect(fixture.constructor).toHaveBeenCalledTimes(1)
    expect(fixture.context.resume).toHaveBeenCalledTimes(1)
    expect(await promise).toBe(true)
    expect(playTaskCompletionSound(identity)).toBe(true)
    expect(fixture.start).toHaveBeenCalledTimes(1)
    expect(fixture.stop).toHaveBeenCalledWith(1.2)
    retireCompletionSound(identity)
    expect(fixture.context.close).toHaveBeenCalledTimes(1)
    expect(playTaskCompletionSound(identity)).toBe(false)
  })
  it("does not auto resume a suspended context or play a backlog", async () => {
    const fixture = audioFixture(); await unlockCompletionSound(identity, () => true)
    fixture.context.state = "suspended"
    expect(playTaskCompletionSound(identity)).toBe(false)
    expect(fixture.context.resume).toHaveBeenCalledTimes(1)
    expect(completionSoundState(identity)).toBe("locked")
  })
  it("contains rejected resume and closes its own context", async () => {
    const fixture = audioFixture(); fixture.context.resume.mockRejectedValueOnce(new Error("denied"))
    expect(await unlockCompletionSound(identity, () => true)).toBe(false)
    expect(fixture.context.close).toHaveBeenCalledTimes(1)
    expect(completionSoundState(identity)).toBe("locked")
  })
  it("retires late resume without resurrecting audio or affecting another identity", async () => {
    const fixture = audioFixture()
    let resolve!: () => void
    fixture.context.resume.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done }))
    const result = unlockCompletionSound(identity, () => true)
    retireCompletionSound("not-owner")
    expect(fixture.context.close).not.toHaveBeenCalled()
    retireCompletionSound(identity); resolve()
    expect(await result).toBe(false)
    expect(playTaskCompletionSound(identity)).toBe(false)
    expect(fixture.context.close).toHaveBeenCalledTimes(1)
  })
  it("closes context if the requesting component retired while resume was pending", async () => {
    const fixture = audioFixture()
    let live = true; let resolve!: () => void
    fixture.context.resume.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done }))
    const result = unlockCompletionSound(identity, () => live)
    live = false; resolve()
    expect(await result).toBe(false)
    expect(fixture.context.close).toHaveBeenCalledTimes(1)
  })
  it("reports unsupported and catches oscillator delivery exceptions", async () => {
    vi.stubGlobal("AudioContext", undefined)
    expect(await unlockCompletionSound(identity, () => true)).toBe(false)
    expect(completionSoundState(identity)).toBe("unavailable")
    const fixture = audioFixture(); await unlockCompletionSound(identity, () => true)
    fixture.context.createOscillator.mockImplementationOnce(() => { throw new Error("blocked") })
    expect(playTaskCompletionSound(identity)).toBe(false)
  })
})

it("bounds an indefinitely pending resume, closes owned context, and ignores its late settlement", async () => {
  vi.useFakeTimers()
  const fixture = audioFixture()
  let resolve!: () => void
  fixture.context.resume.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done }))
  const result = unlockCompletionSound(identity, () => true)
  await vi.advanceTimersByTimeAsync(3000)
  expect(await result).toBe(false)
  expect(fixture.context.close).toHaveBeenCalledTimes(1)
  resolve(); await Promise.resolve()
  expect(completionSoundState(identity)).toBe("locked")
  expect(playTaskCompletionSound(identity)).toBe(false)
  vi.useRealTimers()
})

it("closes a context whose resume resolves without actually becoming running", async () => {
  const fixture = audioFixture()
  fixture.context.resume.mockImplementationOnce(async () => {})
  expect(await unlockCompletionSound(identity, () => true)).toBe(false)
  expect(fixture.context.close).toHaveBeenCalledTimes(1)
  expect(playTaskCompletionSound(identity)).toBe(false)
})

it("an old same-owner pending unlock cannot close a later successful gesture", async () => {
  const fixture = audioFixture()
  let oldLive = true; let resolve!: () => void
  fixture.context.resume.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done }))
  const old = unlockCompletionSound(identity, () => oldLive)
  oldLive = false
  expect(await unlockCompletionSound(identity, () => true)).toBe(true)
  resolve(); expect(await old).toBe(false)
  expect(fixture.context.close).not.toHaveBeenCalled()
  expect(completionSoundState(identity)).toBe("ready")
})
