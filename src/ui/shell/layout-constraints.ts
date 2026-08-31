/**
 * Shared desktop shell geometry.
 *
 * Both resize handles constrain the same middle conversation surface. Keeping
 * this value in one place is important: if Rail and Canvas use different
 * minima, the same physical boundary is reachable at two different pointer
 * positions and the seam appears to jump or briefly render as two edges.
 */
export const WORKSPACE_MAIN_MIN = 420
