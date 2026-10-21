// End-to-end gate check against `next start` and a local fake Supabase.
// Usage: NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=pk npm run build && node tests/http-gate.mjs
// Never talks to a deployed project.
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";

const SUPA_PORT = 54399, APP_PORT = 3011;
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const profiles = [
  { id: ADMIN, username: "boss", first_name: "Big", last_name: "Boss", display_name: null, avatar_path: null, created_at: "2026-10-01T00:00:00Z", onboarded_at: "2026-10-01T00:00:00Z", is_official: false, is_superadmin: true },
  { id: MEMBER, username: "member", first_name: "Plain", last_name: "Member", display_name: null, avatar_path: null, created_at: "2026-10-02T00:00:00Z", onboarded_at: null, is_official: false, is_superadmin: false },
];
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (sub, method = "oauth") => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", exp: 4102444800, amr: [{ method, timestamp: 1 }], app_metadata: { providers: ["google"] } })}.sig`;
const userFor = (token) => {
  const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub;
  return { id: sub, aud: "authenticated", role: "authenticated", email: `${sub.slice(0, 4)}@example.edu`, is_anonymous: false, identities: [{ provider: "google", id: sub, user_id: sub }], app_metadata: { providers: ["google"] }, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" };
};
const cookie = (sub, method) => {
  const token = jwt(sub, method);
  const session = { access_token: token, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: userFor(token) };
  return `sb-localhost-auth-token=base64-${b64(session)}`;
};

const supa = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (process.env.DEBUG_MOCK) console.error("mock", req.method, req.url);
  const send = (status, body, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); };
  if (url.pathname === "/auth/v1/user") {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    return token.split(".").length === 3 ? send(200, userFor(token)) : send(401, { message: "bad jwt" });
  }
  if (url.pathname === "/auth/v1/admin/users") return send(200, { users: profiles.map((p) => ({ ...userFor(jwt(p.id)), last_sign_in_at: null })), aud: "authenticated" });
  if (url.pathname.startsWith("/auth/v1/admin/users/")) return send(200, userFor(jwt(url.pathname.split("/").pop())));
  if (url.pathname.startsWith("/storage/")) return send(200, []);
  if (url.pathname === "/rest/v1/rpc/humor_leaderboard") return send(200, { posts: [], people: [], computedAt: "2026-10-20T00:00:00Z", startsAt: null });
  if (url.pathname.startsWith("/rest/v1/")) {
    const table = url.pathname.split("/").pop();
    let rows = table === "profiles" ? profiles : [];
    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq.")) rows = rows.filter((row) => String(row[key]) === value.slice(3));
      if (value.startsWith("in.(")) rows = rows.filter((row) => value.slice(4, -1).split(",").includes(String(row[key])));
    }
    const headers = { "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` };
    if (req.method === "HEAD") { res.writeHead(200, headers); return res.end(); }
    if ((req.headers.accept || "").includes("vnd.pgrst.object")) return rows.length === 1 ? send(200, rows[0], headers) : send(406, { message: "no rows" });
    return send(200, rows, headers);
  }
  send(404, { message: "not mocked" });
});
await new Promise((resolve) => supa.listen(SUPA_PORT, resolve));
const app = spawn("node", ["node_modules/next/dist/bin/next", "start", "--port", String(APP_PORT), "--hostname", "127.0.0.1"], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${SUPA_PORT}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk", SUPABASE_SECRET_KEY: "sk", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
let log = "";
app.stdout.on("data", (d) => (log += d)); app.stderr.on("data", (d) => (log += d));
try {
  for (let i = 0; i < 60 && !log.includes("Ready"); i++) await new Promise((r) => setTimeout(r, 500));
  const get = (path, headers = {}) => fetch(`http://127.0.0.1:${APP_PORT}${path}`, { redirect: "manual", headers });
  for (const path of ["/", "/users", "/users/" + MEMBER, "/posts", "/posts?source=handmade", "/posts/new", "/ai", "/ai/runs", "/requests", "/rankings/posts?period=week", "/rankings/creators", "/rankings/most-posts", "/rankings/topics", "/rankings/ratings?sort=net", "/rankings/votes", "/rankings/hearts", "/activity?action=cat:auth", "/activity?action=ha&from=2026-10-01T00:00&to=2026-10-21T23:59"]) {
    const anon = await get(path);
    assert.equal(anon.status, 307, `anonymous ${path}`);
    assert.match(anon.headers.get("location"), /\/login/);
    const member = await get(path, { cookie: cookie(MEMBER) });
    assert.equal(member.status, 307, `member ${path}`);
    assert.match(member.headers.get("location"), /\/denied\?reason=forbidden/, log.slice(-1500));
    const password = await get(path, { cookie: cookie(ADMIN, "password") });
    assert.match(password.headers.get("location") || "", /\/denied\?reason=not-google/, `password session ${path}`);
    const admin = await get(path, { cookie: cookie(ADMIN) });
    assert.equal(admin.status, 200, `admin ${path}: ${admin.status}\n${log.slice(-2000)}`);
    assert.equal(admin.headers.get("cache-control"), "private, no-store");
  }
  const dash = await (await get("/", { cookie: cookie(ADMIN) })).text();
  assert.match(dash, /actually funny/);
  const users = await (await get("/users", { cookie: cookie(ADMIN) })).text();
  assert.match(users, /@member/); assert.match(users, /Superadmin/);
  const denied = await (await get("/denied?reason=forbidden", { cookie: cookie(MEMBER) })).text();
  assert.match(denied, /Request superadmin access/, "non-admins get a request button");
  const anonDenied = await (await get("/denied?reason=forbidden")).text();
  assert.doesNotMatch(anonDenied, /Request superadmin access/, "signed-out visitors cannot request");
  const api = await get("/api/anything", { cookie: cookie(MEMBER) });
  assert.equal(api.status, 403);
  const moved = await get("/media/new", { cookie: cookie(ADMIN) });
  assert.match(moved.headers.get("location") || "", /\/posts\/new$/, "old /media links redirect to /posts");
  const votes = await get("/votes?tab=ha", { cookie: cookie(ADMIN) });
  assert.match(votes.headers.get("location") || "", /\/rankings\/votes$/, "old /votes links redirect into Rankings & votes");
  const login = await get("/login");
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("x-robots-tag"), "noindex, nofollow");
  // A forged Server Action POST from a non-admin is stopped by the proxy before any action runs.
  const action = await fetch(`http://127.0.0.1:${APP_PORT}/posts/new`, { method: "POST", redirect: "manual", headers: { cookie: cookie(MEMBER), "next-action": "x", origin: `http://127.0.0.1:${APP_PORT}` }, body: "x" });
  assert.equal(action.status, 307);
  console.log("PASS anonymous → /login, members and non-Google sessions → /denied, superadmin pages render, members can request access, actions blocked for non-admins.");
} finally {
  process.kill(-app.pid); supa.close();
}
