// Test-only Next child preloader. The native version request either completes or
// times out; no version response or business fetch is substituted.
const VERSION_URL = "https://registry.npmjs.org/-/package/next/dist-tags"

function withNextVersionCheckDeadline(nativeFetch, timeout = (milliseconds) => AbortSignal.timeout(milliseconds)) {
  return function (...args) {
    const [input, init] = args
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : undefined
    if (url !== VERSION_URL) return Reflect.apply(nativeFetch, this, args)
    const deadline = timeout(1000)
    const original = init != null && Object.prototype.hasOwnProperty.call(init, "signal")
      ? init.signal : input instanceof Request ? input.signal : undefined
    const signal = original == null ? deadline : AbortSignal.any([original, deadline])
    return Reflect.apply(nativeFetch, this, [input, { ...init, signal }])
  }
}

module.exports = { withNextVersionCheckDeadline }
if (process.env.KOKORO_TEST_NEXT_VERSION_CHECK_DEADLINE === "1") {
  globalThis.fetch = withNextVersionCheckDeadline(globalThis.fetch)
}
