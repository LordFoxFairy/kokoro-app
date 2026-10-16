import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { writeAccountProfile } from "@/ui/settings/account-profile-update-client";
const fetcher = vi.fn();
const input = { name: "New", expected_name: "\ud800 Old " };
const signal = () => new AbortController().signal;
const response = (
  raw: unknown = { data: { subject: "alice", name: "New" } },
  status = 200,
) =>
  Response.json(raw, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "x-request-id": "request",
    },
  });
beforeEach(() => {
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset().mockResolvedValue(response());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("writes once with original name and binds ACK without exposed Bearer", async () => {
  expect(await writeAccountProfile(input, "alice", signal())).toEqual({
    kind: "ack",
  });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]![1]).toMatchObject({
    method: "PATCH",
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  expect(fetcher.mock.calls[0]![1].headers.authorization).toBeUndefined();
});
it.each([
  { data: { subject: "bob", name: "New" } },
  { data: { subject: "alice", name: "Other" } },
  { data: { subject: "alice", name: "New", credential: "secret" } },
  { data: { subject: "alice", name: "New" }, meta: { request_id: "id" } },
])("rejects unbound ACK without replay", async (raw) => {
  fetcher.mockResolvedValue(response(raw));
  await expect(writeAccountProfile(input, "alice", signal())).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce();
});
it("returns declared conflict without retry", async () => {
  fetcher.mockResolvedValue(
    response(
      {
        error: {
          code: "account_profile_conflict",
          message: "Conflict",
          retryable: false,
        },
      },
      409,
    ),
  );
  expect(await writeAccountProfile(input, "alice", signal())).toEqual({
    kind: "rejected",
    status: 409,
  });
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each(["fetch", "body"])(
  "bounds hanging %s independently of editing identity",
  async (kind) => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    fetcher.mockImplementation(() =>
      kind === "fetch"
        ? new Promise(() => {})
        : Promise.resolve(
            new Response(new ReadableStream({ cancel }), {
              headers: {
                "content-type": "application/json",
                "cache-control": "no-store",
                "x-request-id": "request",
              },
            }),
          ),
    );
    const owner = new AbortController();
    const pending = writeAccountProfile(input, "alice", owner.signal).catch(
      (e) => e,
    );
    await vi.advanceTimersByTimeAsync(10001);
    expect(await pending).toBeInstanceOf(Error);
    expect(owner.signal.aborted).toBe(false);
    if (kind === "body") expect(cancel).toHaveBeenCalled();
    fetcher.mockResolvedValue(response());
    expect(await writeAccountProfile(input, "alice", owner.signal)).toEqual({
      kind: "ack",
    });
  },
);
it("rejects invalid input without I/O", async () => {
  await expect(
    writeAccountProfile({ ...input, name: "😀".repeat(51) }, "alice", signal()),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  [429, "12", true],
  [429, null, false],
  [429, "0", false],
  [429, "86401", false],
  [503, "12", false],
])("validates Retry-After%s/%s without retry", async (status, retry, valid) => {
  fetcher.mockResolvedValue(
    Response.json(
      {
        error: {
          code:
            status === 429
              ? "account_profile_rate_limited"
              : "account_profile_unavailable",
          message: "Safe",
          retryable: true,
        },
      },
      {
        status: status as number,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "request",
          ...(retry === null ? {} : { "retry-after": String(retry) }),
        },
      },
    ),
  );
  if (valid)
    expect(await writeAccountProfile(input, "alice", signal())).toEqual({
      kind: "rejected",
      status: 429,
    });
  else
    await expect(
      writeAccountProfile(input, "alice", signal()),
    ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce();
});

it("cancelled write retires a late response body without a second dispatch", async () => {
  let resolve!: (response: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const controller = new AbortController();
  const pending = writeAccountProfile(input, "alice", controller.signal).catch(
    (e) => e,
  );
  controller.abort();
  expect(await pending).toBeInstanceOf(Error);
  const cancel = vi.fn();
  resolve(new Response(new ReadableStream({ cancel })));
  await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  expect(fetcher).toHaveBeenCalledOnce();
});
