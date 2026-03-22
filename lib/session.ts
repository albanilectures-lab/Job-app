import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession } from "./auth";

/** Extract the current userId from the session cookie. Throws if not authenticated. */
export async function requireUserId(): Promise<string> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie?.value) throw new Error("Unauthorized");
  const user = decodeSession(cookie.value);
  if (!user) throw new Error("Unauthorized");
  return user.username;
}
