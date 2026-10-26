import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { AccountReadSnapshotBoundary } from "@/ui/settings/account-read-snapshots";
import { LocaleProvider } from "@/i18n/context";
import { AccountCard } from "@/ui/settings/sections/account-card";
import type { AccountDetail } from "@/ui/settings/settings-types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const fetcher = vi.fn();
const billingFetcher = vi.fn();
beforeEach(() => {
  localStorage.setItem("kokoro.locale", "en");
  billingFetcher.mockReset().mockImplementation(async () => Response.json({
    credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "12500000", held_micros: "500000",
  }, { headers: { "cache-control": "private, no-store", "x-request-id": "account-credits" } }));
  // Profile/CAS assertions keep their own request history; summary is a separate GET.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    input === "/api/session/billing/summary" ? billingFetcher(input, init) : fetcher(input, init));
  fetcher.mockReset().mockResolvedValue(
    Response.json({
      data: {
        subject: "alice",
        name: "Alice Actual",
        email: "alice@example.test",
        email_verified: true,
      },
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("loads real account data after admission without enabling preview writes", async () => {
  render(
    <LocaleProvider>
      <AccountCard
        {...{
          readBoundary: { admitted: true, subject: "alice", generation: 1 },
        }}
        detail={null}
        onDetailChange={vi.fn()}
        onOpenSubscription={vi.fn()}
      />
    </LocaleProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue(
      "Alice Actual",
    ),
  );
  expect(screen.getByText("alice@example.test")).toBeVisible();
  expect(screen.getByText("alice")).toBeVisible();
  expect(screen.getByRole("button", { name: "Change" })).toBeEnabled();
  expect(screen.queryByText("1,000")).not.toBeInTheDocument();
  expect(screen.queryByText("preview@example.test")).not.toBeInTheDocument();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const props = {
  detail: null,
  onDetailChange: vi.fn(),
  onOpenSubscription: vi.fn(),
};
const boundary = (subject = "alice", generation = 1, admitted = true) => ({
  subject,
  generation,
  admitted,
});
const card = (
  subject = "alice",
  generation = 1,
  admitted = true,
  preview = false,
) => (
  <LocaleProvider>
    <AccountCard
      {...props}
      preview={preview}
      readBoundary={boundary(subject, generation, admitted)}
    />
  </LocaleProvider>
);
it("keeps unknown account fields quiet after a read failure and reads again on reentry", async () => {
  const view = render(card("alice", 1, false));
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockRejectedValueOnce(new Error("offline"));
  view.rerender(card());
  await act(async () => {});
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("—");
  expect(screen.getByRole("textbox", { name: "Full name" })).toBeDisabled();
  view.unmount();
  render(card());
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue(
      "Alice Actual",
    ),
  );
});
it("clears old identity synchronously and aborts then ignores its late response", async () => {
  const pending = deferred<Response>();
  fetcher.mockReturnValueOnce(pending.promise);
  const view = render(card());
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
  fetcher.mockResolvedValueOnce(
    Response.json({
      data: { subject: "bob", name: "Bob", email: null, email_verified: null },
    }),
  );
  view.rerender(card("bob", 2));
  expect(signal.aborted).toBe(true);
  expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("—");
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue(
      "Bob",
    ),
  );
  const cancel = vi.fn();
  pending.resolve(
    new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "application/json" },
    }),
  );
  await waitFor(() => expect(cancel).toHaveBeenCalled());
  expect(screen.queryByText("alice@example.test")).not.toBeInTheDocument();
  view.rerender(card("bob", 3, false));
  expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("—");
  expect(screen.queryByText("Bob")).not.toBeInTheDocument();
});
it("rejects a successful response for another subject", async () => {
  fetcher.mockResolvedValueOnce(
    Response.json({
      data: { subject: "bob", name: "Bob", email: null, email_verified: null },
    }),
  );
  render(card());
  await act(async () => {});
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("—");
});
it("clears a loaded profile on same-subject generation retirement", async () => {
  const view = render(card());
  await screen.findByText("alice@example.test");
  fetcher.mockReturnValueOnce(new Promise(() => {}));
  view.rerender(card("alice", 2));
  expect(screen.queryByText("alice@example.test")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("—");
});
it("uses real ID for copy and shows a safe error when clipboard rejects", async () => {
  const writeText = vi
    .fn()
    .mockRejectedValueOnce(new Error("clipboard denied"));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(card());
  await screen.findByText("alice@example.test");
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await screen.findByRole("alert");
  expect(writeText).toHaveBeenCalledWith("alice");
  expect(
    screen.queryByRole("button", { name: "Copied" }),
  ).not.toBeInTheDocument();
});
it("ignores a late clipboard success after an identity switch", async () => {
  const pending = deferred<void>();
  const writeText = vi.fn().mockReturnValueOnce(pending.promise);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const view = render(card());
  await screen.findByText("alice@example.test");
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  fetcher.mockResolvedValueOnce(
    Response.json({
      data: { subject: "bob", name: "Bob", email: null, email_verified: null },
    }),
  );
  view.rerender(card("bob", 2));
  await screen.findByText("bob");
  await act(async () => pending.resolve());
  expect(
    screen.queryByRole("button", { name: "Copied" }),
  ).not.toBeInTheDocument();
});
it("unmount cancels a read; explicit preview never reads the live endpoint", async () => {
  fetcher.mockReturnValueOnce(new Promise(() => {}));
  const view = render(card());
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  fetcher.mockClear();
  render(card("alice", 1, true, true));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue(
    "Preview User",
  );
  expect(screen.getByText("preview@example.test")).toBeVisible();
});
it("offers admitted users a separate login devices entry without enabling preview devices", async () => {
  const view = render(card());
  await screen.findByText("alice@example.test");
  expect(screen.getByRole("button", { name: "Login devices" })).toBeEnabled();
  view.rerender(card("alice", 2, true, true));
  expect(screen.getByRole("button", { name: "Login devices" })).toBeDisabled();
});
it("places login devices in the existing account row between login methods and account deletion", async () => {
  render(card());
  await screen.findByText("alice@example.test");
  const entry = screen.getByRole("button", { name: "Login devices" });
  const row = entry.parentElement!;
  expect(row.querySelector("strong")).toHaveTextContent("Login devices");
  expect(row.querySelector("span")).toHaveTextContent(
    "Only confirmed sign-in sessions and their creation and expiry times are shown.",
  );
  expect(entry).toHaveTextContent("Manage");
  expect(row.previousElementSibling).toHaveTextContent("Manage sign-in method");
  expect(row.nextElementSibling).toHaveTextContent("Delete account");
});

it("offers explicit live name save without saving on blur", async () => {
  render(card());
  const input = await screen.findByRole("textbox", { name: "Full name" });
  await waitFor(() => expect(input).toHaveValue("Alice Actual"));
  expect(input).not.toBeDisabled();
  fireEvent.change(input, { target: { value: "New Alice" } });
  fireEvent.blur(input);
  expect(
    fetcher.mock.calls.filter((call) => call[1]?.method === "PATCH"),
  ).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Save name" })).toBeEnabled();
});

it("saves live name only on explicit action then displays authority from GET", async () => {
  let authoritative = "Alice Actual";
  fetcher.mockImplementation(async (_url, options) => {
    if (options?.method === "PATCH") {
      authoritative = "New Alice";
      return Response.json(
        { data: { subject: "alice", name: authoritative } },
        {
          headers: {
            "cache-control": "private, no-store",
            "x-request-id": "request",
          },
        },
      );
    }
    return Response.json({
      data: {
        subject: "alice",
        name: authoritative,
        email: "alice@example.test",
        email_verified: true,
      },
    });
  });
  render(card());
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue(
      "Alice Actual",
    ),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Full name" }), {
    target: { value: "New Alice" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save name" }));
  await screen.findByText("Name saved and read back.");
  expect(
    fetcher.mock.calls.filter((call) => call[1]?.method === "PATCH"),
  ).toHaveLength(1);
  expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue(
    "New Alice",
  );
  expect(
    fetcher.mock.calls.filter((call) => call[1]?.method === "GET"),
  ).toHaveLength(2);
});

it.each([
  ["Change", "Change email address", "Next"],
  ["Delete account", "Delete account", "Delete account"],
])("account service preview %s is readable but cannot verify, authorize or delete", async (trigger, title, finalAction) => {
  const view = render(card());
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("Alice Actual"));
  const reads = fetcher.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: trigger }));
  let dialog = screen.getByRole("dialog", { name: title });
  expect(dialog).toHaveTextContent(/unavailable|not connected/i);
  if (trigger === "Delete account") expect(dialog).toHaveTextContent("permanently");
  const final = within(dialog).getAllByRole("button", { name: finalAction });
  for (const button of final) {
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/unavailable|not connected/i);
    fireEvent.click(button);
  }
  const code = within(dialog).queryByRole("textbox", { name: "Enter verification code" });
  if (code) {
    fireEvent.change(code, { target: { value: "not verified" } });
    expect(within(dialog).getByRole("button", { name: /Send/ })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: finalAction })).toBeDisabled();
  } else {
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent("Alice Actual");
    expect(dialog).toHaveTextContent("alice@example.test");
    expect(dialog).toHaveTextContent("Kokoro");
    expect(dialog).not.toHaveTextContent("30 days");
  }
  expect(fetcher).toHaveBeenCalledTimes(reads);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: trigger }));
  dialog = screen.getByRole("dialog", { name: title });
  if (code) expect(within(dialog).getByRole("textbox")).toHaveValue("");
  view.rerender(card("alice", 2));
  expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
});

function AccountLoginHarness({ subject = "alice", generation = 1 }: { subject?: string; generation?: number }) {
  const [detail, setDetail] = useState<AccountDetail>(null);
  return <LocaleProvider><AccountCard detail={detail} onDetailChange={setDetail} onOpenSubscription={vi.fn()} readBoundary={boundary(subject, generation)} /></LocaleProvider>;
}

it("opens live sign-in methods as unknown local content and retires it with the identity", async () => {
  const view = render(<AccountLoginHarness />);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("Alice Actual"));
  const reads = fetcher.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Manage sign-in method" }));
  const page = screen.getByRole("region", { name: "Manage sign-in method" });
  expect(screen.queryByRole("dialog", { name: "Manage sign-in method" })).not.toBeInTheDocument();
  for (const provider of ["Google", "Microsoft", "Apple"]) {
    const row = within(page).getByRole("group", { name: provider });
    expect(row).toHaveTextContent("Connection status cannot be read");
    const connect = within(row).getByRole("button", { name: "Connect" });
    expect(connect).toBeDisabled();
    expect(connect).toHaveAccessibleDescription("Account verification and change services are not connected; these actions are unavailable.");
    fireEvent.click(connect);
  }
  expect(within(page).getByRole("button", { name: "Add passkey" })).toBeDisabled();
  expect(page).toHaveTextContent("Linked sign-in methods and passkeys cannot currently be read.");
  expect(page).not.toHaveTextContent("No passkeys");
  expect(page).not.toHaveTextContent("alice@example.test");
  expect(page.querySelector("a, input, iframe, canvas")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(reads);
  view.rerender(<AccountLoginHarness generation={2} />);
  await waitFor(() => expect(screen.queryByRole("region", { name: "Manage sign-in method" })).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Manage sign-in method" })).toBeEnabled();
});

it("does not call an unverified email a confirmed verification target", async () => {
  fetcher.mockResolvedValueOnce(Response.json({ data: { subject: "alice", name: "Alice Actual", email: "unverified@example.test", email_verified: false } }));
  render(card());
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("Alice Actual"));
  const reads = fetcher.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Change" }));
  const dialog = screen.getByRole("dialog", { name: "Change email address" });
  expect(dialog).toHaveTextContent("Your current verified email cannot be confirmed yet.");
  expect(dialog).not.toHaveTextContent("unverified@example.test");
  expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "Next" })).toBeDisabled();
  expect(fetcher).toHaveBeenCalledTimes(reads);
});

it.each(["subject", "generation", "admission", "preview"])("retires the live verification draft on %s changes", async (change) => {
  const view = render(card());
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("Alice Actual"));
  fireEvent.click(screen.getByRole("button", { name: "Change" }));
  const dialog = screen.getByRole("dialog", { name: "Change email address" });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Enter verification code" }), { target: { value: "private draft" } });
  view.rerender(card(change === "subject" ? "bob" : "alice", change === "generation" ? 2 : 1, change !== "admission", change === "preview"));
  expect(screen.queryByRole("dialog", { name: "Change email address" })).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue("private draft")).not.toBeInTheDocument();
});


it("preserves confirmed account information when a same-scope reentry read fails without enabling writes", async () => {
  const pane = (open: boolean) => <LocaleProvider><AccountReadSnapshotBoundary preview={false} readBoundary={boundary()}>
    {open ? <AccountCard {...props} readBoundary={boundary()} /> : null}
  </AccountReadSnapshotBoundary></LocaleProvider>;
  const view = render(pane(true));
  await screen.findByText("alice@example.test");
  view.rerender(pane(false));
  fetcher.mockRejectedValueOnce(new Error("offline"));
  view.rerender(pane(true));
  await act(async () => {});
  expect(screen.getByText("alice@example.test")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("Alice Actual");
  expect(screen.getByRole("textbox", { name: "Full name" })).toBeDisabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
  expect(fetcher.mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
});
