export type SettingsTab =
  | "account"
  | "appearance"
  | "personalization"
  | "computer"
  | "deployment"
  | "integration"
  | "chat"
  | "shortcuts"
  | "credits"
  | "subscription"
  | "skills"
  | "mcp"
  | "team";

export const SETTINGS_TABS: readonly SettingsTab[] = [
  "account",
  "appearance",
  "personalization",
  "computer",
  "deployment",
  "integration",
  "chat",
  "shortcuts",
  "credits",
  "subscription",
  "skills",
  "mcp",
  "team",
];

export type SettingsIntegrationId = "zapier" | "slack" | "telegram" | "line";

export const SETTINGS_INTEGRATIONS: readonly SettingsIntegrationId[] = [
  "zapier",
  "slack",
  "telegram",
  "line",
];
