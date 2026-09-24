/**
 * Fixed Kokoro product identity for the public landing and Product RP login.
 * The authenticated workspace may overlay site presentation only after its
 * domain-bound System manifest has been verified.
 */
export const DEFAULT_BRAND = Object.freeze({
  name: "Kokoro",
  mark: "心",
})

export const DEFAULT_WEB_TITLE = `${DEFAULT_BRAND.name} Web`
