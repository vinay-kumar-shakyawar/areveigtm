# syntax=docker/dockerfile:1.7
# Web image (Next.js standalone). The last stage is the default target, so a
# plain `docker build .` and hosts that cannot pick a stage (Railway) get the
# web server. The worker lives in Dockerfile.worker; docker-compose selects
# stages explicitly via `target:`.
FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

# --- Prisma CLI for migrations ----------------------------------------------
# The standalone bundle has no node_modules/.bin and copying node_modules/prisma
# alone misses its transitive deps (effect, fast-check, ...). Install the CLI at
# the locked version into its own tree instead.
FROM base AS prisma-cli
COPY package-lock.json ./
RUN PRISMA_VERSION=$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version") \
 && mkdir -p /opt/prisma-cli && cd /opt/prisma-cli \
 && npm init -y >/dev/null \
 && npm install --no-audit --no-fund "prisma@${PRISMA_VERSION}"

# --- Web (Next.js standalone) ------------------------------------------------
FROM base AS web
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=prisma-cli /opt/prisma-cli /opt/prisma-cli
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT:-3000}/api/health || exit 1
# Migrations (docker-compose command / Railway pre-deploy command):
#   node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
CMD ["node", "server.js"]
