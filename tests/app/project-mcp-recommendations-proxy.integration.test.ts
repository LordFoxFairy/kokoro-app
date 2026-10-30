import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { currentProductSession } = vi.hoisted(() => ({
  currentProductSession: vi.fn(),
}));
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }));
import { GET, PUT } from "@/app/api/hub/[...path]/route";
let server: Server,
  calls: IncomingMessage[],
  bodies: string[],
  peer: (request: IncomingMessage, response: ServerResponse) => void;
const ref = { kind: "mcp_connector" as const, connector_id: "connector" },
  input = { expected_state_version: "3", recommendations: [ref] },
  data = { project_id: "project", recommendations: [ref], state_version: "4" };
const path = ["projects", "project", "mcp-recommendations"],
  context = () => ({ params: Promise.resolve({ path }) });
const request = (
  body = JSON.stringify(input),
  headers: Record<string, string> = {},
  signal?: AbortSignal,
) =>
  new Request("http://web.test/api/hub/projects/project/mcp-recommendations", {
    method: "PUT",
    headers: {
      origin: "http://web.test",
      "content-type": "application/json",
      ...headers,
    },
    body,
    ...(signal ? { signal } : {}),
  });
const reply = (
  req: IncomingMessage,
  res: ServerResponse,
  raw = JSON.stringify({ data }),
  status = 200,
) => {
  const bytes = Buffer.from(raw);
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-request-id": String(req.headers["x-kokoro-request-id"]),
    "content-length": bytes.length,
  });
  res.end(bytes);
};
beforeEach(async () => {
  calls = [];
  bodies = [];
  peer = reply;
  currentProductSession
    .mockReset()
    .mockResolvedValue({
      access: "admitted-access",
      accessExpiresAt: Date.now() + 60000,
    });
  server = createServer((req, res) => {
    calls.push(req);
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (v) => {
      raw += v;
    });
    req.on("end", () => {
      bodies.push(raw);
      peer(req, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("not bound");
  for (const [k, v] of Object.entries({
    KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
    KOKORO_WEB_REDIS_URL: "redis://unused.invalid/9",
    KOKORO_WEB_ORIGIN: "http://web.test",
    KOKORO_DOMAIN: "configured.product.test",
    KOKORO_BFF_BASE_URL: `http://127.0.0.1:${addr.port}`,
    KOKORO_INTERNAL_SECRET_WEB_BFF: "synthetic-secret",
  }))
    vi.stubEnv(k, v);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});
it("real catchall thin bridge sends raw PUT bytes with trusted Content-Length/no TE and Session authority only", async () => {
  const raw =
    ' {"recommendations":[{"kind":"mcp_connector","connector_id":"connector"}],"expected_state_version":"3"}\n';
  const result = await PUT(
    request(raw, {
      authorization: "Bearer forged",
      "x-kokoro-subject": "forged",
      forwarded: "host=forged.invalid",
    }),
    context(),
  );
  expect(result.status).toBe(200);
  expect(calls).toHaveLength(1);
  expect(bodies).toEqual([raw]);
  expect(calls[0]!.method).toBe("PUT");
  expect(calls[0]!.url).toBe("/v1/projects/project/mcp-recommendations");
  expect(calls[0]!.headers["content-length"]).toBe(
    String(Buffer.byteLength(raw)),
  );
  expect(calls[0]!.headers["transfer-encoding"]).toBeUndefined();
  expect(calls[0]!.headers["idempotency-key"]).toBeUndefined();
  expect(calls[0]!.headers["x-kokoro-subject"]).toBeUndefined();
  expect(calls[0]!.headers.authorization).toBe("Bearer admitted-access");
  expect(calls[0]!.headers.forwarded).toBe("host=configured.product.test");
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(await result.json()).toEqual({ data });
  const get = await GET(
    new Request("http://web.test/api/hub/projects/project/mcp-recommendations"),
    context(),
  );
  expect(get.status).toBe(200);
  expect(calls[1]!.method).toBe("GET");
  expect(calls[1]!.headers["content-length"]).toBeUndefined();
  expect(bodies[1]).toBe("");
});
it("rejects extra identity/query/duplicate body/command headers/cross-origin before any upstream operation", async () => {
  for (const invalid of [
    request(JSON.stringify({ ...input, actor_id: "forged" })),
    request(
      '{"expected_state_version":"3","recommendations":[],"recommendations":[]}',
    ),
    request(undefined, { "idempotency-key": "forbidden" }),
    request(undefined, { origin: "https://other.invalid" }),
    request(undefined, { "content-length": "01" }),
    request(" ".repeat(16385)),
  ])
    expect([400, 403]).toContain((await PUT(invalid, context())).status);
  expect(calls).toHaveLength(0);
  const query = new Request(
    "http://web.test/api/hub/projects/project/mcp-recommendations?tenant_id=other",
  );
  expect((await GET(query, context())).status).toBe(400);
  expect(calls).toHaveLength(0);
});
it("bad owner identity/version/error tuple, malformed UTF8 or incomplete EOF are not success", async () => {
  for (const value of [
    { data: { ...data, project_id: "other" } },
    { data: { ...data, state_version: "9" } },
    {
      error: {
        code: "project_mcp_recommendations_precondition_failed",
        message: "changed",
        retryable: true,
      },
    },
  ]) {
    peer = (req, res) =>
      reply(req, res, JSON.stringify(value), "error" in value ? 412 : 200);
    expect((await PUT(request(), context())).status).toBe(502);
  }
  peer = (req, res) => {
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-request-id": String(req.headers["x-kokoro-request-id"]),
      "content-length": "1",
    });
    res.end(Buffer.from([255]));
  };
  expect((await PUT(request(), context())).status).toBe(502);
  peer = (req, res) => {
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-request-id": String(req.headers["x-kokoro-request-id"]),
      "content-length": "999",
    });
    res.write('{"data":');
    res.destroy();
  };
  expect([502, 503]).toContain((await PUT(request(), context())).status);
});
it("network failure never automatically resends PUT; GET is a separate current-state observation", async () => {
  peer = (req) => req.socket.destroy();
  expect((await PUT(request(), context())).status).toBe(503);
  expect(calls).toHaveLength(1);
  peer = reply;
  const result = await GET(
    new Request("http://web.test/api/hub/projects/project/mcp-recommendations"),
    context(),
  );
  expect(result.status).toBe(200);
  expect(calls).toHaveLength(2);
  expect(calls[1]!.method).toBe("GET");
});
it("pre-aborted caller and unavailable session do not send owner requests", async () => {
  const abort = new AbortController();
  abort.abort();
  expect(
    (await PUT(request(undefined, {}, abort.signal), context())).status,
  ).toBe(503);
  currentProductSession.mockResolvedValueOnce(null);
  expect((await PUT(request(), context())).status).toBe(401);
  expect(calls).toHaveLength(0);
});

it("caller abort closes an in-flight owner response and never lets a late body become success", async () => {
  let started!: () => void;
  const began = new Promise<void>((r) => {
    started = r;
  });
  let closed = false;
  peer = (req, res) => {
    res.once("close", () => {
      closed = true;
    });
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-request-id": String(req.headers["x-kokoro-request-id"]),
    });
    res.write('{"data":');
    started();
  };
  const abort = new AbortController(),
    pending = PUT(request(undefined, {}, abort.signal), context());
  await began;
  abort.abort();
  expect((await pending).status).toBe(503);
  await new Promise((r) => setTimeout(r, 30));
  expect(closed).toBe(true);
  expect(calls).toHaveLength(1);
});
it("admission and slow owner EOF consume one ten-second budget, not a renewed response timer", async () => {
  currentProductSession.mockImplementationOnce(
    () =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              access: "admitted-access",
              accessExpiresAt: Date.now() + 60000,
            }),
          1000,
        ),
      ),
  );
  peer = (req, res) => {
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-request-id": String(req.headers["x-kokoro-request-id"]),
    });
    res.write('{"data":');
  };
  const started = performance.now();
  const result = await PUT(request(), context());
  const elapsed = performance.now() - started;
  expect(result.status).toBe(503);
  expect(elapsed).toBeGreaterThan(9500);
  expect(elapsed).toBeLessThan(10950);
  expect(calls).toHaveLength(1);
}, 15000);
