"use client";

import { useRef, useState } from "react";

import type { HubClient } from "@/hub/client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
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
  const [connectorRefreshKey, setConnectorRefreshKey] = useState(0);
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
        refreshKey={connectorRefreshKey}
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
            setConnectorRefreshKey((value) => value + 1);
            setMode(null);
          }}
          onRegistered={() =>
            setConnectorRefreshKey((value) => value + 1)
          }
          returnFocusRef={returnFocusRef}
        />
      )}
    </>
  );
}
