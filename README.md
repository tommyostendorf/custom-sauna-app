# Insaunity — a better way to control your infrared sauna

A free, open-source, **local-first** app to control a Clearlight®/Jacuzzi®-style infrared
sauna (any model with the Gizwits WiFi module) — power, temperature, timer, lights,
presets, "ready by" smart scheduling, session + cold-plunge tracking, music control, and
notifications. **No cloud account, no subscription.**

> Independent community project. Not affiliated with or endorsed by Clearlight or Jacuzzi;
> "Clearlight" and "Jacuzzi" are trademarks of their respective owners. Works *with*
> compatible saunas.

## ⚠️ Safety & disclaimer
This software controls a high-heat appliance. **Use entirely at your own risk.** Never
leave a heating sauna unattended, keep it clear of anything flammable, and always follow
your sauna's official safety guidance. Provided **as-is with no warranty** (see LICENSE).
Chromotherapy color descriptions reflect **wellness tradition only and are not medical
advice or claims.**

## How it works
Infrared saunas with the WiFi module speak a binary **Gizwits** protocol on the **local
network only** — so a phone can't talk to one directly. Insaunity uses a small always-on
**bridge** on your home network that speaks the protocol and serves the app.

```
[Sauna] ←LAN protocol→ [Bridge device]  ── serves ──>  [App in your phone's browser]
                              │
                    (optional) Tailscale for remote access
                    (optional) IR blaster for chromotherapy
```

The recommended setup is a tiny **plug-in device** (e.g. a Raspberry Pi) that runs the
bridge **and serves the app itself** — so you just open `http://sauna.local` on your phone,
on your home WiFi, with zero configuration and zero cloud.

## Tiers (add what you want)
1. **Local (default):** full control + tracking on your home WiFi. Add it to your Home
   Screen for an app-like experience.
2. **Remote (optional):** reach it from anywhere via **Tailscale** (free) — also enables
   push notifications (which need HTTPS). Guided in-app.
3. **Chromotherapy (optional):** add a Wi-Fi **IR blaster** (Broadlink RM-style); learn your
   chromo remote's codes once, then pick colors in the app.

## Repo layout
- **`bridge/`** — Node/TypeScript service: speaks the Gizwits protocol, exposes a small HTTP
  API, and (in production) serves the built app. Reuses the protocol engine from
  [homebridge-clearlight-sauna](https://github.com/Mustavo/homebridge-clearlight-sauna) (ISC).
- **`web/`** — Next.js PWA (static export). Talks to the bridge same-origin by default.

## Run it (developer / DIY)
```bash
# Build the app (static export)
cd web && npm install && npm run build      # outputs web/out

# Run the bridge (serves the app + API, finds the sauna automatically)
cd ../bridge && npm install && npm run build && npm start
# then open http://<this-machine>:8787
```
A turnkey Raspberry Pi installer and a full build guide (parts list, flashing, IR wiring)
are in progress — see the plan.

## Credits & licence
Protocol engine adapted from `homebridge-clearlight-sauna` (ISC). This project is offered
free to the community.
