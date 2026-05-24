#!/usr/bin/env bash
#
# One-shot setup for running the sauna bridge on an always-on Mac (e.g. the iMac).
# Installs Homebrew/Node/git if needed, fetches the code, builds the bridge,
# installs it as a launchd service (auto-starts on boot, restarts on crash),
# and publishes it over Tailscale. Safe to re-run.
#
# Run it with:
#   curl -fsSL https://raw.githubusercontent.com/tommyostendorf/custom-sauna-app/main/bridge/setup-imac.sh | bash
#
set -euo pipefail

REPO="https://github.com/tommyostendorf/custom-sauna-app.git"
DIR="$HOME/Projects/custom-sauna-app"
PORT=8787

echo "=== Insaunity sauna bridge — Mac setup ==="

# --- Homebrew ---
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
if ! command -v brew >/dev/null 2>&1; then
  echo ">> Installing Homebrew (you may be prompted for your Mac password)…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
fi

# --- git + node ---
command -v git  >/dev/null 2>&1 || { echo ">> Installing git…";  brew install git;  }
command -v node >/dev/null 2>&1 || { echo ">> Installing Node…"; brew install node; }

# --- code ---
if [ -d "$DIR/.git" ]; then
  echo ">> Updating existing checkout…"; git -C "$DIR" pull --ff-only
else
  echo ">> Cloning repo…"; mkdir -p "$HOME/Projects"; git clone "$REPO" "$DIR"
fi

# --- build bridge ---
cd "$DIR/bridge"
echo ">> Installing dependencies…"; npm install
echo ">> Building…"; npm run build

# --- config (the bridge auto-finds the sauna if this IP is wrong) ---
if [ ! -f .env ]; then
  cat > .env <<EOF
SAUNA_HOST=192.168.86.216
PORT=$PORT
BRIDGE_TOKEN=
ALLOWED_ORIGINS=*
EOF
  echo ">> Wrote default .env"
fi

# --- launchd service (always-on) ---
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
  echo ""
  echo ">> Bridge is published on your tailnet at:"
  "$TS" serve status || true
else
  echo "!! Tailscale CLI not found — make sure the Tailscale app is installed and signed in."
fi

echo ""
echo "=== Done! Local check: ==="
curl -s "http://localhost:$PORT/api/health" || true
echo ""
echo "Send Claude the https://….ts.net URL shown above so it can point the app at this bridge."
