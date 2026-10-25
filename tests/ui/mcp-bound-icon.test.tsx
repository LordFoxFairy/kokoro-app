import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { McpIconBinding } from "@/hub/mcp-icon.schema";
import { McpBoundIcon } from "@/ui/mcp/mcp-bound-icon";
import { CustomMcpDetailDialog } from "@/ui/mcp/custom-mcp-detail-dialog";
import { McpConnectionList } from "@/ui/mcp/mcp-connection-list";
import { LocaleProvider } from "@/i18n/context";
import type { CustomApiProfile } from "@/hub/custom-api.schema";

function binding(expiresAt = Date.now() + 60_000, url = "https://storage.example.test/icon?signature=temporary"): McpIconBinding {
  return {
    intent_id: "12345678-1234-1234-1234-123456789abc", content_sha256: "a".repeat(64),
    mime_type: "image/png", size_bytes: "8", width: 24, height: 24,
    preview_reference: { url, method: "GET", required_headers: {}, expires_at: new Date(expiresAt).toISOString() },
  };
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.removeItem("kokoro.locale"); });

it("renders only the original fresh bound preview, without optimizer or credential/referrer forwarding", () => {
  const icon = binding();
  render(<McpBoundIcon icon={icon} alt="Saved connector" fallback={<span>Original mark</span>} className="bound-mark" />);
  const image = screen.getByRole("img", { name: "Saved connector" });
  expect(image).toHaveAttribute("src", icon.preview_reference!.url);
  expect(image).toHaveAttribute("crossorigin", "anonymous");
  expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(image).toHaveClass("bound-mark");
  expect(image).not.toHaveAttribute("srcset");
  expect(screen.queryByText("Original mark")).not.toBeInTheDocument();
});

it.each(["missing-binding", "missing-reference", "expired"] as const)("preserves the caller's fallback when the preview is %s", variant => {
  const full = binding();
  const withoutReference = { ...full, preview_reference: undefined };
  const icon = variant === "missing-binding" ? undefined : variant === "missing-reference" ? withoutReference : binding(Date.now() - 1);
  render(<McpBoundIcon icon={icon} alt="Saved connector" fallback={<span>Original mark</span>} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("Original mark")).toBeVisible();
});

it("retires an on-screen reference at its deadline without fetching or refreshing it", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T00:00:00Z"));
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  render(<McpBoundIcon icon={binding(Date.now() + 1000)} alt="Saved connector" fallback={<span>Original mark</span>} />);
  expect(screen.getByRole("img")).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(1000); });
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("Original mark")).toBeVisible();
  act(() => { vi.advanceTimersByTime(60_000); });
  expect(fetch).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("also retires a reference whose deadline passes between render and its timer effect", () => {
  vi.useFakeTimers();
  const now = Date.now(), icon = binding(now + 1);
  const clock = vi.spyOn(Date, "now").mockReturnValueOnce(now).mockReturnValue(now + 2);
  try {
    render(<McpBoundIcon icon={icon} alt="Saved connector" fallback="M" />);
    act(() => { vi.runOnlyPendingTimers(); });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("M")).toBeVisible();
    expect(vi.getTimerCount()).toBe(0);
  } finally { clock.mockRestore(); }
});

it("keeps a failed URL on the fallback across rerenders instead of retrying the broken image", () => {
  const icon = binding();
  const view = render(<McpBoundIcon icon={icon} alt="Saved connector" fallback={<span>Original mark</span>} />);
  fireEvent.error(screen.getByRole("img"));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  view.rerender(<McpBoundIcon icon={{ ...icon }} alt="Saved connector" fallback={<span>Original mark</span>} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("Original mark")).toBeVisible();
});

it("accepts a newly supplied preview after failure and immediately forgets it when the binding clears", () => {
  const view = render(<McpBoundIcon icon={binding()} alt="Saved connector" fallback={<span>Original mark</span>} />);
  fireEvent.error(screen.getByRole("img"));
  const replacement = binding(Date.now() + 60_000, "https://storage.example.test/icon?signature=replaced");
  view.rerender(<McpBoundIcon icon={replacement} alt="Saved connector" fallback={<span>Original mark</span>} />);
  expect(screen.getByRole("img")).toHaveAttribute("src", replacement.preview_reference!.url);
  view.rerender(<McpBoundIcon alt="Saved connector" fallback={<span>Original mark</span>} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("Original mark")).toBeVisible();
});

it("does not let a replaced reference's old timer hide the fresh projection", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T00:00:00Z"));
  const view = render(<McpBoundIcon icon={binding(Date.now() + 1000)} alt="Saved connector" fallback="M" />);
  const replacement = binding(Date.now() + 2000, "https://storage.example.test/icon?signature=replaced");
  view.rerender(<McpBoundIcon icon={replacement} alt="Saved connector" fallback="M" />);
  act(() => { vi.advanceTimersByTime(1000); });
  expect(screen.getByRole("img")).toHaveAttribute("src", replacement.preview_reference!.url);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("the original non-edit MCP detail shows only its admitted server binding and keeps the letter fallback", () => {
  localStorage.setItem("kokoro.locale", "zh");
  const icon = binding();
  const props: Parameters<typeof CustomMcpDetailDialog>[0] = {
    connector: { availability: "available", connector_id: "bound-connector", server_id: "bound-server", provider_key: "bound-provider", connector_type: "mcp", status: "active", enabled: true, approved_scopes: [], state_version: "2" },
    server: { availability: "available", server_id: "bound-server", display_name: "Bound MCP", server_url: "https://mcp.example.test/mcp", status: "registered", state_version: "3", headers: [], prepare_status: "ready", declarations: [], declarations_available: true, icon },
    actionId: null, admitted: true, managementCommand: undefined, onResumeManagement: vi.fn(),
    actionError: false, deleteId: null, returnFocusRef: { current: null }, onClose: vi.fn(),
    onSaveConfiguration: vi.fn(), onPrepare: vi.fn(), onAuthorize: vi.fn(), onDisconnect: vi.fn(),
    onDeleteIntent: vi.fn(), onCancelDelete: vi.fn(), onDelete: vi.fn(),
  };
  const view = render(<LocaleProvider><CustomMcpDetailDialog {...props} /></LocaleProvider>);
  expect(screen.getByAltText("")).toHaveAttribute("src", icon.preview_reference!.url);
  fireEvent.error(screen.getByAltText(""));
  expect(screen.queryByAltText("")).not.toBeInTheDocument();
  expect(screen.getByText("B", { exact: true })).toBeVisible();
  const fresh = { ...props, server: { ...props.server!, icon: binding(Date.now() + 60_000, "https://storage.example.test/fresh") } };
  view.rerender(<LocaleProvider><CustomMcpDetailDialog {...fresh} admitted={false} /></LocaleProvider>);
  expect(screen.queryByAltText("")).not.toBeInTheDocument();
});

it("the original API added card uses its list binding without losing selection or owner pagination", () => {
  localStorage.setItem("kokoro.locale", "zh");
  const icon = binding();
  const profile: CustomApiProfile = { profile_id: "bound-api", name: "Bound API", state_version: "2", created_at: "2026-10-24T00:00:00Z", updated_at: "2026-10-24T00:00:00Z", environment: [], icon };
  const select = vi.fn(), next = vi.fn(), action = vi.fn();
  render(<LocaleProvider><McpConnectionList connectors={[]} customApis={[profile]} providers={[]} query="" brandName="Kokoro"
    onBrowse={action} onEdit={action} onSelectCustomApi={select} previousEnabled={false} nextEnabled
    onPrevious={action} onNext={next} /></LocaleProvider>);
  const image = screen.getByAltText("");
  expect(image).toHaveAttribute("src", icon.preview_reference!.url);
  fireEvent.error(image);
  expect(screen.queryByAltText("")).not.toBeInTheDocument();
  const card = screen.getByRole("button", { name: profile.name });
  fireEvent.click(card);
  expect(select).toHaveBeenCalledExactlyOnceWith(profile, card);
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  expect(next).toHaveBeenCalledOnce();
  expect(action).not.toHaveBeenCalled();
});
