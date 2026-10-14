import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { TeamClient } from "@/team/client";
import { useTeamSettings } from "@/ui/team/use-team-settings";

const member = {
  member_id: "member-me",
  user_id: "user-me",
  display_name: "Me",
  image_url: null,
  roles: ["owner"],
  joined_at: "2026-09-24T00:00:00Z",
};
const role = {
  role_id: null,
  name: "owner",
  kind: "builtin" as const,
  permissions: { member: ["read" as const] },
};
const client = (): TeamClient => ({
  currentUserId: vi.fn().mockResolvedValue("user-me"),
  listMembers: vi
    .fn()
    .mockResolvedValue({
      items: [member],
      nextCursor: null,
      requestId: "members",
    }),
  listRoles: vi
    .fn()
    .mockResolvedValue({ items: [role], nextCursor: null, requestId: "roles" }),
  listInvitations: vi
    .fn()
    .mockResolvedValue({
      items: [],
      nextCursor: null,
      requestId: "invitations",
    }),
  createInvitation: vi.fn(),
  resendInvitation: vi.fn(),
  cancelInvitation: vi.fn(),
  replaceMemberRoles: vi.fn(),
  removeMember: vi.fn(),
  leave: vi.fn(),
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("retires an old callback when the same component receives a new client", async () => {
  const first = client();
  const hook = renderHook(
    ({ api }) => useTeamSettings(api, "user-me:1", "user-me", false),
    { initialProps: { api: first } },
  );
  await waitFor(() => expect(hook.result.current.snapshot).not.toBeNull());
  const retiredMutate = hook.result.current.mutate;
  const next = client();
  hook.rerender({ api: next });
  await waitFor(() => expect(hook.result.current.snapshot).not.toBeNull());
  const staleAction = vi.fn().mockResolvedValue(undefined);
  await act(() => retiredMutate("stale", staleAction));
  expect(staleAction).not.toHaveBeenCalled();
  const currentAction = vi.fn().mockResolvedValue(undefined);
  await act(() => hook.result.current.mutate("current", currentAction));
  expect(currentAction).toHaveBeenCalledOnce();
});

it("retires an old callback when admission generation changes even for the same subject", async () => {
  const api = client();
  const hook = renderHook(
    ({ scope }) => useTeamSettings(api, scope, "user-me", false),
    { initialProps: { scope: "user-me:1" } },
  );
  await waitFor(() => expect(hook.result.current.snapshot).not.toBeNull());
  const retiredMutate = hook.result.current.mutate;
  hook.rerender({ scope: "user-me:2" });
  const staleAction = vi.fn().mockResolvedValue(undefined);
  await act(() => retiredMutate("stale", staleAction));
  expect(staleAction).not.toHaveBeenCalled();
});

it("uses one whole-authority deadline across distinct role pages, not a fresh budget per page", async () => {
  vi.useFakeTimers();
  let calls = 0;
  const listRoles = vi.fn(async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 6000));
    return {
      items: [{ ...role, name: `role_${calls}` }],
      nextCursor: calls < 2 ? "next" : null,
      requestId: "page",
    };
  });
  const api: TeamClient = { ...client(), listRoles };
  const hook = renderHook(() =>
    useTeamSettings(api, "user-me:1", "user-me", false),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_001);
  });
  expect(hook.result.current.loadError).toBe(true);
  expect(hook.result.current.snapshot).toBeNull();
  expect(api.listRoles).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(hook.result.current.snapshot).toBeNull();
});
