// Overlay handoff timing is part of interaction correctness, not visual
// decoration: a replacement Dialog/Sheet must wait for the previous portal to
// release its focus trap, while reduced-motion users should not pay an
// arbitrary animation delay.
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

export function overlayHandoffDelay(animationMs: number): number {
  if (typeof window === "undefined") {
    return animationMs
  }

  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ? 0 : animationMs
}
