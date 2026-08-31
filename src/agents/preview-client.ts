import type { AgentClient, AgentConnectionSetup, AgentPlatform } from "./client"

const PREVIEW_EXPIRY = "2099-08-30T06:30:00.000Z"

export function previewAgentConnectionSetup(platform: AgentPlatform): AgentConnectionSetup {
  return {
    platform,
    status: "disconnected",
    qr_value: `https://agents.fixture.test/connect?platform=${platform}&ticket=preview`,
    continue_url: `https://agents.fixture.test/continue?platform=${platform}&ticket=preview`,
    expires_at: PREVIEW_EXPIRY,
  }
}

export function createPreviewAgentClient(): AgentClient {
  return {
    connectionSetup: (platform) => Promise.resolve(previewAgentConnectionSetup(platform)),
  }
}
