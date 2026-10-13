import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readAccountProfile } from "@/ui/settings/account-profile-client";
const fetcher = vi.fn();
const data = {
  subject: "alice",
  name: "Alice",
  email: null,
  email_verified: null,
};
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset().mockImplementation(async () => Response.json({ data }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("uses only the fixed same-origin readonly projection", async () => {
  expect(await readAccountProfile(signal())).toEqual(data);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/account/profile",
    expect.objectContaining({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { accept: "application/json" },
    }),
  );
});
it.each([
  { data: { ...data, token: "secret" } },
  { data: { subject: "alice" } },
  { data: { ...data, email_verified: "true" } },
  { data: { ...data, subject: "" } },
  { data, token: "secret" },
])("rejects invalid browser wire %j", async (value) => {
  fetcher.mockResolvedValue(Response.json(value));
  await expect(readAccountProfile(signal())).rejects.toThrow();
});
it.each([401, 429, 503, 302])(
  "rejects status %s and cleans body",
  async (status) => {
    const cancel = vi.fn();
    fetcher.mockResolvedValue(
      new Response(new ReadableStream({ cancel }), { status }),
    );
    await expect(readAccountProfile(signal())).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  },
);
it("rejects oversized actual body", async () => {
  fetcher.mockResolvedValue(
    Response.json({ data: { ...data, name: "x".repeat(16_384) } }),
  );
  await expect(readAccountProfile(signal())).rejects.toThrow();
});
it.each(["fetch", "body"])(
  "retires hanging %s after 5s without aborting identity session",
  async (kind) => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    fetcher.mockImplementation(() =>
      kind === "fetch"
        ? new Promise(() => {})
        : Promise.resolve(
            new Response(new ReadableStream({ cancel }), {
              headers: { "content-type": "application/json" },
            }),
          ),
    );
    const controller = new AbortController();
    const result = readAccountProfile(controller.signal).catch(
      (error) => error,
    );
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await result).toMatchObject({ name: "TimeoutError" });
    expect(controller.signal.aborted).toBe(false);
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
    if (kind === "body") expect(cancel).toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(Response.json({ data }));
    expect(await readAccountProfile(controller.signal)).toEqual(data);
  },
);
it("late fetch body is cancelled after caller abort", async () => {
  let finish!: (value: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const controller = new AbortController();
  const result = readAccountProfile(controller.signal).catch((error) => error);
  controller.abort();
  expect(await result).toMatchObject({ name: "AbortError" });
  const cancel = vi.fn();
  finish(
    new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "application/json" },
    }),
  );
  await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
});
it("headers do not restart the total body deadline", async () => {
  vi.useFakeTimers();
  let finish!: (value: Response) => void;
  const cancel = vi.fn();
  fetcher.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const result = readAccountProfile(signal()).catch((error) => error);
  await vi.advanceTimersByTimeAsync(4_000);
  finish(
    new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "application/json" },
    }),
  );
  await vi.advanceTimersByTimeAsync(1_001);
  expect(await result).toMatchObject({ name: "TimeoutError" });
  expect(cancel).toHaveBeenCalled();
});
