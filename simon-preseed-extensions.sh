#!/usr/bin/env bash
set -euo pipefail

if [ "${SIMON_EXTENSION_PRESEED_ENABLED:-true}" != "true" ]; then
  echo "Simon extension preseed disabled"
  exit 0
fi

TOOLS_DIR="${WASM_TOOLS_DIR:-${HOME}/.ironclaw/tools}"
CHANNELS_DIR="${WASM_CHANNELS_DIR:-${HOME}/.ironclaw/channels}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

install_bundle() {
  local name="$1"
  local kind="$2"
  local url="$3"
  local target_dir

  case "${kind}" in
    wasm_channel) target_dir="${CHANNELS_DIR}" ;;
    wasm_tool) target_dir="${TOOLS_DIR}" ;;
    *)
      echo "Unknown Simon extension kind for ${name}: ${kind}" >&2
      return 1
      ;;
  esac

  local bundle="${TMP_DIR}/${name}.tar.gz"
  local unpack="${TMP_DIR}/${name}"
  mkdir -p "${target_dir}" "${unpack}"

  echo "Preseeding Simon ${kind} ${name}"
  curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 15 --max-time 120 \
    "${url}" \
    -o "${bundle}"

  tar -xzf "${bundle}" -C "${unpack}"

  if [ ! -f "${unpack}/${name}.wasm" ]; then
    echo "Bundle for ${name} did not contain ${name}.wasm" >&2
    return 1
  fi
  if [ ! -f "${unpack}/${name}.capabilities.json" ]; then
    echo "Bundle for ${name} did not contain ${name}.capabilities.json" >&2
    return 1
  fi

  install -m 0644 "${unpack}/${name}.wasm" "${target_dir}/${name}.wasm"
  install -m 0644 "${unpack}/${name}.capabilities.json" "${target_dir}/${name}.capabilities.json"
}

CALENDAR_TAG="${SIMON_CALENDAR_EXTENSION_TAG:-ironclaw-simon-calendar-write-2026-05-05}"
SUPPORT_TAG="${SIMON_SUPPORT_EXTENSION_TAG:-ironclaw-simon-install-pack-support-2026-05-05}"
RAW_BASE="${SIMON_EXTENSION_RAW_BASE:-https://raw.githubusercontent.com/rosenfeldalon/simon-ironclaw-extensions}"

install_bundle \
  simon_telegram_channel \
  wasm_channel \
  "${RAW_BASE}/${CALENDAR_TAG}/bundles/simon_telegram_channel/1.14.tar.gz"

install_bundle \
  simon_google_calendar \
  wasm_tool \
  "${RAW_BASE}/${CALENDAR_TAG}/bundles/simon_google_calendar/0.2.8.tar.gz"

install_bundle \
  simon_daily_briefing \
  wasm_tool \
  "${RAW_BASE}/${CALENDAR_TAG}/bundles/simon_daily_briefing/0.2.1.tar.gz"

install_bundle \
  simon_family_identity \
  wasm_tool \
  "${RAW_BASE}/${SUPPORT_TAG}/bundles/simon_family_identity/0.1.0.tar.gz"

install_bundle \
  simon_setup \
  wasm_tool \
  "${RAW_BASE}/${SUPPORT_TAG}/bundles/simon_setup/0.1.0.tar.gz"

echo "Simon extension preseed complete"
