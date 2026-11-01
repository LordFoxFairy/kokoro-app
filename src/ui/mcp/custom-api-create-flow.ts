import type { HubClient } from "@/hub/client";
import { customApiCreateInputSchema, customApiProfileSchema, type CustomApiCreateInput } from "@/hub/custom-api.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createConnectorCommand } from "./connector-command";

export type CustomApiCreationCompletion = Readonly<{ profileId: string }>;

/** API-specific input and confirmed projection; shared mechanics hold no owner facts. */
export function createCustomApiCreateFlow(options: {
  client: Pick<HubClient, "createCustomApi">;
  boundary: ProjectReadBoundary;
  onConfirmed: () => void;
  key?: () => string;
}) {
  return createConnectorCommand<CustomApiCreateInput, CustomApiCreationCompletion>({
    ...options,
    surface: "custom_api",
    execute: options.client.createCustomApi,
    invalidRequestCode: "invalid_custom_api_request",
    name: body => body.name,
    projectCompletion: ack => Object.freeze({ profileId: customApiProfileSchema.parse(ack).profile_id }),
    freeze: input => {
      const body = customApiCreateInputSchema.parse(input);
      body.environment.forEach(item => Object.freeze(item));
      Object.freeze(body.environment); return Object.freeze(body);
    },
  });
}
export type CustomApiCreateFlow = ReturnType<typeof createCustomApiCreateFlow>;
