#!/usr/bin/env bash
# Merge plants-centered / plants-nomound handoff zip (sprites + plant-meta.json).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="${1:?usage: apply-plants-handoff.sh /path/to/plants-handoff.zip}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q -o "$ZIP" -d "$TMP"
if [[ ! -d "$TMP/assets/plants" ]]; then
  echo "Expected assets/plants/ in zip" >&2
  exit 1
fi
cp -a "$TMP/assets/plants/." "$ROOT/assets/plants/"
node "$ROOT/scripts/sync-plants-art-from-meta.js"
echo "Applied plant handoff and synced renderer/art.js"