#!/usr/bin/env bash
set -euo pipefail

mkdir -p "${HOME}/.ironclaw"

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
HTTP_HOST=${HTTP_HOST:-0.0.0.0}
HTTP_PORT=${HTTP_PORT:-8081}
HTTP_WEBHOOK_SECRET=${HTTP_WEBHOOK_SECRET:-}
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
