import { spawn, type ChildProcess } from "node:child_process"
import { cp, mkdtemp, rm, symlink } from "node:fs/promises"
import { createServer, request as httpRequest, type Server } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

type HttpResult = Readonly<{ status: number; headers: Readonly<Record<string, string | string[] | undefined>>; body: string }>

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("fixture server did not bind")
  return address.port
}

async function unusedPort(): Promise<number> {
  const probe = createServer()
  const port = await listen(probe)
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()))
  return port
}

function rawHttp(
  port: number,
  requestPath: string,
  host = `localhost:${port}`,
  chunkedBody?: string,
): Promise<HttpResult> {
  return new Promise<HttpResult>((resolve, reject) => {
    const headers: Record<string, string> = { host }
    if (chunkedBody !== undefined) headers["transfer-encoding"] = "chunked"
    const request = httpRequest({ hostname: "127.0.0.1", port, path: requestPath, headers }, (response) => {
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.once("end", () => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }))
    })
    request.once("error", reject)
    request.end(chunkedBody)
  })
}

async function waitForNext(port: number, diagnostics: () => string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await rawHttp(port, "/iam/jwks")
      if (response.status === 200) return
    } catch {
      // The socket is not accepting requests yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Next fixture did not become ready\n${diagnostics()}`)
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    let forcedExit: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(fallback)
      if (forcedExit !== undefined) clearTimeout(forcedExit)
      resolve()
    }
    const fallback = setTimeout(() => {
      child.kill("SIGKILL")
      forcedExit = setTimeout(finish, 1_000)
    }, 5_000)
    child.once("exit", finish)
    if (!child.kill("SIGTERM")) finish()
  })
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections()
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function createIsolatedNextFixture(projectRoot: string): Promise<string> {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "kokoro-iam-relay-next-"))
  try {
    await cp(path.join(projectRoot, "src"), path.join(fixtureRoot, "src"), { recursive: true })
    await cp(path.join(projectRoot, "public"), path.join(fixtureRoot, "public"), { recursive: true })
    for (const name of ["package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) {
      await cp(path.join(projectRoot, name), path.join(fixtureRoot, name))
    }
    await symlink(path.join(projectRoot, "node_modules"), path.join(fixtureRoot, "node_modules"), "dir")
    return fixtureRoot
  } catch (error) {
    await rm(fixtureRoot, { recursive: true, force: true })
    throw error
  }
}

describe("IAM relay through the real Next HTTP boundary", { timeout: 30_000 }, () => {
  let bff: Server | undefined
  let bffPort = 0
  let nextPort = 0
  let next: ChildProcess | undefined
  let nextOutput = ""
  let fixtureRoot: string | undefined
  const receivedPaths: string[] = []

  async function cleanupResources(): Promise<void> {
    const errors: unknown[] = []
    if (next !== undefined) {
      const child = next
      next = undefined
      try { await stop(child) } catch (error) { errors.push(error) }
    }
    if (bff !== undefined) {
      const server = bff
      bff = undefined
      try { await close(server) } catch (error) { errors.push(error) }
    }
    if (fixtureRoot !== undefined) {
      const directory = fixtureRoot
      fixtureRoot = undefined
      try { await rm(directory, { recursive: true, force: true }) } catch (error) { errors.push(error) }
    }
    if (errors.length > 0) throw new AggregateError(errors, "failed to clean IAM relay Next fixture")
  }

  beforeAll(async () => {
    try {
      const projectRoot = process.cwd()
      fixtureRoot = await createIsolatedNextFixture(projectRoot)
      bff = createServer((request, response) => {
        receivedPaths.push(request.url ?? "")
        const payload = JSON.stringify({ keys: [] })
        response.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "next-http-probe",
          "content-length": Buffer.byteLength(payload),
        })
        response.end(payload)
      })
      bffPort = await listen(bff)
      nextPort = await unusedPort()
      const nextBin = path.resolve(projectRoot, "node_modules/next/dist/bin/next")
      next = spawn(
        process.execPath,
        [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(nextPort)],
        {
          cwd: fixtureRoot,
          env: {
            ...process.env,
            KOKORO_WEB_ORIGIN: `http://localhost:${nextPort}`,
            KOKORO_BFF_BASE_URL: `http://127.0.0.1:${bffPort}`,
            KOKORO_INTERNAL_SECRET_WEB_BFF: "next-http-secret",
            NEXT_PUBLIC_SESSION_PREVIEW: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      )
      next.stdout?.on("data", (chunk: Buffer) => { nextOutput += chunk.toString("utf8") })
      next.stderr?.on("data", (chunk: Buffer) => { nextOutput += chunk.toString("utf8") })
      await waitForNext(nextPort, () => nextOutput)
    } catch (error) {
      try {
        await cleanupResources()
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "failed to start and clean IAM relay Next fixture")
      }
      throw error
    }
  })

  beforeEach(() => { receivedPaths.length = 0 })

  afterAll(cleanupResources)

  it("relays the canonical GET and rejects an untrusted Host without relying on Origin", async () => {
    const canonical = await rawHttp(nextPort, "/iam/jwks")
    expect(canonical.status).toBe(200)
    expect(JSON.parse(canonical.body)).toEqual({ keys: [] })
    expect(receivedPaths.splice(0)).toEqual(["/iam/jwks"])

    const attacker = await rawHttp(nextPort, "/iam/jwks", "evil.example")
    expect(attacker.status).toBe(403)
    expect(JSON.parse(attacker.body)).toMatchObject({ error: { code: "iam_relay_origin_rejected" } })
    expect(receivedPaths).toEqual([])
  })

  it("rejects a chunked GET body before opening BFF", async () => {
    const response = await rawHttp(nextPort, "/iam/jwks", undefined, "unexpected-body")

    expect(response.status).toBe(400)
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: "iam_relay_body_rejected" } })
    expect(receivedPaths).toEqual([])
  })

  it("records Next canonicalization honestly without expanding the relay allowlist", async () => {
    const dotSegment = await rawHttp(nextPort, "/iam/oauth2/../jwks")
    expect(dotSegment.status).toBe(200)
    expect(receivedPaths.splice(0)).toEqual(["/iam/jwks"])

    const encodedDotSegment = await rawHttp(nextPort, "/iam/oauth2/%2e%2e/jwks")
    expect(encodedDotSegment.status).toBe(200)
    expect(receivedPaths.splice(0)).toEqual(["/iam/jwks"])

    const doubleSlash = await rawHttp(nextPort, "/iam/oauth2//authorize")
    expect(doubleSlash.status).toBe(308)
    expect(doubleSlash.headers.location).toBe("/iam/oauth2/authorize")
    expect(receivedPaths).toEqual([])

    const encodedName = await rawHttp(nextPort, "/iam/oauth2/%61uthorize")
    expect(encodedName.status).toBe(404)
    expect(receivedPaths).toEqual([])
  })
})
