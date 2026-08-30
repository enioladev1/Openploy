# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /repo
RUN pnpm --filter @openploy/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# "dev" outside a real release build - only the release-triggered CI job
# passes a real tag here, so a plain push-to-main image never claims to be a
# version the self-update check would ever match against.
ARG OPENPLOY_VERSION=dev
ENV OPENPLOY_VERSION=$OPENPLOY_VERSION
RUN addgroup -S openploy && adduser -S openploy -G openploy

COPY --from=build --chown=openploy:openploy /repo/apps/web/.next/standalone ./
COPY --from=build --chown=openploy:openploy /repo/apps/web/public ./apps/web/public
COPY --from=build --chown=openploy:openploy /repo/apps/web/.next/static ./apps/web/.next/static

USER openploy
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
