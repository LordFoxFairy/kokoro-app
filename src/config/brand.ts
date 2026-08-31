/**
 * Build-time fallback used before a tenant runtime manifest is available.
 * Live sites must override these values through the domain-bound manifest.
 */
export const DEFAULT_BRAND = Object.freeze({
  name: "Kokoro",
  mark: "心",
})

export const DEFAULT_WEB_TITLE = `${DEFAULT_BRAND.name} Web`
