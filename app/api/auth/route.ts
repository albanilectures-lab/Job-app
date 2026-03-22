import { NextRequest, NextResponse } from "next/server";
import { validateCredentials, encodeSession, decodeSession, SESSION_COOKIE } from "@/lib/auth";

/**
 * GET /api/auth — check current session
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE);
  if (!cookie?.value) {
    return NextResponse.json({ authenticated: false });
  }
  const user = decodeSession(cookie.value);
  if (!user) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({ authenticated: true, user });
}

/**
 * POST /api/auth — login or logout
 * Body: { action: "login", username, password } or { action: "logout" }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "logout") {
    const res = NextResponse.json({ success: true });
    res.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  }

  if (body.action === "login") {
    const { username, password } = body;
    if (!username || !password) {
      return NextResponse.json({ success: false, error: "Username and password required" }, { status: 400 });
    }

    const user = validateCredentials(username, password);
    if (!user) {
      return NextResponse.json({ success: false, error: "Invalid username or password" }, { status: 401 });
    }

    const res = NextResponse.json({ success: true, user });
    res.cookies.set(SESSION_COOKIE, encodeSession(user), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return res;
  }

  return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
}
