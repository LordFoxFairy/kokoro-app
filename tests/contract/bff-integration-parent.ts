import { createHash } from "node:crypto";

// Test-only inverse of the exact owner-published SET49 integration delta.
// The live 16.0 and historical 15.4 bytes are independently pinned in full.
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const approvedChanges = [
  {
    "at": 3,
    "current": "  version: 16.0.0\n",
    "previous": "  version: 15.4.0\n"
  },
  {
    "at": 39,
    "current": "    description: MCP discovery projections; browser-private connector lifecycle is separately scoped.\n",
    "previous": "    description: MCP server projections and lifecycle operations.\n"
  },
  {
    "at": 4324,
    "current": "",
    "previous": "    post:\n      tags: [MCP]\n      operationId: registerMcpServer\n      x-kokoro-owner: kokoro-bff\n      x-kokoro-visibility: public\n      x-kokoro-stability: beta\n      x-kokoro-idempotency: required\n      x-kokoro-permission: capability.mcp.manage\n      summary: Register an MCP server\n      parameters:\n        - $ref: '#/components/parameters/IdempotencyKey'\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema:\n              $ref: '#/components/schemas/McpServerRequest'\n      responses:\n        '200':\n          description: MCP server registered\n          content:\n            application/json:\n              schema:\n                $ref: '#/components/schemas/McpServerResponse'\n        '400': { $ref: '#/components/responses/BadRequest' }\n        '403': { $ref: '#/components/responses/ServiceAuthFailed' }\n        '409': { $ref: '#/components/responses/Conflict' }\n        '401': { $ref: '#/components/responses/ServiceAuthFailed' }\n        '429':\n          description: IAM session admission is rate limited\n          headers:\n            Retry-After:\n              description: Bounded delay in seconds before retrying admission\n              schema: { type: string, pattern: '^[1-9][0-9]{0,4}$' }\n          content:\n            application/json:\n              schema: { $ref: '#/components/schemas/ErrorEnvelope' }\n        '503': { $ref: '#/components/responses/ServiceUnavailable' }\n  /v1/mcp/servers/{name}/enable:\n    parameters:\n      - $ref: '#/components/parameters/McpServerName'\n    post:\n      tags: [MCP]\n      operationId: enableMcpServer\n      x-kokoro-owner: kokoro-bff\n      x-kokoro-visibility: public\n      x-kokoro-stability: beta\n      x-kokoro-idempotency: required\n      x-kokoro-permission: capability.mcp.manage\n      summary: Enable an MCP server\n      parameters:\n        - $ref: '#/components/parameters/IdempotencyKey'\n      responses:\n        '200':\n          description: MCP server enabled\n          content:\n            application/json:\n              schema:\n                $ref: '#/components/schemas/OkResponse'\n        '403': { $ref: '#/components/responses/ServiceAuthFailed' }\n        '404': { $ref: '#/components/responses/NotFound' }\n        '409': { $ref: '#/components/responses/Conflict' }\n        '401': { $ref: '#/components/responses/ServiceAuthFailed' }\n        '429':\n          description: IAM session admission is rate limited\n          headers:\n            Retry-After:\n              description: Bounded delay in seconds before retrying admission\n              schema: { type: string, pattern: '^[1-9][0-9]{0,4}$' }\n          content:\n            application/json:\n              schema: { $ref: '#/components/schemas/ErrorEnvelope' }\n        '503': { $ref: '#/components/responses/ServiceUnavailable' }\n  /v1/mcp/servers/{name}/disable:\n    parameters:\n      - $ref: '#/components/parameters/McpServerName'\n    post:\n      tags: [MCP]\n      operationId: disableMcpServer\n      x-kokoro-owner: kokoro-bff\n      x-kokoro-visibility: public\n      x-kokoro-stability: beta\n      x-kokoro-idempotency: required\n      x-kokoro-permission: capability.mcp.manage\n      summary: Disable an MCP server\n      parameters:\n        - $ref: '#/components/parameters/IdempotencyKey'\n      responses:\n        '200':\n          description: MCP server disabled\n          content:\n            application/json:\n              schema:\n                $ref: '#/components/schemas/OkResponse'\n        '403': { $ref: '#/components/responses/ServiceAuthFailed' }\n        '404': { $ref: '#/components/responses/NotFound' }\n        '409': { $ref: '#/components/responses/Conflict' }\n        '401': { $ref: '#/components/responses/ServiceAuthFailed' }\n        '429':\n          description: IAM session admission is rate limited\n          headers:\n            Retry-After:\n              description: Bounded delay in seconds before retrying admission\n              schema: { type: string, pattern: '^[1-9][0-9]{0,4}$' }\n          content:\n            application/json:\n              schema: { $ref: '#/components/schemas/ErrorEnvelope' }\n        '503': { $ref: '#/components/responses/ServiceUnavailable' }\n  /v1/mcp/servers/{name}:\n    parameters:\n      - $ref: '#/components/parameters/McpServerName'\n    delete:\n      tags: [MCP]\n      operationId: deleteMcpServer\n      x-kokoro-owner: kokoro-bff\n      x-kokoro-visibility: public\n      x-kokoro-stability: beta\n      x-kokoro-idempotency: required\n      x-kokoro-permission: capability.mcp.manage\n      summary: Delete an MCP server\n      parameters:\n        - $ref: '#/components/parameters/IdempotencyKey'\n      responses:\n        '200':\n          description: MCP server deleted\n          content:\n            application/json:\n              schema:\n                $ref: '#/components/schemas/OkResponse'\n        '403': { $ref: '#/components/responses/ServiceAuthFailed' }\n        '404': { $ref: '#/components/responses/NotFound' }\n        '409': { $ref: '#/components/responses/Conflict' }\n        '401': { $ref: '#/components/responses/ServiceAuthFailed' }\n        '429':\n          description: IAM session admission is rate limited\n          headers:\n            Retry-After:\n              description: Bounded delay in seconds before retrying admission\n              schema: { type: string, pattern: '^[1-9][0-9]{0,4}$' }\n          content:\n            application/json:\n              schema: { $ref: '#/components/schemas/ErrorEnvelope' }\n        '503': { $ref: '#/components/responses/ServiceUnavailable' }\n"
  },
  {
    "at": 12158,
    "current": "",
    "previous": "    McpServerName:\n      name: name\n      in: path\n      required: true\n      schema:\n        type: string\n"
  },
  {
    "at": 17894,
    "current": "",
    "previous": "    McpServer:\n      type: object\n      required: [scope, name, revision, transport, url, allowed_tools, secret_ref, enabled]\n      properties:\n        scope: { type: string }\n        name: { type: string }\n        revision: { type: integer }\n        transport:\n          type: string\n          enum: [http, streamable_http]\n        url: { type: string }\n        allowed_tools:\n          type: array\n          items: { type: string }\n        secret_ref:\n          type: [string, 'null']\n        enabled: { type: boolean }\n"
  },
  {
    "at": 17907,
    "current": "",
    "previous": "    McpServerRequest:\n      type: object\n      required: [name, transport, url, allowed_tools]\n      additionalProperties: false\n      properties:\n        name: { type: string }\n        transport:\n          type: string\n          enum: [http, streamable_http]\n        url: { type: string }\n        allowed_tools:\n          type: array\n          items: { type: string }\n        secret_ref:\n          type: [string, 'null']\n"
  },
  {
    "at": 17922,
    "current": "",
    "previous": "    McpServerResponse:\n      type: object\n      required: [data, meta]\n      properties:\n        data:\n          type: object\n          required: [server]\n          properties:\n            server: { $ref: '#/components/schemas/McpServer' }\n        meta: { $ref: '#/components/schemas/RequestMeta' }\n"
  }
] as const;

export function restorePublic154Integration(bytes: Uint8Array): Buffer {
  if (hash(bytes) !== "b4e91483e425fdcc9547eac8bcda554273cbee0863ccb0ddfb185fae18e4e267") throw new Error("not fixed public16.0");
  const lines = Buffer.from(bytes).toString("utf8").match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  for (const change of [...approvedChanges].reverse()) {
    const count = change.current ? (change.current.match(/\n/gu)?.length ?? 0) : 0;
    if (lines.slice(change.at, change.at + count).join("") !== change.current) throw new Error("integration delta drift");
    const previous = change.previous.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
    lines.splice(change.at, count, ...previous);
  }
  const parent = Buffer.from(lines.join(""));
  if (hash(parent) !== "87186311e67eeebcd5f27d7974326186e1912de49d18d4d524a0bcbc940a0817") throw new Error("public15.4 parent drift");
  return parent;
}
