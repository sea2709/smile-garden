#!/usr/bin/env bash
# Merge Heily critters-handoff.zip (assets/critters + day backgrounds) into repo assets/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="${1:?usage: apply-critters-handoff.sh /path/to/critters-handoff.zip}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q -o "$ZIP" -d "$TMP"
cp -a "$TMP/assets/." "$ROOT/assets/"
echo "Merged critters handoff into $ROOT/assets/"