/**
 * Spotify Web API client (browser, PKCE flow — no client secret).
 * Tokens live in localStorage. The refresh token is also handed to the bridge
 * so it can auto-pause playback when the sauna turns off.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const SCOPES =
  "user-read-playback-state user-modify-playback-state user-read-currently-playing";
const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

const LS = { access: "sp_access", refresh: "sp_refresh", expires: "sp_expires", verifier: "sp_verifier" };

const redirectUri = () => `${window.location.origin}/callback`;

// --- PKCE helpers ---
function randomString(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ("0" + (b & 0xff).toString(16)).slice(-2)).join("");
}
function base64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// --- Token storage ---
function store(json: { access_token: string; refresh_token?: string; expires_in: number }) {
  localStorage.setItem(LS.access, json.access_token);
  if (json.refresh_token) localStorage.setItem(LS.refresh, json.refresh_token);
  localStorage.setItem(LS.expires, String(Date.now() + json.expires_in * 1000 - 60000));
}

export const isConnected = () => !!localStorage.getItem(LS.refresh);
export const getRefreshToken = () => localStorage.getItem(LS.refresh);
export const clientId = () => CLIENT_ID;
export function disconnect() {
  [LS.access, LS.refresh, LS.expires, LS.verifier].forEach((k) => localStorage.removeItem(k));
}

// --- Auth flow ---
export async function beginLogin() {
  const verifier = randomString(48);
  localStorage.setItem(LS.verifier, verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: await challenge(verifier),
  });
  window.location.href = `${AUTH_URL}?${params}`;
}

/** Exchange the auth code for tokens (called from /callback). Returns the refresh token. */
export async function completeLogin(code: string): Promise<string | null> {
  const verifier = localStorage.getItem(LS.verifier);
  if (!verifier) return null;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Spotify token exchange failed");
  const json = await res.json();
  store(json);
  return json.refresh_token ?? null;
}

async function refresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem(LS.refresh);
  if (!refreshToken) return null;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const json = await res.json();
  store(json);
  return json.access_token;
}

async function token(): Promise<string | null> {
  const expires = Number(localStorage.getItem(LS.expires) ?? 0);
  if (Date.now() < expires) return localStorage.getItem(LS.access);
  return refresh();
}

// --- Playback ---
export interface NowPlaying {
  isPlaying: boolean;
  track: string;
  artist: string;
  art: string | null;
}

export async function getNowPlaying(): Promise<NowPlaying | null> {
  const t = await token();
  if (!t) return null;
  const res = await fetch(`${API}/me/player?type=track`, { headers: { Authorization: `Bearer ${t}` } });
  if (res.status === 204 || !res.ok) return null; // nothing playing / no active device
  const d = await res.json();
  const item = d.item;
  if (!item) return null;
  return {
    isPlaying: !!d.is_playing,
    track: item.name,
    artist: (item.artists ?? []).map((a: { name: string }) => a.name).join(", "),
    art: item.album?.images?.[0]?.url ?? null,
  };
}

async function command(path: string, method: "PUT" | "POST") {
  const t = await token();
  if (!t) return;
  await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${t}` } });
}

export const play = () => command("/me/player/play", "PUT");
export const pause = () => command("/me/player/pause", "PUT");
export const next = () => command("/me/player/next", "POST");
export const previous = () => command("/me/player/previous", "POST");
