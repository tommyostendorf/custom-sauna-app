"use client";

import { useEffect, useState } from "react";
import { completeLogin, clientId } from "@/lib/spotify";
import { api } from "@/lib/api";

export default function SpotifyCallback() {
  const [msg, setMsg] = useState("Connecting Spotify…");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    const error = new URLSearchParams(window.location.search).get("error");
    if (error) {
      setMsg("Spotify connection cancelled.");
      setTimeout(() => (window.location.href = "/"), 1500);
      return;
    }
    if (!code) {
      window.location.href = "/";
      return;
    }
    (async () => {
      try {
        const refreshToken = await completeLogin(code);
        // Hand the refresh token to the bridge so it can auto-pause on power-off.
        if (refreshToken) {
          await api.spotifyConnect(refreshToken, clientId()).catch(() => {});
        }
        setMsg("Spotify connected! Returning…");
      } catch {
        setMsg("Couldn't connect Spotify. Returning…");
      }
      setTimeout(() => (window.location.href = "/"), 1200);
    })();
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-center">
      <p className="text-muted">{msg}</p>
    </main>
  );
}
