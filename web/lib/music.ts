/**
 * Launches the iOS Shortcut that connects the sauna's Bluetooth speaker and
 * starts Spotify. The shortcut must be named exactly MUSIC_SHORTCUT on the phone.
 * No-op on desktop browsers (the shortcuts:// scheme just won't resolve).
 */
export const MUSIC_SHORTCUT = "Sauna Music";
export const MUSIC_OFF_SHORTCUT = "Sauna Music Off";

function runShortcut(name: string) {
  window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(name)}`;
}

export function launchMusic() {
  runShortcut(MUSIC_SHORTCUT);
}

/** Pauses music when the sauna is turned off (runs the "Sauna Music Off" shortcut). */
export function launchMusicOff() {
  runShortcut(MUSIC_OFF_SHORTCUT);
}
