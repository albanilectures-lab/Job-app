import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, decodeSession } from "./auth";

/** Extract the current userId from the session cookie or X-Session header. Throws if not authenticated. */
export async function requireUserId(): Promise<string> {
  // Try cookie first
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (cookie?.value) {
    const user = decodeSession(cookie.value);
    if (user) return user.username;
  }

  // Fallback: X-Session header (Chrome extension)
  const headerStore = await headers();
  const headerSession = headerStore.get("x-session");
  if (headerSession) {
    const user = decodeSession(headerSession);
    if (user) return user.username;
  }

  throw new Error("Unauthorized");
}
