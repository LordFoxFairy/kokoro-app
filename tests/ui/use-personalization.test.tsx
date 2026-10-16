import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePersonalization } from "@/ui/settings/use-personalization";

const fields = (nickname: string) => ({
  nickname,
  occupation: "",
  about: "",
  instructions: "",
});
const response = (nickname: string, revision: number) =>
  new Response(
    JSON.stringify({ data: { personalization: fields(nickname), revision } }),
  );
const boundary = { admitted: true, subject: "alice", generation: 1 };
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const advance = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

it("a hung GET expires, stays write-locked, and can retry within the same editing session", async () => {
  const fetch = vi
    .fn()
    .mockImplementationOnce(() => new Promise<Response>(() => undefined))
    .mockImplementationOnce(async () => response("server", 1));
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() => usePersonalization(false, boundary));
  await advance(10_001);
  expect(result.current.phase).toBe("load-error");
  expect(result.current.disabled).toBe(true);
  act(() => {
    result.current.update("nickname", "must not send");
    result.current.persist();
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  act(() => result.current.retry());
  await advance();
  expect(result.current.phase).toBe("ready");
  expect(result.current.fields.nickname).toBe("server");
  expect(vi.getTimerCount()).toBe(0);
});

it("a slow PUT body expires as unknown, keeps the latest draft, and requires reread plus choice before another CAS", async () => {
  const cancel = vi.fn();
  const fetch = vi
    .fn()
    .mockImplementationOnce(async () => response("server", 1))
    .mockImplementationOnce(
      async () => new Response(new ReadableStream({ cancel })),
    )
    .mockImplementationOnce(async () => response("other device", 3))
    .mockImplementationOnce(async () => response("latest", 4));
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() => usePersonalization(false, boundary));
  await advance();
  expect(result.current.phase).toBe("ready");
  act(() => {
    result.current.update("nickname", "first");
    result.current.persist();
  });
  act(() => {
    result.current.update("nickname", "latest");
    result.current.persist();
  });
  await advance(10_001);
  expect(result.current.phase).toBe("unknown");
  expect(result.current.fields.nickname).toBe("latest");
  expect(result.current.disabled).toBe(false);
  expect(cancel).toHaveBeenCalledTimes(1);
  act(() => result.current.persist());
  expect(fetch).toHaveBeenCalledTimes(2);
  act(() => result.current.retry());
  await advance();
  expect(result.current.phase).toBe("review");
  expect(result.current.fields.nickname).toBe("latest");
  expect(fetch).toHaveBeenCalledTimes(3);
  act(() => result.current.saveDraft());
  await advance();
  expect(result.current.phase).toBe("ready");
  expect(result.current.saved).toBe(true);
  expect(JSON.parse(fetch.mock.calls[3]?.[1].body as string)).toEqual({
    ...fields("latest"),
    expected_revision: 3,
  });
  expect(vi.getTimerCount()).toBe(0);
});
