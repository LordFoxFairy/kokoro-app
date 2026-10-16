import type { HubClient } from "@/hub/client";

export const SKILLS_KEY = "hub/skills";
export const SKILLS_CATALOG_KEY = "hub/skills/catalog";

const clientResourceIds = new WeakMap<object, number>();
let nextClientResourceId = 1;

/**
 * Scope each shared resource by its actual Hub client. Preview, live, and
 * fixture clients may coexist in one tab and must never share owner data.
 */
export function skillResourceKey(
  prefix: string,
  client: HubClient,
  suffix = "",
): string {
  let id = clientResourceIds.get(client);
  if (id === undefined) {
    id = nextClientResourceId++;
    clientResourceIds.set(client, id);
  }
  return `${prefix}/${id}${suffix ? `/${suffix}` : ""}`;
}
