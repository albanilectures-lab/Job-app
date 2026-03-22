import { cookies } from "next/headers";

// ─── Hardcoded Accounts ──────────────────────────────────────
// Change credentials here. Format: { username, password, displayName }
export const ACCOUNTS = [
  { username: "admin", password: "admin", displayName: "Admin" },
  { username: "admin2", password: "admin2", displayName: "Admin 2" },
  { username: "admin3", password: "admin3", displayName: "Admin 3" },
  { username: "admin4", password: "admin4", displayName: "Admin 4" },
  { username: "admin5", password: "admin5", displayName: "Admin 5" },
  { username: "admin6", password: "admin6", displayName: "Admin 6" },
  { username: "admin7", password: "admin7", displayName: "Admin 7" },
  { username: "admin8", password: "admin8", displayName: "Admin 8" },
  { username: "admin9", password: "admin9", displayName: "Admin 9" },
  { username: "admin10", password: "admin10", displayName: "Admin 10" },
];

export const SESSION_COOKIE = "jobbot_session";

export interface SessionUser {
  username: string;
  displayName: string;
}

/** Validate credentials. Returns the account or null. */
export function validateCredentials(username: string, password: string): SessionUser | null {
  const account = ACCOUNTS.find(
    (a) => a.username === username && a.password === password
  );
  if (!account) return null;
  return { username: account.username, displayName: account.displayName };
}

/** Encode session data to a cookie value (base64 JSON). */
export function encodeSession(user: SessionUser): string {
  return Buffer.from(JSON.stringify(user)).toString("base64");
}

/** Decode session cookie. Returns null if invalid. */
export function decodeSession(value: string): SessionUser | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf-8"));
    if (parsed.username && parsed.displayName) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Get the current session user from cookies (server-side). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie?.value) return null;
  const user = decodeSession(cookie.value);
  // Verify user still exists in accounts list
  if (user && !ACCOUNTS.find((a) => a.username === user.username)) return null;
  return user;
}
