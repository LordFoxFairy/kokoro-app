import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";

import type { HubClient } from "@/hub/client";
import { LocaleProvider } from "@/i18n/context";
import { McpOAuthCallback } from "@/ui/mcp/mcp-oauth-callback";
import { parseMcpOAuthCallback } from "@/ui/mcp/mcp-oauth-callback-payload";

afterEach(() => {
  cleanup();
});

describe("parseMcpOAuthCallback", () => {
  it("accepts exactly one standard success callback", () => {
    expect(
      parseMcpOAuthCallback("?state=opaque-state&code=authorization-code"),
    ).toEqual({ state: "opaque-state", code: "authorization-code" });
  });

  it("accepts exactly one standard provider-denied callback", () => {
    expect(
      parseMcpOAuthCallback("?state=opaque-state&error=access_denied"),
    ).toEqual({ state: "opaque-state", error: "access_denied" });
  });

  it("rejects malformed, duplicate, and ambiguous callback query values", () => {
    expect(parseMcpOAuthCallback("?code=authorization-code")).toBeUndefined();
    expect(
      parseMcpOAuthCallback("?state=one&state=two&code=authorization-code"),
    ).toBeUndefined();
    expect(
      parseMcpOAuthCallback(
        "?state=opaque-state&code=authorization-code&error=access_denied",
      ),
    ).toBeUndefined();
  });

  it("posts the provider callback through the same-origin Hub client before returning to connectors", async () => {
    const completeMcpConnectorAuthorization = vi
      .fn()
      .mockResolvedValue({
        connector: { connector_id: "connector-one", status: "active" },
      });
    const onComplete = vi.fn();
    render(
      <McpOAuthCallback
        client={{ completeMcpConnectorAuthorization } as unknown as HubClient}
        payload={{ state: "opaque-state", code: "authorization-code" }}
        onComplete={onComplete}
      />,
      { wrapper: LocaleProvider },
    );

    await waitFor(() =>
      expect(completeMcpConnectorAuthorization).toHaveBeenCalledWith({
        state: "opaque-state",
        code: "authorization-code",
      }),
    );
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("shares Complete across StrictMode and broadcasts only the connector id", async () => {
    const messages: unknown[] = [];
    class Channel {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      constructor(readonly name: string) {}
      postMessage(value: unknown) {
        messages.push(value);
      }
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", Channel);
    const completeMcpConnectorAuthorization = vi
      .fn()
      .mockResolvedValue({
        connector: { connector_id: "connector-one", status: "active" },
      });
    render(
      <StrictMode>
        <McpOAuthCallback
          client={{ completeMcpConnectorAuthorization } as unknown as HubClient}
          payload={{ state: "opaque-state", code: "authorization-code" }}
          onComplete={() => undefined}
        />
      </StrictMode>,
      { wrapper: LocaleProvider },
    );
    await waitFor(() =>
      expect(messages).toEqual([{ connector_id: "connector-one" }]),
    );
    expect(completeMcpConnectorAuthorization).toHaveBeenCalledOnce();
    expect(JSON.stringify(messages)).not.toContain("opaque-state");
    expect(JSON.stringify(messages)).not.toContain("authorization-code");
    vi.unstubAllGlobals();
  });

  it("keeps an owner-acknowledged OAuth denial failed while broadcasting only a reload hint", async () => {
    const messages: unknown[] = [];
    class Channel {
      constructor(readonly name: string) {}
      postMessage(value: unknown) {
        messages.push(value);
      }
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", Channel);
    const completeMcpConnectorAuthorization = vi.fn().mockResolvedValue({
      connector: { connector_id: "connector-one", status: "error" },
    });
    const onComplete = vi.fn();
    render(
      <McpOAuthCallback
        client={{ completeMcpConnectorAuthorization } as unknown as HubClient}
        payload={{ state: "opaque-state", error: "access_denied" }}
        onComplete={onComplete}
      />,
      { wrapper: LocaleProvider },
    );

    expect(onComplete).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(messages).toEqual([{ connector_id: "connector-one" }]),
    );
    expect(JSON.stringify(messages)).not.toContain("access_denied");
    expect(JSON.stringify(messages)).not.toContain("opaque-state");
    vi.unstubAllGlobals();
  });
});
