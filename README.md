# ironclaw-railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/ironclaw?referralCode=4pD7Sc&utm_medium=integration&utm_source=template&utm_campaign=generic)

Railway-ready deployment wrapper for IronClaw, tuned for Simon's self-hosted migration path.

The current wrapper baseline is upstream IronClaw `ironclaw-v0.28.0`. The live Simon Railway runtime stays on `0.27.0` until the local lab canary passes.

## Purpose

This repository keeps the Railway runtime buildable and Simon-compatible without forking IronClaw wholesale. It exists to:

- build a hosted-safe IronClaw image
- apply the Simon runtime patch stack during the Docker build
- preserve a non-interactive Railway startup path
- keep the CLI and HTTP gateway usable for diagnostics
- preseed the current Simon install pack for local and hosted readiness checks

## Build Baseline

The Dockerfile clones upstream IronClaw from:

- repo: `https://github.com/nearai/ironclaw.git`
- ref: `ironclaw-v0.28.0`

Override `IRONCLAW_REPO` or `IRONCLAW_REF` only when intentionally testing a different upstream source.

## Patch Stack

The current wrapper applies these patches in order:

1. `0001-wasm-workspace-reader.patch`
   Carry forward. Wires workspace reads into WASM tools and exposes the workspace resolver for later notification-target logic.
2. `0002-recipient-first-notification-routing.patch`
   Simon-specific keep. Rebases Simon's recipient-first notification routing onto `0.28.0`, using the upstream Slack-fix lessons: preserve trusted routing metadata, prefer concrete channel targets over owner fallback, and surface provider delivery errors instead of silently treating them as success.
3. `0003-simon-daily-briefing-clean-notifications.patch`
   Simon-specific keep. Keeps Simon daily briefing notifications clean and bounded.
4. `0004-force-active-wasm-channels.patch`
   Simon-specific keep. Forces the required Simon WASM channel active at startup in hosted contexts.

`0005-wasm-channel-shared-workspace-durable-state.patch` is intentionally not applied in this slice. Its shared-workspace and durable-state behavior is now substantially present upstream in `0.28.0`, so it is a candidate for later reevaluation rather than a live wrapper dependency.

## Simon Install-Pack Baseline

The preseed script keeps the current Simon pack versions:

- `simon_telegram_channel` `1.16`
- `simon_google_calendar` `0.2.8`
- `simon_daily_briefing` `0.2.1`
- `simon_family_identity` `0.1.0`
- `simon_setup` `0.1.0`

Do not bump these here unless `0.28.0` proves a real compatibility break.

## Railway Shape

This wrapper still provides:

- non-interactive startup for hosted deployment
- a public proxy in front of the internal IronClaw gateway
- port separation between the proxy and webhook channel
- PostgreSQL persistence with pgvector support
- the `ironclaw` CLI in the running container for diagnostics

Recommended port split:

- public wrapper: `8080`
- HTTP webhook channel: `8081`
- internal IronClaw gateway: `3000`

## Validation Goal For This Slice

This repository is ready for the `0.28` prep slice when:

- the patch stack applies cleanly to upstream `ironclaw-v0.28.0`
- the resulting `ironclaw` binary builds and starts locally
- the Simon lab canary passes against that chosen binary/build

This slice does not include a live Railway upgrade.

## Deploy

Click the button above, or use this link directly:

https://railway.com/deploy/ironclaw?referralCode=4pD7Sc&utm_medium=integration&utm_source=template&utm_campaign=generic

## Upstream

- IronClaw upstream: https://github.com/nearai/ironclaw
- Simon docs authority: `/Users/alonr/projects/simon-docs/docs/ironclaw/railway-0-28-migration.md`
