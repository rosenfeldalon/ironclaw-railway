#!/usr/bin/env python3
"""Sync the Simon Pickup widget and layout into a running Gateway workspace."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
WIDGET_ROOT = ROOT / "gateway-widgets" / "simon-pickup-admin"
LAYOUT_PARTIAL_PATH = ROOT / "gateway-widgets" / "pickup-layout.json"
WIDGET_ID = "simon-pickup-admin"
DEFAULT_GATEWAY_BASE_URL = "http://127.0.0.1:8080"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Install the Simon Pickup widget into a running IronClaw Gateway workspace."
    )
    parser.add_argument(
        "--gateway-base-url",
        default=None,
        help="Gateway base URL. Defaults to $GATEWAY_BASE_URL or http://127.0.0.1:8080.",
    )
    parser.add_argument(
        "--gateway-auth-token",
        default=None,
        help="Gateway bearer token. Defaults to $GATEWAY_AUTH_TOKEN.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the merged layout and planned writes without sending them.",
    )
    return parser.parse_args()


def env_or_value(value: str | None, env_name: str) -> str | None:
    if value:
        return value
    return os.environ.get(env_name)


def request_json(
    method: str,
    url: str,
    token: str,
    payload: dict[str, Any] | None = None,
) -> Any:
    body = None
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed with {error.code}: {raw}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"{method} {url} failed: {error.reason}") from error

    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"{method} {url} returned invalid JSON: {raw}") from error


def request_status(method: str, url: str, token: str, payload: dict[str, Any]) -> None:
    request_json(method, url, token, payload)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def merge_dicts(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merged[key] = merge_dicts(base[key], value)
        else:
            merged[key] = value
    return merged


def merge_tab_order(current_order: list[str] | None, desired_order: list[str]) -> list[str]:
    existing = [tab for tab in (current_order or []) if isinstance(tab, str) and tab]
    if not existing:
        return desired_order

    merged = [tab for tab in existing if tab != WIDGET_ID]
    if "settings" in merged:
        index = merged.index("settings")
        merged.insert(index, WIDGET_ID)
    else:
        merged.append(WIDGET_ID)

    for tab_id in desired_order:
        if tab_id not in merged:
            if tab_id == WIDGET_ID and "settings" in merged:
                merged.insert(merged.index("settings"), WIDGET_ID)
            else:
                merged.append(tab_id)

    return merged


def build_layout(current: dict[str, Any], partial: dict[str, Any]) -> dict[str, Any]:
    merged = merge_dicts(current, partial)
    desired_order = partial.get("tabs", {}).get("order", [])
    tabs = dict(current.get("tabs", {}))
    tabs.update(partial.get("tabs", {}))
    tabs["order"] = merge_tab_order(current.get("tabs", {}).get("order"), desired_order)
    merged["tabs"] = tabs
    return merged


def write_widget_file(base_url: str, token: str, target_path: str, source_path: Path) -> None:
    request_status(
        "POST",
        f"{base_url}/api/memory/write",
        token,
        {
            "path": target_path,
            "content": source_path.read_text(encoding="utf-8"),
            "append": False,
        },
    )


def main() -> int:
    args = parse_args()
    base_url = env_or_value(args.gateway_base_url, "GATEWAY_BASE_URL") or DEFAULT_GATEWAY_BASE_URL
    token = env_or_value(args.gateway_auth_token, "GATEWAY_AUTH_TOKEN")

    if not token:
        print("Missing Gateway auth token. Set GATEWAY_AUTH_TOKEN or pass --gateway-auth-token.", file=sys.stderr)
        return 1

    partial = load_json(LAYOUT_PARTIAL_PATH)
    try:
        current_layout = request_json("GET", f"{base_url}/api/frontend/layout", token) or {}
    except RuntimeError as error:
        if not args.dry_run:
            raise
        current_layout = {}
        print(f"Warning: {error}", file=sys.stderr)
        print("Continuing dry-run with an empty current layout.", file=sys.stderr)
    merged_layout = build_layout(current_layout, partial)

    writes = [
        (
            f".system/gateway/widgets/{WIDGET_ID}/manifest.json",
            WIDGET_ROOT / "manifest.json",
        ),
        (
            f".system/gateway/widgets/{WIDGET_ID}/index.js",
            WIDGET_ROOT / "index.js",
        ),
        (
            f".system/gateway/widgets/{WIDGET_ID}/style.css",
            WIDGET_ROOT / "style.css",
        ),
    ]

    if args.dry_run:
        print("Merged layout:")
        print(json.dumps(merged_layout, indent=2))
        print("")
        print("Planned widget writes:")
        for target_path, source_path in writes:
            print(f"- {source_path} -> {target_path}")
        return 0

    request_status("PUT", f"{base_url}/api/frontend/layout", token, merged_layout)
    for target_path, source_path in writes:
        write_widget_file(base_url, token, target_path, source_path)

    print(f"Updated layout and synced widget '{WIDGET_ID}' to {base_url}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
