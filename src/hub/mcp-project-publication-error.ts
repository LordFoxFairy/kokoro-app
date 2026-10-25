import { MCP_PUBLICATION_POLICY } from "@/generated/bff-mcp-project-publication";
import { BFF_CONNECTOR_COMMAND_ERROR_POLICY } from "@/generated/bff-connector-command-errors";
/** Only the paired closed tuple authorizes recovery. A missing receipt never proves a failed write. */
export function mcpPublicationErrorPolicy(status: number, error: { code: string; retryable: boolean }) {
  const own = [...Object.values(MCP_PUBLICATION_POLICY.faults), ...Object.values(MCP_PUBLICATION_POLICY.admission_faults)].find(entry => entry.status === status && entry.code === error.code && entry.retryable === error.retryable);
  if (own) return own;
  const shared = Object.values(BFF_CONNECTOR_COMMAND_ERROR_POLICY.mcp).find(entry => entry.status === status && entry.code === error.code && entry.retryable === error.retryable);
  return shared ? { ...shared, first_rejection_allows_revised_command: false } : null;
}
