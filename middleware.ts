import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, decodeSession, ACCOUNTS } from "@/lib/auth";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths — no auth needed
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg")
  ) {
    return NextResponse.next();
  }

  // Support auth via cookie OR X-Session header (for Chrome extension)
  const cookie = req.cookies.get(SESSION_COOKIE);
  const headerSession = req.headers.get("x-session");
  const sessionValue = cookie?.value || headerSession || "";
  const user = sessionValue ? decodeSession(sessionValue) : null;
  const isValid = user && ACCOUNTS.find((a) => a.username === user.username);

  // Handle CORS preflight for extension requests
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (!isValid) {
    // API routes return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    // Page routes redirect to login
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();

  // Add CORS headers for API routes (extension support)
  if (pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin");
    if (origin) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Session");
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
