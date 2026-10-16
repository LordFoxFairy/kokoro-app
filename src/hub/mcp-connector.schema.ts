import { z } from "zod";
import { connectorCommandErrorAllowed } from "./connector-command-error";

export type McpConnectorReadOperation =
  | "connectors"
  | "connector"
  | "connections"
  | "connection"
  | "providers"
  | "provider";
export type McpConnectorCommandOperation =
  | "create"
  | "update"
  | "enabled"
  | "remove";
export type McpConnectorOperation =
  | McpConnectorReadOperation
  | McpConnectorCommandOperation;
export type McpPrivateServerOperation =
  | "registerServer"
  | "importJson"
  | "server"
  | "prepareServer"
  | "updateServer"
  | "deleteServer";
export const mcpConnectorIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u);
const providerKey = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}(?![\s\S])/u);
const cursor = z.string().regex(/^[A-Za-z0-9_-]{1,2048}(?![\s\S])/u);
export const mcpConnectorStateVersionSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,15}(?![\s\S])/u)
  .refine((value) => BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER));
const scalar = (min: number, max: number) =>
  z
    .string()
    .refine(
      (value) =>
        !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
          value,
        ) &&
        [...value].length >= min &&
        [...value].length <= max &&
        (min === 0 || Boolean(value.trim())),
    );
const status = z.enum(["pending", "active", "error", "revoked"]);
const unique = (values: string[]) => new Set(values).size === values.length;
const safeUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  });
export const mcpConnectorSchema = z
  .object({
    connector_id: mcpConnectorIdSchema,
    connector_type: z.enum(["builtin", "byok", "mcp"]),
    provider_key: providerKey,
    status,
    approved_scopes: z
      .array(
        z
          .string()
          .min(1)
          .max(128)
          .regex(/^\S+(?![\s\S])/u),
      )
      .refine(unique),
    enabled: z.boolean(),
    state_version: mcpConnectorStateVersionSchema,
    server_id: mcpConnectorIdSchema.optional(),
    display_name: scalar(1, 100).optional(),
    description: scalar(0, 1000).optional(),
    created_at: z.string().datetime({ offset: true }).optional(),
    updated_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type McpConnector = z.infer<typeof mcpConnectorSchema>;

function isDevelopmentLoopback(url: URL): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]")
  );
}

const privateServerUrl = z
  .string()
  .max(255)
  .refine((value) => {
    if (value.trim() !== value) return false;
    try {
      const url = new URL(value);
      return (
        (url.protocol === "https:" || isDevelopmentLoopback(url)) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.toString() === value
      );
    } catch {
      return false;
    }
  });
const privateText = (min: number, max: number, multiline = false) =>
  z.string().refine((value) => {
    if (
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
        value,
      ) ||
      new TextEncoder().encode(value).byteLength < min ||
      new TextEncoder().encode(value).byteLength > max
    )
      return false;
    return multiline
      ? ![...value].some((character) => {
          const point = character.charCodeAt(0);
          return (
            (point < 32 && point !== 9 && point !== 10 && point !== 13) ||
            point === 127
          );
        })
      : !/[\0\r\n]/u.test(value);
  });
const privateForbiddenHeaderNames = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "proxy-authorization",
  "proxy-connection",
  "forwarded",
  "traceparent",
  "tracestate",
  "baggage",
  "transfer-encoding",
]);
const privateHeaderName = z
  .string()
  .regex(/^[!#$%&'*+.^_`|~0-9a-z-]{1,128}(?![\s\S])/u)
  .refine(
    (value) =>
      !privateForbiddenHeaderNames.has(value) &&
      !["proxy-", "sec-", "x-kokoro-", "x-forwarded-"].some((prefix) =>
        value.startsWith(prefix),
      ),
  );
const privateHeaderWriteSchema = z
  .object({ name: privateHeaderName, value: privateText(1, 4096) })
  .strict();
const privateHeaderWritesSchema = z
  .array(privateHeaderWriteSchema)
  .max(32)
  .refine(
    (values) => new Set(values.map(({ name }) => name)).size === values.length,
  )
  .refine(
    (values) =>
      values.reduce(
        (size, item) => size + new TextEncoder().encode(item.value).byteLength,
        0,
      ) <= 32_768,
  );
const privateHeaderRemovalsSchema = z
  .array(privateHeaderName)
  .max(32)
  .refine((values) => new Set(values).size === values.length);
const privateOauthClientWriteSchema = z
  .object({
    client_id: privateText(1, 1024),
    client_secret: privateText(1, 4096),
  })
  .strict();
const privateHeaderDescriptorSchema = z
  .object({
    name: privateHeaderName,
    configured: z.boolean(),
    state_version: mcpConnectorStateVersionSchema,
    status: z.enum(["active", "revoked"]),
  })
  .strict()
  .refine((value) => value.configured === (value.status === "active"));
const privateOauthClientDescriptorSchema = z
  .object({
    client_id: privateText(1, 1024),
    configured: z.boolean(),
    origin: z.enum(["byo", "dcr"]),
    status: z.enum(["configured", "revoked"]),
    state_version: mcpConnectorStateVersionSchema,
  })
  .strict()
  .refine((value) => value.configured === (value.status === "configured"));
const privateSelectorText = privateText(1, 256);
const privateDeclarationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("tool"),
      selector: privateSelectorText,
      display_name: privateText(1, 1000),
      input_schema_digest: z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u),
      output_schema_digest: z
        .string()
        .regex(/^[a-f0-9]{64}(?![\s\S])/u)
        .optional(),
      required_scopes: z.array(privateText(1, 128)).max(2000).refine(unique),
    })
    .strict(),
  z
    .object({
      kind: z.literal("resource"),
      selector: privateSelectorText,
      display_name: privateText(1, 1000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("prompt"),
      selector: privateSelectorText,
      display_name: privateText(1, 1000),
    })
    .strict(),
]);
export const mcpPrivateServerSchema = z
  .object({
    server_id: mcpConnectorIdSchema,
    display_name: privateText(1, 100),
    server_url: privateServerUrl,
    status: z.enum(["pending", "registered", "disabled"]),
    state_version: mcpConnectorStateVersionSchema,
    notes: privateText(1, 4000, true).optional(),
    headers: z
      .array(privateHeaderDescriptorSchema)
      .max(32)
      .refine(
        (values) =>
          new Set(values.map(({ name }) => name)).size === values.length,
      ),
    oauth_client: privateOauthClientDescriptorSchema.optional(),
    prepare_status: z.enum([
      "pending_prepare",
      "prepare_failed",
      "needs_oauth",
      "ready",
    ]),
    authorization_status: z
      .enum(["pending", "approved", "revoked", "failed"])
      .optional(),
    declarations: z
      .array(privateDeclarationSchema)
      .max(2000)
      .refine(
        (values) =>
          new Set(values.map(({ selector }) => selector)).size ===
          values.length,
      ),
    declaration_digest: z
      .string()
      .regex(/^[a-f0-9]{64}(?![\s\S])/u)
      .optional(),
    connection_id: mcpConnectorIdSchema.optional(),
    declarations_available: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (!value.declarations_available &&
        (value.declarations.length > 0 ||
          value.declaration_digest !== undefined)) ||
      (value.declarations_available &&
        value.declaration_digest === undefined) ||
      (value.prepare_status === "ready" && !value.declarations_available)
    )
      context.addIssue({
        code: "custom",
        message: "private server declaration state is inconsistent",
      });
  });
export const mcpPrivateServerRegistrationInputSchema = z
  .object({
    display_name: privateText(1, 100),
    server_url: privateServerUrl,
    notes: privateText(1, 4000, true).optional(),
    headers: privateHeaderWritesSchema.optional(),
    oauth_client: privateOauthClientWriteSchema.optional(),
  })
  .strict();
export const mcpPrivateServerPrepareInputSchema = z
  .object({ expected_state_version: mcpConnectorStateVersionSchema })
  .strict();
export const mcpPrivateServerUpdateInputSchema = z
  .object({
    expected_state_version: mcpConnectorStateVersionSchema,
    display_name: privateText(1, 100).optional(),
    notes: privateText(1, 4000, true).optional(),
    clear_notes: z.boolean().optional(),
    server_url: privateServerUrl.optional(),
    header_upserts: privateHeaderWritesSchema.optional(),
    header_removals: privateHeaderRemovalsSchema.optional(),
    oauth_client: privateOauthClientWriteSchema.optional(),
    revoke_oauth_client: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.notes !== undefined && value.clear_notes === true) ||
      (value.oauth_client !== undefined &&
        value.revoke_oauth_client === true) ||
      (value.header_removals ?? []).some((name) =>
        (value.header_upserts ?? []).some((header) => header.name === name),
      )
    )
      context.addIssue({
        code: "custom",
        message: "private server update conflicts",
      });
    if (
      value.display_name === undefined &&
      value.notes === undefined &&
      value.clear_notes !== true &&
      value.server_url === undefined &&
      (value.header_upserts?.length ?? 0) === 0 &&
      (value.header_removals?.length ?? 0) === 0 &&
      value.oauth_client === undefined &&
      value.revoke_oauth_client !== true
    )
      context.addIssue({
        code: "custom",
        message: "private server update is empty",
      });
  });
export const mcpPrivateServerRegistrationSchema = z
  .object({
    server: mcpPrivateServerSchema,
    connector: mcpConnectorSchema,
    replayed: z.boolean(),
  })
  .strict();
export const mcpPrivateJsonImportInputSchema = z
  .object({
    config_json: z
      .string()
      .refine(
        (value) =>
          new TextEncoder().encode(value).byteLength >= 1 &&
          new TextEncoder().encode(value).byteLength <= 65_536,
      ),
  })
  .strict();
export const mcpPrivateJsonImportSchema = z
  .object({
    imports: z
      .array(
        z
          .object({
            server: mcpPrivateServerSchema,
            connector: mcpConnectorSchema,
          })
          .strict(),
      )
      .min(1)
      .max(32)
      .refine(
        (entries) =>
          new Set(entries.map((entry) => entry.server.server_id)).size ===
          entries.length,
      ),
    replayed: z.boolean(),
  })
  .strict();
export const mcpPrivateServerPrepareSchema = z
  .object({
    server: mcpPrivateServerSchema,
    connector: mcpConnectorSchema,
    declarations: z.array(privateDeclarationSchema).max(2000),
    replayed: z.boolean(),
  })
  .strict();
export const mcpPrivateServerUpdateSchema = z
  .object({
    server: mcpPrivateServerSchema,
    connector: mcpConnectorSchema,
    replayed: z.boolean(),
  })
  .strict();
export const mcpPrivateServerDeletionSchema = z
  .object({
    server_id: mcpConnectorIdSchema,
    deleted: z.literal(true),
    replayed: z.boolean(),
  })
  .strict();
export type McpPrivateServer = z.infer<typeof mcpPrivateServerSchema>;
export type McpPrivateServerRegistrationInput = z.infer<
  typeof mcpPrivateServerRegistrationInputSchema
>;
export type McpPrivateServerUpdateInput = z.infer<
  typeof mcpPrivateServerUpdateInputSchema
>;
export type McpPrivateServerRegistration = z.infer<
  typeof mcpPrivateServerRegistrationSchema
>;
export type McpPrivateJsonImport = z.infer<typeof mcpPrivateJsonImportSchema>;

/** Validates the atomic JSON-import projection without exposing raw config or secrets. */
export function mcpPrivateJsonImportMatches(value: unknown, input?: unknown): boolean {
  const body = mcpPrivateJsonImportInputSchema.safeParse(input);
  if (!body.success) return false;
  let document: unknown;
  try {
    document = JSON.parse(body.data.config_json);
  } catch {
    return false;
  }
  if (
    typeof document !== "object" ||
    document === null ||
    Array.isArray(document) ||
    typeof (document as Record<string, unknown>).mcpServers !== "object" ||
    (document as Record<string, unknown>).mcpServers === null ||
    Array.isArray((document as Record<string, unknown>).mcpServers)
  )
    return false;
  const expected = Object.entries(
    (document as { mcpServers: Record<string, unknown> }).mcpServers,
  ).map(([displayName, raw]) => {
    if (
      typeof raw !== "object" ||
      raw === null ||
      Array.isArray(raw) ||
      (raw as Record<string, unknown>).type !== "streamableHttp" ||
      typeof (raw as Record<string, unknown>).url !== "string"
    )
      return undefined;
    return { displayName, serverUrl: (raw as { url: string }).url };
  });
  if (expected.some((entry) => entry === undefined)) return false;
  const parsed = z
    .object({ data: mcpPrivateJsonImportSchema })
    .strict()
    .safeParse(value);
  return (
    parsed.success &&
    parsed.data.data.imports.length === expected.length &&
    parsed.data.data.imports.every((entry, index) => {
      const match = expected[index];
      return (
        match !== undefined &&
        entry.server.display_name === match.displayName &&
        entry.server.server_url === match.serverUrl &&
        entry.connector.server_id === entry.server.server_id &&
        entry.connector.enabled === false &&
        entry.connector.status === "pending"
      );
    })
  );
}
export type McpPrivateServerPrepare = z.infer<
  typeof mcpPrivateServerPrepareSchema
>;
export type McpPrivateServerUpdate = z.infer<
  typeof mcpPrivateServerUpdateSchema
>;
export type McpPrivateServerDeletion = z.infer<
  typeof mcpPrivateServerDeletionSchema
>;
function privateServerResponseMatches(
  value: unknown,
  serverId: string | undefined,
  input?: Record<string, unknown>,
  expectedEnabled?: boolean,
): boolean {
  const parsed = z
    .object({
      data: z
        .object({
          server: mcpPrivateServerSchema,
          connector: mcpConnectorSchema,
          replayed: z.boolean(),
          declarations: z.array(privateDeclarationSchema).max(2000).optional(),
        })
        .strict(),
    })
    .strict()
    .safeParse(value);
  if (!parsed.success) return false;
  const { server, connector } = parsed.data.data;
  if (
    (serverId !== undefined && server.server_id !== serverId) ||
    connector.server_id !== server.server_id ||
    (expectedEnabled !== undefined && connector.enabled !== expectedEnabled)
  )
    return false;
  if (
    input?.expected_state_version !== undefined &&
    BigInt(server.state_version) <= BigInt(String(input.expected_state_version))
  )
    return false;
  return true;
}
export function mcpPrivateServerMatches(
  operation: McpPrivateServerOperation,
  value: unknown,
  serverId: string | undefined,
  input?: unknown,
): boolean {
  if (operation === "server")
    return (
      z
        .object({ data: z.object({ server: mcpPrivateServerSchema }).strict() })
        .strict()
        .safeParse(value).data?.data.server.server_id === serverId
    );
  if (operation === "deleteServer")
    return (
      z
        .object({ data: mcpPrivateServerDeletionSchema })
        .strict()
        .safeParse(value).data?.data.server_id === serverId
    );
  const body =
    input !== undefined && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : undefined;
  if (operation === "registerServer") {
    const parsed = z
      .object({ data: mcpPrivateServerRegistrationSchema })
      .strict()
      .safeParse(value);
    return (
      parsed.success &&
      body !== undefined &&
      parsed.data.data.server.display_name === body.display_name &&
      parsed.data.data.server.server_url === body.server_url &&
      privateServerResponseMatches(value, undefined, body, false)
    );
  }
  if (operation === "prepareServer") {
    const parsed = z
      .object({ data: mcpPrivateServerPrepareSchema })
      .strict()
      .safeParse(value);
    return (
      parsed.success &&
      body !== undefined &&
      JSON.stringify(parsed.data.data.declarations) ===
        JSON.stringify(parsed.data.data.server.declarations) &&
      privateServerResponseMatches(
        value,
        serverId,
        body,
        parsed.data.data.server.prepare_status === "ready",
      )
    );
  }
  return (
    z.object({ data: mcpPrivateServerUpdateSchema }).strict().safeParse(value)
      .success &&
    body !== undefined &&
    privateServerResponseMatches(
      value,
      serverId,
      body,
      body.server_url !== undefined ||
        (Array.isArray(body.header_upserts) &&
          body.header_upserts.length > 0) ||
        (Array.isArray(body.header_removals) &&
          body.header_removals.length > 0) ||
        body.oauth_client !== undefined ||
        body.revoke_oauth_client === true
        ? false
        : undefined,
    )
  );
}

export const mcpConnectorConnectionSchema = z
  .object({
    connection_id: mcpConnectorIdSchema,
    connector_id: mcpConnectorIdSchema,
    server_id: mcpConnectorIdSchema,
    allowed_selectors: z
      .array(
        z
          .string()
          .min(1)
          .max(256)
          .regex(/^\S(?:[\s\S]*\S)?(?![\s\S])/u),
      )
      .refine(unique),
    policy_digest: z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u),
    status: z.enum(["active", "revoked"]),
  })
  .strict();
export type McpConnectorConnection = z.infer<
  typeof mcpConnectorConnectionSchema
>;

const category = z.enum([
  "efficiency",
  "creation",
  "business",
  "development",
  "finance",
  "travel",
  "health",
]);
export const mcpConnectorProviderSchema = z
  .object({
    provider_key: providerKey,
    display_name: scalar(1, 100),
    description: scalar(0, 1000).optional(),
    directory_type: z.enum(["app", "data_source"]),
    category_keys: z.array(category).refine(unique),
    example_prompts: z.array(scalar(1, 1000)).max(10),
    author: scalar(1, 100).optional(),
    website: safeUrl.optional(),
    privacy_url: safeUrl.optional(),
    cover_image_url: safeUrl.optional(),
    updated_at: z.string().datetime({ offset: true }).optional(),
    connection_server_id: mcpConnectorIdSchema.optional(),
    enabled: z.boolean(),
    state_version: mcpConnectorStateVersionSchema,
  })
  .strict();
export type McpConnectorProvider = z.infer<typeof mcpConnectorProviderSchema>;

const page = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({ items: z.array(item).max(100), next_cursor: cursor.nullable() })
    .strict();
export const mcpConnectorPageSchema = page(mcpConnectorSchema);
export const mcpConnectorConnectionPageSchema = page(
  mcpConnectorConnectionSchema,
);
export const mcpConnectorProviderPageSchema = page(mcpConnectorProviderSchema);
export type McpConnectorPage = z.infer<typeof mcpConnectorPageSchema>;
export type McpConnectorConnectionPage = z.infer<
  typeof mcpConnectorConnectionPageSchema
>;
export type McpConnectorProviderPage = z.infer<
  typeof mcpConnectorProviderPageSchema
>;
export const mcpConnectorSchemas = {
  connectors: z.object({ data: mcpConnectorPageSchema }).strict(),
  connector: z
    .object({ data: z.object({ connector: mcpConnectorSchema }).strict() })
    .strict(),
  connections: z.object({ data: mcpConnectorConnectionPageSchema }).strict(),
  connection: z
    .object({
      data: z.object({ connection: mcpConnectorConnectionSchema }).strict(),
    })
    .strict(),
  providers: z.object({ data: mcpConnectorProviderPageSchema }).strict(),
  provider: z
    .object({
      data: z.object({ provider: mcpConnectorProviderSchema }).strict(),
    })
    .strict(),
  create: z
    .object({ data: z.object({ connector: mcpConnectorSchema }).strict() })
    .strict(),
  update: z
    .object({ data: z.object({ connector: mcpConnectorSchema }).strict() })
    .strict(),
  enabled: z
    .object({ data: z.object({ connector: mcpConnectorSchema }).strict() })
    .strict(),
  remove: z
    .object({ data: z.object({ connector: mcpConnectorSchema }).strict() })
    .strict(),
};
export const mcpConnectorCommandRequestSchemas = {
  create: z
    .object({
      provider_key: providerKey,
      connector_type: z.enum(["builtin", "byok", "mcp"]),
      display_name: scalar(1, 100),
      description: scalar(0, 1000),
    })
    .strict(),
  update: z
    .object({
      display_name: scalar(1, 100),
      description: scalar(0, 1000),
      expected_state_version: mcpConnectorStateVersionSchema,
    })
    .strict(),
  enabled: z
    .object({
      enabled: z.boolean(),
      expected_state_version: mcpConnectorStateVersionSchema,
    })
    .strict(),
  remove: z
    .object({ expected_state_version: mcpConnectorStateVersionSchema })
    .strict(),
};
export type McpConnectorCreateInput = z.infer<
  typeof mcpConnectorCommandRequestSchemas.create
>;
export type McpConnectorUpdateInput = z.infer<
  typeof mcpConnectorCommandRequestSchemas.update
>;
export type McpConnectorEnabledInput = z.infer<
  typeof mcpConnectorCommandRequestSchemas.enabled
>;
export type McpConnectorRemoveInput = z.infer<
  typeof mcpConnectorCommandRequestSchemas.remove
>;
const mcpConnectorErrors: Record<number, readonly string[]> = {
  400: ["invalid_mcp_personal_request"],
  401: ["session_authentication_required", "session_invalid"],
  403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden"],
  404: ["mcp_personal_not_found"],
  409: ["mcp_personal_server_url_conflict"],
  412: ["mcp_personal_precondition_failed"],
  413: ["mcp_personal_body_too_large"],
  429: ["session_rate_limited"],
  503: [
    "product_tenant_not_configured",
    "iam_admission_unavailable",
    "mcp_personal_dependency_unavailable",
  ],
};
export const mcpConnectorErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string().min(1),
        retryable: z.boolean(),
      })
      .strict(),
  })
  .strict();
export function mcpConnectorErrorAllowed(
  operation: McpConnectorOperation | McpPrivateServerOperation | "authorization",
  httpStatus: number,
  value: unknown,
): boolean {
  const parsed = mcpConnectorErrorSchema.safeParse(value);
  if (
    !parsed.success ||
    ((operation === "connectors" || operation === "providers") &&
      httpStatus === 404)
  )
    return false;
  const published = connectorCommandErrorAllowed("mcp", httpStatus, parsed.data.error,
    !["connectors", "connector", "connections", "connection", "providers", "provider", "server"].includes(operation));
  if (published !== undefined) return published;
  return (
    (mcpConnectorErrors[httpStatus]?.includes(parsed.data.error.code) ??
      false) &&
    parsed.data.error.retryable ===
      (httpStatus === 429 || httpStatus === 503)
  );
}
export function mcpConnectorMatches(
  operation: McpConnectorOperation,
  value: unknown,
  id: string | undefined,
  query: URLSearchParams,
  input?: unknown,
): boolean {
  const parsed = mcpConnectorSchemas[operation].safeParse(value);
  if (!parsed.success) return false;
  const data = parsed.data.data as unknown as {
    connector?: Record<string, unknown>;
    connection?: Record<string, unknown>;
    provider?: Record<string, unknown>;
    items?: Array<Record<string, unknown>>;
  };
  if (operation === "connector") return data.connector?.connector_id === id;
  if (operation === "connection") return data.connection?.connection_id === id;
  if (operation === "provider") return data.provider?.provider_key === id;
  if (
    operation === "connectors" ||
    operation === "connections" ||
    operation === "providers"
  ) {
    const items = data.items ?? [];
    const identity =
      operation === "connections"
        ? "connection_id"
        : operation === "connectors"
          ? "connector_id"
          : "provider_key";
    const keys = items.map((item) => item[identity]);
    return (
      keys.every((key): key is string => typeof key === "string") &&
      items.length <= Number(query.get("limit") ?? 50) &&
      unique(keys) &&
      (operation !== "connectors" ||
        !query.has("status") ||
        items.every((item) => item.status === query.get("status"))) &&
      (operation !== "connections" ||
        items.every((item) => item.connector_id === id)) &&
      (operation !== "providers" ||
        !query.has("directory_type") ||
        items.every(
          (item) => item.directory_type === query.get("directory_type"),
        )) &&
      (operation !== "providers" ||
        !query.has("category_key") ||
        items.every(
          (item) =>
            Array.isArray(item.category_keys) &&
            item.category_keys.includes(query.get("category_key")),
        ))
    );
  }
  const result = data.connector;
  if (!result || !input || typeof input !== "object" || Array.isArray(input))
    return false;
  const body = input as Record<string, unknown>;
  if (operation === "create")
    return (
      result.provider_key === body.provider_key &&
      result.connector_type === body.connector_type &&
      result.display_name === body.display_name &&
      result.description === body.description &&
      result.enabled === false &&
      result.state_version === "1" &&
      (result.status === "pending" || result.status === "active")
    );
  if (result.connector_id !== id) return false;
  if (operation === "update")
    return (
      result.display_name === body.display_name &&
      result.description === body.description &&
      result.status !== "revoked"
    );
  if (operation === "enabled")
    return result.enabled === body.enabled && result.status !== "revoked";
  return result.enabled === false && result.status === "revoked";
}
