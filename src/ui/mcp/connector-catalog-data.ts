import type { MessageKey } from "@/i18n/messages"

export type ConnectorCatalogItem = {
  id: string
  name: string
  description: MessageKey
  iconUrl?: string
  iconText?: string
}

export const APP_CONNECTORS: readonly ConnectorCatalogItem[] = [
  { id: "browser", name: "My Browser", description: "connectorCatalog.browserDescription", iconUrl: "/assets/connectors/my-browser.webp" },
  { id: "gmail", name: "Gmail", description: "connectorCatalog.gmailDescription", iconUrl: "/assets/connectors/gmail.webp" },
  { id: "github", name: "GitHub", description: "connectorCatalog.githubDescription", iconUrl: "/assets/connectors/github.webp" },
  { id: "instagram", name: "Instagram", description: "connectorCatalog.instagramDescription", iconUrl: "/assets/connectors/instagram.svg" },
  { id: "workspace", name: "Google Workspace", description: "connectorCatalog.workspaceDescription", iconUrl: "/assets/connectors/google-workspace.webp" },
  { id: "meta", name: "Meta Ads Manager", description: "connectorCatalog.metaDescription", iconUrl: "/assets/connectors/meta-ads.svg" },
  { id: "calendar", name: "Google Calendar", description: "connectorCatalog.calendarDescription", iconUrl: "/assets/connectors/google-calendar.webp" },
  { id: "notion", name: "Notion", description: "connectorCatalog.notionDescription", iconUrl: "/assets/connectors/notion.webp" },
  { id: "creator", name: "Instagram Creator Marketplace", description: "connectorCatalog.creatorDescription", iconUrl: "/assets/connectors/instagram-creator.svg" },
  { id: "higgsfield", name: "Higgsfield", description: "connectorCatalog.higgsfieldDescription", iconUrl: "/assets/connectors/higgsfield.webp" },
  { id: "outlook", name: "Outlook Mail", description: "connectorCatalog.outlookDescription", iconUrl: "/assets/connectors/outlook.svg" },
  { id: "tiktok-business", name: "TikTok for Business", description: "connectorCatalog.tiktokDescription", iconUrl: "/assets/connectors/tiktok.svg" },
]

export const API_CONNECTORS: readonly ConnectorCatalogItem[] = [
  { id: "elevenlabs-api", name: "ElevenLabs API", description: "connectorCatalog.elevenLabsApiDescription", iconUrl: "/assets/connectors/elevenlabs-api.webp" },
  { id: "openai", name: "OpenAI", description: "connectorCatalog.openAiDescription", iconUrl: "/assets/connectors/openai.webp" },
  { id: "openrouter-api", name: "OpenRouter API", description: "connectorCatalog.openRouterDescription", iconUrl: "/assets/connectors/openrouter-api.webp" },
  { id: "grok", name: "Grok", description: "connectorCatalog.grokDescription", iconUrl: "/assets/connectors/grok.webp" },
  { id: "similarweb-api", name: "Similarweb API", description: "connectorCatalog.similarwebDescription", iconUrl: "/assets/connectors/similarweb-api.webp" },
  { id: "ahrefs-api", name: "Ahrefs API", description: "connectorCatalog.ahrefsDescription", iconUrl: "/assets/connectors/ahrefs-api.webp" },
  { id: "n8n-api", name: "n8n API", description: "connectorCatalog.n8nDescription", iconUrl: "/assets/connectors/n8n-api.webp" },
  { id: "perplexity", name: "Perplexity", description: "connectorCatalog.perplexityDescription", iconUrl: "/assets/connectors/perplexity.webp" },
  { id: "cloudflare-api", name: "Cloudflare API", description: "connectorCatalog.cloudflareDescription", iconUrl: "/assets/connectors/cloudflare-api.webp" },
  { id: "typeform", name: "Typeform", description: "connectorCatalog.typeformDescription", iconUrl: "/assets/connectors/typeform.webp" },
  { id: "mailchimp", name: "Mailchimp Marketing", description: "connectorCatalog.mailchimpDescription", iconUrl: "/assets/connectors/mailchimp.webp" },
  { id: "google-gemini", name: "Google Gemini", description: "connectorCatalog.geminiDescription", iconUrl: "/assets/connectors/google-gemini.webp" },
]

// The plugins surface exposes answer-oriented data sources, which are a
// different product concept from user-created API connectors. Keep this list
// separate so the future catalog endpoint can replace it without changing the
// custom API management flow.
export const DATA_SOURCE_CONNECTORS: readonly ConnectorCatalogItem[] = [
  { id: "similarweb", name: "Similarweb", description: "plugins.sourceSimilarwebDescription", iconUrl: "/assets/connectors/similarweb-api.webp" },
  { id: "world-bank", name: "World Bank DataBank", description: "plugins.sourceWorldBankDescription", iconText: "WB" },
  { id: "x-twitter", name: "X/Twitter", description: "plugins.sourceTwitterDescription", iconText: "X" },
  { id: "brand24", name: "Brand24", description: "plugins.sourceBrand24Description", iconText: "B24" },
  { id: "ahrefs", name: "Ahrefs", description: "plugins.sourceAhrefsDescription", iconUrl: "/assets/connectors/ahrefs-api.webp" },
  { id: "coingecko", name: "CoinGecko", description: "plugins.sourceCoinGeckoDescription", iconText: "CG" },
  { id: "pophive", name: "PopHIVE", description: "plugins.sourcePopHiveDescription", iconText: "PH" },
  { id: "morningstar", name: "Morningstar", description: "plugins.sourceMorningstarDescription", iconText: "M" },
  { id: "alpaca", name: "Alpaca", description: "plugins.sourceAlpacaDescription", iconText: "A" },
  { id: "alpha-vantage", name: "Alpha Vantage", description: "plugins.sourceAlphaVantageDescription", iconText: "AV" },
  { id: "fred", name: "FRED", description: "plugins.sourceFredDescription", iconText: "F" },
  { id: "oecd", name: "OECD Data Explorer", description: "plugins.sourceOecdDescription", iconText: "OECD" },
]
