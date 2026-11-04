// Single-account login for the whole app.
//
// Credentials come from env vars (APP_USERNAME, APP_PASSWORD) and sessions are
// HMAC-signed cookies (AUTH_SECRET). Uses Web Crypto only, so it runs in the
// proxy and in route handlers alike.
//
// Fails closed: if the vars are missing or too weak, nobody can sign in.

export const SESSION_COOKIE = "viralos_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

const MIN_PASSWORD = 12;
const MIN_SECRET = 32;

const enc = new TextEncoder();

/** Why login can't work yet, or null when it's configured correctly. */
export function authConfigError(): string | null {
  const { APP_USERNAME, APP_PASSWORD, AUTH_SECRET } = process.env;
  if (!APP_USERNAME || !APP_PASSWORD || !AUTH_SECRET) {
    return "Login isn't set up yet. Add APP_USERNAME, APP_PASSWORD and AUTH_SECRET to the environment variables.";
  }
  if (APP_PASSWORD.length < MIN_PASSWORD) return `APP_PASSWORD must be at least ${MIN_PASSWORD} characters.`;
  if (AUTH_SECRET.length < MIN_SECRET) return `AUTH_SECRET must be at least ${MIN_SECRET} characters.`;
  return null;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/**
 * Signing key for sessions. It mixes in the username and password, so changing
 * either one signs everyone out.
 */
async function sessionKey() {
  const { APP_USERNAME = "", APP_PASSWORD = "", AUTH_SECRET = "" } = process.env;
  const base = await hmacKey(AUTH_SECRET);
  const derived = await crypto.subtle.sign("HMAC", base, enc.encode(`session:${APP_USERNAME}:${APP_PASSWORD}`));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Constant-time string comparison: HMAC both sides with a throwaway key, then compare digests. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw", crypto.getRandomValues(new Uint8Array(32)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const [da, db] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(a)),
    crypto.subtle.sign("HMAC", key, enc.encode(b)),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function checkCredentials(username: string, password: string): Promise<boolean> {
  if (authConfigError()) return false;
  // Always run both comparisons so timing doesn't reveal which one was wrong.
  const [u, p] = await Promise.all([
    safeEqual(username, process.env.APP_USERNAME!),
    safeEqual(password, process.env.APP_PASSWORD!),
  ]);
  return u && p;
}

interface SessionPayload {
  u: string;   // username
  exp: number; // unix seconds
}

export async function createSessionToken(): Promise<string> {
  const payload: SessionPayload = { u: process.env.APP_USERNAME!, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await sessionKey(), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token || authConfigError()) return false;
  const [body, sig] = token.split(".");
  const sigBytes = sig ? fromB64url(sig) : null;
  if (!body || !sigBytes) return false;
  const ok = await crypto.subtle.verify("HMAC", await sessionKey(), sigBytes, enc.encode(body));
  if (!ok) return false;
  try {
    const bytes = fromB64url(body);
    const payload = JSON.parse(new TextDecoder().decode(bytes ?? new Uint8Array())) as SessionPayload;
    return payload.u === process.env.APP_USERNAME && typeof payload.exp === "number" && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

/** Only allow redirects back into this app (no "//evil.com" or absolute URLs). */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.startsWith("/login")) return "/";
  return next;
}
