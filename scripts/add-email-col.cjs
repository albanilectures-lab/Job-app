const { neon } = require("@neondatabase/serverless");
const { readFileSync } = require("fs");
const env = readFileSync(".env.local", "utf-8");
const m = env.match(/DATABASE_URL=(.+)/);
const sql = neon(m[1].trim());
sql`ALTER TABLE gmail_tokens ADD COLUMN IF NOT EXISTS email TEXT`
  .then(() => console.log("Done"))
  .catch((e) => console.error(e));
