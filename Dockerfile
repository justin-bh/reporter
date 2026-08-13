# syntax=docker/dockerfile:1

# ---- Builder: install workspace + build web/server ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# The hoisted linker installs every workspace dep; node-pty (used only by the
# terminal recorder) has no linux-arm64 prebuild and compiles from source, so the
# builder needs a toolchain. Electron's binary is never used in this image.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
ENV PYTHON=/usr/bin/python3
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable

# Copy the whole repo (host node_modules/dist excluded via .dockerignore).
COPY . .

RUN pnpm install --frozen-lockfile

# Build shared packages, the web SPA, then the server (which runs prisma generate).
RUN pnpm --filter @reporter/shared build \
 && pnpm --filter @reporter/api-client build \
 && pnpm --filter @reporter/ui build \
 && pnpm --filter @reporter/web build \
 && pnpm --filter @reporter/server build

# ---- Runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV BLOB_DIR=/data/blobs
# Prisma's query engine dynamically links libssl; bookworm-slim omits it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable

# Copy the built monorepo (preserves apps/server/dist + apps/web/dist layout the
# server uses to serve the SPA, plus node_modules incl. the Prisma CLI/engines).
COPY --from=builder /app /app

RUN mkdir -p /data/blobs
EXPOSE 8080

ENTRYPOINT ["sh", "/app/docker/entrypoint.sh"]
