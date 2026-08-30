# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/agent ./apps/agent
RUN pnpm install --frozen-lockfile

FROM base AS runner
WORKDIR /repo
ENV NODE_ENV=production
# "dev" outside a real release build - see apps/web/Dockerfile's comment.
ARG OPENPLOY_VERSION=dev
ENV OPENPLOY_VERSION=$OPENPLOY_VERSION

# docker CLI + buildx: this is the one process in the whole platform allowed
# to talk to /var/run/docker.sock (bind-mounted at deploy time, not baked into
# the image). pack CLI: Cloud Native Buildpacks for the "Heroku Buildpacks"
# build method. tar: extracting GitHub source tarballs.
RUN apk add --no-cache docker-cli docker-cli-buildx tar curl \
  && curl -fsSL "https://github.com/buildpacks/pack/releases/download/v0.40.9/pack-v0.40.9-linux.tgz" \
     | tar -C /usr/local/bin -xzf - pack \
  && chmod +x /usr/local/bin/pack

# Every workspace package is consumed as TypeScript source (package.json
# "main" points at src/index.ts, no per-package build step) - tsx transpiles
# on the fly at runtime rather than needing a bundler like apps/web has via Next.js.
COPY --from=deps /repo ./
WORKDIR /repo/apps/agent
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
