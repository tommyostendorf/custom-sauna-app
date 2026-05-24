#!/usr/bin/env bash
#
# One-shot setup for running the sauna bridge on an always-on Mac (e.g. the iMac).
# NO admin / password required: installs Node in user space (nvm), downloads the
# code (no git/Homebrew), builds the bridge, installs it as a per-user launchd
# service (auto-start on boot, restart on crash), and publishes it over Tailscale.
# Safe to re-run (preserves your .env and saved data).
#
# Run it with:
#   curl -fsSL https://raw.githubusercontent.com/tommyostendorf/custom-sauna-app/main/bridge/setup-imac.sh | bash
#
set -euo pipefail

DIR="$HOME/Projects/custom-sauna-app"
PORT=8787
echo "=== Insaunity sauna bridge — Mac setup (no admin required) ==="

# --- Node: use any existing install, else install via nvm (user-space, no password) ---
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
for p in /opt/homebrew/bin /usr/local/bin; do [ -x "$p/node" ] && export PATH="$p:$PATH"; done

if ! command -v node >/dev/null 2>&1; then
  echo ">> Installing Node in your user space (no password needed)…"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
  nvm install --lts
fi
echo ">> Node $(node -v), npm $(npm -v)"

# --- Code: download tarball (no git, no admin) ---
echo ">> Fetching app code…"
mkdir -p "$HOME/Projects"
TMP="$(mktemp -d)"
curl -fsSL https://github.com/tommyostendorf/custom-sauna-app/archive/refs/heads/main.tar.gz | tar xz -C "$TMP"
# preserve existing config + data across re-runs
[ -f "$DIR/bridge/.env" ] && cp "$DIR/bridge/.env" "$TMP/keep.env"
[ -d "$DIR/bridge/data" ] && cp -R "$DIR/bridge/data" "$TMP/keep-data"
rm -rf "$DIR"
mv "$TMP/custom-sauna-app-main" "$DIR"
[ -f "$TMP/keep.env" ] && mv "$TMP/keep.env" "$DIR/bridge/.env"
[ -d "$TMP/keep-data" ] && mv "$TMP/keep-data" "$DIR/bridge/data"
rm -rf "$TMP"

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
  echo ""; echo ">> Published on your tailnet:"; "$TS" serve status || true
else
  echo "!! Tailscale CLI not found — open/sign in to the Tailscale app, then re-run this."
fi

echo ""; echo "=== Local check ==="; curl -s "http://localhost:$PORT/api/health" || true
echo ""; echo ">> Send Claude the https://….ts.net URL shown above."
