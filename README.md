# Sauna App — a better way to control your Clearlight® sauna

An independent, self-hosted app to control a Clearlight / Jacuzzi infrared sauna over your
local network — power, temperature, timer, lights, presets, delayed start, and session
history. No cloud account or subscription required.

> Not affiliated with or endorsed by Clearlight or Jacuzzi. "Clearlight" is a trademark of
> its respective owner. This is a community project that works *with* compatible saunas.

## ⚠️ Safety

This software remotely controls a high-heat appliance. Use at your own risk. Never leave a
heating sauna unattended, keep it clear of flammables, and follow your sauna's official
safety guidance. No warranty — see LICENSE.

## How it works

Clearlight saunas with the WiFi module run **Gizwits GAgent** firmware and speak a binary
protocol over the local network. The app has two parts:

- **`bridge/`** — a small always-on Node.js service that speaks the sauna's protocol and
  exposes a simple HTTP API. Runs on any always-on computer on your home network (a Mac, a
  Raspberry Pi, etc.). This is the only thing that talks to the sauna.
- **`web/`** — a Next.js PWA (the interface). It only talks to the bridge.

For remote access (controlling it away from home), the bridge is exposed securely over
**Tailscale**; the web app is deployed to **Vercel**. See the in-app Remote Access guide.

## Quick start (local)

```bash
# Bridge
cd bridge && npm install && cp .env.example .env   # set SAUNA_HOST to your sauna's IP
npm run dev

# Web app (in another terminal)
cd web && npm install && npm run dev                # set NEXT_PUBLIC_BRIDGE_URL in .env.local
```

Find your sauna's IP from your router (pin it with a DHCP reservation). The sauna's main
power must be ON for its WiFi module to respond.

## Credits

The Gizwits protocol engine in `bridge/src/gizwits/` is adapted from the open-source
[homebridge-clearlight-sauna](https://github.com/Mustavo/homebridge-clearlight-sauna)
project (ISC licence).
