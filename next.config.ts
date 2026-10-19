import type { NextConfig } from "next"

const configuredDevOrigin = process.env.KOKORO_DOMAIN?.trim()
const adminInternalOrigin = process.env.KOKORO_ADMIN_INTERNAL_ORIGIN?.trim() || "http://127.0.0.1:3320"

function exactHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    return /^https?:$/u.test(url.protocol) && url.origin === value ? value : null
  } catch { return null }
}

const resolvedAdminInternalOrigin = exactHttpOrigin(adminInternalOrigin)

const nextConfig: NextConfig = {
  // Next dev logs full URLs. Exact browser-private paths carry verification
  // tokens, signed continuations or authorization codes; ordinary logs stay on.
  logging: {
    incomingRequests: {
      ignore: [
        /^\/iam\/verify-email(?:\?.*)?$/u,
        /^\/iam\/interactions\/invitation(?:\?.*)?$/u,
        /^\/auth\/sign-in(?:\?.*)?$/u,
        /^\/iam\/oauth2\/authorize(?:\?.*)?$/u,
        /^\/api\/auth\/callback\/kokoro-iam(?:\?.*)?$/u,
      ],
    },
  },
  // Keep the configured local hostname usable in desktop QA. The wildcard
  // `*.localhost` resolves to loopback without a hosts-file entry. Do not
  // bake a production hostname into the Next config.
  allowedDevOrigins: ["127.0.0.1", "localhost", ...(configuredDevOrigin ? [configuredDevOrigin] : [])],
  // The app owns its own runtime diagnostics surface. The floating Next.js
  // dev badge overlaps the mobile composer and is not part of the product UI.
  devIndicators: false,
  turbopack: { root: process.cwd() },
  // 生产镜像：standalone 产物自带精简 node_modules + server.js，容器只需 node server.js。
  output: "standalone",
  async rewrites() {
    if (resolvedAdminInternalOrigin === null) return []
    return [
      { source: "/manage", destination: `${resolvedAdminInternalOrigin}/manage` },
      { source: "/manage/:path*", destination: `${resolvedAdminInternalOrigin}/manage/:path*` },
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ]
  },
}

export default nextConfig
