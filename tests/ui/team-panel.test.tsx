import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { endProductSession } = vi.hoisted(() => ({
  endProductSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/ui/auth/product-auth-client", () => ({ endProductSession }));

import { LocaleProvider } from "@/i18n/context";
import {
  TeamClientError,
  type TeamClient,
  type TeamInvitation,
  type TeamMember,
  type TeamRole,
} from "@/team/client";
import { TeamPanel } from "@/ui/team/team-panel";

const timestamp = "2026-09-24T00:00:00Z";
const members: TeamMember[] = [
  {
    member_id: "member-me",
    user_id: "user-me",
    display_name: "Me",
    image_url: null,
    roles: ["owner"],
    joined_at: timestamp,
  },
  {
    member_id: "member-bob",
    user_id: "user-bob",
    display_name: "Bob",
    image_url: null,
    roles: ["member"],
    joined_at: timestamp,
  },
];
const invitations: TeamInvitation[] = [
  {
    invitation_id: "inv-1",
    email: "invite@example.test",
    roles: ["member"],
    status: "pending",
    created_at: timestamp,
    expires_at: timestamp,
  },
];
const roles: TeamRole[] = [
  {
    role_id: null,
    name: "owner",
    kind: "builtin",
    permissions: {
      member: ["create", "read", "update", "delete"],
      invitation: ["create", "read", "cancel"],
    },
  },
  {
    role_id: null,
    name: "admin",
    kind: "builtin",
    permissions: {
      member: ["create", "read", "update", "delete"],
      invitation: ["create", "read", "cancel"],
    },
  },
  {
    role_id: null,
    name: "member",
    kind: "builtin",
    permissions: { member: ["read"] },
  },
];

function client(overrides: Partial<TeamClient> = {}): TeamClient {
  return {
    currentUserId: vi.fn().mockResolvedValue("user-me"),
    listMembers: vi
      .fn()
      .mockResolvedValue({
        items: members,
        nextCursor: null,
        requestId: "req-members",
      }),
    listInvitations: vi
      .fn()
      .mockResolvedValue({
        items: invitations,
        nextCursor: null,
        requestId: "req-invites",
      }),
    listRoles: vi
      .fn()
      .mockResolvedValue({
        items: roles,
        nextCursor: null,
        requestId: "req-roles",
      }),
    createInvitation: vi.fn().mockResolvedValue(undefined),
    resendInvitation: vi.fn().mockResolvedValue(undefined),
    cancelInvitation: vi.fn().mockResolvedValue(undefined),
    replaceMemberRoles: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function show(value: TeamClient) {
  return render(
    <TeamPanel
      client={value}
      readBoundary={{ admitted: true, subject: "user-me", generation: 1 }}
      onClose={vi.fn()}
    />,
    { wrapper: LocaleProvider },
  );
}

afterEach(cleanup);

describe("fixed-tenant Team Product UI", () => {
  it("shows current-tenant members/management invitations with roles[] but no namespace switch or inbox", async () => {
    show(client());
    expect(
      await screen.findByTestId("member-row-member-bob"),
    ).toHaveTextContent("Bob");
    expect(screen.getByTestId("invitation-row-inv-1")).toHaveTextContent(
      "invite@example.test",
    );
    expect(screen.getByTestId("member-row-member-me")).toHaveTextContent(
      "Owner",
    );
    expect(screen.queryByTestId("team-switcher")).toBeNull();
    expect(screen.queryByTestId("invite-accept")).toBeNull();
    expect(screen.queryByTestId("invite-decline")).toBeNull();
  });

  it("creates, resends and cancels invitations using invitation_id, then refreshes read pages", async () => {
    const api = client();
    show(api);
    await screen.findByTestId("invitation-row-inv-1");
    fireEvent.change(screen.getByTestId("invite-email"), {
      target: { value: "new@example.test" },
    });
    fireEvent.click(screen.getByTestId("invite-submit"));
    await waitFor(() =>
      expect(api.createInvitation).toHaveBeenCalledWith(
        "new@example.test",
        ["member"],
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByTestId("invitation-resend-inv-1"));
    await waitFor(() =>
      expect(api.resendInvitation).toHaveBeenCalledWith(
        "inv-1",
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByTestId("invitation-cancel-inv-1"));
    await waitFor(() =>
      expect(api.cancelInvitation).toHaveBeenCalledWith(
        "inv-1",
        expect.any(AbortSignal),
      ),
    );
    expect(
      (api.listInvitations as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(1);
  });

  it("replaces roles[] and removes by member_id, not IAM user_id", async () => {
    const api = client();
    show(api);
    await screen.findByTestId("member-row-member-bob");
    fireEvent.click(screen.getByTestId("member-role-member-bob-member"));
    fireEvent.click(screen.getByTestId("member-role-member-bob-admin"));
    fireEvent.click(screen.getByTestId("member-role-save-member-bob"));
    await waitFor(() =>
      expect(api.replaceMemberRoles).toHaveBeenCalledWith(
        "member-bob",
        ["admin"],
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByTestId("member-remove-member-bob"));
    fireEvent.click(screen.getByTestId("member-remove-confirm-member-bob"));
    await waitFor(() =>
      expect(api.removeMember).toHaveBeenCalledWith(
        "member-bob",
        expect.any(AbortSignal),
      ),
    );
  });

  it("supports explicit leave and presents LAST_OWNER without automatic retry", async () => {
    const api = client({
      leave: vi
        .fn()
        .mockRejectedValue(
          new TeamClientError("Last owner", "LAST_OWNER", 409, "req-conflict"),
        ),
    });
    show(api);
    fireEvent.click(await screen.findByTestId("team-leave"));
    fireEvent.click(screen.getByTestId("team-leave-confirm"));
    expect(await screen.findByTestId("team-notice")).toBeInTheDocument();
    expect(api.leave).toHaveBeenCalledOnce();
  });

  it("pages members by opaque cursor and hides mutation controls for a plain member", async () => {
    const api = client({
      listInvitations: vi
        .fn()
        .mockRejectedValue(
          new TeamClientError("Forbidden", "FORBIDDEN", 403, "req-forbidden"),
        ),
      listMembers: vi
        .fn()
        .mockResolvedValueOnce({
          items: [{ ...members[0], roles: ["member"] }],
          nextCursor: "opaque+2",
          requestId: "r1",
        })
        .mockResolvedValueOnce({
          items: [members[1]],
          nextCursor: null,
          requestId: "r2",
        }),
    });
    show(api);
    await screen.findByTestId("team-members");
    expect(screen.queryByTestId("invite-submit")).toBeNull();
    expect(api.listInvitations).not.toHaveBeenCalled();
    expect(screen.queryByTestId("member-remove-member-me")).toBeNull();
    fireEvent.click(screen.getByTestId("members-more"));
    expect(
      await screen.findByTestId("member-row-member-bob"),
    ).toBeInTheDocument();
    expect(api.listMembers).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, cursor: "opaque+2" }),
    );
  });

  it("finds the actor and all roles beyond the first pages before deriving controls", async () => {
    const api = client({
      listMembers: vi
        .fn()
        .mockResolvedValueOnce({
          items: [members[1]],
          nextCursor: "member-next",
          requestId: "r1",
        })
        .mockResolvedValueOnce({
          items: [members[0]],
          nextCursor: null,
          requestId: "r2",
        }),
      listRoles: vi
        .fn()
        .mockResolvedValueOnce({
          items: [roles[2]],
          nextCursor: "role-next",
          requestId: "r1",
        })
        .mockResolvedValueOnce({
          items: [roles[0], roles[1]],
          nextCursor: null,
          requestId: "r2",
        }),
    });
    show(api);
    expect(await screen.findByTestId("invite-submit")).toBeInTheDocument();
    expect(screen.getByTestId("member-remove-member-bob")).toBeInTheDocument();
    expect(api.listMembers).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100, cursor: "member-next" }),
    );
    expect(api.listRoles).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100, cursor: "role-next" }),
    );
  });

  it("does not report a successful write as failed when its readback fails or repeat the write", async () => {
    const api = client({
      listInvitations: vi
        .fn()
        .mockResolvedValueOnce({
          items: invitations,
          nextCursor: null,
          requestId: "first",
        })
        .mockRejectedValueOnce(
          new TeamClientError("Unavailable", "UNAVAILABLE", 503, "later"),
        ),
    });
    show(api);
    await screen.findByTestId("invite-submit");
    fireEvent.change(screen.getByTestId("invite-email"), {
      target: { value: "new@example.test" },
    });
    fireEvent.click(screen.getByTestId("invite-submit"));
    expect(await screen.findByTestId("team-notice")).toHaveTextContent(
      /submitted|已提交/u,
    );
    expect(screen.getByTestId("invite-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("invite-submit"));
    expect(api.createInvitation).toHaveBeenCalledOnce();
  });

  it("pages invitations by owner cursor", async () => {
    const nextInvitation = {
      ...invitations[0]!,
      invitation_id: "inv-2",
      email: "second@example.test",
    };
    const api = client({
      listInvitations: vi
        .fn()
        .mockResolvedValueOnce({
          items: invitations,
          nextCursor: "invite-next",
          requestId: "r1",
        })
        .mockResolvedValueOnce({
          items: [nextInvitation],
          nextCursor: null,
          requestId: "r2",
        }),
    });
    show(api);
    fireEvent.click(await screen.findByTestId("invitations-more"));
    expect(await screen.findByTestId("invitation-row-inv-2")).toHaveTextContent(
      "second@example.test",
    );
    expect(api.listInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, cursor: "invite-next" }),
    );
  });

  it("ends the Product Session after a successful leave without refetching forbidden members", async () => {
    const api = client();
    show(api);
    fireEvent.click(await screen.findByTestId("team-leave"));
    fireEvent.click(screen.getByTestId("team-leave-confirm"));
    await waitFor(() => expect(endProductSession).toHaveBeenCalledOnce());
    expect(api.leave).toHaveBeenCalledOnce();
    expect(api.listMembers).toHaveBeenCalledOnce();
  });
});

describe("Team localized presentation and explicit actions", () => {
  it("labels known roles and pending invitations while preserving custom role names", async () => {
    const api = client({
      listMembers: vi.fn().mockResolvedValue({
        items: [...members, { ...members[1]!, member_id: "member-custom", display_name: "Custom", roles: ["reviewer_custom"] }],
        nextCursor: null,
        requestId: "req-members",
      }),
    });
    show(api);
    const me = await screen.findByTestId("member-row-member-me");
    expect(me).toHaveTextContent("Owner");
    expect(me).toHaveTextContent("You");
    expect(screen.getByTestId("member-row-member-custom")).toHaveTextContent("reviewer_custom");
    expect(screen.getByTestId("invitation-row-inv-1")).toHaveTextContent("Awaiting acceptance");
    expect(screen.getByTestId("invitation-row-inv-1")).not.toHaveTextContent("pending");
    expect(api.createInvitation).not.toHaveBeenCalled();
    expect(api.replaceMemberRoles).not.toHaveBeenCalled();
  });

  it("selects the invite role with a keyboard and submits its original wire value only on Invite", async () => {
    const api = client();
    show(api);
    const trigger = await screen.findByRole("combobox", { name: "Invitee role" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveTextContent("Member");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const admin = await screen.findByRole("option", { name: "Admin" });
    expect(screen.queryByRole("option", { name: "Owner" })).toBeNull();
    act(() => admin.focus());
    fireEvent.keyDown(admin, { key: "Enter" });
    await waitFor(() => expect(trigger).toHaveTextContent("Admin"));
    expect(api.createInvitation).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("invite-email"), { target: { value: "admin@example.test" } });
    fireEvent.click(screen.getByTestId("invite-submit"));
    await waitFor(() => expect(api.createInvitation).toHaveBeenCalledWith("admin@example.test", ["admin"], expect.any(AbortSignal)));
    expect(api.createInvitation).toHaveBeenCalledOnce();
  });

  it("explains leaving and cancels its confirmation without submitting", async () => {
    const api = client();
    show(api);
    const leave = await screen.findByTestId("team-leave");
    expect(leave).toHaveAccessibleDescription("After leaving, you will lose access to this team’s content. Confirmation is required.");
    fireEvent.click(leave);
    const confirmation = screen.getByRole("group", { name: "Leave this team?" });
    expect(within(confirmation).getByTestId("team-leave-confirm")).toBeEnabled();
    expect(api.leave).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("team-leave-confirm")).toBeNull();
    expect(screen.getByTestId("team-leave")).toBeEnabled();
    expect(api.leave).not.toHaveBeenCalled();
  });
});

describe("SET20 Team recovery and retirement RED", () => {
  it("locks a second write after unknown outcome until authoritative reload and explicit choice", async () => {
    const api = client({
      createInvitation: vi
        .fn()
        .mockRejectedValue(new TeamClientError("Lost ACK", null, null, null)),
    });
    show(api);
    await screen.findByTestId("invite-submit");
    fireEvent.change(screen.getByTestId("invite-email"), {
      target: { value: "new@example.test" },
    });
    fireEvent.click(screen.getByTestId("invite-submit"));
    await screen.findByTestId("team-notice");
    expect(screen.getByTestId("invite-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("invite-submit"));
    expect(api.createInvitation).toHaveBeenCalledOnce();
  });

  it("prevents two writes dispatched in the same render turn", async () => {
    const releases: Array<() => void> = [];
    const api = client({
      resendInvitation: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            releases.push(resolve);
          }),
      ),
    });
    show(api);
    const button = await screen.findByTestId("invitation-resend-inv-1");
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const callsBeforeRelease = (
      api.resendInvitation as ReturnType<typeof vi.fn>
    ).mock.calls.length;
    await act(async () => {
      releases.forEach((release) => release());
      await Promise.resolve();
    });
    expect(callsBeforeRelease).toBe(1);
  });

  it("does not sign out a new Team identity from a retired client's late leave ACK", async () => {
    endProductSession.mockClear();
    let release!: () => void;
    const oldApi = client({
      leave: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
    });
    const view = show(oldApi);
    fireEvent.click(await screen.findByTestId("team-leave"));
    fireEvent.click(screen.getByTestId("team-leave-confirm"));
    await waitFor(() => expect(oldApi.leave).toHaveBeenCalledOnce());
    const newApi = client({
      currentUserId: vi.fn().mockResolvedValue("user-bob"),
    });
    view.rerender(
      <TeamPanel
        client={newApi}
        readBoundary={{ admitted: true, subject: "user-bob", generation: 2 }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(newApi.currentUserId).toHaveBeenCalledOnce());
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(endProductSession).not.toHaveBeenCalled();
  });

  it("fails closed at twenty unique role pages instead of granting partial permissions", async () => {
    let pages = 0;
    const api = client({
      listRoles: vi.fn(async () => {
        pages += 1;
        return {
          items: [{ ...roles[0]!, name: `role_${pages}` }],
          nextCursor: pages < 21 ? `cursor-${pages}` : null,
          requestId: `req-${pages}`,
        };
      }),
    });
    show(api);
    await waitFor(() =>
      expect(
        screen.queryByTestId("team-members") !== null ||
          screen.queryByRole("alert") !== null,
      ).toBe(true),
    );
    expect(api.listRoles).toHaveBeenCalledTimes(20);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-submit")).toBeNull();
  });
});

describe("SET20 explicit authority recovery and admission", () => {
  it("requires full authority reload and explicit continue after an unknown write, preserving the draft", async () => {
    const api = client({
      createInvitation: vi
        .fn()
        .mockRejectedValueOnce(
          new TeamClientError("Lost ACK", null, null, null),
        )
        .mockResolvedValue(undefined),
    });
    show(api);
    await screen.findByTestId("invite-submit");
    fireEvent.change(screen.getByTestId("invite-email"), {
      target: { value: "draft@example.test" },
    });
    fireEvent.click(screen.getByTestId("invite-submit"));
    fireEvent.click(await screen.findByTestId("team-reconcile"));
    await screen.findByTestId("team-continue");
    expect(api.currentUserId).toHaveBeenCalledTimes(2);
    expect(api.listMembers).toHaveBeenCalledTimes(2);
    expect(api.listRoles).toHaveBeenCalledTimes(2);
    expect(api.listInvitations).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("invite-submit")).toBeDisabled();
    expect(screen.getByTestId("invite-email")).toHaveValue(
      "draft@example.test",
    );
    expect(api.createInvitation).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("team-continue"));
    expect(api.createInvitation).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("invite-submit"));
    await waitFor(() => expect(api.createInvitation).toHaveBeenCalledTimes(2));
  });

  it("keeps unknown write locked after failed authority reload", async () => {
    const api = client({
      createInvitation: vi.fn().mockRejectedValue(new Error("Unknown")),
      listRoles: vi
        .fn()
        .mockResolvedValueOnce({
          items: roles,
          nextCursor: null,
          requestId: "first",
        })
        .mockRejectedValue(new Error("Unavailable")),
    });
    show(api);
    await screen.findByTestId("invite-submit");
    fireEvent.change(screen.getByTestId("invite-email"), {
      target: { value: "draft@example.test" },
    });
    fireEvent.click(screen.getByTestId("invite-submit"));
    fireEvent.click(await screen.findByTestId("team-reconcile"));
    await waitFor(() => expect(api.listRoles).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("team-continue")).toBeNull();
    expect(screen.getByTestId("invite-submit")).toBeDisabled();
    expect(api.createInvitation).toHaveBeenCalledOnce();
  });

  it("reloads actor and roles after a successful invitation before granting new write controls", async () => {
    const api = client({
      listMembers: vi
        .fn()
        .mockResolvedValueOnce({
          items: members,
          nextCursor: null,
          requestId: "before",
        })
        .mockResolvedValue({
          items: [{ ...members[0]!, roles: ["member"] }, members[1]!],
          nextCursor: null,
          requestId: "after",
        }),
    });
    show(api);
    await screen.findByTestId("invite-submit");
    fireEvent.change(screen.getByTestId("invite-email"), {
      target: { value: "new@example.test" },
    });
    fireEvent.click(screen.getByTestId("invite-submit"));
    await waitFor(() =>
      expect(screen.queryByTestId("invite-submit")).toBeNull(),
    );
    expect(api.currentUserId).toHaveBeenCalledTimes(2);
    expect(api.listRoles).toHaveBeenCalledTimes(2);
    expect(api.createInvitation).toHaveBeenCalledOnce();
  });

  it("does zero reads without a live admitted boundary", async () => {
    const api = client();
    render(<TeamPanel client={api} onClose={vi.fn()} />, {
      wrapper: LocaleProvider,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.currentUserId).not.toHaveBeenCalled();
    expect(api.listMembers).not.toHaveBeenCalled();
    expect(screen.queryByTestId("team-leave")).toBeNull();
  });

  it("retires current draft and confirmation synchronously when admission is lost", async () => {
    const api = client();
    const view = show(api);
    await screen.findByTestId("invite-submit");
    fireEvent.change(screen.getByTestId("invite-email"), {
      target: { value: "private@example.test" },
    });
    fireEvent.click(screen.getByTestId("member-remove-member-bob"));
    view.rerender(
      <TeamPanel
        client={api}
        readBoundary={{ admitted: false, subject: "user-me", generation: 1 }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("invite-email")).toBeNull();
    expect(screen.queryByTestId("member-remove-confirm-member-bob")).toBeNull();
    expect(api.removeMember).not.toHaveBeenCalled();
  });

  it("rejects duplicate role identity across permission pages", async () => {
    const api = client({
      listRoles: vi
        .fn()
        .mockResolvedValueOnce({
          items: roles,
          nextCursor: "second",
          requestId: "one",
        })
        .mockResolvedValueOnce({
          items: [roles[0]!],
          nextCursor: null,
          requestId: "two",
        }),
    });
    show(api);
    await screen.findByRole("alert");
    expect(screen.queryByTestId("invite-submit")).toBeNull();
    expect(api.listRoles).toHaveBeenCalledTimes(2);
  });

  it("rejects a permission catalog exceeding 2000 items even on a complete page", async () => {
    const api = client({
      listRoles: vi
        .fn()
        .mockResolvedValue({
          items: Array.from({ length: 2001 }, (_, index) => ({
            ...roles[0]!,
            name: `role_${index}`,
          })),
          nextCursor: null,
          requestId: "large",
        }),
    });
    show(api);
    await screen.findByRole("alert");
    expect(screen.queryByTestId("invite-submit")).toBeNull();
    expect(api.createInvitation).not.toHaveBeenCalled();
  });

  it("does not sign out the Product session from a preview leave", async () => {
    endProductSession.mockClear();
    const api = client();
    render(<TeamPanel client={api} preview onClose={vi.fn()} />, {
      wrapper: LocaleProvider,
    });
    fireEvent.click(await screen.findByTestId("team-leave"));
    fireEvent.click(screen.getByTestId("team-leave-confirm"));
    await waitFor(() => expect(api.leave).toHaveBeenCalledOnce());
    expect(endProductSession).not.toHaveBeenCalled();
  });
});

describe("Team invitation validation and confirmation focus", () => {
  it("rejects native-valid a@b before the client or unknown-write guard, then submits one corrected wire", async () => {
    const { teamCreateInvitationRequestSchema } = await import("@/team/schema");
    const createInvitation = vi.fn<TeamClient["createInvitation"]>(async (email, roles) => {
      teamCreateInvitationRequestSchema.parse({ email, roles });
    });
    const api = client({ createInvitation });
    show(api);
    const input = await screen.findByTestId("invite-email") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "a@b" } });
    expect(input.checkValidity()).toBe(true);
    expect(teamCreateInvitationRequestSchema.safeParse({ email: input.value, roles: ["member"] }).success).toBe(false);
    await act(async () => fireEvent.click(screen.getByTestId("invite-submit")));
    expect(createInvitation).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(expect.stringContaining("Enter a valid email address."));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(screen.queryByTestId("team-notice")).toBeNull();
    expect(screen.queryByTestId("team-continue")).toBeNull();
    expect(screen.getByTestId("invite-submit")).toBeEnabled();
    expect(screen.getByTestId("invitation-resend-inv-1")).toBeEnabled();

    fireEvent.change(input, { target: { value: "new@example.test" } });
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Enter a valid email address.")).toBeNull();
    expect(input).toHaveAccessibleDescription("Choose a role and send a team invitation by email.");
    fireEvent.click(screen.getByTestId("invite-submit"));
    await waitFor(() => expect(createInvitation).toHaveBeenCalledOnce());
    expect(createInvitation).toHaveBeenCalledWith("new@example.test", ["member"], expect.any(AbortSignal));
    await waitFor(() => expect(screen.getByTestId("invite-submit")).toBeEnabled());
    expect(screen.queryByTestId("team-notice")).toBeNull();
    expect(api.resendInvitation).not.toHaveBeenCalled();
  });

  it.each(["leave", "remove"] as const)("focuses Cancel for %s and returns only an explicit cancellation to its original action", async (kind) => {
    const api = client();
    show(api);
    const triggerId = kind === "leave" ? "team-leave" : "member-remove-member-bob";
    const trigger = await screen.findByTestId(triggerId);
    act(() => trigger.focus());
    fireEvent.click(trigger);
    const confirmation = kind === "leave"
      ? screen.getByRole("group", { name: "Leave this team?" })
      : screen.getByTestId("member-row-member-bob");
    const cancel = within(confirmation).getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();
    expect(api.leave).not.toHaveBeenCalled();
    expect(api.removeMember).not.toHaveBeenCalled();
    fireEvent.click(cancel);
    expect(screen.getByTestId(triggerId)).toHaveFocus();
    expect(screen.queryByTestId(kind === "leave" ? "team-leave-confirm" : "member-remove-confirm-member-bob")).toBeNull();
    expect(api.leave).not.toHaveBeenCalled();
    expect(api.removeMember).not.toHaveBeenCalled();
  });

  it.each(["client", "subject", "generation"] as const)("retires invalid input and confirmation on %s replacement without focusing old actions", async (change) => {
    const api = client();
    const view = show(api);
    const input = await screen.findByTestId("invite-email");
    fireEvent.change(input, { target: { value: "a@b" } });
    fireEvent.click(screen.getByTestId("invite-submit"));
    expect(input).toHaveAttribute("aria-invalid", "true");
    const oldTrigger = screen.getByTestId("member-remove-member-bob");
    fireEvent.click(oldTrigger);
    const cancel = within(screen.getByTestId("member-row-member-bob")).getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();
    const oldTriggerFocus = vi.spyOn(oldTrigger, "focus");
    const oldCancelFocus = vi.spyOn(cancel, "focus");
    const subject = change === "subject" ? "user-next" : "user-me";
    const nextApi = change === "generation" ? api : client({
      currentUserId: vi.fn().mockResolvedValue(subject),
      listMembers: vi.fn().mockResolvedValue({ items: members.map((member) => member.member_id === "member-me" ? { ...member, user_id: subject } : member), nextCursor: null, requestId: "next-members" }),
    });
    view.rerender(<TeamPanel client={nextApi} readBoundary={{ admitted: true, subject, generation: change === "generation" ? 2 : 1 }} onClose={vi.fn()} />);
    const nextInput = await screen.findByTestId("invite-email");
    expect(nextInput).toHaveValue("");
    expect(nextInput).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Enter a valid email address.")).toBeNull();
    expect(screen.queryByTestId("member-remove-confirm-member-bob")).toBeNull();
    expect(oldTriggerFocus).not.toHaveBeenCalled();
    expect(oldCancelFocus).not.toHaveBeenCalled();
    expect(api.createInvitation).not.toHaveBeenCalled();
    expect(api.removeMember).not.toHaveBeenCalled();
    expect(nextApi.createInvitation).not.toHaveBeenCalled();
    expect(nextApi.removeMember).not.toHaveBeenCalled();
    oldTriggerFocus.mockRestore();
    oldCancelFocus.mockRestore();
  });
});
