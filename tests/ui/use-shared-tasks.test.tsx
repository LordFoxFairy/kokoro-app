import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), revoke: vi.fn() }));
vi.mock("@/ui/settings/shared-tasks-client", () => ({
  readSharedTasks: mocks.read,
}));
vi.mock("@/engine/client", () => ({
  createSessionClient: () => ({ revokeShare: mocks.revoke }),
}));
import { useSharedTasks } from "@/ui/settings/use-shared-tasks";
const item = {
  session_id: "session",
  title: "Real",
  shared_at: "2026-10-15T00:00:00.000Z",
  expires_at: null,
};
const page = { data: { items: [item], next_cursor: null } };
const boundary = { admitted: true, subject: "alice", generation: 1 };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue(page);
  mocks.revoke.mockResolvedValue({ share_id: "share" });
});
afterEach(() => vi.useRealTimers());
it("preview and unadmitted scopes issue zero API calls", async () => {
  renderHook(() => useSharedTasks(true, boundary));
  renderHook(() => useSharedTasks(false, { ...boundary, admitted: false }));
  await act(async () => {});
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.revoke).not.toHaveBeenCalled();
});
it("unknown locks all writes until a complete explicit reread and explicit continuation", async () => {
  const view = renderHook(() => useSharedTasks(false, boundary));
  await waitFor(() => expect(view.result.current.items).toHaveLength(1));
  mocks.revoke.mockRejectedValueOnce(Error("unknown"));
  await act(() => view.result.current.revoke("session"));
  expect(view.result.current.blocked).toBe(true);
  await act(() => view.result.current.revoke("session"));
  expect(mocks.revoke).toHaveBeenCalledTimes(1);
  await act(() => view.result.current.reload());
  expect(view.result.current.review).toBe(true);
  await act(() => view.result.current.revoke("session"));
  expect(mocks.revoke).toHaveBeenCalledTimes(1);
  act(() => view.result.current.proceed());
  await act(() => view.result.current.revoke("session"));
  expect(mocks.revoke).toHaveBeenCalledTimes(2);
});
it("read failure after real ACK does not locally remove a task or unlock further writes", async () => {
  const view = renderHook(() => useSharedTasks(false, boundary));
  await waitFor(() => expect(view.result.current.items).toHaveLength(1));
  mocks.read.mockRejectedValueOnce(Error("read failed"));
  await act(() => view.result.current.revoke("session"));
  expect(view.result.current.items).toEqual([item]);
  expect(view.result.current.blocked).toBe(true);
  mocks.read.mockRejectedValueOnce(Error("read failed"));
  await act(() => view.result.current.reload());
  expect(view.result.current.review).toBe(false);
  expect(view.result.current.blocked).toBe(true);
});
it("a same-render double write dispatches once", async () => {
  const view = renderHook(() => useSharedTasks(false, boundary));
  await waitFor(() => expect(view.result.current.items).toHaveLength(1));
  let release!: (v: unknown) => void;
  mocks.revoke.mockImplementation(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  let first!: Promise<void>;
  act(() => {
    first = view.result.current.revoke("session");
    void view.result.current.revoke("session");
  });
  expect(mocks.revoke).toHaveBeenCalledTimes(1);
  await act(async () => {
    release({ share_id: "share" });
    await first;
  });
});
it("identity/generation retirement clears facts and refuses an old callback", async () => {
  const view = renderHook(
    ({ generation }) => useSharedTasks(false, { ...boundary, generation }),
    { initialProps: { generation: 1 } },
  );
  await waitFor(() => expect(view.result.current.items).toHaveLength(1));
  const old = view.result.current.revoke;
  view.rerender({ generation: 2 });
  await act(() => old("session"));
  expect(mocks.revoke).not.toHaveBeenCalled();
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
});
it("complete recovery refuses repeated page cursors and keeps all writes blocked", async () => {
  const view = renderHook(() => useSharedTasks(false, boundary));
  await waitFor(() => expect(view.result.current.items).toHaveLength(1));
  mocks.revoke.mockRejectedValueOnce(Error("unknown"));
  await act(() => view.result.current.revoke("session"));
  mocks.read.mockResolvedValue({
    data: { items: [item], next_cursor: "repeat" },
  });
  await act(() => view.result.current.reload());
  expect(view.result.current.error).toBe(true);
  expect(view.result.current.blocked).toBe(true);
  expect(view.result.current.review).toBe(false);
});
it("an ACK with the target still in a complete authoritative list cannot restore write eligibility", async () => {
  const view = renderHook(() => useSharedTasks(false, boundary));
  await waitFor(() => expect(view.result.current.items).toHaveLength(1));
  await act(() => view.result.current.revoke("session"));
  expect(view.result.current.items).toEqual([item]);
  expect(view.result.current.blocked).toBe(true);
  expect(view.result.current.review).toBe(false);
});
it("stop sharing and its complete reread share one total ten-second budget", async () => {
  const view = renderHook(() => useSharedTasks(false, boundary));
  await waitFor(() => expect(view.result.current.items).toHaveLength(1));
  vi.useFakeTimers();
  mocks.revoke.mockImplementation(
    () => new Promise((r) => setTimeout(() => r({ share_id: "share" }), 6000)),
  );
  mocks.read.mockImplementation(
    (_subject, _cursor, signal: AbortSignal) =>
      new Promise((r, no) => {
        setTimeout(() => r({ data: { items: [], next_cursor: null } }), 6000);
        signal.addEventListener("abort", () => no(Error("retired")), {
          once: true,
        });
      }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = view.result.current.revoke("session");
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10001);
    await pending;
  });
  expect(view.result.current.blocked).toBe(true);
  expect(view.result.current.review).toBe(false);
  expect(view.result.current.items).toEqual([item]);
});
it("a successful authoritative removal shows only the new owner list", async () => {
  const view = renderHook(() => useSharedTasks(false, boundary));
  await waitFor(() => expect(view.result.current.items).toHaveLength(1));
  mocks.read.mockResolvedValueOnce({ data: { items: [], next_cursor: null } });
  await act(() => view.result.current.revoke("session"));
  expect(view.result.current.items).toEqual([]);
  expect(view.result.current.blocked).toBe(false);
  expect(mocks.revoke).toHaveBeenCalledTimes(1);
});

it.each(["network failure", "incomplete pagination"] as const)(
  "a new blocked reread revokes prior review eligibility during and after %s",
  async (failure) => {
    const view = renderHook(() => useSharedTasks(false, boundary));
    await waitFor(() => expect(view.result.current.items).toEqual([item]));
    mocks.revoke.mockRejectedValueOnce(Error("unknown"));
    await act(() => view.result.current.revoke(item.session_id));
    await act(() => view.result.current.reload());
    expect(view.result.current.review).toBe(true);
    expect(view.result.current.blocked).toBe(true);
    const oldProceed = view.result.current.proceed;

    type ReadPage = { data: { items: typeof item[]; next_cursor: string | null } };
    let finish!: (value: ReadPage) => void;
    let fail!: (reason: Error) => void;
    mocks.read.mockImplementationOnce(() => new Promise<ReadPage>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    }));
    if (failure === "incomplete pagination") {
      mocks.read.mockResolvedValueOnce({ data: { items: [], next_cursor: "repeated" } });
    }
    let reread!: Promise<void>;
    act(() => { reread = view.result.current.reload(); });
    expect(view.result.current.busy).toBe(true);
    expect(view.result.current.review).toBe(false);
    expect(view.result.current.blocked).toBe(true);
    act(oldProceed);
    await act(() => view.result.current.revoke(item.session_id));
    expect(view.result.current.blocked).toBe(true);
    expect(mocks.revoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      if (failure === "network failure") fail(Error("network failed"));
      else finish({ data: { items: [item], next_cursor: "repeated" } });
      await reread;
    });
    expect(view.result.current.busy).toBe(false);
    expect(view.result.current.error).toBe(true);
    expect(view.result.current.review).toBe(false);
    expect(view.result.current.blocked).toBe(true);
    expect(view.result.current.items).toEqual([item]);
    act(oldProceed);
    await act(() => view.result.current.revoke(item.session_id));
    expect(view.result.current.blocked).toBe(true);
    expect(mocks.revoke).toHaveBeenCalledTimes(1);

    await act(() => view.result.current.reload());
    expect(view.result.current.error).toBe(false);
    expect(view.result.current.review).toBe(true);
    expect(view.result.current.blocked).toBe(true);
    await act(() => view.result.current.revoke(item.session_id));
    expect(mocks.revoke).toHaveBeenCalledTimes(1);
    act(() => view.result.current.proceed());
    expect(view.result.current.review).toBe(false);
    expect(view.result.current.blocked).toBe(false);
    mocks.read.mockResolvedValueOnce({ data: { items: [], next_cursor: null } });
    await act(() => view.result.current.revoke(item.session_id));
    expect(mocks.revoke).toHaveBeenCalledTimes(2);
    expect(view.result.current.items).toEqual([]);
    expect(view.result.current.blocked).toBe(false);
  },
);
