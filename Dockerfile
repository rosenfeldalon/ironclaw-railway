FROM rust:1.95-slim-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev cmake gcc g++ git python3 \
    && rm -rf /var/lib/apt/lists/* \
    && rustup target add wasm32-wasip2 \
    && cargo install wasm-tools

WORKDIR /build

ARG IRONCLAW_REPO=https://github.com/nearai/ironclaw.git
ARG IRONCLAW_REF=ironclaw-v0.27.0
RUN git clone --depth 1 --branch "${IRONCLAW_REF}" "${IRONCLAW_REPO}" /build/ironclaw

WORKDIR /build/ironclaw

COPY patches/0001-wasm-workspace-reader.patch /tmp/0001-wasm-workspace-reader.patch
COPY patches/0002-recipient-first-notification-routing.patch /tmp/0002-recipient-first-notification-routing.patch
COPY patches/0003-simon-daily-briefing-clean-notifications.patch /tmp/0003-simon-daily-briefing-clean-notifications.patch
RUN git apply /tmp/0001-wasm-workspace-reader.patch
RUN git apply /tmp/0002-recipient-first-notification-routing.patch
RUN git apply /tmp/0003-simon-daily-briefing-clean-notifications.patch

RUN cargo build --release --bin ironclaw

FROM caddy:2.10.2-builder AS caddy_builder
RUN xcaddy build

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 bash curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/ironclaw/target/release/ironclaw /usr/local/bin/ironclaw
COPY --from=builder /build/ironclaw/migrations /app/migrations
COPY --from=caddy_builder /usr/bin/caddy /usr/bin/caddy

COPY Caddyfile /etc/caddy/Caddyfile
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && useradd -m -u 1000 -s /bin/bash ironclaw

USER ironclaw
WORKDIR /home/ironclaw

ENV RUST_LOG=ironclaw=info
ENV SANDBOX_ENABLED=false

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
