// Usage: node scripts/grant-superadmin.mjs you@school.edu [--revoke]
// Run locally by a database owner. Reads .env.local; never commit keys.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local"))
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
const email = process.argv[2]?.toLowerCase();
const grant = !process.argv.includes("--revoke");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !key) {
  console.error("Usage: node scripts/grant-superadmin.mjs <email> [--revoke]  (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY)");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false }, db: { schema: process.env.HUMOR_DATA_SCHEMA || "public" } });
let user = null;
for (let page = 1; !user && page <= 50; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 1000) break;
}
if (!user) {
  console.error(`No account for ${email}. Sign in to the member app with Google once, then retry.`);
  process.exit(1);
}
const { data, error } = await db.from("profiles").update({ is_superadmin: grant }).eq("id", user.id).select("id,username,is_superadmin").single();
if (error) {
  console.error(error.message.includes("is_superadmin") ? "Apply supabase/migrations/202610200001_superadmin.sql first." : error.message);
  process.exit(1);
}
console.log(`${grant ? "Granted" : "Revoked"} superadmin: ${email} (@${data.username ?? data.id})`);
