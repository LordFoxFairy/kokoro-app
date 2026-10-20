"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import { connectorCommandMayResume, connectorCommandFailureMessage } from "./connector-command-failure";
import type { McpManagementSummary } from "./mcp-management-commands";

/** The same original-command controls in private, provider and pending details. */
export function McpManagementStatus({ command, admitted, onResume }: {
  command: McpManagementSummary | undefined; admitted: boolean; onResume: () => void;
}) {
  const t = useT();
  if (!command || command.kind === "rejected") return null;
  return <Alert role="status">
    <AlertDescription>{t(command.kind === "completed" ? "mcp.creationDone" : command.kind === "running" ? "mcp.loading" : connectorCommandFailureMessage(command.failure, "mcp.recovery.outcome_unknown"))}</AlertDescription>
    {command.kind === "unknown" || command.kind === "completed" ? <Button type="button" variant="outline" disabled={!admitted || (command.kind === "unknown" && !connectorCommandMayResume(command.failure))} onClick={onResume}>
      {t(command.kind === "completed" ? "mcp.creationDone" : connectorCommandMayResume(command.failure) ? "mcp.retryOriginal" : "mcp.recovery.inspectRequired")}
    </Button> : null}
  </Alert>;
}
