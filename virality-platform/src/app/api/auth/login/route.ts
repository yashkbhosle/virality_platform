import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE, SESSION_MAX_AGE, authConfigError, checkCredentials, createSessionToken, safeNextPath,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

// Brute-force protection: 5 failed tries per IP per 15 minutes.
// In memory, so it's per server instance; the strong-password rule does the heavy lifting.
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const fails = new Map<string, { count: number; first: number }>();

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

function lockedOut(ip: string) {
  const f = fails.get(ip);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) {
    fails.delete(ip);
    return false;
  }
  return f.count >= MAX_FAILS;
}

function recordFail(ip: string) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.first > WINDOW_MS) fails.set(ip, { count: 1, first: Date.now() });
  else f.count++;
  if (fails.size > 5000) fails.clear(); // keep memory bounded
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const configError = authConfigError();
  if (configError) return NextResponse.json({ error: configError }, { status: 503 });

  const ip = clientIp(req);
  if (lockedOut(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.slice(0, 200) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 500) : "";

  if (!(await checkCredentials(username, password))) {
    recordFail(ip);
    await sleep(600 + Math.random() * 400); // slow down guessing
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }

  fails.delete(ip);
  const res = NextResponse.json({ ok: true, next: safeNextPath(body?.next) });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
