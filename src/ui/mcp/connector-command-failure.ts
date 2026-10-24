import { HubClientError } from "@/hub/client";
import { BFF_CONNECTOR_COMMAND_ERROR_POLICY as policy } from "@/generated/bff-connector-command-errors";
import type { MessageKey } from "@/i18n/messages";

export type ConnectorCommandFailure =
  | keyof typeof policy.mcp
  | keyof typeof policy.mcp_preconditions;
export type ConnectorCommandSurface = "mcp" | "custom_api";

/** Only a verified published tuple can change how the original intent resumes. */
export function connectorCommandFailure(
  surface: ConnectorCommandSurface,
  error: unknown,
): ConnectorCommandFailure | undefined {
  if (!(error instanceof HubClientError) || error.reason !== "http")
    return undefined;
  const entries = [
    ...Object.entries(policy[surface]),
    ...(surface === "mcp" ? Object.entries(policy.mcp_preconditions) : []),
  ];
  const match = entries.find(
    ([, entry]) =>
      entry.code === error.code &&
      entry.status === error.status &&
      entry.retryable === error.retryable,
  );
  return match?.[0] as ConnectorCommandFailure | undefined;
}

export function connectorCommandMayResume(
  failure: ConnectorCommandFailure | undefined,
): boolean {
  if (failure === undefined) return true;
  return (
    failure in policy.mcp &&
    policy.mcp[failure as keyof typeof policy.mcp].recovery === "same_command"
  );
}

/** This exception belongs only to Prepare, never to other inspect_owner commands. */
export function connectorPrepareMayInspect(failure: ConnectorCommandFailure | undefined): boolean {
  const rule = policy.prepare_inspection_recovery;
  return failure === rule.failure && rule.operation === "prepareServer" && rule.binding === "exact_server_connector" &&
    rule.same_actor && rule.server_version === "not_older_than_original" && rule.replay === "same_command" &&
    !rule.automatic_retries && !rule.new_command_authorized;
}

export function connectorCommandFailureMessage(
  failure: ConnectorCommandFailure | undefined,
  fallback: MessageKey,
): MessageKey {
  return failure === undefined ? fallback : `mcp.recovery.${failure}`;
}
