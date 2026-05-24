/**
 * Bridge-side Spotify control — just enough to PAUSE playback when the sauna
 * turns off. Uses the refresh token captured during the app's PKCE login.
 */

import { getSpotify, setSpotify } from './store';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';

export function isSpotifyConnected(): boolean {
  return !!getSpotify().refreshToken;
}

/** Exchange the stored refresh token for a fresh access token (PKCE: no secret needed). */
async function getAccessToken(): Promise<string | null> {
  const { refreshToken, clientId } = getSpotify();
  if (!refreshToken || !clientId) return null;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string; refresh_token?: string };
    // Spotify sometimes rotates the refresh token — persist the new one.
    if (json.refresh_token) setSpotify(json.refresh_token, clientId);
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

/** Pause whatever is playing on the user's active Spotify device. */
export async function pausePlayback(): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API}/me/player/pause`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });
    // 204 = paused; 404 = no active device (nothing playing) — both are "fine".
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}
