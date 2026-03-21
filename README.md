# ironclaw-railway

Deploy IronClaw on Railway with PostgreSQL + pgvector.

Railway-ready wrapper for deploying [IronClaw](https://github.com/nearai/ironclaw) with PostgreSQL and pgvector.

## What this repo does

The upstream IronClaw project is not directly optimized for Railway public networking in its default form. This wrapper makes it easier to deploy IronClaw on Railway by adding a small public-facing proxy layer and a simple container entrypoint suitable for Railway.

This setup is designed to work with:

* IronClaw app service
* PostgreSQL service with pgvector
* Railway private networking
* Railway public HTTP domain for the app

## Included files

* `Dockerfile` — builds IronClaw and packages the Railway-ready runtime
* `Caddyfile` — exposes Railway's public port and proxies traffic to IronClaw
* `docker-entrypoint.sh` — starts IronClaw and the proxy inside the container

## Services required in Railway

This deployment uses 2 services:

1. `ironclaw` — this repo
2. `Postgres` — Docker image using pgvector

Recommended Postgres image:

```
pgvector/pgvector:pg16-trixie
```

## Railway variables

### IronClaw service

```
DATABASE_URL=postgresql://${{Postgres.POSTGRES_USER}}:${{Postgres.POSTGRES_PASSWORD}}@Postgres.railway.internal:5432/${{Postgres.POSTGRES_DB}}?sslmode=disable
LLM_BACKEND=openai
OPENAI_API_KEY=your_openai_api_key
SANDBOX_ENABLED=false
```

### Postgres service

```
POSTGRES_DB=ironclaw
POSTGRES_USER=ironclaw
POSTGRES_PASSWORD=${{ secret(16) }}
PGDATA=/var/lib/postgresql/data/pgdata
```

## Railway networking

### IronClaw service

* Public HTTP domain: enabled

### Postgres service

* Public domain: disabled
* Volume: enabled

Recommended volume mount path for Postgres:

```
/var/lib/postgresql/data
```

## Notes

* IronClaw may log a local gateway URL with a token during startup.
* If needed, use your Railway public domain together with the token query string shown in the logs.
* Docker sandbox features are disabled in this setup because Railway does not provide Docker-in-Docker in this deployment model.

## Suggested GitHub topics

* railway
* ironclaw
* ai-assistant
* rust
* postgresql
* pgvector
* self-hosted
* railway-template

## Credits

* Upstream project: [nearai/ironclaw](https://github.com/nearai/ironclaw)
* This repo is a Railway deployment wrapper and is not the original IronClaw project.

## License

Review the upstream IronClaw license before publishing or redistributing this wrapper.
