const INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/tommyostendorf/custom-sauna-app/main/bridge/setup-imac.sh | bash";

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold text-text">
        <span className="text-ember-soft">{n}.</span> {title}
      </h2>
      <div className="mt-3 flex flex-col gap-2 text-sm text-muted">{children}</div>
    </section>
  );
}

export default function SetupGuide() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
      <a href="/" className="text-sm text-muted">← Back</a>

      <header className="py-1">
        <h1 className="text-2xl font-semibold tracking-tight text-text">Set up Insaunity</h1>
        <p className="mt-2 text-sm text-muted">
          Your sauna only talks on your home WiFi, so a small always-on helper — the
          <span className="text-text"> bridge</span> — runs on a computer at home and serves this
          app. Pick where it runs, then open the app on your phone. No account, no cloud required.
        </p>
      </header>

      <Section n="1" title="Pick where the bridge runs">
        <p>
          <span className="text-text">Easiest — a computer you leave on</span>{" "}
          (a Mac that&apos;s usually awake). Free if you already have one.
        </p>
        <p>
          <span className="text-text">Best — a Raspberry Pi</span> (a tiny ~$45 computer that runs
          24/7). Needed if you want scheduling, notifications, and remote access to work while your
          computer is off.
        </p>
      </Section>

      <Section n="2" title="Option A — a Mac you leave on">
        <p>Open the <span className="text-text">Terminal</span> app and paste this one line:</p>
        <code className="block overflow-x-auto whitespace-pre rounded-xl bg-surface-2 p-3 text-xs text-ember-soft">
          {INSTALL_CMD}
        </code>
        <p>
          It installs everything (no password needed) and prints an address like
          <span className="text-text"> http://your-mac.local:8787</span>.
        </p>
        <p>
          Keep that Mac <span className="text-text">awake and on WiFi</span> (System Settings →
          search “sleep” → set the computer to never sleep) so it stays reachable.
        </p>
      </Section>

      <Section n="3" title="Option B — a Raspberry Pi (always-on)">
        <p className="text-text">What to buy (~$70 total):</p>
        <ul className="list-disc pl-5">
          <li>Raspberry Pi 4 (2GB) — ~$45</li>
          <li>microSD card, 16GB+ — ~$8</li>
          <li>USB-C power supply — ~$10</li>
          <li>A case — ~$8</li>
        </ul>
        <p className="mt-1">
          Flash <span className="text-text">Raspberry Pi OS</span> with the official Raspberry Pi
          Imager (set your WiFi name/password and enable SSH right in the Imager), then run the
          installer. It runs 24/7 and is reachable at <span className="text-text">http://sauna.local</span>.
        </p>
        <p className="text-xs">A dedicated one-tap Pi installer is being finalized — for now the Mac path above is the easy on-ramp.</p>
      </Section>

      <Section n="4" title="Open the app on your phone">
        <p>On the <span className="text-text">same WiFi</span>, open the address the installer
          printed (e.g. <span className="text-text">http://your-mac.local:8787</span>).</p>
        <p>Then tap <span className="text-text">Share → Add to Home Screen</span> for an app icon.</p>
      </Section>

      <Section n="5" title="Optional — use it from anywhere">
        <p>Install <span className="text-text">Tailscale</span> (free) on the bridge computer and
          your phone with the same account. This lets you control it away from home and unlocks
          push notifications. See “Use it away from home” back in the More tab.</p>
      </Section>

      <Section n="6" title="Optional — chromotherapy lights (coming soon)">
        <p>A small Wi-Fi IR blaster will let you control your sauna&apos;s color light from the app —
          on the roadmap.</p>
      </Section>

      <p className="px-2 pt-2 text-center text-xs text-muted">
        ⚠️ Insaunity controls a high-heat appliance. Never leave a heating sauna unattended; use at
        your own risk; no warranty; chromotherapy notes are wellness tradition, not medical advice.
      </p>
    </main>
  );
}
