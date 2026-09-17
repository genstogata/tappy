#!/usr/bin/env bash
#
# Bump the Tappy version in one command.
#
# Two strings must stay in lockstep:
#   app.js            APP_VERSION = "vNN"          (shown in the footer)
#   service-worker.js CACHE_NAME  = "tappy-cache-vNN"  (forces browsers to
#                                                       pick up new files)
#
# If they drift apart, the service worker keeps serving stale files to anyone
# who has already visited. This script updates both atomically, and CI fails
# the build if they ever disagree.
#
# The Docker image tag is derived from APP_VERSION by the publish workflow, so
# bumping here is all that is needed to cut a new image version.
#
# Usage:
#   scripts/bump-version.sh 31        # -> v31
#   scripts/bump-version.sh v31.1     # -> v31.1
#   scripts/bump-version.sh           # show the current version

set -euo pipefail

cd "$(dirname "$0")/.."

APP_JS="app.js"
SW_JS="service-worker.js"

read_version() {
  sed -n 's/.*APP_VERSION = "v\([0-9][0-9.]*\)".*/\1/p' "$APP_JS" | head -1
}

read_cache() {
  sed -n 's/.*CACHE_NAME = "tappy-cache-v\([0-9][0-9.]*\)".*/\1/p' "$SW_JS" | head -1
}

CURRENT="$(read_version)"
CURRENT_CACHE="$(read_cache)"

if [ -z "$CURRENT" ]; then
  echo "error: could not read APP_VERSION from $APP_JS" >&2
  exit 1
fi

if [ -z "${1:-}" ]; then
  echo "Current version: v$CURRENT"
  if [ "$CURRENT" != "$CURRENT_CACHE" ]; then
    echo "WARNING: $SW_JS CACHE_NAME is v$CURRENT_CACHE — out of sync!" >&2
    exit 1
  fi
  echo "Usage: $0 <new-version>   e.g. $0 $((CURRENT + 1))"
  exit 0
fi

NEW="${1#v}"

if ! printf '%s' "$NEW" | grep -Eq '^[0-9]+(\.[0-9]+)*$'; then
  echo "error: version must be digits and dots, e.g. 31 or 31.1 (got '$1')" >&2
  exit 1
fi

if [ "$NEW" = "$CURRENT" ]; then
  echo "Already at v$NEW — nothing to do."
  exit 0
fi

# Portable in-place edit: write to a temp file and move it, so this works with
# both BSD sed (macOS) and GNU sed (Linux/CI) without -i flag differences.
#
# The temp file's mode is copied from the original before the move. mktemp
# creates files as 0600, and `mv` preserves that — which would silently strip
# read permissions from app.js/service-worker.js and make them unreadable to
# the nginx user inside the Docker image (403 Forbidden).
edit() {
  local file="$1" pattern="$2" tmp
  tmp="$(mktemp)"
  sed "$pattern" "$file" > "$tmp"
  chmod --reference="$file" "$tmp" 2>/dev/null || chmod "$(stat -f '%Lp' "$file" 2>/dev/null || stat -c '%a' "$file")" "$tmp"
  mv "$tmp" "$file"
}

edit "$APP_JS" "s/APP_VERSION = \"v[0-9][0-9.]*\"/APP_VERSION = \"v$NEW\"/"
edit "$SW_JS"  "s/CACHE_NAME = \"tappy-cache-v[0-9][0-9.]*\"/CACHE_NAME = \"tappy-cache-v$NEW\"/"

# Verify both landed, rather than trusting the sed above.
FINAL_APP="$(read_version)"
FINAL_CACHE="$(read_cache)"

if [ "$FINAL_APP" != "$NEW" ] || [ "$FINAL_CACHE" != "$NEW" ]; then
  echo "error: bump failed (app.js=v$FINAL_APP, service-worker.js=v$FINAL_CACHE)" >&2
  exit 1
fi

echo "Bumped v$CURRENT -> v$NEW"
echo "  $APP_JS            APP_VERSION = \"v$NEW\""
echo "  $SW_JS  CACHE_NAME  = \"tappy-cache-v$NEW\""
echo
echo "Next:"
echo "  git add $APP_JS $SW_JS && git commit -m \"Bump version to v$NEW\""
echo "  git push beta beta"
echo
echo "The publish workflow will tag the image af416/tappy:v$NEW (and :beta)."
