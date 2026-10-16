// hub self 面 HTTP 客户端：同源 `/api/hub/*` BFF 代理（注入 web-bff 凭据 + 信封 scope/user）。
// 入站过 Zod，失败以类型化错误上抛；错误体尽力取 hub 错误码（如 hub.skill_required）供 UI 本地化。

import { z, ZodError, type ZodTypeAny } from "zod";
import { createSkillPublishClient } from "./skill-publish-client";
import {
  mcpConnectorPageSchema,
  mcpConnectorSchema,
  mcpConnectorErrorAllowed,
  mcpConnectorErrorSchema,
  mcpConnectorProviderPageSchema,
  mcpPrivateServerRegistrationInputSchema,
  mcpPrivateServerRegistrationSchema,
  mcpPrivateJsonImportInputSchema,
  mcpPrivateJsonImportSchema,
  mcpPrivateServerPrepareInputSchema,
  mcpPrivateServerPrepareSchema,
  mcpPrivateServerUpdateInputSchema,
  mcpPrivateServerUpdateSchema,
  mcpPrivateServerDeletionSchema,
  mcpPrivateServerSchema,
  type McpPrivateServer,
  type McpPrivateServerOperation,
  type McpPrivateServerRegistration,
  type McpPrivateServerRegistrationInput,
  type McpPrivateJsonImport,
  type McpPrivateServerPrepare,
  type McpPrivateServerUpdate,
  type McpPrivateServerUpdateInput,
  type McpPrivateServerDeletion,
  type McpConnectorCommandOperation,
  type McpConnector,
  type McpConnectorPage,
  type McpConnectorCreateInput,
  type McpConnectorEnabledInput,
  type McpConnectorProviderPage,
  type McpConnectorRemoveInput,
  type McpConnectorUpdateInput,
} from "./mcp-connector.schema";
import {
  mcpConnectorAuthorizationDataSchemas,
  mcpConnectorAuthorizationErrorAllowed,
  type McpConnectorAuthorizationCallback,
  type McpConnectorAuthorizationCompleted,
  type McpConnectorAuthorizationInput,
  type McpConnectorAuthorizationOperation,
  type McpConnectorAuthorizationStarted,
  type McpConnectorConnectionCreated,
  type McpConnectorCreateConnectionInput,
} from "./mcp-connector-authorization.schema";
import {
  customApiCreateInputSchema,
  customApiCreateSchema,
  customApiErrorSchema,
  customApiGetSchema,
  customApiPageSchema,
  customApiRemoveInputSchema,
  customApiRemoveSchema,
  customApiUpdateInputSchema,
  customApiUpdateSchema,
  type CustomApiCreateInput,
  type CustomApiPage,
  type CustomApiProfile,
  type CustomApiRemoveInput,
  type CustomApiUpdateInput,
} from "./custom-api.schema";

import {
  installationIdSchema,
  installationKeySchema,
  installationSourceSchema,
  installationListQuerySchema,
  installationReceiptMatches,
  installationResponseSchema,
  installationErrorSchema,
  installationErrorAllowed,
  type InstallationOperation,
  type InstallationListQuery,
  type InstallationPage,
  type InstallationReceipt,
  type PersonalInstallation,
  HUB_BASE,
  hubDataSchema,
  hubErrorSchema,
  skillPoolPath,
  skillPoolSchema,
  skillCatalogPath,
  skillCatalogSchema,
  skillQuotaPath,
  skillQuotaSchema,
  skillRevisionsPath,
  skillRevisionsSchema,
  type SkillCard,
  type SkillCatalog,
  type SkillQuota,
  type SkillRevision,
  mcpConnectionPageSchema,
  mcpConnectionErrorAllowed,
  mcpConnectionReadErrorSchema,
  mcpConnectionsPath,
  type McpConnectionPage,
  type ManagedPersonalSkill,
  type managedPersonalSkillPageSchema,
} from "./schemas";

export type HubFailureReason = "network" | "http" | "parse" | "aborted";

export class HubClientError extends Error {
  readonly reason: HubFailureReason;
  // hub 稳定错误码（http 失败时尽力解析）：如 hub.skill_required / capability_registration_disabled。
  readonly code: string | null;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly requestId: string | null;
  readonly retryAfter: string | null;

  constructor(
    reason: HubFailureReason,
    message: string,
    code: string | null,
    status: number | null,
    retryable = false,
    requestId: string | null = null,
    retryAfter: string | null = null,
  ) {
    super(message);
    this.name = "HubClientError";
    this.reason = reason;
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

export type GithubRepository = {
  canonical: string;
  owner: string;
  name: string;
};

/**
 * Accept only the two repository forms the BFF contract can resolve:
 * `OWNER/REPOSITORY` or an HTTPS github.com repository URL. Keeping this
 * boundary in the hub client as well as the dialog prevents another caller
 * from accidentally sending a branch URL, credentials, or an arbitrary host
 * to the GitHub importer.
 */
export function parseGithubRepository(value: string): GithubRepository | null {
  const input = value.trim();
  if (input === "") return null;

  const candidate = /^https?:\/\//i.test(input)
    ? input
    : `https://github.com/${input.replace(/^\/+/, "")}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    (hostname !== "github.com" && hostname !== "www.github.com")
  )
    return null;
  const authority =
    candidate.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1] ?? "";
  const host = authority.slice(authority.lastIndexOf("@") + 1);
  // URL normalizes the default :443 away, so reject an explicit port from the
  // raw authority as well as any non-standard origin.
  if (host.includes(":")) return null;
  if (url.origin !== `https://${hostname}`) return null;
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  )
    return null;

  // Do not silently accept `owner//repo` or multiple path components. Those
  // forms otherwise look valid after filtering empty URL segments.
  if (!/^\/[^/]+\/[^/]+\/?$/.test(url.pathname)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const [owner, rawName] = segments;
  const name = rawName?.replace(/\.git$/i, "") ?? "";
  if (
    !owner ||
    !name ||
    owner === "." ||
    owner === ".." ||
    name === "." ||
    name === ".."
  )
    return null;
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(name))
    return null;

  return {
    canonical: `https://github.com/${owner}/${name}`,
    owner,
    name,
  };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function describeUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readError(response: Response): Promise<HubClientError> {
  let code: string | null = null;
  let message = `hub request failed with status ${response.status}`;
  try {
    const raw = (await response.json()) as unknown;
    const parsed = hubErrorSchema.safeParse(raw);
    if (parsed.success) {
      code = parsed.data.error.code;
      message = parsed.data.error.message || message;
    } else if (typeof raw === "object" && raw !== null) {
      // Keep the canonical envelope first, but tolerate the flat forms used
      // by older BFF adapters so typed GitHub errors still reach the UI.
      const body = raw as Record<string, unknown>;
      const nested =
        typeof body.error === "object" && body.error !== null
          ? (body.error as Record<string, unknown>)
          : null;
      const firstString = (...values: unknown[]) =>
        values.find(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        );
      code =
        firstString(nested?.code, body.code, body.error_code, body.errorCode) ??
        null;
      message =
        firstString(
          nested?.message,
          body.message,
          body.error_message,
          body.errorMessage,
          body.detail,
        ) ?? message;
    }
  } catch {
    // 无 JSON 错误体：保留状态码描述。
  }
  return new HubClientError("http", message, code, response.status);
}

async function parseData<T extends ZodTypeAny>(
  response: Response,
  inner: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (error) {
    if (isAbortError(error)) {
      throw new HubClientError(
        "aborted",
        "hub request aborted",
        null,
        response.status,
      );
    }
    throw new HubClientError(
      "parse",
      describeUnknown(error),
      null,
      response.status,
    );
  }
  try {
    return hubDataSchema(inner).parse(raw).data;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HubClientError("parse", error.message, null, response.status);
    }
    throw error;
  }
}

async function requestData<T extends ZodTypeAny>(
  path: string,
  inner: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  let response: Response;
  try {
    response = await fetch(`${HUB_BASE}${path}`, {
      cache: "no-store",
      ...init,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new HubClientError("aborted", "hub request aborted", null, null);
    }
    throw new HubClientError("network", describeUnknown(error), null, null);
  }
  if (!response.ok) {
    throw await readError(response);
  }
  return parseData(response, inner);
}

/** Browser Proxy can add private/max-age directives to the owner's no-store. */
export function hasHubNoStoreDirective(headers: Headers): boolean {
  const value = headers.get("cache-control");
  if (value === null) return false;
  let quoted = false;
  let escaped = false;
  let start = 0;
  let found = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    // A comma inside an extension's quoted value is not a directive boundary.
    if (char === "," && !quoted) {
      found ||= value.slice(start, index).trim().toLowerCase() === "no-store";
      start = index + 1;
    }
  }
  return (
    !quoted &&
    !escaped &&
    (found || value.slice(start).trim().toLowerCase() === "no-store")
  );
}

const MCP_CONNECTION_READ_BYTES = 1024 * 1024;
const MCP_CONNECTION_READ_TIMEOUT_MS = 10_000;

async function readMcpConnections(
  path: string,
  signal?: AbortSignal,
): Promise<McpConnectionPage> {
  const deadline = new AbortController();
  const timer = setTimeout(
    () =>
      deadline.abort(
        new DOMException("MCP connection read timed out", "TimeoutError"),
      ),
    MCP_CONNECTION_READ_TIMEOUT_MS,
  );
  const joined =
    signal === undefined
      ? deadline.signal
      : AbortSignal.any([signal, deadline.signal]);
  let response: Response | undefined;
  try {
    response = await fetch(`${HUB_BASE}${path}`, {
      cache: "no-store",
      redirect: "error",
      signal: joined,
    });
    if (
      !hasHubNoStoreDirective(response.headers) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(
        response.headers.get("x-request-id") ?? "",
      ) ||
      !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(
        response.headers.get("content-type") ?? "",
      )
    ) {
      throw new HubClientError(
        "parse",
        "invalid BFF connection response headers",
        null,
        response.status,
      );
    }
    const declared = response.headers.get("content-length");
    if (
      declared !== null &&
      (!/^(0|[1-9][0-9]*)$/u.test(declared) ||
        Number(declared) > MCP_CONNECTION_READ_BYTES)
    ) {
      throw new HubClientError(
        "parse",
        "BFF connection response is too large",
        null,
        response.status,
      );
    }
    if (response.body === null)
      throw new HubClientError(
        "parse",
        "missing BFF connection response body",
        null,
        response.status,
      );
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MCP_CONNECTION_READ_BYTES)
          throw new HubClientError(
            "parse",
            "BFF connection response is too large",
            null,
            response.status,
          );
        chunks.push(part.value);
      }
    } finally {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    joined.throwIfAborted();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (error) {
      throw new HubClientError(
        "parse",
        describeUnknown(error),
        null,
        response.status,
      );
    }
    if (response.status === 200) {
      const parsed = z
        .object({ data: mcpConnectionPageSchema })
        .strict()
        .safeParse(raw);
      if (!parsed.success)
        throw new HubClientError(
          "parse",
          parsed.error.message,
          null,
          response.status,
        );
      return parsed.data.data;
    }
    const parsed = mcpConnectionReadErrorSchema.safeParse(raw);
    if (
      !parsed.success ||
      !mcpConnectionErrorAllowed(response.status, parsed.data.error.code)
    )
      throw new HubClientError(
        "parse",
        "invalid BFF connection error",
        null,
        response.status,
      );
    throw new HubClientError(
      "http",
      parsed.data.error.message,
      parsed.data.error.code,
      response.status,
      parsed.data.error.retryable,
      response.headers.get("x-request-id"),
    );
  } catch (error) {
    if (error instanceof HubClientError) throw error;
    throw new HubClientError(
      isAbortError(error) || joined.aborted ? "aborted" : "network",
      describeUnknown(error),
      null,
      response?.status ?? null,
    );
  } finally {
    clearTimeout(timer);
    void response?.body?.cancel().catch(() => undefined);
  }
}

const MCP_CONNECTOR_RESPONSE_BYTES = 1024 * 1024;
const MCP_CONNECTOR_TIMEOUT_MS = 10_000;

/**
 * The current-user connector API is a distinct, closed V1 contract. Keep its
 * response validation here instead of letting UI components infer transport
 * success from a JSON shape. This mirrors the browser-private adapter's
 * no-store/request-id/media invariants and makes late responses cancellable.
 */
async function requestMcpConnector<T extends ZodTypeAny>(
  operation:
    | McpConnectorCommandOperation
    | McpConnectorAuthorizationOperation
    | McpPrivateServerOperation
    | "connectors"
    | "providers",
  path: string,
  schema: T,
  init?: RequestInit,
  signal?: AbortSignal,
): Promise<z.infer<T>> {
  const deadline = new AbortController();
  const timer = setTimeout(
    () =>
      deadline.abort(
        new DOMException("MCP current-user request timed out", "TimeoutError"),
      ),
    MCP_CONNECTOR_TIMEOUT_MS,
  );
  const joined =
    signal === undefined
      ? deadline.signal
      : AbortSignal.any([signal, deadline.signal]);
  let response: Response | undefined;
  try {
    response = await fetch(`${HUB_BASE}${path}`, {
      cache: "no-store",
      redirect: "error",
      ...init,
      signal: joined,
    });
    const requestId = response.headers.get("x-request-id");
    if (
      !hasHubNoStoreDirective(response.headers) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(requestId ?? "") ||
      !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(
        response.headers.get("content-type") ?? "",
      )
    ) {
      throw new HubClientError(
        "parse",
        "invalid MCP current-user response headers",
        null,
        response.status,
      );
    }
    const declared = response.headers.get("content-length");
    if (
      declared !== null &&
      (!/^(0|[1-9][0-9]*)$/u.test(declared) ||
        Number(declared) > MCP_CONNECTOR_RESPONSE_BYTES)
    ) {
      throw new HubClientError(
        "parse",
        "MCP current-user response is too large",
        null,
        response.status,
      );
    }
    if (response.body === null)
      throw new HubClientError(
        "parse",
        "missing MCP current-user response body",
        null,
        response.status,
      );
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MCP_CONNECTOR_RESPONSE_BYTES)
          throw new HubClientError(
            "parse",
            "MCP current-user response is too large",
            null,
            response.status,
          );
        chunks.push(part.value);
      }
    } finally {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    joined.throwIfAborted();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (error) {
      throw new HubClientError(
        "parse",
        describeUnknown(error),
        null,
        response.status,
      );
    }
    const expected =
      operation === "create" ||
      operation === "createConnection" ||
      operation === "registerServer" ||
      operation === "importJson"
        ? 201
        : 200;
    if (response.status === expected) {
      const parsed = z.object({ data: schema }).strict().safeParse(raw);
      if (!parsed.success)
        throw new HubClientError(
          "parse",
          parsed.error.message,
          null,
          response.status,
        );
      return parsed.data.data;
    }
    const parsed = mcpConnectorErrorSchema.safeParse(raw);
    const authorizationOperation = [
      "beginAuthorization",
      "reconnectAuthorization",
      "completeAuthorization",
      "createConnection",
    ].includes(operation);
    const connectorOperation =
      operation === "registerServer"
        ? "create"
        : operation === "server"
          ? "connector"
          : operation;
    const errorAllowed = authorizationOperation
      ? mcpConnectorAuthorizationErrorAllowed(response.status, parsed.data)
      : mcpConnectorErrorAllowed(
          connectorOperation as
            | McpConnectorCommandOperation
            | "connectors"
            | "providers",
          response.status,
          parsed.data,
        );
    if (!parsed.success || !errorAllowed)
      throw new HubClientError(
        "parse",
        "invalid MCP current-user error",
        null,
        response.status,
      );
    throw new HubClientError(
      "http",
      parsed.data.error.message,
      parsed.data.error.code,
      response.status,
      parsed.data.error.retryable,
      requestId,
      response.status === 429 ? response.headers.get("retry-after") : null,
    );
  } catch (error) {
    if (error instanceof HubClientError) throw error;
    throw new HubClientError(
      isAbortError(error) || joined.aborted ? "aborted" : "network",
      describeUnknown(error),
      null,
      response?.status ?? null,
    );
  } finally {
    clearTimeout(timer);
    void response?.body?.cancel().catch(() => undefined);
  }
}

function createIdempotencyKey(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}:${uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

const JSON_HEADERS = { "content-type": "application/json" } as const;

/** A separate BFF product boundary for the Custom API aggregate. */
async function requestCustomApi<T extends ZodTypeAny>(
  path: string,
  schema: T,
  init?: RequestInit,
  signal?: AbortSignal,
): Promise<z.infer<T>> {
  const deadline = new AbortController();
  const timer = setTimeout(
    () =>
      deadline.abort(
        new DOMException("Custom API request timed out", "TimeoutError"),
      ),
    MCP_CONNECTOR_TIMEOUT_MS,
  );
  const joined =
    signal === undefined
      ? deadline.signal
      : AbortSignal.any([signal, deadline.signal]);
  let response: Response | undefined;
  try {
    response = await fetch(`${HUB_BASE}${path}`, {
      cache: "no-store",
      redirect: "error",
      ...init,
      signal: joined,
    });
    const requestId = response.headers.get("x-request-id");
    if (
      !hasHubNoStoreDirective(response.headers) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(requestId ?? "") ||
      !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(
        response.headers.get("content-type") ?? "",
      )
    )
      throw new HubClientError(
        "parse",
        "invalid Custom API response headers",
        null,
        response.status,
      );
    const raw = (await response.json()) as unknown;
    if (response.status === 201 || response.status === 200) {
      const parsed = z.object({ data: schema }).strict().safeParse(raw);
      if (!parsed.success)
        throw new HubClientError(
          "parse",
          parsed.error.message,
          null,
          response.status,
        );
      return parsed.data.data;
    }
    const parsed = customApiErrorSchema.safeParse(raw);
    if (!parsed.success)
      throw new HubClientError(
        "parse",
        "invalid Custom API error",
        null,
        response.status,
      );
    throw new HubClientError(
      "http",
      parsed.data.error.message,
      parsed.data.error.code,
      response.status,
      parsed.data.error.retryable,
      requestId,
    );
  } catch (error) {
    if (error instanceof HubClientError) throw error;
    throw new HubClientError(
      isAbortError(error) || joined.aborted ? "aborted" : "network",
      describeUnknown(error),
      null,
      response?.status ?? null,
    );
  } finally {
    clearTimeout(timer);
    void response?.body?.cancel().catch(() => undefined);
  }
}

function idempotencyHeaders(
  prefix: string,
  headers: Record<string, string> = {},
): Record<string, string> {
  return { ...headers, "Idempotency-Key": createIdempotencyKey(prefix) };
}

export type HubClient = {
  listPersonalSkills: (
    cursor?: string,
    signal?: AbortSignal,
  ) => Promise<z.infer<typeof managedPersonalSkillPageSchema>>;
  getPublishedPersonalSkill: (
    id: string,
    signal?: AbortSignal,
  ) => Promise<ManagedPersonalSkill>;
  listMcpConnections: (
    query?: {
      connection_id?: string;
      provider_key?: string;
      limit?: number;
      cursor?: string;
    },
    signal?: AbortSignal,
  ) => Promise<McpConnectionPage>;
  listMcpConnectors: (
    query?: {
      status?: "pending" | "active" | "error" | "revoked";
      limit?: number;
      cursor?: string;
    },
    signal?: AbortSignal,
  ) => Promise<McpConnectorPage>;
  listMcpConnectorProviders: (
    query?: {
      query?: string;
      directory_type?: "app" | "data_source";
      category_key?: string;
      limit?: number;
      cursor?: string;
    },
    signal?: AbortSignal,
  ) => Promise<McpConnectorProviderPage>;
  createMcpConnector: (
    input: McpConnectorCreateInput,
    signal?: AbortSignal,
  ) => Promise<McpConnector>;
  /** Distinct owner aggregate; custom API secrets never enter any MCP route. */
  createCustomApi?: (
    input: CustomApiCreateInput,
    signal?: AbortSignal,
  ) => Promise<CustomApiProfile>;
  listCustomApis?: (
    query?: { limit?: number; cursor?: string },
    signal?: AbortSignal,
  ) => Promise<CustomApiPage>;
  getCustomApi?: (
    profileId: string,
    signal?: AbortSignal,
  ) => Promise<CustomApiProfile>;
  updateCustomApi?: (
    profileId: string,
    input: CustomApiUpdateInput,
    signal?: AbortSignal,
  ) => Promise<CustomApiProfile>;
  removeCustomApi?: (
    profileId: string,
    input: CustomApiRemoveInput,
    signal?: AbortSignal,
  ) => Promise<void>;
  registerPrivateMcpServer?: (
    input: McpPrivateServerRegistrationInput,
    signal?: AbortSignal,
  ) => Promise<McpPrivateServerRegistration>;
  importPrivateMcpJson?: (
    configJson: string,
    signal?: AbortSignal,
  ) => Promise<McpPrivateJsonImport>;
  getPrivateMcpServer?: (
    serverId: string,
    signal?: AbortSignal,
  ) => Promise<McpPrivateServer>;
  preparePrivateMcpServer?: (
    serverId: string,
    expectedStateVersion: string,
    signal?: AbortSignal,
  ) => Promise<McpPrivateServerPrepare>;
  updatePrivateMcpServer?: (
    serverId: string,
    input: McpPrivateServerUpdateInput,
    signal?: AbortSignal,
  ) => Promise<McpPrivateServerUpdate>;
  deletePrivateMcpServer?: (
    serverId: string,
    expectedStateVersion: string,
    signal?: AbortSignal,
  ) => Promise<McpPrivateServerDeletion>;
  updateMcpConnector: (
    connectorId: string,
    input: McpConnectorUpdateInput,
    signal?: AbortSignal,
  ) => Promise<McpConnector>;
  setMcpConnectorEnabled: (
    connectorId: string,
    input: McpConnectorEnabledInput,
    signal?: AbortSignal,
  ) => Promise<McpConnector>;
  removeMcpConnector: (
    connectorId: string,
    input: McpConnectorRemoveInput,
    signal?: AbortSignal,
  ) => Promise<McpConnector>;
  beginMcpConnectorAuthorization: (
    connectorId: string,
    input: McpConnectorAuthorizationInput,
    signal?: AbortSignal,
  ) => Promise<McpConnectorAuthorizationStarted>;
  reconnectMcpConnectorAuthorization: (
    connectorId: string,
    input: McpConnectorAuthorizationInput,
    signal?: AbortSignal,
  ) => Promise<McpConnectorAuthorizationStarted>;
  completeMcpConnectorAuthorization: (
    input: McpConnectorAuthorizationCallback,
    signal?: AbortSignal,
  ) => Promise<McpConnectorAuthorizationCompleted>;
  createMcpConnectorConnection: (
    input: McpConnectorCreateConnectionInput,
    signal?: AbortSignal,
  ) => Promise<McpConnectorConnectionCreated>;
  listSkillPool: () => Promise<SkillCard[]>;
  listSkillCatalog: (params?: {
    scope?: "official" | "third_party";
    query?: string;
    cursor?: string;
  }) => Promise<SkillCatalog>;
  /** The owner may omit quota facts for a catalog-only Skills projection. */
  skillQuota: () => Promise<SkillQuota | null>;
  skillRevisions: (name: string, scope?: string) => Promise<SkillRevision[]>;
  /** Mutates one owner-issued installation. Display names and series IDs are never write identities. */
  setSkillEnabled: (installationId: string, enabled: boolean) => Promise<void>;
  /** Creates an installation from the owner-issued immutable revision source. */
  installSkill?: (sourceRef: string) => Promise<void>;
  /** Optional GitHub preview/import endpoints; preview clients may omit them. */
};

export function createHubClient(): HubClient {
  return {
    listPersonalSkills: (cursor, signal) =>
      createSkillPublishClient().listPublished(cursor, signal),
    getPublishedPersonalSkill: async (id, signal) => {
      const skill = await createSkillPublishClient().getManaged(id, signal);
      if (
        skill.skill_id !== id ||
        skill.source_ref !== `skill:${id}` ||
        skill.status !== "active"
      )
        throw new HubClientError(
          "parse",
          "published Skill identity mismatch",
          null,
          200,
        );
      return skill;
    },
    listMcpConnections: (query = {}, signal) => {
      const search = new URLSearchParams();
      if (query.connection_id !== undefined)
        search.set("connection_id", query.connection_id);
      if (query.provider_key !== undefined)
        search.set("provider_key", query.provider_key);
      if (query.limit !== undefined) search.set("limit", String(query.limit));
      if (query.cursor !== undefined) search.set("cursor", query.cursor);
      return readMcpConnections(
        `${mcpConnectionsPath}${search.size === 0 ? "" : `?${search}`}`,
        signal,
      );
    },
    listMcpConnectors: (query = {}, signal) => {
      const search = new URLSearchParams();
      if (query.status !== undefined) search.set("status", query.status);
      if (query.limit !== undefined) search.set("limit", String(query.limit));
      if (query.cursor !== undefined) search.set("cursor", query.cursor);
      return requestMcpConnector(
        "connectors",
        `/mcp/connectors${search.size === 0 ? "" : `?${search}`}`,
        mcpConnectorPageSchema,
        undefined,
        signal,
      );
    },
    listMcpConnectorProviders: (query = {}, signal) => {
      const search = new URLSearchParams();
      if (query.query !== undefined) search.set("query", query.query);
      if (query.directory_type !== undefined)
        search.set("directory_type", query.directory_type);
      if (query.category_key !== undefined)
        search.set("category_key", query.category_key);
      if (query.limit !== undefined) search.set("limit", String(query.limit));
      if (query.cursor !== undefined) search.set("cursor", query.cursor);
      return requestMcpConnector(
        "providers",
        `/mcp/providers${search.size === 0 ? "" : `?${search}`}`,
        mcpConnectorProviderPageSchema,
        undefined,
        signal,
      );
    },
    createMcpConnector: async (input, signal) =>
      (
        await requestMcpConnector(
          "create",
          "/mcp/connectors",
          z.object({ connector: mcpConnectorSchema }).strict(),
          {
            method: "POST",
            headers: idempotencyHeaders("mcp-connector", { ...JSON_HEADERS }),
            body: JSON.stringify(input),
          },
          signal,
        )
      ).connector,
    createCustomApi: async (input, signal) =>
      (
        await requestCustomApi(
          "/connectors/custom-apis",
          customApiCreateSchema,
          {
            method: "POST",
            headers: idempotencyHeaders("custom-api", { ...JSON_HEADERS }),
            body: JSON.stringify(customApiCreateInputSchema.parse(input)),
          },
          signal,
        )
      ).custom_api,
    listCustomApis: (query = {}, signal) => {
      const search = new URLSearchParams();
      if (query.limit !== undefined) search.set("limit", String(query.limit));
      if (query.cursor !== undefined) search.set("cursor", query.cursor);
      return requestCustomApi(
        `/connectors/custom-apis${search.size === 0 ? "" : `?${search}`}`,
        customApiPageSchema,
        undefined,
        signal,
      );
    },
    getCustomApi: async (profileId, signal) =>
      (
        await requestCustomApi(
          `/connectors/custom-apis/${encodeURIComponent(profileId)}`,
          customApiGetSchema,
          undefined,
          signal,
        )
      ).custom_api,
    updateCustomApi: async (profileId, input, signal) =>
      (
        await requestCustomApi(
          `/connectors/custom-apis/${encodeURIComponent(profileId)}`,
          customApiUpdateSchema,
          {
            method: "PATCH",
            headers: idempotencyHeaders("custom-api", { ...JSON_HEADERS }),
            body: JSON.stringify(customApiUpdateInputSchema.parse(input)),
          },
          signal,
        )
      ).custom_api,
    removeCustomApi: async (profileId, input, signal) => {
      await requestCustomApi(
        `/connectors/custom-apis/${encodeURIComponent(profileId)}`,
        customApiRemoveSchema,
        {
          method: "DELETE",
          headers: idempotencyHeaders("custom-api", { ...JSON_HEADERS }),
          body: JSON.stringify(customApiRemoveInputSchema.parse(input)),
        },
        signal,
      );
    },
    registerPrivateMcpServer: (input, signal) =>
      requestMcpConnector(
        "registerServer",
        "/mcp/servers",
        mcpPrivateServerRegistrationSchema,
        {
          method: "POST",
          headers: idempotencyHeaders("mcp-private-server", {
            ...JSON_HEADERS,
          }),
          body: JSON.stringify(
            mcpPrivateServerRegistrationInputSchema.parse(input),
          ),
        },
        signal,
      ),
    importPrivateMcpJson: (configJson, signal) =>
      requestMcpConnector(
        "importJson",
        "/mcp/servers/import",
        mcpPrivateJsonImportSchema,
        {
          method: "POST",
          headers: idempotencyHeaders("mcp-private-import", {
            ...JSON_HEADERS,
          }),
          body: JSON.stringify(
            mcpPrivateJsonImportInputSchema.parse({ config_json: configJson }),
          ),
        },
        signal,
      ),
    getPrivateMcpServer: async (serverId, signal) =>
      (
        await requestMcpConnector(
          "server",
          `/mcp/servers/${encodeURIComponent(serverId)}`,
          z.object({ server: mcpPrivateServerSchema }).strict(),
          undefined,
          signal,
        )
      ).server,
    preparePrivateMcpServer: (serverId, expectedStateVersion, signal) =>
      requestMcpConnector(
        "prepareServer",
        `/mcp/servers/${encodeURIComponent(serverId)}/prepare`,
        mcpPrivateServerPrepareSchema,
        {
          method: "POST",
          headers: idempotencyHeaders("mcp-private-server", {
            ...JSON_HEADERS,
          }),
          body: JSON.stringify(
            mcpPrivateServerPrepareInputSchema.parse({
              expected_state_version: expectedStateVersion,
            }),
          ),
        },
        signal,
      ),
    updatePrivateMcpServer: (serverId, input, signal) =>
      requestMcpConnector(
        "updateServer",
        `/mcp/servers/${encodeURIComponent(serverId)}`,
        mcpPrivateServerUpdateSchema,
        {
          method: "PATCH",
          headers: idempotencyHeaders("mcp-private-server", {
            ...JSON_HEADERS,
          }),
          body: JSON.stringify(mcpPrivateServerUpdateInputSchema.parse(input)),
        },
        signal,
      ),
    deletePrivateMcpServer: (serverId, expectedStateVersion, signal) =>
      requestMcpConnector(
        "deleteServer",
        `/mcp/servers/${encodeURIComponent(serverId)}`,
        mcpPrivateServerDeletionSchema,
        {
          method: "DELETE",
          headers: idempotencyHeaders("mcp-private-server", {
            ...JSON_HEADERS,
          }),
          body: JSON.stringify(
            mcpPrivateServerPrepareInputSchema.parse({
              expected_state_version: expectedStateVersion,
            }),
          ),
        },
        signal,
      ),
    updateMcpConnector: async (connectorId, input, signal) =>
      (
        await requestMcpConnector(
          "update",
          `/mcp/connectors/${encodeURIComponent(connectorId)}`,
          z.object({ connector: mcpConnectorSchema }).strict(),
          {
            method: "PATCH",
            headers: idempotencyHeaders("mcp-connector", { ...JSON_HEADERS }),
            body: JSON.stringify(input),
          },
          signal,
        )
      ).connector,
    setMcpConnectorEnabled: async (connectorId, input, signal) =>
      (
        await requestMcpConnector(
          "enabled",
          `/mcp/connectors/${encodeURIComponent(connectorId)}/enabled`,
          z.object({ connector: mcpConnectorSchema }).strict(),
          {
            method: "PUT",
            headers: idempotencyHeaders("mcp-connector", { ...JSON_HEADERS }),
            body: JSON.stringify(input),
          },
          signal,
        )
      ).connector,
    removeMcpConnector: async (connectorId, input, signal) =>
      (
        await requestMcpConnector(
          "remove",
          `/mcp/connectors/${encodeURIComponent(connectorId)}`,
          z.object({ connector: mcpConnectorSchema }).strict(),
          {
            method: "DELETE",
            headers: idempotencyHeaders("mcp-connector", { ...JSON_HEADERS }),
            body: JSON.stringify(input),
          },
          signal,
        )
      ).connector,
    beginMcpConnectorAuthorization: (connectorId, input, signal) =>
      requestMcpConnector(
        "beginAuthorization",
        `/mcp/connectors/${encodeURIComponent(connectorId)}/authorization`,
        mcpConnectorAuthorizationDataSchemas.beginAuthorization,
        {
          method: "POST",
          headers: { ...JSON_HEADERS },
          body: JSON.stringify(input),
        },
        signal,
      ),
    reconnectMcpConnectorAuthorization: (connectorId, input, signal) =>
      requestMcpConnector(
        "reconnectAuthorization",
        `/mcp/connectors/${encodeURIComponent(connectorId)}/authorization/reconnect`,
        mcpConnectorAuthorizationDataSchemas.reconnectAuthorization,
        {
          method: "POST",
          headers: { ...JSON_HEADERS },
          body: JSON.stringify(input),
        },
        signal,
      ),
    completeMcpConnectorAuthorization: (input, signal) =>
      requestMcpConnector(
        "completeAuthorization",
        "/mcp/authorization/callback",
        mcpConnectorAuthorizationDataSchemas.completeAuthorization,
        {
          method: "POST",
          headers: { ...JSON_HEADERS },
          body: JSON.stringify(input),
        },
        signal,
      ),
    createMcpConnectorConnection: (input, signal) =>
      requestMcpConnector(
        "createConnection",
        "/mcp/connections",
        mcpConnectorAuthorizationDataSchemas.createConnection,
        {
          method: "POST",
          headers: idempotencyHeaders("mcp-connector", { ...JSON_HEADERS }),
          body: JSON.stringify(input),
        },
        signal,
      ),
    listSkillPool: async () =>
      (await requestData(skillPoolPath, skillPoolSchema)).skills,
    listSkillCatalog: (params = {}) => {
      const search = new URLSearchParams();
      if (params.scope) search.set("scope", params.scope);
      if (params.query?.trim()) search.set("query", params.query.trim());
      if (params.cursor) search.set("cursor", params.cursor);
      const suffix = search.toString();
      return requestData(
        `${skillCatalogPath}${suffix ? `?${suffix}` : ""}`,
        skillCatalogSchema,
      );
    },
    skillQuota: () => requestData(skillQuotaPath, skillQuotaSchema),
    skillRevisions: async (name, scope) =>
      (await requestData(skillRevisionsPath(name, scope), skillRevisionsSchema))
        .revisions,
    setSkillEnabled: async (installationId, enabled) => {
      let response: Response;
      try {
        response = await fetch(
          "/api/skill.v1.SkillOptionalService/SetSkillInstallationEnabled",
          {
            method: "POST",
            cache: "no-store",
            headers: idempotencyHeaders("skill-installation", {
              ...JSON_HEADERS,
            }),
            body: JSON.stringify({ installationId, enabled }),
          },
        );
      } catch (error) {
        throw new HubClientError("network", describeUnknown(error), null, null);
      }
      if (!response.ok) {
        throw await readError(response);
      }
    },
    installSkill: async (sourceRef) => {
      await createSkillInstallationClient().install(
        sourceRef,
        createIdempotencyKey("skill-installation"),
      );
    },
  };
}

export type SkillInstallationClient = {
  list: (
    query?: InstallationListQuery,
    signal?: AbortSignal,
  ) => Promise<InstallationPage>;
  get: (id: string, signal?: AbortSignal) => Promise<PersonalInstallation>;
  install: (
    sourceRef: string,
    key: string,
    signal?: AbortSignal,
  ) => Promise<InstallationReceipt>;
  setEnabled: (
    id: string,
    enabled: boolean,
    key: string,
    signal?: AbortSignal,
  ) => Promise<InstallationReceipt>;
  remove: (
    id: string,
    key: string,
    signal?: AbortSignal,
  ) => Promise<InstallationReceipt>;
};

export function createSkillInstallationClient(): SkillInstallationClient {
  const base = "/api/hub/self/skill-installations";
  const idPath = (id: string) =>
    `${base}/${encodeURIComponent(installationIdSchema.parse(id))}`;
  const commandHeaders = (key: string, json: boolean) => ({
    ...(json ? { "content-type": "application/json" } : {}),
    "idempotency-key": installationKeySchema.parse(key),
  });
  async function request(
    operation: InstallationOperation,
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
  ) {
    const deadline = new AbortController();
    const joined =
      signal === undefined
        ? deadline.signal
        : AbortSignal.any([signal, deadline.signal]);
    const timer = setTimeout(() => deadline.abort(), 10_000);
    let response: Response | undefined;
    const within = <T>(work: Promise<T>): Promise<T> =>
      new Promise((resolve, reject) => {
        const abort = () => reject(joined.reason);
        joined.addEventListener("abort", abort, { once: true });
        void work
          .then(resolve, reject)
          .finally(() => joined.removeEventListener("abort", abort));
        if (joined.aborted) abort();
      });
    try {
      joined.throwIfAborted();
      response = await within(
        fetch(path, {
          ...init,
          cache: "no-store",
          redirect: "error",
          signal: joined,
        }).then((value) => {
          if (joined.aborted) void value.body?.cancel().catch(() => undefined);
          return value;
        }),
      );
      joined.throwIfAborted();
      if (response === undefined)
        throw new HubClientError(
          "network",
          "Missing installation response",
          null,
          null,
        );
      const requestId = response.headers.get("x-request-id");
      const retryAfter =
        response.status === 429 ? response.headers.get("retry-after") : null;
      if (
        !hasHubNoStoreDirective(response.headers) ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(requestId ?? "") ||
        !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(
          response.headers.get("content-type") ?? "",
        ) ||
        (retryAfter !== null && !/^[1-9][0-9]{0,4}$/u.test(retryAfter))
      ) {
        throw new HubClientError(
          "parse",
          "Invalid installation response headers",
          null,
          response.status,
        );
      }
      const declared = response.headers.get("content-length");
      if (
        (declared !== null &&
          (!/^(0|[1-9][0-9]*)$/u.test(declared) ||
            Number(declared) > 1_048_576)) ||
        response.body === null
      )
        throw new HubClientError(
          "parse",
          "Invalid installation body size",
          null,
          response.status,
        );
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      const cancel = () => {
        void reader.cancel().catch(() => undefined);
      };
      joined.addEventListener("abort", cancel, { once: true });
      try {
        for (;;) {
          const part = await within(reader.read());
          joined.throwIfAborted();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 1_048_576)
            throw new HubClientError(
              "parse",
              "Installation body is too large",
              null,
              response.status,
            );
          chunks.push(part.value);
        }
      } finally {
        joined.removeEventListener("abort", cancel);
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      if (declared !== null && Number(declared) !== size)
        throw new HubClientError(
          "parse",
          "Installation body size mismatch",
          null,
          response.status,
        );
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
      } catch {
        throw new HubClientError(
          "parse",
          "Invalid installation JSON",
          null,
          response.status,
        );
      }
      if (response.status !== 200) {
        const error = installationErrorSchema.safeParse(raw);
        if (
          !error.success ||
          !installationErrorAllowed(
            operation,
            response.status,
            error.data.error.code,
          )
        )
          throw new HubClientError(
            "parse",
            "Invalid installation error",
            null,
            response.status,
          );
        throw new HubClientError(
          "http",
          "Installation request rejected",
          error.data.error.code,
          response.status,
          error.data.error.retryable,
          requestId,
          retryAfter,
        );
      }
      const result = installationResponseSchema(operation).safeParse(raw);
      if (!result.success)
        throw new HubClientError(
          "parse",
          "Invalid installation response",
          null,
          response.status,
        );
      return result.data;
    } catch (error) {
      if (error instanceof HubClientError) throw error;
      throw new HubClientError(
        signal?.aborted ? "aborted" : "network",
        "Installation request did not complete",
        null,
        response?.status ?? null,
      );
    } finally {
      clearTimeout(timer);
      void response?.body?.cancel().catch(() => undefined);
    }
  }
  const receipt = async (
    operation: "install" | "setEnabled" | "remove",
    path: string,
    init: RequestInit,
    identity: string,
    enabled?: boolean,
    signal?: AbortSignal,
  ): Promise<InstallationReceipt> => {
    const result = await request(operation, path, init, signal);
    if (!("installation" in result.data))
      throw new HubClientError(
        "parse",
        "Invalid installation receipt",
        null,
        200,
      );
    const value = result.data;
    if (!installationReceiptMatches(operation, value, identity, enabled))
      throw new HubClientError(
        "parse",
        "Installation receipt identity mismatch",
        null,
        200,
      );
    return value;
  };
  return {
    list: async (query = {}, signal) => {
      const input = installationListQuerySchema.parse(query);
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(input))
        if (value !== undefined) search.set(key, String(value));
      const result = await request(
        "list",
        `${base}${search.size ? `?${search}` : ""}`,
        { method: "GET" },
        signal,
      );
      if (!Array.isArray(result.data))
        throw new HubClientError(
          "parse",
          "Invalid installation list",
          null,
          200,
        );
      return result as InstallationPage;
    },
    get: async (id, signal) => {
      const result = await request(
        "get",
        idPath(id),
        { method: "GET" },
        signal,
      );
      if (
        !("installation_id" in result.data) ||
        result.data.installation_id !== id
      )
        throw new HubClientError(
          "parse",
          "Installation identity mismatch",
          null,
          200,
        );
      return result.data;
    },
    install: (sourceRef, key, signal) =>
      receipt(
        "install",
        base,
        {
          method: "POST",
          headers: commandHeaders(key, true),
          body: JSON.stringify({
            source_ref: installationSourceSchema.parse(sourceRef),
          }),
        },
        sourceRef,
        undefined,
        signal,
      ),
    setEnabled: (id, enabled, key, signal) => {
      if (typeof enabled !== "boolean")
        throw new HubClientError("parse", "Invalid enabled state", null, null);
      return receipt(
        "setEnabled",
        `${idPath(id)}/enabled`,
        {
          method: "PUT",
          headers: commandHeaders(key, true),
          body: JSON.stringify({ enabled }),
        },
        id,
        enabled,
        signal,
      );
    },
    remove: (id, key, signal) =>
      receipt(
        "remove",
        idPath(id),
        { method: "DELETE", headers: commandHeaders(key, false) },
        id,
        undefined,
        signal,
      ),
  };
}
