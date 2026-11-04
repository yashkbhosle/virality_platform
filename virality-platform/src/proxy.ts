import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Every page and API route needs a valid session, except:
//  - the login page and the login/logout endpoints
//  - the daily cron call, which carries its own CRON_SECRET
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout"]);

function isCronCall(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return (
    !!secret &&
    req.nextUrl.pathname === "/api/my-channel/snapshot" &&
    req.headers.get("authorization") === `Bearer ${secret}`
  );
}

/** Block cross-site form posts / fetches that change data. */
function isCrossSiteWrite(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return false;
  const origin = req.headers.get("origin");
  if (!origin) return false; // same-origin fetches from older browsers, curl, etc. still need the cookie
  try {
    return new URL(origin).host !== req.headers.get("host");
  } catch {
    return true;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && isCrossSiteWrite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (PUBLIC_PATHS.has(pathname) || isCronCall(req)) return NextResponse.next();

  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (isApi) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's static files and public images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
