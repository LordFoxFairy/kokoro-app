# @kokoro/app 独立产品 Web 子仓库生产镜像。
# 构建上下文就是本仓库根目录，不依赖 kokoro-web monorepo 的 apps/user 路径。
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# pnpm 版本须与本地一致（11.2.2）：pnpm-workspace.yaml 的 allowBuilds 仅新版识别。
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
ENV npm_config_fetch_retries=6 \
    npm_config_fetch_retry_mintimeout=10000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_network_concurrency=4
# workspace 清单 + 锁先拷，供过滤安装。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/web-core/package.json ./packages/web-core/
# pnpm 11 blocks native build scripts by default in CI. Install deterministically first,
# approve only the native packages required by Next/Tailwind, then build them explicitly.
RUN pnpm install --frozen-lockfile --filter @kokoro/app... --ignore-scripts \
    && pnpm approve-builds --all \
    && pnpm rebuild esbuild sharp unrs-resolver

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
# 带 deps 阶段的全部 node_modules(过滤安装,各层级);再叠源码(.dockerignore 排除 node_modules,不覆盖)。
COPY --from=deps /app ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 关 pnpm11 运行前 deps 校验：deps 阶段是 --filter 过滤安装，全量校验会误判不一致。
ENV pnpm_config_verify_deps_before_run=false
# standalone 产物落根目录 `.next/standalone`。
RUN pnpm --filter @kokoro/app build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# 容器内须监听 0.0.0.0（standalone server.js 默认 localhost）。
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN useradd --system --uid 1001 kokoro
# standalone 根含 node_modules 与 server.js。
COPY --from=build --chown=kokoro:kokoro /app/.next/standalone ./
COPY --from=build --chown=kokoro:kokoro /app/.next/static ./.next/static
COPY --from=build --chown=kokoro:kokoro /app/public ./public
USER kokoro
EXPOSE 3000
CMD ["node", "server.js"]
