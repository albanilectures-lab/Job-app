/**
 * Netlify Scheduled Function — runs every 4 hours.
 * Triggers the autopilot for all enabled users by calling the app's own API.
 */
export default async function handler(req: Request) {
  const appUrl = process.env.URL || process.env.DEPLOY_URL || "https://jobappme.netlify.app";

  console.log(`[Scheduled Autopilot] Running at ${new Date().toISOString()}`);

  try {
    const res = await fetch(`${appUrl}/api/autopilot?scheduled=true`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = await res.json();
    console.log("[Scheduled Autopilot] Result:", JSON.stringify(data));

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Scheduled Autopilot] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const config = {
  schedule: "0 */4 * * *", // Every 4 hours
};
