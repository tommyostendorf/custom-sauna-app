#!/usr/bin/env bash
#
# One-shot setup for running Insaunity on an always-on Mac.
# NO admin / password: installs Node in user space, downloads the code (no git/
# Homebrew), builds the app + bridge, and runs it as a per-user launchd service
# (auto-start on boot, restart on crash) that serves the app locally on this WiFi.
# Tailscale (optional) is published too if installed, for remote access.
# Safe to re-run (preserves your .env and saved data).
#
# Run it with:
#   curl -fsSL https://raw.githubusercontent.com/tommyostendorf/custom-sauna-app/main/bridge/setup-imac.sh | bash
#
set -euo pipefail

DIR="$HOME/Projects/custom-sauna-app"
PORT=8787
BRANCH="${INSAUNITY_BRANCH:-main}"
echo "=== Insaunity sauna bridge — Mac setup (no admin required) ==="

# --- Node: use any existing install, else download official prebuilt binary ---
# (user-space, no admin, no git, no Xcode tools — the bridge has no native deps)
NODE_HOME="$HOME/.local/node"
for p in "$NODE_HOME/bin" /opt/homebrew/bin /usr/local/bin; do [ -x "$p/node" ] && export PATH="$p:$PATH"; done

if ! command -v node >/dev/null 2>&1; then
  echo ">> Downloading Node (prebuilt, user-space, no password)…"
  NODE_VERSION="v22.12.0"
  case "$(uname -m)" in arm64) NARCH=arm64;; *) NARCH=x64;; esac
  mkdir -p "$NODE_HOME"
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-darwin-$NARCH.tar.gz" \
    | tar xz -C "$NODE_HOME" --strip-components=1
  export PATH="$NODE_HOME/bin:$PATH"
fi
echo ">> Node $(node -v), npm $(npm -v)"

# --- Code: download tarball (no git, no admin) ---
echo ">> Fetching app code ($BRANCH)…"
mkdir -p "$HOME/Projects"
TMP="$(mktemp -d)"
curl -fsSL "https://github.com/tommyostendorf/custom-sauna-app/archive/refs/heads/$BRANCH.tar.gz" | tar xz -C "$TMP"
EXTRACTED="$(find "$TMP" -maxdepth 1 -type d -name 'custom-sauna-app-*' | head -1)"
# preserve existing config + data across re-runs
[ -f "$DIR/bridge/.env" ] && cp "$DIR/bridge/.env" "$TMP/keep.env"
[ -d "$DIR/bridge/data" ] && cp -R "$DIR/bridge/data" "$TMP/keep-data"
rm -rf "$DIR"
mv "$EXTRACTED" "$DIR"
[ -f "$TMP/keep.env" ] && mv "$TMP/keep.env" "$DIR/bridge/.env"
[ -d "$TMP/keep-data" ] && mv "$TMP/keep-data" "$DIR/bridge/data"
rm -rf "$TMP"

# --- Build the app (static export) so the bridge can serve it locally ---
echo ">> Building the app…"
( cd "$DIR/web" && npm install --no-fund --no-audit && NEXT_PUBLIC_BRIDGE_URL= npm run build )

# --- Build bridge ---
cd "$DIR/bridge"
echo ">> Installing dependencies…"; npm install --no-fund --no-audit
echo ">> Building…"; npm run build

# --- .env (the bridge auto-finds the sauna if this IP is wrong) ---
if [ ! -f .env ]; then
  printf 'SAUNA_HOST=192.168.86.216\nPORT=%s\nBRIDGE_TOKEN=\nALLOWED_ORIGINS=*\n' "$PORT" > .env
  echo ">> Wrote default .env"
fi

# --- launchd per-user service (no sudo) ---
NODE_BIN="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/com.insaunity.bridge.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.insaunity.bridge</string>
  <key>ProgramArguments</key><array>
    <string>$NODE_BIN</string><string>$DIR/bridge/dist/server.js</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR/bridge</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/bridge/bridge.log</string>
  <key>StandardErrorPath</key><string>$DIR/bridge/bridge.log</string>
</dict></plist>
EOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo ">> Bridge service installed and started (auto-starts on boot)."
sleep 3

# --- Tailscale publish ---
TS="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
[ -x "$TS" ] || TS="$(command -v tailscale || true)"
if [ -n "${TS:-}" ] && [ -x "$TS" ]; then
  "$TS" serve --bg "$PORT" || true
  echo ""; echo ">> Also published over Tailscale (for remote access):"; "$TS" serve status || true
else
  echo ">> (Tailscale not installed — that's fine; it's only needed for remote access.)"
fi

echo ""; echo "=== Done! ==="
curl -s "http://localhost:$PORT/api/health" >/dev/null && echo "Bridge is running."
echo ""
echo "Open Insaunity on a phone on this same WiFi at:"
echo "    http://$(hostname -s 2>/dev/null || hostname).local:$PORT"
echo "(or http://localhost:$PORT on this computer). Then Add to Home Screen."
