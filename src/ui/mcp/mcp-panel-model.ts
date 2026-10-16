/**
 * The create menu is a product taxonomy, not a rendering preference.  Keep
 * Custom API separate from MCP forms so its secret-based lifecycle can never
 * fall through to the MCP transport editor.
 */
export type McpCreateMode = "custom-api" | "form" | "json" | "url";
