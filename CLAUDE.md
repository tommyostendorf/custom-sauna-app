# Custom Sauna App — Project Rules

## What this is
A custom app to control Tommy's Clearlight infrared sauna over the local network,
replacing the bad official cloud app. Talks to the sauna directly via its Gizwits LAN
protocol — no cloud, no subscription.

## Architecture (two parts)
- **`bridge/`** — a small always-on Node.js + TypeScript service. It speaks the Gizwits
  protocol to the sauna and exposes a simple HTTP REST API. This is the only thing that
  touches the sauna. Runs on the iMac in production; developed/tested on the MacBook.
- **`web/`** — a Next.js static-export PWA (the UI). Only calls the bridge API; never
  speaks the sauna protocol directly. The bridge serves this app same-origin, and
  **Tailscale** exposes the bridge so the phone can reach it from any network. One-command
  install + auto-start on the iMac: `bridge/setup-imac.sh`.

## Network access & security
- The bridge has **no auth by default** and controls a heater, so access control is
  network-level: it binds to **`127.0.0.1` only** (`BIND_HOST`, default localhost), so the
  *only* way in is via **Tailscale** (`tailscale serve` proxies the tailnet → localhost).
  Other devices on the WiFi can't reach it. Set `BIND_HOST=0.0.0.0` to expose on the LAN.
- Debugging consequence: from another machine, hit the bridge at its **Tailscale HTTPS URL**
  (e.g. `https://<host>.<tailnet>.ts.net/api/health`), NOT `IP:8787` (that port is now
  closed off-box). On the iMac itself, `curl localhost:8787` still works.

## Direction note (2026-05-26)
A native iOS/App-Store app via **Capacitor** (sauna protocol running on the phone, no
bridge) was explored and **abandoned**. Reason: the sauna is 2.4GHz-only and usually sits
on a different network than the phone, so LAN-only native can't reach it; Tailscale + the
bridge already solve cross-network access. This is a **hobby** project, not commercial.
The native experiment is archived on branch `feature/capacitor-mobile` (do not merge).
See project memory `insaunity-mobile-pivot.md`. Don't re-attempt native without a new reason.

## How the sauna is reached
- Connect by **direct IP** (currently `192.168.86.216` — **source of truth is
  `bridge/.env` `SAUNA_HOST`**; it drifts on reboots, was `.48` originally), NOT broadcast
  discovery — Google WiFi mesh drops the discovery broadcast and the sauna's responder is flaky.
- The sauna is **2.4GHz-only** and joins via a Linksys extender ("barlow_ext") that bridges
  it onto the Google network. Keep that extender powered/online — it's the linchpin.
- A DHCP reservation was attempted but hasn't held; the bridge can also auto-find the sauna.
- The sauna's main power must be ON for the WiFi module to answer on the LAN. **Don't
  wall-power-cycle it casually** — the 2.4GHz module is slow/flaky to rejoin WiFi.
- Protocol facts: TCP control port 12416; temps are Fahrenheit internally; timer in minutes.

## Protocol engine
`bridge/src/gizwits/{protocol,discovery,device}.ts` is reused from the open-source
`Mustavo/homebridge-clearlight-sauna` (ISC licence). `discovery.ts` was patched to use
subnet-directed broadcast; `device.ts` gained `setDelayedStart` / `cancelDelayedStart`.
Don't rewrite the wire format.

## Running the bridge
```
cd bridge
npm install
npm run dev      # ts-node, reads .env
```
Test: `curl localhost:8787/api/status` (sauna must be powered on).

## Standard rules
- Never commit `.env` (already gitignored). Secrets only in `.env`.
- New branch for features; confirm before pushing to main.
- Plain-English explanations; readable, commented code.
