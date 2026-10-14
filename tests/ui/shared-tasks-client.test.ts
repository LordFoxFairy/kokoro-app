import { afterEach, expect, it, vi } from "vitest";
import { readSharedTasks } from "@/ui/settings/shared-tasks-client";
const response = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, {
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
      "x-request-id": "request",
      ...headers,
    },
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("uses generated operation through same-origin private reader without browser bearer", async () => {
  const fetcher = vi.fn(
    async (...args: [RequestInfo | URL, RequestInit?]) => (
      void args,
      response('{"data":{"items":[],"next_cursor":null}}')
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await readSharedTasks("alice")).toEqual({
    data: { items: [], next_cursor: null },
  });
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    "/api/account/shared-tasks?limit=100",
  );
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    credentials: "same-origin",
    redirect: "error",
    cache: "no-store",
  });
  expect(
    new Headers(fetcher.mock.calls[0]?.[1]?.headers).has("authorization"),
  ).toBe(false);
});
it.each([
  '{"data":{"items":[],"next_cursor":null,"unknown":1}}',
  '{"data":{"items":[],"items":[],"next_cursor":null}}',
  '\ufeff{"data":{"items":[],"next_cursor":null}}',
])("rejects raw unsafe JSON %j", async (raw) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      void args;
      return response(raw);
    }),
  );
  await expect(readSharedTasks("alice")).rejects.toThrow();
});
it("bounds a hung fetch and closes a late response", async () => {
  vi.useFakeTimers();
  let resolve!: (v: Response) => void;
  const cancel = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    ),
  );
  const pending = readSharedTasks("alice");
  const rejected = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(10001);
  await rejected;
  resolve(new Response(new ReadableStream({ cancel })));
  await Promise.resolve();
  await Promise.resolve();
  expect(cancel).toHaveBeenCalledOnce();
});
it("bounds a hung response body and cancels the actual reader", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode("{"));
            },
            cancel,
          }),
          {
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
              "x-request-id": "request",
            },
          },
        ),
    ),
  );
  const pending = readSharedTasks("alice");
  const rejected = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(10001);
  await rejected;
  expect(cancel).toHaveBeenCalledOnce();
});
it("a caller abort retires its request without sending a browser bearer", async () => {
  const controller = new AbortController();
  const fetcher = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetcher);
  const pending = readSharedTasks("alice", undefined, controller.signal);
  const rejected = expect(pending).rejects.toThrow();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  controller.abort();
  await rejected;
  expect(fetcher).toHaveBeenCalledOnce();
});
