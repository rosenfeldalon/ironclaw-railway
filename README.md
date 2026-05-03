# ironclaw-railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/ironclaw?referralCode=4pD7Sc&utm_medium=integration&utm_source=template&utm_campaign=generic)

This repository provides a Railway-ready deployment wrapper for IronClaw so it can run correctly in a hosted environment without the common issues that appear when deploying the upstream project directly.

The Dockerfile currently builds upstream IronClaw `ironclaw-v0.27.0` and applies the Simon runtime patches in `patches/` during the Docker build. Override `IRONCLAW_REPO` and `IRONCLAW_REF` only when intentionally testing a different IronClaw source.

## Overview

IronClaw is a secure AI assistant with chat, memory, jobs, routines, and a web interface. This repository adapts IronClaw for Railway by adding the pieces needed for a smooth hosted deployment.

This setup handles the major problems that usually appear in Railway:

- skipping interactive first-run onboarding
- avoiding localhost-only gateway access
- preventing port conflicts between the gateway and HTTP webhook channel
- keeping the `ironclaw` CLI available for diagnostic commands
- running behind a public HTTP wrapper
- using PostgreSQL with pgvector for persistence
- making deployment easier for users who do not want to inspect logs manually

## Deploy

Click the button above, or use this link directly:

https://railway.com/deploy/ironclaw?referralCode=4pD7Sc&utm_medium=integration&utm_source=template&utm_campaign=generic

## What this template includes

This Railway template includes:

- IronClaw application service
- PostgreSQL service with pgvector
- public web access through a wrapper/proxy layer
- non-interactive startup for hosted environments
- persistent PostgreSQL storage
- private internal networking between services

## Why this wrapper exists

The upstream IronClaw project is designed mainly for local or self-managed environments. When deploying to Railway, several things need to be adapted:

- the default onboarding flow is interactive
- the internal gateway runs on localhost
- the public web entrypoint must listen on the Railway service port
- the webhook channel must not conflict with the public proxy port
- hosted users need a cleaner out-of-the-box experience

This repository solves those issues so the app starts correctly on Railway.

## Gateway Token

IronClaw’s web gateway uses a login token to protect access to the browser UI.

This means that after deployment, users may see a token prompt before entering the application. This token is not the same as your OpenAI or other LLM provider API key. It is used only for authenticating access to the IronClaw web interface.

Why this exists:

- protects the hosted UI from unauthorized access
- keeps the internal assistant interface gated behind authentication
- adds a simple security layer for public deployments

In the current Railway deployment flow, the token may be shown by IronClaw at runtime. For a more user-friendly template, the deployment can be extended to generate and inject a stable token automatically so users do not need to search for it manually.

## Architecture

This deployment uses two services.

### 1. ironclaw

The main application service built from this repository.

Responsibilities:

- starts IronClaw with Railway-friendly configuration
- skips interactive onboarding
- proxies public traffic to the internal IronClaw gateway
- keeps the UI accessible from the Railway public domain

### 2. Postgres

A PostgreSQL database service using pgvector.

Responsibilities:

- stores IronClaw data persistently
- supports vector-based features through pgvector
- stays private inside Railway internal networking

Recommended Postgres image:

    pgvector/pgvector:pg16-trixie

## Key Railway-specific changes

This wrapper includes several important deployment changes.

### 1. Non-interactive startup

Interactive first-run onboarding is skipped by preconfiguring the required environment variables for hosted deployment.

### 2. Public wrapper/proxy

IronClaw’s internal gateway runs locally, while the wrapper exposes the public Railway HTTP port and forwards traffic correctly.

### 3. Port separation

The public wrapper and IronClaw HTTP webhook channel run on separate ports to avoid bind conflicts.

Recommended split:

- public wrapper: 8080
- IronClaw webhook channel: 8081
- internal IronClaw gateway: 3000

### 4. Persistent database

Postgres uses a mounted volume so data survives redeploys.

### 5. Railway-friendly networking

- IronClaw is exposed publicly
- Postgres stays private
- internal service communication uses Railway private networking

## Environment variables

### IronClaw service

Use these variables on the IronClaw service:

    DATABASE_URL=postgresql://${{Postgres.POSTGRES_USER}}:${{Postgres.POSTGRES_PASSWORD}}@Postgres.railway.internal:5432/${{Postgres.POSTGRES_DB}}?sslmode=disable
    LLM_BACKEND=ollama
    OPENAI_API_KEY=
    ONBOARD_COMPLETED=true
    SANDBOX_ENABLED=false
    GATEWAY_ENABLED=true
    GATEWAY_HOST=127.0.0.1
    GATEWAY_PORT=3000
    GATEWAY_AUTH_TOKEN=${{ secret(32) }}
    PORT=8080
    HTTP_HOST=0.0.0.0
    HTTP_PORT=8081
    HTTP_WEBHOOK_SECRET=${{ secret(32) }}
    SECRETS_MASTER_KEY=${{ secret(64) }}
    HEARTBEAT_ENABLED=false
    EMBEDDING_ENABLED=false

Set a real provider and matching secret later, outside logs and repo files, before expecting agent responses that require model calls.

### Postgres service

Use these variables on the Postgres service:

    POSTGRES_DB=ironclaw
    POSTGRES_USER=ironclaw
    POSTGRES_PASSWORD=${{ secret(16) }}
    PGDATA=/var/lib/postgresql/data/pgdata

## Storage

### Postgres volume

Enable a persistent volume for Postgres.

Recommended mount path:

    /var/lib/postgresql/data

## Networking

### IronClaw service

- public HTTP domain enabled
- public wrapper listens on port 8080

### Postgres service

- no public domain
- private networking only
- persistent volume enabled

## User experience notes

After deployment, the app loads through the Railway public domain and opens the IronClaw UI.

This wrapper was updated to solve:

- first-run onboarding issues
- gateway accessibility problems
- HTTP webhook secret requirement
- port collision between Caddy and IronClaw HTTP channel
- Railway public access routing

## Repository files

This repository includes:

- `Dockerfile` — builds and packages the Railway-ready runtime
- `Caddyfile` — exposes the public Railway port and proxies traffic to IronClaw
- `docker-entrypoint.sh` — starts IronClaw with non-interactive onboarding disabled, redacts token-bearing startup URLs from platform logs, and starts the public proxy; explicit arguments pass through to the `ironclaw` CLI for diagnostics
- `railway.toml` — pins the Dockerfile builder and `/api/health` deploy healthcheck
- `README.md` — deployment instructions and template information

## Recommended use cases

This template is a good fit for:

- personal AI assistant hosting
- secure chat and memory workflows
- routine and job automation
- hosted demos of IronClaw
- fast Railway-based evaluation environments

## Important notes

- This repository is a Railway deployment wrapper, not the upstream IronClaw project itself.
- The upstream project remains the source for IronClaw application development.
- This wrapper focuses specifically on reliable Railway deployment behavior.

## Upstream project

Original project:

https://github.com/nearai/ironclaw

## Credits

- Upstream project: nearai/ironclaw
- Railway deployment wrapper: this repository

## Suggested tags

railway, ironclaw, ai-assistant, rust, postgresql, pgvector, self-hosted, automation

## License

Review the upstream IronClaw license before redistributing or publishing derivative deployment wrappers.
