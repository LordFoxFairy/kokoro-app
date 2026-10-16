"use client";

import { useRef, useState } from "react";

import type { HubClient } from "@/hub/client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { invalidateMcpConnectorProjection } from "@/ui/mcp/use-mcp-projection";
import { invalidateCustomApiProjection } from "@/ui/mcp/use-custom-api-projection";
import { McpContent } from "@/ui/mcp/mcp-content";
import { McpCreateDialog } from "@/ui/mcp/mcp-create-dialog";
import type { McpCreateMode } from "@/ui/mcp/mcp-panel-model";

type ConnectorsSettingsSectionProps = {
  client: HubClient;
  preview: boolean;
  brandName: string;
  readBoundary?: ProjectReadBoundary;
};

/** Connector create-dialog lifecycle is owned by the connector section so it
 * cannot leak into Settings navigation or the dialog shell. */
export function ConnectorsSettingsSection({
  client,
  preview,
  brandName,
  readBoundary,
}: ConnectorsSettingsSectionProps) {
  const [mode, setMode] = useState<McpCreateMode | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const openCreate = (
    nextMode: McpCreateMode,
    target?: HTMLElement | null,
  ): void => {
    returnFocusRef.current = target ?? null;
    setMode(nextMode);
  };

  return (
    <>
      <McpContent
        client={client}
        preview={preview}
        embedded
        initialView="connections"
        settingsLayout
        brandName={brandName}
        {...(readBoundary === undefined ? {} : { readBoundary })}
        onCreateMcp={openCreate}
      />
      {mode === null ? null : (
        <McpCreateDialog
          client={client}
          mode={mode}
          open
          onOpenChange={(open) => {
            if (!open) setMode(null);
          }}
          onDone={async () => {
            const identity = preview ? "preview" : readBoundary?.admitted ? readBoundary.subject : null;
            if (mode === "custom-api" && identity != null) invalidateCustomApiProjection(client, identity);
            else if (mode !== "json") {
              // Register and remote Prepare/OAuth can settle in different reads.
              if (identity != null) invalidateMcpConnectorProjection(client, identity);
            }
          }}
          onRegistered={() => {
            const identity = preview ? "preview" : readBoundary?.admitted ? readBoundary.subject : null;
            if (identity != null) invalidateMcpConnectorProjection(client, identity);
          }}
          returnFocusRef={returnFocusRef}
        />
      )}
    </>
  );
}
