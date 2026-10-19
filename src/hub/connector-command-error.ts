import { BFF_CONNECTOR_COMMAND_ERROR_POLICY as policy } from "@/generated/bff-connector-command-errors";

type Surface = "mcp" | "custom_api";
type WireError = { code: string; retryable: boolean };

/** A narrow published tuple check, not an instruction to retry or create a key. */
export function connectorCommandErrorAllowed(
  surface: Surface,
  status: number,
  error: WireError,
  mutation: boolean,
): boolean | undefined {
  const receipt = Object.values(policy[surface]).find(
    (entry) => entry.code === error.code,
  );
  if (receipt)
    return (
      (mutation || error.code === policy[surface].invalid.code) &&
      receipt.status === status &&
      receipt.retryable === error.retryable
    );
  if (surface === "mcp") {
    const precondition = Object.values(policy.mcp_preconditions).find(
      (entry) => entry.code === error.code,
    );
    if (precondition)
      return (
        status === precondition.status &&
        error.retryable === precondition.retryable
      );
  }
  return undefined;
}
