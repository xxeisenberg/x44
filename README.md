<p align="center">
  <img src="./banner.webp" alt="x44 banner" width="100%" />
</p>

# x44

A lightweight, self-hosted deployment platform for static sites and single-page applications.

Spins up Docker containers to build Git repositories, uploads output assets to Cloudflare R2, and serves them globally.

---

## Features

- Every build runs in its own Docker container with RAM and CPU limits.
- Cloudflare Queues run builds one by one so files don't overwrite each other.
- Set environment variables in the dashboard and use thm during builds.
- Broken builds never break the live site. Only successful builds go live.
- Projects are automatically served on `*.x44.diy` straight from R2.
- SPAs work out of the box with static sites support.
- Root directory, build command or output directory can be changed from the dashboard.
- Redeploy anytime with a single click.

---

## Monorepo Structure

### 1. `apps/web`

Web dashboard for project configuration, deployment tracking, environment variables, and domain management.

**Tech stack:**

- Next.js (App Router)
- TypeScript
- Tailwind CSS

### 2. `apps/control-plane`

API backend running on Cloudflare Workers. Handles project management, GitHub OAuth, branch resolution, D1 database operations, and acts as both queue producer and consumer.

**Tech stack:**

- Hono
- Cloudflare Workers & Queues
- Cloudflare D1 + Drizzle ORM
- better-auth

### 3. `apps/subdomain-router`

Wildcard edge router serving `*.x44.diy`. Queries D1 for the latest successful build and streams assets directly from R2.

**Tech stack:**

- Cloudflare Workers
- Cloudflare R2

### 4. `apps/build-worker`

Linux build daemon running an Axum web server. Receives build specifications, provisions isolated Docker containers to compile repositories, and uploads the resulting static files to R2.

**Tech stack:**

- Rust (Axum)
- Docker CLI

### 5. `packages/types`

Shared TypeScript types and schemas used across the dashboard and control plane.

---

## Running it locally

You need Node.js, pnpm, Rust and Docker installed.

1. Install Dependencies:

```bash
pnpm install
```

2. Configure Environment Variables:

Copy `.env.example` to `.env` in each service and update with your credentials:

```bash
cp apps/web/.env.example apps/web/.env
cp apps/control-plane/.env.example apps/control-plane/.env
cp apps/build-worker/.env.example apps/build-worker/.env
```

3. Start dev server [frontend & backend]:

```bash
pnpm dev
```

4. Start the build worker(make sure Docker is running):

```bash
cd apps/build-worker
cargo run
```
