"use client";

import type { HubClient } from "@/hub/client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";

import { McpProjectionRead } from "./mcp-projection-read";
import type { McpCreateMode } from "./mcp-panel-model";

export type McpContentProps = {
  client: HubClient;
  preview?: boolean;
  embedded?: boolean;
  brandName?: string;
  readBoundary?: ProjectReadBoundary;
  onCreateMcp?: (
    mode: McpCreateMode,
    returnTarget?: HTMLElement | null,
  ) => void;
  initialView?: "catalog" | "connections";
  settingsLayout?: boolean;
  /** Bumps only after a connector mutation so the owner projection is refetched. */
  refreshKey?: number;
};

export function McpContent(props: McpContentProps) {
  // Preview uses the identical v1 projection with an injected client. Live
  // product rendering still requires an admitted subject and has no fallback.
  // A generation fences pending reads while admission is revalidated; it is
  // not a new user identity. Re-keying a cached projection for every periodic
  // session check remounts this surface and sends duplicate provider/connector
  // reads even when the verified subject did not change. Admission=false still
  // unmounts immediately, so a revocation never renders a cached projection.
  const identity = props.preview
    ? "preview"
    : props.readBoundary?.admitted && props.readBoundary.subject !== null
      ? props.readBoundary.subject
      : null;
  if (identity === null) return null;
  return (
    <McpProjectionScope
      client={props.client}
      embedded={props.embedded ?? false}
      identity={identity}
      initialView={props.initialView ?? "catalog"}
      settingsLayout={props.settingsLayout ?? false}
      refreshKey={props.refreshKey ?? 0}
      {...(props.brandName === undefined ? {} : { brandName: props.brandName })}
      {...(props.onCreateMcp === undefined
        ? {}
        : { onCreateMcp: props.onCreateMcp })}
    />
  );
}

function McpProjectionScope({
  client,
  embedded,
  identity,
  brandName,
  onCreateMcp,
  initialView,
  settingsLayout,
  refreshKey,
}: {
  client: HubClient;
  embedded: boolean;
  identity: string;
  brandName?: string;
  onCreateMcp?: (
    mode: McpCreateMode,
    returnTarget?: HTMLElement | null,
  ) => void;
  initialView: "catalog" | "connections";
  settingsLayout: boolean;
  refreshKey: number;
}) {
  // The projection hooks fence a refresh through their request generation.
  // Re-key only when the admitted subject changes: doing so on every mutation
  // first rendered `null`, which made the embedded Settings surface blink and
  // collapse before its cached rows could be retained.
  return (
    <McpProjectionRead
      key={identity}
      client={client}
      embedded={embedded}
      identity={identity}
      initialView={initialView}
      settingsLayout={settingsLayout}
      refreshKey={refreshKey}
      {...(brandName === undefined ? {} : { brandName })}
      {...(onCreateMcp === undefined ? {} : { onCreateMcp })}
    />
  );
}
