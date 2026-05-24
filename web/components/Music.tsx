"use client";

import { useCallback, useEffect, useState } from "react";
import * as spotify from "@/lib/spotify";
import { launchMusic } from "@/lib/music";
import { api } from "@/lib/api";
import { Card, SectionLabel } from "./ui";

export function Music() {
  const [connected, setConnected] = useState(false);
  const [np, setNp] = useState<spotify.NowPlaying | null>(null);

  const refresh = useCallback(async () => {
    if (!spotify.isConnected()) {
      setConnected(false);
      return;
    }
    setConnected(true);
    try {
      setNp(await spotify.getNowPlaying());
    } catch {
      /* ignore transient errors */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const ctrl = async (fn: () => Promise<void>) => {
    await fn();
    setTimeout(refresh, 500);
  };

  const disconnect = () => {
    spotify.disconnect();
    api.spotifyDisconnect().catch(() => {});
    setConnected(false);
    setNp(null);
  };

  return (
    <Card>
      <SectionLabel>Music</SectionLabel>

      {connected ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {np?.art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={np.art} alt="" className="h-14 w-14 rounded-lg object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-2 text-xl">🎵</div>
            )}
            <div className="min-w-0">
              <div className="truncate font-medium">{np?.track ?? "Nothing playing"}</div>
              <div className="truncate text-sm text-muted">
                {np?.artist ?? "Open Spotify on a device and press play"}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-8 text-2xl">
            <button type="button" aria-label="Previous" onClick={() => ctrl(spotify.previous)}>
              ⏮
            </button>
            <button
              type="button"
              aria-label={np?.isPlaying ? "Pause" : "Play"}
              onClick={() => ctrl(np?.isPlaying ? spotify.pause : spotify.play)}
              className="text-4xl"
            >
              {np?.isPlaying ? "⏸" : "▶"}
            </button>
            <button type="button" aria-label="Next" onClick={() => ctrl(spotify.next)}>
              ⏭
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={launchMusic} className="text-xs text-ember-soft">
              ▶ Start on sauna speaker
            </button>
            <button type="button" onClick={disconnect} className="text-xs text-muted">
              Disconnect Spotify
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Connect Spotify to see and control what&apos;s playing here — and the sauna will
            auto-pause your music when you turn it off.
          </p>
          <button
            type="button"
            onClick={() => spotify.beginLogin()}
            className="rounded-2xl bg-[#1DB954] py-3 font-semibold text-black"
          >
            Connect Spotify
          </button>
          <button
            type="button"
            onClick={launchMusic}
            className="rounded-2xl border border-border bg-surface-2 py-3 font-medium text-text"
          >
            🎵 Start music shortcut
          </button>
        </div>
      )}
    </Card>
  );
}
