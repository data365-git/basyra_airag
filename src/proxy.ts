import { NextResponse, type NextRequest } from "next/server";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import { PORTAL_COOKIE, verifyPortalJWT } from "@/lib/portalAuth";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/api/public", "/portal", "/api/portal", "/article", "/api/telegram/webhook", "/api/telegram/set-webhook", "/api/portal/telegram-login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files and icons
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/workbox-") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;

  // Portal auth is valid for API requests coming from the participant portal /
  // Telegram Mini App. Those requests use either a bearer token or the portal
  // cookie, and still rely on route-level auth for final authorization.
  if (!payload && pathname.startsWith("/api/")) {
    const auth = request.headers.get("authorization") ?? request.headers.get("Authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    const portalToken = bearer ?? request.cookies.get(PORTAL_COOKIE)?.value ?? null;
    const portalPayload = portalToken ? await verifyPortalJWT(portalToken) : null;
    if (portalPayload) {
      return NextResponse.next();
    }
  }

  if (!payload) {
    // API routes → 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Page routes → redirect to login with return URL
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(loginUrl);

    // Clear a stale/invalid cookie if one was present
    if (token) {
      response.cookies.delete(COOKIE_NAME);
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-).*)",
  ],
};
