#!/usr/bin/env bash
# Build & run the Flutter mobile app pointed at the dev API.
#
# Picks the API base URL in this order of preference:
#   1. ALP_API_BASE_URL env var if already set
#   2. apps/mobile/.env.local (copy from .env.local.example)
#   3. Auto-detected Windows host LAN IP (works on WSL2 + mirrored networking)
#
# Usage:
#   ./scripts/run-mobile.sh              # uses default device flutter picks
#   ./scripts/run-mobile.sh -d <id>      # pick a specific device
#   FLUTTER_DEVICE=chrome ./scripts/run-mobile.sh   # also works
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

ENV_FILE="$ROOT/apps/mobile/.env.local"
if [ -z "${ALP_API_BASE_URL:-}" ] && [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    set -a; . "$ENV_FILE"; set +a
fi

if [ -z "${ALP_API_BASE_URL:-}" ]; then
    # Fall back: try to detect the Windows host LAN IP from inside WSL.
    HOST_IP=""
    if command -v powershell.exe >/dev/null 2>&1; then
        HOST_IP=$(powershell.exe -NoProfile -Command \
            "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.InterfaceAlias -match 'Wi-Fi|Ethernet' -and \$_.IPAddress -notlike '169.254.*' -and \$_.IPAddress -notlike '127.*' } | Select-Object -First 1 -ExpandProperty IPAddress)" \
            2>/dev/null | tr -d '\r\n[:space:]')
    fi
    if [ -n "$HOST_IP" ]; then
        ALP_API_BASE_URL="http://$HOST_IP:35173/api/v1"
        echo "Auto-detected Windows host IP: $HOST_IP"
    else
        ALP_API_BASE_URL="http://10.0.2.2:35173/api/v1"
        echo "Falling back to Android-emulator loopback: $ALP_API_BASE_URL"
    fi
fi

echo "ALP_API_BASE_URL=$ALP_API_BASE_URL"
echo

cd apps/mobile

DEVICE_ARGS=""
if [ -n "${FLUTTER_DEVICE:-}" ]; then
    DEVICE_ARGS="-d $FLUTTER_DEVICE"
fi

# Pass through any user-supplied flags after our --dart-define.
# shellcheck disable=SC2086
exec flutter run \
    --dart-define=ALP_API_BASE_URL="$ALP_API_BASE_URL" \
    $DEVICE_ARGS \
    "$@"
