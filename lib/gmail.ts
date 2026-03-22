import { google } from "googleapis";
import { getGmailTokens, saveGmailTokens } from "./db";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/gmail/callback`
  );
}

/**
 * Generate the URL for user consent.
 */
export function getAuthUrl(): string {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

/**
 * Exchange authorization code for tokens and persist them.
 */
export async function exchangeCode(code: string, userId: string): Promise<void> {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Missing tokens from Google OAuth exchange");
  }

  // Fetch the connected email address
  let email: string | undefined;
  try {
    oauth2.setCredentials({ access_token: tokens.access_token });
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const profile = await gmail.users.getProfile({ userId: "me" });
    email = profile.data.emailAddress ?? undefined;
  } catch {
    // Non-critical — continue without email
  }

  await saveGmailTokens(
    tokens.access_token,
    tokens.refresh_token,
    tokens.expiry_date ?? Date.now() + 3600 * 1000,
    userId,
    email
  );
}

/**
 * Get an authenticated Gmail client item (refreshing token if needed).
 */
async function getGmailClient(userId: string) {
  const tokens = await getGmailTokens(userId);
  if (!tokens) throw new Error("Gmail not connected. Please authenticate first.");

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiresAt,
  });

  // Refresh if expired
  if (Date.now() >= tokens.expiresAt - 60000) {
    const { credentials } = await oauth2.refreshAccessToken();
    await saveGmailTokens(
      credentials.access_token!,
      credentials.refresh_token ?? tokens.refreshToken,
      credentials.expiry_date ?? Date.now() + 3600 * 1000,
      userId
    );
  }

  return google.gmail({ version: "v1", auth: oauth2 });
}

/**
 * Check inbox for application-related replies.
 * Returns a list of recent messages related to job applications.
 */
export async function checkApplicationReplies(userId: string, maxResults = 20) {
  const gmail = await getGmailClient(userId);

  const response = await gmail.users.messages.list({
    userId: "me",
    q: 'subject:(application OR interview OR "thank you for applying" OR position OR opportunity OR candidacy)',
    maxResults,
  });

  const messages = response.data.messages ?? [];
  const results = [];

  for (const msg of messages.slice(0, 10)) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id!,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Date"],
    });

    const headers = detail.data.payload?.headers ?? [];
    results.push({
      id: msg.id,
      subject: headers.find((h) => h.name === "Subject")?.value ?? "",
      from: headers.find((h) => h.name === "From")?.value ?? "",
      date: headers.find((h) => h.name === "Date")?.value ?? "",
      snippet: detail.data.snippet ?? "",
    });
  }

  return results;
}


