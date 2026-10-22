import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { write } = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock("@/ui/settings/account-profile-update-client", () => ({
  writeAccountProfile: write,
}));
import { useAccountProfileEditor } from "@/ui/settings/use-account-profile-editor";
const profile = {
  subject: "alice",
  name: "Old",
  email: null,
  email_verified: null,
};
const reload = vi.fn();
beforeEach(() => {
  write.mockReset().mockResolvedValue({ kind: "ack" });
  reload.mockReset().mockResolvedValue({ ...profile, name: "Authority" });
});
afterEach(cleanup);
const editor = () =>
  renderHook(({ scope }) => useAccountProfileEditor(scope, profile, reload, true), {
    initialProps: { scope: "alice:1" },
  });
it("uses explicit save, exact original and authority rather than input after ACK", async () => {
  const h = editor();
  act(() => h.result.current.change("New"));
  expect(write).not.toHaveBeenCalled();
  await act(() => h.result.current.save());
  expect(write).toHaveBeenCalledWith(
    { name: "New", expected_name: "Old" },
    "alice",
    expect.any(AbortSignal),
  );
  expect(h.result.current.draft).toBe("Authority");
  expect(h.result.current.phase).toBe("saved");
});
it("a confirmed-read revocation blocks current and previously captured edit/save callbacks", async () => {
  const h = renderHook(({ confirmed }) => useAccountProfileEditor("alice:1", profile, reload, confirmed), { initialProps: { confirmed: true } });
  act(() => h.result.current.change("Draft"));
  const earlier = h.result.current;
  h.rerender({ confirmed: false });
  expect(h.result.current.editable).toBe(false);
  expect(h.result.current.canSave).toBe(false);
  act(() => earlier.change("Unexpected"));
  await act(() => earlier.save());
  expect(h.result.current.draft).toBe("Draft");
  expect(write).not.toHaveBeenCalled();
  h.rerender({ confirmed: true });
  await act(() => h.result.current.save());
  expect(write).toHaveBeenCalledOnce();
});
it("preserves an edited name and its CAS baseline during a fresh profile read", async () => {
  const h = renderHook(({ name, confirmed }) => useAccountProfileEditor("alice:1", { ...profile, name }, reload, confirmed), { initialProps: { name: "Old", confirmed: true } });
  act(() => h.result.current.change("Draft"));
  h.rerender({ name: "Old", confirmed: false });
  h.rerender({ name: "Changed elsewhere", confirmed: true });
  expect(h.result.current.draft).toBe("Draft");
  await act(() => h.result.current.save());
  expect(write).toHaveBeenCalledWith({ name: "Draft", expected_name: "Old" }, "alice", expect.any(AbortSignal));
});
it.each(["unknown", "conflict"])(
  "locks %s until successful read and explicit choice before another save",
  async (kind) => {
    if (kind === "unknown") write.mockRejectedValue(new Error("lost ACK"));
    else write.mockResolvedValue({ kind: "rejected", status: 409 });
    reload.mockResolvedValue(null);
    const h = editor();
    act(() => h.result.current.change("Draft"));
    await act(() => h.result.current.save());
    expect(h.result.current.phase).toBe("readFailed");
    expect(h.result.current.draft).toBe("Draft");
    await act(() => h.result.current.save());
    expect(write).toHaveBeenCalledOnce();
    reload.mockResolvedValue({ ...profile, name: "Server Now" });
    await act(() => h.result.current.retryRead());
    expect(h.result.current.phase).toBe("review");
    expect(h.result.current.canSave).toBe(false);
    act(() => h.result.current.keepDraft());
    write.mockResolvedValue({ kind: "ack" });
    await act(() => h.result.current.save());
    expect(write.mock.calls[1]![0]).toEqual({
      name: "Draft",
      expected_name: "Server Now",
    });
  },
);
it("adopts server value only on explicit choice", async () => {
  write.mockRejectedValue(new Error("unknown"));
  const h = editor();
  act(() => h.result.current.change("Draft"));
  await act(() => h.result.current.save());
  expect(h.result.current.draft).toBe("Draft");
  act(() => h.result.current.adoptServer());
  expect(h.result.current.draft).toBe("Authority");
  expect(h.result.current.canSave).toBe(false);
});
it("late ACK cannot reload or alter replacement identity", async () => {
  let done!: (v: { kind: "ack" }) => void;
  write.mockImplementation(
    () =>
      new Promise((r) => {
        done = r;
      }),
  );
  const h = editor();
  act(() => h.result.current.change("Draft"));
  let pending!: Promise<void>;
  act(() => {
    pending = h.result.current.save();
  });
  h.rerender({ scope: "alice:2" });
  expect(write.mock.calls[0]![2].aborted).toBe(true);
  await act(async () => {
    done({ kind: "ack" });
    await pending;
  });
  expect(reload).not.toHaveBeenCalled();
  await waitFor(() => expect(h.result.current.draft).toBe("Old"));
});
it("failed authority read after ACK does not synthesize saved name", async () => {
  reload.mockResolvedValue(null);
  const h = editor();
  act(() => h.result.current.change("New"));
  await act(() => h.result.current.save());
  expect(h.result.current.phase).toBe("readFailed");
  expect(h.result.current.draft).toBe("New");
  expect(h.result.current.canSave).toBe(false);
});

it("synchronous duplicate save attempts still dispatch one write", async () => {
  let done!: (v: { kind: "ack" }) => void;
  write.mockImplementation(
    () =>
      new Promise((r) => {
        done = r;
      }),
  );
  const h = editor();
  act(() => h.result.current.change("New"));
  let first!: Promise<void>;
  act(() => {
    first = h.result.current.save();
    void h.result.current.save();
  });
  expect(write).toHaveBeenCalledOnce();
  await act(async () => {
    done({ kind: "ack" });
    await first;
  });
});
it("unmount cancels pending write and ignores late rejection", async () => {
  let reject!: (e: Error) => void;
  write.mockImplementation(
    () =>
      new Promise((_r, fail) => {
        reject = fail;
      }),
  );
  const h = editor();
  act(() => h.result.current.change("New"));
  let pending!: Promise<void>;
  act(() => {
    pending = h.result.current.save();
  });
  h.unmount();
  expect(write.mock.calls[0]![2].aborted).toBe(true);
  await act(async () => {
    reject(new Error("late"));
    await pending;
  });
  expect(reload).not.toHaveBeenCalled();
});

it("treats 401 after possible committed ACK as unknown until authoritative read and explicit choice", async () => {
  write.mockResolvedValue({ kind: "rejected", status: 401 });
  reload.mockResolvedValue({ ...profile, name: "Committed Name" });
  const h = editor();
  act(() => h.result.current.change("Committed Name"));
  await act(() => h.result.current.save());
  expect(reload).toHaveBeenCalledOnce();
  expect(h.result.current.phase).toBe("review");
  expect(h.result.current.canSave).toBe(false);
  await act(() => h.result.current.save());
  expect(write).toHaveBeenCalledOnce();
  act(() => h.result.current.adoptServer());
  expect(h.result.current.draft).toBe("Committed Name");
  expect(h.result.current.canSave).toBe(false);
});
