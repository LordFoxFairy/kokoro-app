// Opt-in, test-child-only observations. Never record JSON contents, request data,
// full paths, or error messages; preserve each native operation and exception.
/* eslint-disable @typescript-eslint/no-require-imports -- Node --require needs this synchronous CJS preloader before Next loads. */
const fs = require("node:fs")
const path = require("node:path")
const { createHash } = require("node:crypto")

if (process.env.KOKORO_TEST_JSON_EOF_TRACE_DIR) {
  const traceDirectory = process.env.KOKORO_TEST_JSON_EOF_TRACE_DIR
  const nativeRead = fs.readFileSync
  const nativeAppend = fs.appendFileSync
  const nativeParse = JSON.parse
  let failures = 0
  let eofFailures = 0
  let readSequence = 0
  let emitted = 0
  let emittedBytes = 0
  let dropped = 0
  const recent = []
  const emit = (record) => {
    try {
      const summary = record.kind === "installed" || record.kind === "exit"
      const line = JSON.stringify({ elapsed_ms: Math.round(process.uptime() * 1000), ...record }) + "\n"
      const bytes = Buffer.byteLength(line)
      // Reserve one maximum-sized record for the exit counters even if native
      // calls continue after observations have exhausted their event budget.
      if (bytes > 8 * 1024 || emittedBytes + bytes > (summary ? 256 : 248) * 1024 ||
          !summary && emitted >= 512) { dropped += 1; return }
      nativeAppend(path.join(traceDirectory, `next-json-eof-${process.pid}.jsonl`), line, { mode: 0o600 })
      emittedBytes += bytes
      if (!summary) emitted += 1
    } catch { /* Observation must not alter the request outcome. */ }
  }
  const safeFile = (value) => {
    const pathname = value.split("?", 1)[0]
    return pathname.length <= 256 && /^[A-Za-z0-9_./[\]-]+$/.test(pathname) ? pathname : "other"
  }
  const frames = (stack) => String(stack).split("\n").slice(1, 15).map((frame) => {
    const normalized = frame.replaceAll("\\", "/")
    const next = normalized.match(/\/next\/dist\/([^ )]+):(\d+):(\d+)/)
    if (next) return { owner: "next", file: safeFile(next[1]), line: Number(next[2]) }
    const app = normalized.match(/\/src\/([^ )]+):(\d+):(\d+)/)
    if (app) return { owner: "app", file: safeFile(app[1]), line: Number(app[2]) }
    return { owner: normalized.includes("node:") ? "node" : "other" }
  })
  fs.readFileSync = function (...args) {
    const value = Reflect.apply(nativeRead, this, args)
    const name = typeof args[0] === "string" ? args[0].replaceAll("\\", "/") : ""
    if (name.includes("/.next/") && name.endsWith(".json")) {
      const bytes = typeof value === "string" ? Buffer.from(value) : Buffer.isBuffer(value) ? value : undefined
      if (bytes !== undefined && bytes.byteLength <= 1024 * 1024) {
        const record = { read_seq: ++readSequence, file: name.slice(name.lastIndexOf("/.next/") + 1),
          byte_count: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") }
        recent.push({ text: bytes.toString("utf8"), record })
        if (recent.length > 32) recent.shift()
        if (bytes.byteLength === 0) emit({ kind: "empty_manifest_read", ...record, frames: frames(new Error().stack) })
      }
    }
    return value
  }
  JSON.parse = function (...args) {
    try { return Reflect.apply(nativeParse, this, args) }
    catch (error) {
      failures += 1
      if (error instanceof SyntaxError && error.message === "Unexpected end of JSON input") {
        eofFailures += 1
        if (eofFailures <= 512) {
          const text = typeof args[0] === "string" ? args[0] : Buffer.isBuffer(args[0]) ? args[0].toString("utf8") : undefined
          emit({ kind: "json_eof", failures, eof_failures: eofFailures,
            byte_count: text === undefined ? null : Buffer.byteLength(text),
            manifest_reads: recent.filter((entry) => entry.text === text).map((entry) => entry.record),
            frames: frames(error.stack) })
        }
      }
      throw error
    }
  }
  emit({ kind: "installed" })
  process.on("exit", () => emit({ kind: "exit", failures, eof_failures: eofFailures, manifest_reads: readSequence,
    emitted, emitted_bytes: emittedBytes, dropped }))
}
