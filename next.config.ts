import type { NextConfig } from "next"

const configuredDevOrigin = process.env.KOKORO_DOMAIN?.trim()

const nextConfig: NextConfig = {
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
}

export default nextConfig
