import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the Next.js static export (built into `out/`) as a native iOS app.
 * The web build is unchanged; `webDir` just points Capacitor at the exported files.
 * Run `npm run build` first, then `npx cap sync ios`.
 */
const config: CapacitorConfig = {
  appId: "com.insaunity.app",
  appName: "Insaunity",
  webDir: "out",
  ios: {
    // The app talks to the sauna over the local network only (no server origin).
    contentInset: "always",
  },
};

export default config;
