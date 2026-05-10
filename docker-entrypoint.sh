#!/usr/bin/env bash
set -euo pipefail

mkdir -p "${HOME}/.ironclaw"

# Keep the gateway auth scope aligned with the runtime owner scope when
# Railway only provides one of the two variables.
if [ -n "${IRONCLAW_OWNER_ID:-}" ] && [ -z "${GATEWAY_USER_ID:-}" ]; then
  export GATEWAY_USER_ID="${IRONCLAW_OWNER_ID}"
fi
if [ -n "${GATEWAY_USER_ID:-}" ] && [ -z "${IRONCLAW_OWNER_ID:-}" ]; then
  export IRONCLAW_OWNER_ID="${GATEWAY_USER_ID}"
fi

write_ironclaw_env() {
  cat > "${HOME}/.ironclaw/.env" <<EOF
DATABASE_URL=${DATABASE_URL:-}
LLM_BACKEND=${LLM_BACKEND:-ollama}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
LLM_MODEL=${LLM_MODEL:-}
LLM_API_KEY=${LLM_API_KEY:-}
LLM_BASE_URL=${LLM_BASE_URL:-}
SECRETS_MASTER_KEY=${SECRETS_MASTER_KEY:-}
ONBOARD_COMPLETED=${ONBOARD_COMPLETED:-true}
SANDBOX_ENABLED=${SANDBOX_ENABLED:-false}
HEARTBEAT_ENABLED=${HEARTBEAT_ENABLED:-false}
EMBEDDING_ENABLED=${EMBEDDING_ENABLED:-false}
GATEWAY_ENABLED=${GATEWAY_ENABLED:-true}
GATEWAY_HOST=${GATEWAY_HOST:-127.0.0.1}
GATEWAY_PORT=${GATEWAY_PORT:-3000}
GATEWAY_AUTH_TOKEN=${GATEWAY_AUTH_TOKEN:-}
GATEWAY_USER_ID=${GATEWAY_USER_ID:-}
HTTP_HOST=${HTTP_HOST:-0.0.0.0}
HTTP_PORT=${HTTP_PORT:-8081}
HTTP_WEBHOOK_SECRET=${HTTP_WEBHOOK_SECRET:-}
IRONCLAW_OWNER_ID=${IRONCLAW_OWNER_ID:-}
OAUTH_BASE_URL=${OAUTH_BASE_URL:-}
TUNNEL_URL=${TUNNEL_URL:-}
EOF
}

write_ironclaw_env

if [ -z "${PORT:-}" ]; then
  export PORT=8080
fi

export IRONCLAW_FORCE_ACTIVE_WASM_CHANNELS="${IRONCLAW_FORCE_ACTIVE_WASM_CHANNELS:-simon_telegram_channel}"

/usr/local/bin/simon-preseed-extensions.sh

if [ "$#" -gt 0 ]; then
  if [ "$1" = "ironclaw" ]; then
    exec "$@"
  fi
  exec ironclaw "$@"
fi

redact_ironclaw_log() {
  sed -u -E \
    -e 's/token=[^[:space:]]+/token=[redacted]/g' \
    -e 's/(GATEWAY_AUTH_TOKEN=)[^[:space:]]+/\1[redacted]/g'
}

ironclaw --no-onboard 2>&1 | redact_ironclaw_log &
IRONCLAW_PID=$!

sleep 5

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
CADDY_PID=$!

cleanup() {
  kill "$CADDY_PID" "$IRONCLAW_PID" 2>/dev/null || true
}

trap cleanup SIGINT SIGTERM

wait -n "$IRONCLAW_PID" "$CADDY_PID"
exit $?
