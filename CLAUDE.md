# Custom Sauna App — Project Rules

## What this is
A custom app to control Tommy's Clearlight infrared sauna over the local network,
replacing the bad official cloud app. Talks to the sauna directly via its Gizwits LAN
protocol — no cloud, no subscription.

## Architecture (two parts)
- **`bridge/`** — a small always-on Node.js + TypeScript service. It speaks the Gizwits
  protocol to the sauna and exposes a simple HTTP REST API. This is the only thing that
  touches the sauna. Runs on the iMac in production; developed/tested on the MacBook.
- **(root, coming next)** — a Next.js PWA on Vercel. The UI. Only calls the bridge API;
  never speaks the sauna protocol directly.

## How the sauna is reached
- Connect by **direct IP** (currently `192.168.86.48`), NOT broadcast discovery —
  Google WiFi mesh drops the discovery broadcast and the sauna's responder is flaky.
- Pin the IP with a **DHCP reservation** in the Google Home app so it never changes.
- The sauna's main power must be ON for the WiFi module to answer on the LAN.
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
