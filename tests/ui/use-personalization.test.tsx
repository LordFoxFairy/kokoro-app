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

it.each([
  { admitted: true, subject: "bob", generation: 2 },
  { admitted: true, subject: "alice", generation: 2 },
])("retired form callbacks cannot edit or save the next admitted session ($subject:$generation)", async (nextBoundary) => {
  const fetch = vi.fn().mockImplementationOnce(async () => response("alice profile", 1))
    .mockImplementationOnce(async () => response("current profile", 4))
    .mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body as string) as { nickname: string; expected_revision: number };
      return response(body.nickname, body.expected_revision + 1);
    });
  vi.stubGlobal("fetch", fetch);
  const h = renderHook(({ identity }) => usePersonalization(false, identity), {
    initialProps: { identity: boundary },
  });
  await advance();
  const retired = h.result.current;
  h.rerender({ identity: nextBoundary });
  await advance();
  expect(h.result.current.fields.nickname).toBe("current profile");
  act(() => {
    retired.update("nickname", "retired edit");
    retired.persist();
  });
  await advance();
  expect(h.result.current.fields.nickname).toBe("current profile");
  expect(fetch).toHaveBeenCalledTimes(2);
  act(() => {
    h.result.current.update("nickname", "current edit");
    h.result.current.persist();
  });
  await advance();
  expect(JSON.parse(fetch.mock.calls[2]?.[1].body as string)).toEqual({
    ...fields("current edit"), expected_revision: 4,
  });
  expect(h.result.current.saved).toBe(true);
});

it.each(["chooseServer", "saveDraft"] as const)("retired recovery controls cannot read or resolve the next account's conflict (%s)", async (action) => {
  const fetch = vi.fn().mockImplementationOnce(async () => response("alice profile", 1))
    .mockImplementationOnce(async () => response("bob profile", 4))
    .mockImplementationOnce(async () => new Response(JSON.stringify({ error: {
      code: "personalization_revision_conflict", message: "Changed elsewhere", retryable: false,
    } }), { status: 409 }))
    .mockImplementation(async () => response("bob elsewhere", 5));
  vi.stubGlobal("fetch", fetch);
  const h = renderHook(({ identity }) => usePersonalization(false, identity), {
    initialProps: { identity: boundary },
  });
  await advance();
  const retired = h.result.current;
  h.rerender({ identity: { admitted: true, subject: "bob", generation: 2 } });
  await advance();
  act(() => {
    h.result.current.update("nickname", "bob draft");
    h.result.current.persist();
  });
  await advance();
  expect(h.result.current.phase).toBe("conflict");
  act(() => retired.retry());
  await advance();
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(h.result.current.phase).toBe("conflict");
  act(() => h.result.current.retry());
  await advance();
  expect(h.result.current.phase).toBe("review");
  act(() => retired[action]());
  await advance();
  expect(h.result.current.phase).toBe("review");
  expect(h.result.current.fields.nickname).toBe("bob draft");
  expect(fetch).toHaveBeenCalledTimes(4);
  act(() => h.result.current.chooseServer());
  expect(h.result.current.fields.nickname).toBe("bob elsewhere");
});
