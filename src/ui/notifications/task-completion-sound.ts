// One page identity owns one audio context; persisted preference is not audio unlock.
type SoundState = "locked" | "ready" | "unavailable"
let owner: string | null = null
let context: AudioContext | null = null
let epoch = 0
const sources = new Map<OscillatorNode, GainNode>()
const listeners = new Set<() => void>()
function emit(): void { for (const listener of listeners) { try { listener() } catch { /* Isolated UI observers. */ } } }
export function completionSoundSupported(): boolean { return typeof window !== "undefined" && typeof window.AudioContext === "function" }
export function completionSoundState(identity: string): SoundState {
  if (!completionSoundSupported()) return "unavailable"
  return owner === identity && context?.state === "running" ? "ready" : "locked"
}
export function subscribeCompletionSound(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener) } }
export function retireCompletionSound(identity: string): void {
  if (owner !== identity) return
  epoch += 1; owner = null
  const old = context; context = null
  for (const [source, gain] of sources) {
    source.onended = null
    try { source.stop() } catch { /* Already ended. */ }
    try { source.disconnect(); gain.disconnect() } catch { /* Detached owned nodes. */ }
  }
  sources.clear()
  if (old) { old.onstatechange = null; try { void old.close().catch(() => {}) } catch { /* Browser close rejection. */ } }
  emit()
}
/** Invoke synchronously from a gesture, with a guard that retires late resume promises. */
export async function unlockCompletionSound(identity: string, current: () => boolean): Promise<boolean> {
  if (!current() || !completionSoundSupported()) return false
  if (owner !== identity && owner !== null) retireCompletionSound(owner)
  owner = identity
  // Fence every gesture, including retries by the same stable owner.
  const generation = ++epoch
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    if (!context) { context = new window.AudioContext(); context.onstatechange = emit }
    const audio = context
    const resuming = audio.resume()
    const resumed = await Promise.race([resuming.then(() => true), new Promise<false>((resolve) => { timeout = setTimeout(() => resolve(false), 3000) })])
    if (!resumed) { if (owner === identity && generation === epoch) retireCompletionSound(identity); return false }
    if (!current() || owner !== identity || generation !== epoch || context !== audio) {
      if (owner === identity && generation === epoch) retireCompletionSound(identity)
      return false
    }
    if (audio.state !== "running") { retireCompletionSound(identity); return false }
    emit()
    return true
  } catch { if (owner === identity && generation === epoch) retireCompletionSound(identity); return false }
  finally { if (timeout !== undefined) clearTimeout(timeout) }
}
export function playTaskCompletionSound(identity: string): boolean {
  if (completionSoundState(identity) !== "ready" || !context) return false
  const audio = context
  let oscillator: OscillatorNode | null = null
  let gain: GainNode | null = null
  try {
    oscillator = audio.createOscillator()
    gain = audio.createGain()
    oscillator.frequency.value = 660
    gain.gain.setValueAtTime(0.12, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18)
    oscillator.connect(gain); gain.connect(audio.destination)
    sources.set(oscillator, gain)
    const source = oscillator, envelope = gain
    oscillator.onended = () => { sources.delete(source); source.onended = null; try { source.disconnect(); envelope.disconnect() } catch { /* Detached owned nodes. */ } }
    oscillator.start(); oscillator.stop(audio.currentTime + 0.2)
    return true
  } catch {
    if (oscillator) { sources.delete(oscillator); oscillator.onended = null; try { oscillator.stop() } catch { /* Unstarted source. */ } try { oscillator.disconnect() } catch { /* Detached source. */ } }
    try { gain?.disconnect() } catch { /* Detached envelope. */ }
    return false
  }
}
