// Migration script: Drop old tables and let initDb recreate them with userId columns
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

// Read .env.local manually
const envContent = readFileSync(".env.local", "utf-8");
const match = envContent.match(/DATABASE_URL=(.+)/);
const DATABASE_URL = match ? match[1].trim() : null;

if (!DATABASE_URL) {
  console.error("DATABASE_URL not set in .env.local");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrate() {
  console.log("Dropping old tables...");
  await sql`DROP TABLE IF EXISTS application_logs`;
  await sql`DROP TABLE IF EXISTS resumes`;
  await sql`DROP TABLE IF EXISTS jobs`;
  await sql`DROP TABLE IF EXISTS gmail_tokens`;
  await sql`DROP TABLE IF EXISTS search_config`;
  await sql`DROP TABLE IF EXISTS user_profile`;
  console.log("All tables dropped.");
  console.log("Tables will be recreated on next app start via initDb().");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
