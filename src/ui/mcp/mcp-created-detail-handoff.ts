import { mcpConnectorSchema, mcpPrivateServerSchema } from "@/hub/mcp-connector.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { McpCreationFacts, McpServerCreationCompletion } from "./mcp-server-creation-flow";
import { getMcpConnectorRevisionSnapshot } from "./use-mcp-projection";

type Observation = {
  client: object; subject: string; generation: number; revision: number;
  serverVersion: string; connectorVersion: string; facts: McpCreationFacts;
};
// The completion object's identity is the capability for this one modal handoff.
// No route, journal, storage, or reconstructed locator can recover these facts.
const observations = new WeakMap<McpServerCreationCompletion, Observation>();
function freezeFact(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  Object.values(value).forEach(freezeFact);
  Object.freeze(value);
}
export function rememberCreatedMcpDetail(target: McpServerCreationCompletion, client: object,
  boundary: ProjectReadBoundary, facts: McpCreationFacts): void {
  observations.delete(target);
  if (!boundary.admitted || boundary.subject === null) return;
  // Clone only strict owner read schemas; registration headers/client secrets
  // are not a permitted handoff, even if the caller has extra write fields.
  const server = mcpPrivateServerSchema.safeParse(facts.server);
  const connector = mcpConnectorSchema.safeParse(facts.connector);
  if (!server.success || !connector.success || server.data.status === "disabled" || connector.data.status === "revoked" ||
    server.data.server_id !== target.serverId || connector.data.server_id !== target.serverId ||
    connector.data.connector_id !== target.connectorId || connector.data.provider_key !== target.providerKey || connector.data.connector_type !== "mcp") return;
  const safeFacts = { server: server.data, connector: connector.data };
  freezeFact(safeFacts);
  observations.set(target, { client, subject: boundary.subject, generation: boundary.generation,
    revision: getMcpConnectorRevisionSnapshot(client, boundary.subject), serverVersion: server.data.state_version,
    connectorVersion: connector.data.state_version, facts: safeFacts });
}
export function readCreatedMcpDetail(target: McpServerCreationCompletion, client: object,
  boundary: ProjectReadBoundary): McpCreationFacts | null {
  const observed = observations.get(target);
  if (!observed) return null;
  const { server, connector } = observed.facts;
  if (!boundary.admitted || boundary.subject !== observed.subject || client !== observed.client || boundary.generation !== observed.generation ||
    getMcpConnectorRevisionSnapshot(client, observed.subject) !== observed.revision ||
    server.server_id !== target.serverId || connector.connector_id !== target.connectorId || connector.provider_key !== target.providerKey ||
    connector.server_id !== target.serverId || server.state_version !== observed.serverVersion || connector.state_version !== observed.connectorVersion) {
    observations.delete(target);
    return null;
  }
  return observed.facts;
}
/** A new owner observation starts by retiring the old one, including on failure. */
export function retireCreatedMcpDetail(target: McpServerCreationCompletion): void { observations.delete(target); }
