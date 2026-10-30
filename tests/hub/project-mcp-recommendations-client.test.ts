import { afterEach, expect, it, vi } from "vitest";
import { createProjectMcpRecommendationsClient } from "@/hub/project-mcp-recommendations-client";
const recommendation = {
  kind: "mcp_connector" as const,
  connector_id: "connector",
};
const original = {
  expected_state_version: "3",
  recommendations: [recommendation],
};
const data = {
  project_id: "project",
  recommendations: [recommendation],
  state_version: "4",
};
const response = (
  raw: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(typeof raw === "string" ? raw : JSON.stringify(raw), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store, max-age=0",
      "x-request-id": "owner-request",
      ...headers,
    },
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("standalone GET/PUT accepts formal browser no-store directives and never adds a command key", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ data }))
    .mockResolvedValueOnce(response({ data: { ...data, state_version: "3" } }));
  vi.stubGlobal("fetch", fetcher);
  const client = createProjectMcpRecommendationsClient();
  expect(await client.get("project")).toEqual(data);
  expect((await client.replace("project", original)).state_version).toBe("3");
  expect(fetcher.mock.calls.map((call) => call[1].method)).toEqual([
    "GET",
    "PUT",
  ]);
  expect(fetcher.mock.calls[0]?.[1].body).toBeUndefined();
  expect(fetcher.mock.calls[1]?.[1].headers["idempotency-key"]).toBeUndefined();
  expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual(original);
});
it.each([
  { ...data, project_id: "other" },
  { ...data, state_version: "6" },
  { ...data, state_version: "2" },
  { ...data, state_version: "2147483648" },
  { ...data, recommendations: [] },
  { ...data, recommendations: [recommendation, recommendation] },
  { ...data, extra: true },
])("rejects mismatched/invalid ACK without another PUT", async (invalid) => {
  const fetcher = vi.fn().mockResolvedValue(response({ data: invalid }));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    createProjectMcpRecommendationsClient().replace("project", original),
  ).rejects.toMatchObject({ reason: "parse" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("closed status/code/bit faults remain HTTP errors, unknown/mismatched tuples fail closed", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      response(
        {
          error: {
            code: "project_mcp_recommendations_precondition_failed",
            message: "changed",
            retryable: false,
          },
        },
        412,
      ),
    )
    .mockResolvedValueOnce(
      response(
        {
          error: {
            code: "project_mcp_recommendations_precondition_failed",
            message: "changed",
            retryable: true,
          },
        },
        412,
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  const client = createProjectMcpRecommendationsClient();
  await expect(client.replace("project", original)).rejects.toMatchObject({
    reason: "http",
    status: 412,
    code: "project_mcp_recommendations_precondition_failed",
  });
  await expect(client.get("project")).rejects.toMatchObject({
    reason: "parse",
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([
  '{"data":{"project_id":"project","recommendations":[],"state_version":"1","state_version":"2"}}',
  "not json",
])("rejects duplicate JSON and invalid body", async (raw) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(raw)));
  await expect(
    createProjectMcpRecommendationsClient().get("project"),
  ).rejects.toMatchObject({ reason: "parse" });
});
it("enforces response headers/length/fatal UTF8/byte cap and GET canonical ref order", async () => {
  const cases = [
    response({ data }, 200, { "cache-control": "private,max-age=0" }),
    response({ data }, 200, { "content-length": "999" }),
    response({ data }, 200, { "retry-after": "7" }),
    response({ data }, 200, { "content-type": "text/html" }),
    new Response(new Uint8Array([255]), {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json",
        "x-request-id": "request",
      },
    }),
    response(" ".repeat(65537)),
    response({
      data: {
        ...data,
        recommendations: [
          { kind: "provider", provider_key: "p" },
          recommendation,
        ],
      },
    }),
  ];
  const fetcher = vi.fn();
  for (const value of cases) fetcher.mockResolvedValueOnce(value);
  vi.stubGlobal("fetch", fetcher);
  for (let index = 0; index < cases.length; index++)
    await expect(
      createProjectMcpRecommendationsClient().get("project"),
    ).rejects.toMatchObject({ reason: "parse" });
});
it("pre-abort sends no request and a hung body shares the original total deadline", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(
    createProjectMcpRecommendationsClient().get("project", controller.signal),
  ).rejects.toMatchObject({ reason: "aborted" });
  expect(fetcher).not.toHaveBeenCalled();
  vi.useFakeTimers();
  let canceled = 0;
  fetcher.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('{"data":'));
        },
        cancel() {
          canceled++;
        },
      }),
      {
        headers: {
          "cache-control": "no-store",
          "content-type": "application/json",
          "x-request-id": "request",
        },
      },
    ),
  );
  const pending = expect(
    createProjectMcpRecommendationsClient().get("project"),
  ).rejects.toMatchObject({ reason: "network" });
  await vi.advanceTimersByTimeAsync(10001);
  await pending;
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(canceled).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("retires an ignored-abort late fetch without consuming its response or retrying PUT", async () => {
  let deliver!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { deliver = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  const rejected = expect(createProjectMcpRecommendationsClient().replace("project", original, controller.signal)).rejects.toMatchObject({ reason: "aborted" });
  controller.abort();
  await rejected;
  const canceled = vi.fn();
  deliver(new Response(new ReadableStream({ cancel: canceled }), { headers: { "content-type": "application/json" } }));
  await Promise.resolve();
  await Promise.resolve();
  expect(canceled).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("GET rejects a well-formed PUT-only CAS fault rather than inventing a GET contract", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code: "project_mcp_recommendations_precondition_failed", message: "changed", retryable: false } }, 412)));
  await expect(createProjectMcpRecommendationsClient().get("project")).rejects.toMatchObject({ reason: "parse" });
});
