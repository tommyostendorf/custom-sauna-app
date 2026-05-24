"use client";

import { useCallback, useEffect, useState } from "react";
import * as spotify from "@/lib/spotify";
import { launchMusic } from "@/lib/music";
import { api } from "@/lib/api";
import { Card, SectionLabel } from "./ui";

const Prev = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
    <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
  </svg>
);
const Next = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
    <path d="M6 18l8.5-6L6 6zM16 6h2v12h-2z" />
  </svg>
);
const Play = () => (
  <svg viewBox="0 0 24 24" className="h-7 w-7 translate-x-[1px]" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7z" />
  </svg>
);
const Pause = () => (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
    <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
  </svg>
);
const NoteIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 text-muted" fill="currentColor" aria-hidden>
    <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

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
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-2">
                <NoteIcon />
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate font-medium">{np?.track ?? "Nothing playing"}</div>
              <div className="truncate text-sm text-muted">
                {np?.artist ?? "Open Spotify on a device and press play"}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-8 py-1">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => ctrl(spotify.previous)}
              className="text-muted transition hover:text-text active:scale-90"
            >
              <Prev />
            </button>
            <button
              type="button"
              aria-label={np?.isPlaying ? "Pause" : "Play"}
              onClick={() => ctrl(np?.isPlaying ? spotify.pause : spotify.play)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-text text-bg shadow-lg transition active:scale-95"
            >
              {np?.isPlaying ? <Pause /> : <Play />}
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => ctrl(spotify.next)}
              className="text-muted transition hover:text-text active:scale-90"
            >
              <Next />
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
