import { z } from "zod";

/** Browser-private consumer of BFF 400fab6, not a Storage or Platform SDK. */
export const mcpIconIdSchema = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u);
const decimal = (max: bigint) => z.string().regex(/^[1-9][0-9]{0,9}$/u).refine(v => BigInt(v) <= max);
const version = decimal(BigInt(2147483646));
const mime = z.enum(["image/png", "image/jpeg"]);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const filename = z.string().refine(v => Boolean(v) && v.trim() === v && new TextEncoder().encode(v).byteLength <= 255 && !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(v));
const referenceUrl = z.string().refine(v => {
  try { const u = new URL(v); return !u.username && !u.password && !u.hash && (u.protocol === "https:" || (process.env.NODE_ENV !== "production" && u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))); } catch { return false; }
});
export const mcpIconReferenceSchema = z.object({
  url: referenceUrl, method: z.enum(["GET", "PUT"]),
  required_headers: z.record(z.string(), z.string().refine(v => !/[\0\r\n]/u.test(v))),
  expires_at: z.string().datetime(),
}).strict().refine(v => Object.keys(v.required_headers).every(k => /^[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(k) && !["authorization", "cookie", "proxy-authorization"].includes(k)));
const dimensions = { width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096) };
export const mcpIconSelectionSchema = z.object({ intent_id: mcpIconIdSchema, expected_state_version: version }).strict();
export const mcpIconBindingSchema = z.object({
  intent_id: mcpIconIdSchema, content_sha256: digest, mime_type: mime, size_bytes: decimal(BigInt(1048576)), ...dimensions,
  preview_reference: mcpIconReferenceSchema.optional(),
}).strict().refine(v => v.preview_reference === undefined || v.preview_reference.method === "GET" && Object.keys(v.preview_reference.required_headers).length === 0);
export const mcpIconIntentSchema = z.object({
  intent_id: mcpIconIdSchema, state: z.enum(["staged", "completing", "ready", "bound", "retiring", "released"]), state_version: decimal(BigInt(2147483647)),
  filename, mime_type: mime, content_sha256: digest, size_bytes: decimal(BigInt(1048576)), expires_at: z.string().datetime(), expired: z.boolean(),
  width: dimensions.width.optional(), height: dimensions.height.optional(), created_at: z.string().datetime(), updated_at: z.string().datetime(),
}).strict().refine(v => (v.width === undefined) === (v.height === undefined) && (!["ready", "bound"].includes(v.state) || v.width !== undefined));
export const mcpIconInputs = {
  beginIcon: z.object({ filename, mime_type: mime, content_sha256: digest, size_bytes: decimal(BigInt(1048576)) }).strict(),
  completeIcon: z.object({ expected_state_version: version, source_version_id: z.string().regex(/^[\x21-\x7e]{1,1024}$/u).refine(v => v !== "null") }).strict(),
  cancelIcon: z.object({ expected_state_version: version }).strict(),
  importIcon: z.object({ image_url: z.string().max(4096).refine(v => {
    try { const u = new URL(v); return v.trim() === v && /^https:\/\//iu.test(v) && !/[\\#\u0000-\u0020\u007f-\u009f\ud800-\udfff]/u.test(v) && !u.username && !u.password && !v.slice(v.indexOf("://") + 3).split(/[/?#]/u)[0]?.includes("@"); } catch { return false; }
  }) }).strict(),
};
const command = { intent: mcpIconIntentSchema, replayed: z.boolean() };
export const mcpIconResponses = {
  beginIcon: z.object({ ...command, upload_reference: mcpIconReferenceSchema.optional() }).strict(),
  completeIcon: z.object(command).strict(), cancelIcon: z.object(command).strict(), importIcon: z.object(command).strict(),
  getIcon: z.object({ intent: mcpIconIntentSchema, preview_reference: mcpIconReferenceSchema.optional() }).strict(),
};
export type McpIconOperation = keyof typeof mcpIconResponses;
export type McpIconIntent = z.infer<typeof mcpIconIntentSchema>;
export type McpIconBinding = z.infer<typeof mcpIconBindingSchema>;
export type McpIconSelection = z.infer<typeof mcpIconSelectionSchema>;
export type McpIconReference = z.infer<typeof mcpIconReferenceSchema>;
export type McpIconSaveChange = { icon?: McpIconSelection | undefined; clear_icon?: true | undefined };
export type McpIconCommandInput<O extends Exclude<McpIconOperation, "getIcon">> = z.infer<(typeof mcpIconInputs)[O]>;

export function mcpIconOperation(path: readonly string[], method: string): McpIconOperation | undefined {
  if (path[0] !== "mcp" || path[1] !== "icons") return;
  if (path.length === 3 && method === "POST" && path[2] === "uploads") return "beginIcon";
  if (path.length === 3 && method === "POST" && path[2] === "import") return "importIcon";
  if (!mcpIconIdSchema.safeParse(path[2]).success) return;
  if (path.length === 3 && method === "GET") return "getIcon";
  if (path.length === 4 && method === "POST" && path[3] === "complete") return "completeIcon";
  if (path.length === 4 && method === "POST" && path[3] === "cancel") return "cancelIcon";
  return undefined;
}
export function mcpIconMatches(operation: McpIconOperation, value: unknown, id?: string, input?: unknown): boolean {
  const parsed = z.object({ data: mcpIconResponses[operation] }).strict().safeParse(value);
  if (!parsed.success) return false;
  const data = parsed.data.data, intent = data.intent;
  if (id !== undefined && intent.intent_id !== id) return false;
  if (operation === "cancelIcon" && intent.state !== "released") return false;
  if ((operation === "completeIcon" || operation === "importIcon") && (!(["ready", "bound", "retiring", "released"] as string[]).includes(intent.state) || intent.width === undefined)) return false;
  if (operation === "completeIcon" || operation === "cancelIcon") {
    const request = mcpIconInputs[operation].safeParse(input);
    if (!request.success || BigInt(intent.state_version) <= BigInt(request.data.expected_state_version)) return false;
  }
  if ("upload_reference" in data && data.upload_reference !== undefined && (intent.state !== "staged" || intent.expired || data.upload_reference.method !== "PUT")) return false;
  if ("preview_reference" in data && data.preview_reference !== undefined && (intent.state !== "ready" || intent.expired || data.preview_reference.method !== "GET" || Object.keys(data.preview_reference.required_headers).length > 0)) return false;
  if (operation === "beginIcon") {
    const request = mcpIconInputs.beginIcon.safeParse(input);
    if (!request.success || intent.filename !== request.data.filename || intent.content_sha256 !== request.data.content_sha256 || intent.mime_type !== request.data.mime_type || intent.size_bytes !== request.data.size_bytes) return false;
  }
  return true;
}
export function mcpIconSaveMatches(binding: McpIconBinding | undefined, input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  const value = input as Record<string, unknown>;
  if (value.icon !== undefined) { const parsed = mcpIconSelectionSchema.safeParse(value.icon); return parsed.success && binding?.intent_id === parsed.data.intent_id; }
  return value.clear_icon !== true || binding === undefined;
}
