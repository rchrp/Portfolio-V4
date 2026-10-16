# Production image for the portfolio (apps/web), deployable on Dokploy.
#
# Runtime environment (set in Dokploy, never baked into the image):
#   DATABASE_URL   PostgreSQL connection string; pending migrations are
#                  applied on every start. Empty: demonstration projects.
#   ADMIN_ORIGIN   Exact public origin, e.g. https://example.com (admin panel).
#   UPLOAD_STORAGE, S3_*   See "Storage in production" in the README. With the
#                  default local storage, mount a volume on
#                  /app/apps/web/public/projects to keep admin uploads.
#
# Register a passkey from the container's terminal: pnpm admin:invite

FROM node:24-bookworm-slim AS base
ENV COREPACK_HOME=/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
# The Prisma CLI needs OpenSSL, which the slim image leaves out.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /app

# Dependencies first, so they stay cached while only the source changes.
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
# corepack fetches the pnpm version pinned in package.json ("packageManager").
RUN corepack install && chmod -R a+rX /corepack
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY . .
RUN pnpm build

# The Prisma CLI and tsx (devDependencies) stay installed: the container runs
# the migrations, the seed and the admin invite itself.
FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build /corepack /corepack
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then pnpm db:migrate || exit 1; fi; exec pnpm start"]
