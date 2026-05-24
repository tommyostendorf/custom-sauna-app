/**
 * Public sauna API used by every UI component.
 *
 * This is now a thin facade over a swappable backend (see lib/transport/). The
 * exported `api` object and `applyPreset` keep the exact same shape they always had,
 * so no component needs to change. getBackend() decides whether calls go to the Node
 * bridge over HTTP (Mode A) or run natively on the device (Mode B, later phases).
 */

import { Preset } from "./types";
import { getBackend } from "./transport";
import { SaunaBackend } from "./transport/types";

export const api: SaunaBackend = getBackend();

/**
 * Apply a preset: set temperature, timer, lights, then either start now or arm a
 * delayed start. Runs sequentially because each command waits for the sauna to ACK.
 */
export async function applyPreset(p: Preset): Promise<void> {
  await api.setTemperature(p.temperatureF, "F");
  await api.setTimer(p.timerMinutes);
  await api.setLight("internal", p.internalLight);
  await api.setLight("external", p.externalLight);
  if (p.delayedStartMinutes > 0) {
    await api.setDelayedStart(p.delayedStartMinutes);
  } else {
    await api.setPower(true);
  }
}
