<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/logos/brand/openploy-logo-light.png">
    <img alt="Openploy" src="apps/web/public/logos/brand/openploy-logo.png" width="360">
  </picture>
</p>

A self-hosted platform as a service (PaaS) alternative to VERCEL, RAILWAY, RENDER, NETLIFY, HEROKU - deploy applications, databases, and Docker Compose stacks from your own server.

## Features

- **Applications** - deploy from a GitHub repo (Dockerfile or Heroku buildpacks) or a static file upload, with automatic deploys on push
- **Databases** - one-click Postgres, MySQL, MariaDB, Redis, ClickHouse, or MongoDB, with scheduled backups to any S3-compatible storage
- **Compose stacks** - deploy an existing `docker-compose.yml` from a repo or pasted directly
- **One-click app templates** - pre-configured, ready-to-deploy apps (n8n, phpMyAdmin, Excalidraw, more to come) with the compose file, env vars, and domain already set up
- **Domains & TLS** - automatic HTTPS via Traefik and Let's Encrypt, or an instant `nip.io` domain with no DNS setup
- **Environment variables** - per-service, with variables that can reference another service's connection details instead of being typed in
- **Scheduled tasks** - cron jobs that run inside a service's own container
- **Notifications** - email or Telegram alerts on deploy/backup success or failure
- **AI-assisted debugging** - send a failed deployment or container log to an AI provider for a plain-language explanation
- **Monitoring** - host CPU, memory, and disk usage at a glance
- **Multi-user** - owner/admin/member roles, audit log of every action
- **GitHub App integration** - connect repos without sharing a personal access token

## Architecture

A pnpm monorepo. `apps/web` never talks to Docker directly - only `apps/agent` holds the Docker socket, and the two communicate through a Postgres-backed job queue.

```
apps/
  web/      Next.js dashboard + tRPC API (apps/agent-blind, DB-only)
  agent/    Job worker with exclusive Docker/Swarm access
packages/
  db/               Drizzle schema + migrations, shared by web and agent
  shared/           Zod schemas and types shared across the monorepo
  queue/             pg-boss job queue client
  docker/           Docker/Swarm operations (build, deploy, logs, exec)
  crypto/           Envelope encryption for stored secrets
  traefik/          Traefik static/dynamic config rendering
  compose/          docker-compose.yml parsing, validation, and merging
  github/           GitHub App API client
  notifications/    Email/Telegram templates and senders
  ai-providers/     OpenAI/Anthropic/OpenRouter clients for log debugging
  storage/          S3-compatible client for backups
```

## Requirements

- A Linux server (Docker Swarm mode) for a real install, or Docker Desktop for local development
- Node.js >= 22 and [pnpm](https://pnpm.io/)

## Install (production)

On a fresh Linux VPS, run as root:

```bash
curl -fsSL https://raw.githubusercontent.com/enioladev1/Openploy/main/installer/install.sh | bash
```

This installs Docker if needed, initializes a Swarm, generates the encryption key and database credentials, and deploys the platform itself. It prints a `nip.io` URL at the end - open it and sign up as the first admin (that page only works once). A custom domain can be set later from Settings > Dashboard domain.

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill in DATABASE_URL and a generated master key
pnpm dev
```

`apps/agent` additionally needs its own `.env.local` with Docker/Traefik-related paths - see `apps/agent/.env.local` once it exists, or ask in the codebase for the current set of variables.

Common commands from the repo root:

```bash
pnpm dev         # run every app/package in watch mode
pnpm build       # build everything
pnpm typecheck   # typecheck every package
pnpm test        # run every package's test suite
pnpm db:generate # generate a Drizzle migration from schema changes
pnpm db:migrate  # apply pending migrations
```

## License

[Apache License 2.0](LICENSE)
