import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/i18n/context";
import { AccountCard } from "@/ui/settings/sections/account-card";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const fetcher = vi.fn();
beforeEach(() => {
  localStorage.setItem("kokoro.locale", "en");
  vi.stubGlobal("fetch", fetcher);
  fetcher
    .mockReset()
    .mockResolvedValue(
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
        loginMethodsOpen={false}
        onLoginMethodsChange={vi.fn()}
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
  expect(screen.getByRole("button", { name: "Change" })).toBeDisabled();
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
  loginMethodsOpen: false,
  onLoginMethodsChange: vi.fn(),
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
it("waits for admission, retries read failure and never substitutes preview", async () => {
  const view = render(card("alice", 1, false));
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockRejectedValueOnce(new Error("offline"));
  view.rerender(card());
  expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load");
  expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("—");
  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
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
  await screen.findByRole("alert");
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
  render(card()); await screen.findByText("alice@example.test")
  const entry = screen.getByRole("button", { name: "Login devices" })
  const row = entry.parentElement!
  expect(row.querySelector("strong")).toHaveTextContent("Login devices")
  expect(row.querySelector("span")).toHaveTextContent("Only confirmed sign-in sessions and their creation and expiry times are shown.")
  expect(entry).toHaveTextContent("Manage")
  expect(row.previousElementSibling).toHaveTextContent("Manage sign-in method")
  expect(row.nextElementSibling).toHaveTextContent("Delete account")
});
