import type { HubClient } from "@/hub/client";
import { subscribeResource } from "@/lib/query/resource-store";
import type { SkillsPool } from "./skills-pool-model";
import { SKILLS_KEY, skillResourceKey } from "./skills-resource-cache";

/** One reader for the shell's warm subscription and the mounted Skills panel. */
export async function readSkillsPool(client: HubClient): Promise<SkillsPool> {
  const [skills, quota] = await Promise.all([
    client.listSkillPool(),
    client.skillQuota().catch(() => null),
  ]);
  return { skills, quota };
}

/** Warm the existing client-scoped entry without revalidating a settled pool. */
export function warmSkillsPool(client: HubClient): () => void {
  return subscribeResource(
    skillResourceKey(SKILLS_KEY, client),
    () => readSkillsPool(client),
    () => undefined,
    false,
  );
}
