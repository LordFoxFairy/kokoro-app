import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import YAML from "yaml";
import {
  requestWithDomain,
  DEFAULT_UPSTREAM_MAX_RESPONSE_BYTES,
  UpstreamResponseTooLargeError,
} from "@/lib/server/upstream-http";
import { publicSkillListProvenance } from "@/generated/bff-public-skill-list/provenance";
import { GET } from "@/app/v1/skill.list/route";
vi.mock("@/lib/server/upstream-http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/upstream-http")>()),
  requestWithDomain: vi.fn(),
}));
const headers = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "x-request-id": "owner-public-1",
};
const payload = {
  ok: true,
  request_id: "owner-public-1",
  data: [
    {
      id: "skill-1",
      name: "Actual",
      owner_type: "personal",
      created_at: 1792627200,
    },
  ],
};
const env = {
  KOKORO_BFF_BASE_URL: "http://bff.test",
  KOKORO_WEB_ORIGIN: "https://app.test",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "configured-only-secret",
  KOKORO_DOMAIN: "app.test",
};
const input = (overrides: Record<string, string> = {}, query = "") =>
  new Request(`https://app.test/v1/skill.list${query}`, {
    headers: {
      host: "app.test",
      authorization: "Bearer original-native-token",
      ...overrides,
    },
  });
beforeEach(() => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.mocked(requestWithDomain)
    .mockReset()
    .mockResolvedValue(Response.json(payload, { headers }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("uses only the fixed public operation artifact and preserves public numeric timestamps", async () => {
  const bytes = await readFile("src/generated/bff-public-openapi.yaml"),
    spec = YAML.parse(bytes.toString());
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    publicSkillListProvenance.sourceSha256,
  );
  expect(
    Object.keys(spec.paths[publicSkillListProvenance.path].get.responses).map(
      Number,
    ),
  ).toEqual([...publicSkillListProvenance.statuses]);
  const response = await GET(input());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(payload);
});
it("keeps the native bearer but replaces caller service/tenant authority and never adds a Session or cookie", async () => {
  const response = await GET(
    input(
      {
        cookie: "private-cookie=value",
        "x-kokoro-service": "forged",
        "x-kokoro-internal-secret": "forged",
        "x-kokoro-tenant-id": "foreign",
        forwarded: "host=foreign.invalid",
      },
      "?project_id=project-1",
    ),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.has("set-cookie")).toBe(false);
  const [url, domain, options] = vi.mocked(requestWithDomain).mock.calls[0]!;
  expect(url).toBe("http://bff.test/v1/skill.list?project_id=project-1");
  expect(domain).toBe("app.test");
  expect(options?.headers).toEqual({
    authorization: "Bearer original-native-token",
    accept: "application/json",
    "x-kokoro-service": "web-bff",
    "x-kokoro-internal-secret": "configured-only-secret",
    "x-kokoro-request-id": expect.any(String),
  });
  expect(options).toMatchObject({
    timeoutMs: 10000,
    maxResponseBytes: DEFAULT_UPSTREAM_MAX_RESPONSE_BYTES,
  });
});
it.each([
  { host: "foreign.test" },
  { origin: "http://app.test" },
  { origin: "https://foreign.test" },
])("rejects forged host/origin before upstream %o", async (forged) => {
  expect((await GET(input(forged))).status).toBe(403);
  expect(requestWithDomain).not.toHaveBeenCalled();
});
it.each([
  "",
  "Basic TOKEN",
  "Bearer one, Bearer two",
  "Bearer with whitespace",
])(
  "rejects malformed native bearer %s without Session fallback",
  async (authorization) => {
    expect((await GET(input({ authorization }))).status).toBe(401);
    expect(requestWithDomain).not.toHaveBeenCalled();
  },
);
it.each([
  "?project_id=one&project_id=two",
  "?tenant_id=foreign",
  "?__proto__=foreign",
])("rejects unknown or duplicate public query %s", async (query) => {
  expect((await GET(input({}, query))).status).toBe(400);
  expect(requestWithDomain).not.toHaveBeenCalled();
});
it.each([400, 401, 403, 404, 405, 410, 429, 502, 503])(
  "preserves only declared public error status %s and its native envelope",
  async (status) => {
    const body = {
      ok: false,
      request_id: "owner-public-1",
      error: { code: "OwnerCode", message: "Owner message" },
    };
    vi.mocked(requestWithDomain).mockResolvedValue(
      Response.json(body, {
        status,
        headers: {
          ...headers,
          ...(status === 429 ? { "retry-after": "3" } : {}),
        },
      }),
    );
    const response = await GET(input());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(response.headers.get("retry-after")).toBe(
      status === 429 ? "3" : null,
    );
  },
);
it.each([
  "redirect",
  "bad-media",
  "cacheable",
  "wrong-request",
  "unknown-field",
  "nested-extra",
  "duplicate-key",
  "numeric-string",
  "invalid-json",
  "oversized-length",
])("rejects invalid upstream public response: %s", async (kind) => {
  let body = JSON.stringify(payload),
    status = 200;
  const changed: Record<string, string> = {};
  if (kind === "redirect") {
    status = 302;
    changed.location = "https://foreign.invalid";
  }
  if (kind === "bad-media") changed["content-type"] = "text/plain";
  if (kind === "cacheable") changed["cache-control"] = "public, max-age=3600";
  if (kind === "wrong-request")
    body = body.replace("owner-public-1", "another-request");
  if (kind === "unknown-field")
    body = JSON.stringify({ ...payload, secret: "untrusted" });
  if (kind === "nested-extra")
    body = JSON.stringify({
      ...payload,
      data: [{ ...payload.data[0], secret: "untrusted" }],
    });
  if (kind === "duplicate-key")
    body = body.replace('"ok":true', '"ok":false,"ok":true');
  if (kind === "numeric-string")
    body = body.replace("1792627200", '"1792627200"');
  if (kind === "invalid-json") body = "{";
  if (kind === "oversized-length")
    changed["content-length"] = String(DEFAULT_UPSTREAM_MAX_RESPONSE_BYTES + 1);
  vi.mocked(requestWithDomain).mockResolvedValue(
    new Response(body, { status, headers: { ...headers, ...changed } }),
  );
  const response = await GET(input());
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    ok: false,
    error: { code: "InvalidResponse" },
  });
  expect(requestWithDomain).toHaveBeenCalledOnce();
});
it("bounds oversized transport responses without returning private bytes", async () => {
  vi.mocked(requestWithDomain).mockRejectedValue(
    new UpstreamResponseTooLargeError(),
  );
  expect((await GET(input())).status).toBe(502);
});
it("ends one absolute ten-second budget even when the upstream ignores cancellation, without retry", async () => {
  vi.useFakeTimers();
  vi.mocked(requestWithDomain).mockImplementation(
    () => new Promise(() => undefined),
  );
  const request = GET(input());
  await vi.advanceTimersByTimeAsync(10001);
  expect((await request).status).toBe(503);
  expect(requestWithDomain).toHaveBeenCalledOnce();
  expect(vi.mocked(requestWithDomain).mock.calls[0]?.[2]?.signal?.aborted).toBe(
    true,
  );
});

it("enforces the JSON byte ceiling even when the response omits content-length",async()=>{
 const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(DEFAULT_UPSTREAM_MAX_RESPONSE_BYTES+1));controller.close()}})
 vi.mocked(requestWithDomain).mockResolvedValue(new Response(body,{headers}))
 const response=await GET(input());expect(response.status).toBe(502);expect(await response.json()).toMatchObject({error:{code:"InvalidResponse"}})
})
