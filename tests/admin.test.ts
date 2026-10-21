// Pure unit tests: no network, no database.
import assert from "node:assert/strict";
import { gateDecision, isPublicPath, safeNext } from "../lib/gate";
import { computeStats } from "../lib/stats";
import { parseMediaFields, sniffImage } from "../lib/media-rules";
import { tokenCount } from "../lib/format";

const id = "11111111-1111-4111-8111-111111111111";
const google = { id, is_anonymous: false, identities: [{ provider: "google" }] } as never;
const claims = { sub: id, amr: [{ method: "oauth", timestamp: 10 }] };

// Gate: only a fresh Google OAuth session with is_superadmin === true passes.
assert.equal(gateDecision(null, null, null), "anonymous");
assert.equal(gateDecision(google, claims, { is_superadmin: true }), "admin");
assert.equal(gateDecision(google, claims, { is_superadmin: false }), "forbidden");
assert.equal(gateDecision(google, claims, null), "forbidden");
assert.equal(gateDecision(google, claims, { is_superadmin: "true" }), "forbidden");
assert.equal(gateDecision(google, claims, { is_superadmin: 1 }), "forbidden");
assert.equal(gateDecision(google, { sub: id, amr: [{ method: "password", timestamp: 10 }] }, { is_superadmin: true }), "not-google");
assert.equal(gateDecision(google, { sub: "someone-else", amr: claims.amr }, { is_superadmin: true }), "not-google");
assert.equal(gateDecision({ ...(google as object), identities: [{ provider: "email" }] } as never, claims, { is_superadmin: true }), "not-google");
assert.equal(gateDecision({ ...(google as object), is_anonymous: true } as never, claims, { is_superadmin: true }), "not-google");

// Only sign-in plumbing is public.
for (const path of ["/login", "/denied", "/auth/start", "/auth/callback"]) assert.equal(isPublicPath(path), true, path);
for (const path of ["/", "/users", "/media", "/media/new", "/votes", "/loginx", "/api/anything"]) assert.equal(isPublicPath(path), false, path);
assert.equal(safeNext("/media?status=deleted"), "/media?status=deleted");
for (const bad of ["https://evil.example", "//evil.example", "/\\evil", "/login", "/auth/callback", null]) assert.equal(safeNext(bad), "/");

// Media validation mirrors database constraints.
const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
assert.equal(parseMediaFields(form({ content: "  Hi  ", style: "Pun", source: "ai" })).ok, true);
assert.deepEqual(parseMediaFields(form({ content: "  Hi  ", style: "Pun", source: "ai" })), { ok: true, value: { content: "Hi", style: "Pun", source: "ai", description: null } });
assert.equal(parseMediaFields(form({ content: " ", style: "Pun", source: "ai" })).ok, false);
assert.equal(parseMediaFields(form({ content: "x".repeat(241), style: "Pun", source: "ai" })).ok, false);
assert.equal(parseMediaFields(form({ content: "ok", style: "Evil", source: "ai" })).ok, false);
assert.equal(parseMediaFields(form({ content: "ok", style: "Pun", source: "scraped" })).ok, false);
assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
assert.equal(sniffImage(new Uint8Array(Buffer.from("GIF89a......"))), "image/gif");
assert.equal(sniffImage(new Uint8Array(Buffer.from("<svg onload=1>"))), null);
assert.equal(tokenCount({ attempts: [{ totalTokenCount: 100 }, { totalTokenCount: 50 }] }), 150);
assert.equal(tokenCount({ totalTokenCount: 7 }), 7);
assert.equal(tokenCount(null), 0);

// Stats: laugh rate, styles, funnel, self-laughs and exclusion of deleted posts.
const now = new Date("2026-10-20T16:00:00Z");
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const profile = (n: number, extra = {}) => ({ id: u(n), username: `user${n}`, first_name: null, last_name: null, display_name: null, avatar_path: null, created_at: now.toISOString(), onboarded_at: now.toISOString(), is_official: false, is_superadmin: false, ...extra });
const stats = computeStats({
  now,
  profiles: [profile(1, { is_superadmin: true }), profile(2), profile(3, { is_official: true })],
  images: [
    { id: "i1", user_id: u(1), status: "ready", created_at: "2026-10-19T12:00:00Z", storage_path: "a" },
    { id: "i2", user_id: u(2), status: "ready", created_at: "2026-10-10T12:00:00Z", storage_path: "b" },
    { id: "i3", user_id: u(2), status: "ready", created_at: "2026-10-18T12:00:00Z", storage_path: "c" },
    { id: "i4", user_id: u(2), status: "processing", created_at: "2026-10-20T12:00:00Z", storage_path: null },
  ],
  captions: [
    { id: "c1", image_id: "i1", content: "short", style: "Pun", source: "ai", created_at: "2026-10-19T12:00:00Z", deleted_at: null },
    { id: "c2", image_id: "i2", content: "x".repeat(90), style: "Roast", source: "ai", created_at: "2026-10-10T12:00:00Z", deleted_at: null },
    { id: "c3", image_id: "i3", content: "gone", style: "Pun", source: "handmade", created_at: "2026-10-18T12:00:00Z", deleted_at: "2026-10-19T00:00:00Z" },
  ],
  votes: [
    { user_id: u(2), caption_id: "c1", value: 1, created_at: "2026-10-19T12:30:00Z" },
    { user_id: u(1), caption_id: "c1", value: 1, created_at: "2026-10-19T13:00:00Z" },
    { user_id: u(1), caption_id: "c3", value: 1, created_at: "2026-10-18T13:00:00Z" },
  ],
  comments: [{ id: "m1", caption_id: "c1", user_id: u(2), created_at: "2026-10-19T14:00:00Z", deleted_at: null }],
  commentVotes: [{ comment_id: "m1", user_id: u(1), created_at: "2026-10-19T15:00:00Z" }],
  generations: [
    { image_id: "i1", status: "completed", model: "gemini", failure_stage: null, usage_metadata: { attempts: [{ totalTokenCount: 1000 }] }, created_at: "2026-10-19T11:59:50Z", completed_at: "2026-10-19T12:00:00Z" },
    { image_id: "i4", status: "failed", model: "gemini", failure_stage: "provider", usage_metadata: null, created_at: "2026-10-20T12:00:00Z", completed_at: null },
  ],
  saves: [{ caption_id: "c1" }],
  reports: [{ caption_id: "c2", reason: "Spam" }],
});
assert.equal(stats.totals.members, 2);
assert.equal(stats.totals.superadmins, 1);
assert.equal(stats.totals.livePosts, 2);
assert.equal(stats.totals.deletedPosts, 1);
assert.equal(stats.totals.ha, 2, "votes on deleted posts are excluded");
assert.equal(stats.totals.laughRate, 0.5);
assert.equal(stats.selfLaughs, 1);
assert.equal(stats.silent, 1, "c2 is older than 3 days with no Ha");
assert.equal(stats.medianFirstLaugh, 30 * 60_000);
assert.deepEqual(stats.funnel.map((s) => s.count), [4, 3, 2, 1]);
assert.equal(stats.aiCaptioned, 1);
assert.equal(stats.styles[0].style, "Pun");
assert.equal(stats.styles[0].average, 2);
assert.equal(stats.hall[0].id, "c1");
assert.equal(stats.crowd[0].id, u(1));
assert.equal(stats.gemini.tokens, 1000);
assert.equal(stats.gemini.medianLatency, 10_000);
assert.equal(stats.gemini.failures[0].stage, "provider");
assert.equal(stats.laughs, 3, "two Ha + one comment heart");
assert.equal(stats.days.length, 30);
assert.equal(stats.days.reduce((s, d) => s + d.ha, 0), 2);
assert.equal(stats.lengths[0].average, 2);
console.log("PASS admin gate, safe redirects, media validation and dashboard statistics.");
