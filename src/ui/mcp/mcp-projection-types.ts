import type {
  McpConnector,
  McpConnectorProvider,
  McpPrivateServer,
} from "@/hub/mcp-connector.schema";

export type McpProjectionView = "catalog" | "connections";

export type McpProjectionResource = "providers" | "connectors";

export type McpResourceState<T> = {
  data?: T;
  dataIdentity?: string;
  requestIdentity?: string;
  loading: boolean;
  error: boolean;
};

export type McpConnectorEditor = {
  kind: "edit";
  connector: McpConnector;
  server?: McpPrivateServer;
};

export const MCP_CATEGORY_MESSAGES = {
  efficiency: "mcp.categoryEfficiency",
  creation: "mcp.categoryCreation",
  business: "mcp.categoryBusiness",
  development: "mcp.categoryDevelopment",
  finance: "mcp.categoryFinance",
  travel: "mcp.categoryTravel",
  health: "mcp.categoryHealth",
} as const;

export const MCP_CATEGORY_OPTIONS = Object.keys(MCP_CATEGORY_MESSAGES) as Array<
  keyof typeof MCP_CATEGORY_MESSAGES
>;

export const DEFAULT_CONNECTOR_ARTWORK = "/integrations/default-connector.svg";

export function providerArtwork(
  provider: Pick<McpConnectorProvider, "cover_image_url">,
): string {
  return provider.cover_image_url ?? DEFAULT_CONNECTOR_ARTWORK;
}

export function formatProviderDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}
