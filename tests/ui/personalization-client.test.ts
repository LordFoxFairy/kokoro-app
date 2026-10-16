import { afterEach, expect, it, vi } from "vitest";
import {
  readPersonalization,
  replacePersonalization,
} from "@/ui/settings/personalization-client";
const fields = {
  nickname: "mine",
  occupation: "",
  about: "",
  instructions: "",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("propagates cancellation to GET and PUT and never sends an already retired intent", async () => {
  const fetch = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ data: { personalization: fields, revision: 2 } }),
        ),
    );
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  await readPersonalization(controller.signal);
  await replacePersonalization(fields, 1, controller.signal);
  expect(fetch.mock.calls[0]?.[1].signal).not.toBe(controller.signal);
  expect(fetch.mock.calls[1]?.[1].signal).not.toBe(controller.signal);
  controller.abort();
  await expect(
    replacePersonalization(fields, 1, controller.signal),
  ).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([
  { personalization: fields, revision: 1 },
  { personalization: fields, revision: 3 },
  { personalization: { ...fields, nickname: "someone else" }, revision: 2 },
  { personalization: null, revision: 2 },
])(
  "rejects an invalid or mismatched write acknowledgement: %j",
  async (data) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }))),
    );
    await expect(replacePersonalization(fields, 1)).rejects.toThrow();
  },
);
it("rejects late JSON success after the operation was aborted", async () => {
  const controller = new AbortController();
  const cancel = vi.fn();
  const response = new Response(
    new ReadableStream<Uint8Array>({
      pull() {
        controller.abort();
      },
      cancel,
    }),
  );
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(
    replacePersonalization(fields, 1, controller.signal),
  ).rejects.toThrow();
});

it.each([
  { personalization: null, revision: 1 },
  { personalization: fields, revision: 0 },
  { personalization: fields, revision: Number.MAX_SAFE_INTEGER + 1 },
  { personalization: null, revision: -1 },
  { personalization: fields, revision: 1.5 },
])("rejects impossible owner snapshot %j", async (data) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }))),
  );
  await expect(readPersonalization()).rejects.toThrow();
});

it("bounds hung fetch and cancels a response arriving after its deadline", async () => {
  vi.useFakeTimers();
  let resolve!: (response: Response) => void;
  const fetch = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  let error: unknown;
  void readPersonalization().catch((value: unknown) => {
    error = value;
  });
  await vi.advanceTimersByTimeAsync(10_001);
  expect(error).toMatchObject({ name: "TimeoutError" });
  expect(fetch.mock.calls[0]?.[1].signal.aborted).toBe(true);
  const cancel = vi.fn();
  resolve(new Response(new ReadableStream({ cancel })));
  await vi.advanceTimersByTimeAsync(0);
  expect(cancel).toHaveBeenCalledTimes(1);
});

it("includes slow response body consumption in the PUT deadline without aborting its editing session", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))),
  );
  const session = new AbortController();
  let error: unknown;
  void replacePersonalization(fields, 1, session.signal).catch(
    (value: unknown) => {
      error = value;
    },
  );
  await vi.advanceTimersByTimeAsync(10_001);
  expect(error).toMatchObject({ name: "TimeoutError" });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(session.signal.aborted).toBe(false);
});

it("does not reset the deadline when headers arrive late", async () => {
  vi.useFakeTimers();
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  let error: unknown;
  void readPersonalization().catch((value: unknown) => {
    error = value;
  });
  await vi.advanceTimersByTimeAsync(9_000);
  const cancel = vi.fn();
  resolve(new Response(new ReadableStream({ cancel })));
  await vi.advanceTimersByTimeAsync(1_001);
  expect(error).toMatchObject({ name: "TimeoutError" });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("session retirement immediately cancels a hung request and releases its late response", async () => {
  vi.useFakeTimers();
  let resolve!: (response: Response) => void;
  const fetch = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const session = new AbortController();
  const result = readPersonalization(session.signal).catch(
    (error: unknown) => error,
  );
  session.abort();
  expect(await result).toMatchObject({ name: "AbortError" });
  expect(fetch.mock.calls[0]?.[1].signal.aborted).toBe(true);
  const cancel = vi.fn();
  resolve(new Response(new ReadableStream({ cancel })));
  await vi.advanceTimersByTimeAsync(0);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([-1, 0.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])(
  "does not send a PUT with unusable CAS revision %s",
  async (revision) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(replacePersonalization(fields, revision)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("accepts the initial null/zero snapshot and first-write ACK1", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({ data: { personalization: null, revision: 0 } }),
          ),
      )
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({ data: { personalization: fields, revision: 1 } }),
          ),
      ),
  );
  await expect(readPersonalization()).resolves.toEqual({
    personalization: null,
    revision: 0,
  });
  await expect(replacePersonalization(fields, 0)).resolves.toEqual({
    personalization: fields,
    revision: 1,
  });
});

it.each([
  ["nickname", 128],
  ["occupation", 256],
  ["about", 2000],
  ["instructions", 8000],
] as const)(
  "uses Unicode code points at the %s owner boundary",
  async (field, limit) => {
    const valid = { ...fields, [field]: "😀".repeat(limit) };
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({ data: { personalization: valid, revision: 1 } }),
          ),
      )
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({ data: { personalization: valid, revision: 2 } }),
          ),
      )
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                personalization: { ...valid, [field]: valid[field] + "😀" },
                revision: 3,
              },
            }),
          ),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(readPersonalization()).resolves.toEqual({
      personalization: valid,
      revision: 1,
    });
    await expect(replacePersonalization(valid, 1)).resolves.toEqual({
      personalization: valid,
      revision: 2,
    });
    await expect(readPersonalization()).rejects.toThrow();
  },
);
