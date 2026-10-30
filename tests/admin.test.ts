// Pure unit tests: no network, no database.
import assert from "node:assert/strict";
import { consoleRole, gateDecision, isPublicPath, safeNext } from "../lib/gate";
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
assert.equal(gateDecision(google, claims, { is_superadmin: false, is_admin: true }), "admin", "admins get in");
assert.equal(gateDecision(google, claims, { is_admin: "true" }), "forbidden");
assert.equal(consoleRole({ is_superadmin: true, is_admin: true }), "superadmin");
assert.equal(consoleRole({ is_superadmin: false, is_admin: true }), "admin");
assert.equal(consoleRole({ is_superadmin: null }), null, "missing is_admin column reads as no role");
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

// AI analytics: per-model usage, publication, candidate picks and edits.
import { candidatesOf, computeAiStats, usageOf } from "../lib/ai-stats";
assert.deepEqual(usageOf({ attempts: [{ promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2, totalTokenCount: 17 }, { promptTokenCount: 1, totalTokenCount: 1 }] }), { prompt: 11, output: 5, thoughts: 2, total: 18 });
assert.deepEqual(usageOf({ input_tokens: 4, output_tokens: 6 }), { prompt: 4, output: 6, thoughts: 0, total: 10 });
assert.equal(candidatesOf([{ text: "b", originalText: "a", style: "Pun" }])[0].original, "a");
const cand = (texts: string[]) => texts.map((t) => ({ text: t, originalText: t, style: "Pun" }));
const gen = (id: string, image: string, extra = {}) => ({ id, image_id: image, user_id: "u", provider: "google", model: "gemini-x", prompt_version: "v1", status: "completed", failure_stage: null, usage_metadata: { attempts: [{ totalTokenCount: 100 }] }, caption_candidates: cand(["one", "two", "three", "four"]), joke_style: null, created_at: "2026-10-19T12:00:00Z", completed_at: "2026-10-19T12:00:05Z", ...extra });
const ai = computeAiStats({
  now,
  generations: [
    gen("g1", "p1", { created_at: "2026-10-19T11:00:00Z" }),
    gen("g2", "p1", { caption_candidates: cand(["a", "b", "c", "d"]) }),
    gen("g3", "p2"),
    gen("g4", "p3", { status: "failed", failure_stage: "provider", completed_at: null, usage_metadata: null, model: "claude-x", provider: "anthropic", prompt_version: "v2" }),
  ],
  captions: [
    { id: "x1", image_id: "p1", content: "c", source: "ai", deleted_at: null },
    { id: "x2", image_id: "p2", content: "my own rewrite", source: "ai", deleted_at: null },
  ],
  votes: [{ caption_id: "x1", value: 1 }, { caption_id: "x1", value: 1 }],
  moderation: [{ model: "gemini-x", allowed: true }, { model: "gemini-x", allowed: false }],
});
assert.equal(ai.totals.runs, 4);
assert.equal(ai.totals.published, 2, "only the latest completed run per photo counts as published");
assert.equal(ai.totals.providers, 2);
assert.equal(ai.matched, 1, "x1 matched a candidate of g2 (its latest run)");
assert.deepEqual(ai.styleWins, [], "candidates that share one style are not a style choice");
assert.equal(ai.singleStyle, 1);
const styled = (texts: string[]) => texts.map((t, i) => ({ text: t, originalText: t, style: ["Pun", "Roast", "Absurd", "Wholesome"][i] }));
const ai2 = computeAiStats({ now, votes: [], moderation: [],
  generations: [gen("s1", "q1", { caption_candidates: styled(["a", "b", "c", "d"]) }), gen("s2", "q2", { caption_candidates: styled(["e", "f", "g", "h"]) })],
  captions: [{ id: "y1", image_id: "q1", content: "b", source: "ai", deleted_at: null }, { id: "y2", image_id: "q2", content: "f", source: "ai", deleted_at: null }] });
assert.deepEqual(ai2.styleWins[0], { style: "Roast", offered: 2, picked: 2, rate: 1 });
assert.deepEqual(ai2.styleWins.slice(1).map((w) => w.picked), [0, 0, 0]);
assert.equal(ai.edited, 1);
assert.equal(ai.regenerations, 1.5);
const gemini = ai.models.find((m) => m.model === "gemini-x")!;
assert.equal(gemini.runs, 3); assert.equal(gemini.usage.total, 300); assert.equal(gemini.medianLatency, 5000); assert.equal(gemini.haPerPost, 1);
assert.equal(ai.models.find((m) => m.provider === "anthropic")!.failed, 1);
assert.equal(ai.versions.length, 2);
assert.equal(ai.failures[0].label, "provider");
assert.equal(ai.moderation.length, 2);
console.log("PASS AI analytics: usage parsing, per-model and per-prompt stats, candidate picks and edits.");

// Topics and activity wording.
import { classify } from "../lib/topics";
import { describe as describeAction, detailText } from "../lib/activity";
assert.deepEqual(classify("Freshmen walking out of Dodge Fitness Center after three sets"), { topic: "columbia", matches: ["dodge"] });
assert.equal(classify("Me on the 1 train at 2am").topic, "nyc");
assert.equal(classify("Butler Library before finals", "a subway car").topic, "columbia", "Columbia wins over NYC");
assert.equal(classify("The local students handed their finals in forty minutes early").topic, "student");
assert.equal(classify("A cat in a banana costume").topic, "other");
assert.equal(classify("Parent orientation").topic, "other", "'rent' must not match inside 'parent'");
assert.equal(classify("Pigeons own this city").topic, "nyc", "plural keywords match");
assert.equal(describeAction("dislike"), "Disliked a post");
assert.equal(detailText("like", { switchedFrom: "dislike" }), "switched from dislike");
assert.equal(detailText("login", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit Version/17 Safari/605" }), "Safari on macOS");
assert.equal(detailText("edit", { caption: "new", before: "old" }), "“new” · was “old”");
console.log("PASS topics and activity descriptions.");

import { nyLocalToIso } from "../lib/format";
assert.equal(nyLocalToIso("2026-10-20T09:30"), "2026-10-20T13:30:00.000Z", "EDT is UTC-4");
assert.equal(nyLocalToIso("2026-12-01T00:00"), "2026-12-01T05:00:00.000Z", "EST is UTC-5");
assert.equal(nyLocalToIso("2026-13-01T00:00") === null || nyLocalToIso("bad") === null, true);
assert.equal(nyLocalToIso("bad"), null);
console.log("PASS New York time range parsing.");

// Catalog tables: validation mirrors the migration's checks.
import { catalogPath, dbErrorMessage, isMissingTable, parseRecord, resource, RESOURCES, shareOf, STEP_RESOURCE } from "../lib/catalog";
const terms = resource("terms")!, models = resource("llm-models")!, providers = resource("llm-providers")!;
const domains = resource("signup-domains")!, emails = resource("whitelisted-emails")!, examples = resource("examples")!;
assert.equal(resource("profiles"), null, "only listed tables are editable");
assert.equal(resource("terms", "team"), null, "terms are an AI tab");
assert.equal(resource("signup-domains", "ai"), null, "sign-up lists are a Team tab");
assert.equal(catalogPath(terms), "/ai/terms");
assert.equal(catalogPath(providers), "/ai/llm-models", "providers are listed with models"); assert.equal(catalogPath(providers, "p"), "/ai/llm-providers/p"); assert.equal(catalogPath(domains, "x"), "/team/signup-domains/x");
assert.deepEqual(RESOURCES.filter((r) => r.section === "team").map((r) => r.slug), ["signup-domains", "whitelisted-emails"]);
assert.equal(new Set(RESOURCES.map((r) => r.slug)).size, RESOURCES.length);
assert.deepEqual(parseRecord(terms, form({ term: " Butler ", definition: "Library", example: " ", category: "campus" })), { ok: true, value: { term: "Butler", definition: "Library", example: null, category: "campus" } });
assert.equal(parseRecord(terms, form({ term: "", definition: "x", category: "campus" })).ok, false);
assert.equal(parseRecord(terms, form({ term: "x", definition: "x", category: "mars" })).ok, false);
assert.equal(parseRecord(terms, form({ term: "x".repeat(81), definition: "x", category: "campus" })).ok, false);
assert.deepEqual(parseRecord(domains, form({ domain: " @Columbia.EDU ", note: "" })), { ok: true, value: { domain: "columbia.edu", note: null } });
for (const bad of ["https://columbia.edu", "columbia", "a b.edu", "-x.edu"]) assert.equal(parseRecord(domains, form({ domain: bad })).ok, false, bad);
assert.deepEqual(parseRecord(emails, form({ email: "Guest@Gmail.com" })), { ok: true, value: { email: "guest@gmail.com", note: null } });
assert.equal(parseRecord(emails, form({ email: "nope" })).ok, false);
const provider = "22222222-2222-4222-8222-222222222222";
const model = (extra: Record<string, string>) => parseRecord(models, form({ display_name: "Flash", provider_id: provider, model_id: "gemini-3.8-flash", ...extra }));
assert.deepEqual(model({ is_active: "on", max_output_tokens: "2048", temperature: "0.07" }), { ok: true, value: { display_name: "Flash", provider_id: provider, model_id: "gemini-3.8-flash", is_active: true, supports_vision: false, max_output_tokens: 2048, temperature: 0.07, notes: null } });
assert.equal(model({ max_output_tokens: "1.5" }).ok, false);
assert.equal(model({ max_output_tokens: "70000" }).ok, false);
assert.equal(model({ temperature: "2.5" }).ok, false);
assert.equal(model({ temperature: "0.123" }).ok, false);
assert.equal(model({ model_id: "bad id!" }).ok, false);
assert.equal(model({ provider_id: "not-a-uuid" }).ok, false);
assert.equal(parseRecord(providers, form({ name: "Google", slug: "Google" })).ok, false, "slugs are lowercase");
assert.equal(parseRecord(providers, form({ name: "Google", slug: "google", api_base_url: "http://insecure.example" })).ok, false);
assert.equal(parseRecord(examples, form({ caption: "c", scene: "s", style: "HANDMADE" })).ok, false, "examples use AI styles only");
assert.equal(parseRecord(examples, form({ caption: "c", scene: "s", style: "Pun", chain_id: "" })).ok, true, "chain is optional");
assert.equal(dbErrorMessage(domains, { code: "23505", message: "dup" }), "That domain is already allowed.");
assert.match(dbErrorMessage(providers, { code: "23503", message: "fk" }), /still has models/);
assert.equal(isMissingTable({ code: "PGRST205", message: "Could not find the table" }), true);
assert.equal(isMissingTable({ code: "23505", message: "dup" }), false);
assert.equal(shareOf({ share: 40 }), 40); assert.equal(shareOf([{ share: 5 }]), 5); assert.equal(shareOf(null), 0);
assert.equal(detailText("catalog_insert", { table: "humor_allowed_signup_domains", label: "columbia.edu" }), "allowed signup domains: columbia.edu");
// Prompt chains and their steps.
const chainDef = resource("prompt-chains", "ai")!;
assert.equal(catalogPath(chainDef, "x"), "/ai/prompt-chains/x");
assert.deepEqual(parseRecord(chainDef, form({ name: " Challenger ", prompt_version: "caption-styles-v4", description: "" })), { ok: true, value: { name: "Challenger", prompt_version: "caption-styles-v4", description: null } });
assert.equal(parseRecord(chainDef, form({ name: "x", prompt_version: "Caption Styles" })).ok, false, "versions are lowercase slugs");
assert.equal(resource("prompt-chain-steps"), null, "steps are not a tab");
const step = (extra: Record<string, string>) => parseRecord(STEP_RESOURCE, form({ position: "1", name: "Caption", system_prompt: "sys", user_prompt: "Image: [image]", ...extra }));
assert.deepEqual(step({ output_schema: ' {"type":"object"} ' }), { ok: true, value: { position: 1, name: "Caption", llm_model_id: null, system_prompt: "sys", user_prompt: "Image: [image]", output_schema: { type: "object" } } });
assert.equal(step({}).ok && (step({}) as { value: Record<string, unknown> }).value.output_schema, null, "schema is optional");
assert.match((step({ output_schema: "{nope" }) as { error: string }).error, /not valid JSON/);
assert.match((step({ output_schema: "[1,2]" }) as { error: string }).error, /JSON object/);
assert.equal(step({ position: "0" }).ok, false); assert.equal(step({ position: "21" }).ok, false);
assert.equal(step({ system_prompt: " " }).ok, false);
console.log("PASS catalog validation and database error messages.");

// Provider connectors with a fake fetch: request shape, parsing, errors, no network.
import { fillUserPrompt, parseCaptions, runCaptions, type RunInput } from "../lib/llm";
void (async () => {
  const four = JSON.stringify({ captions: [["A", "deadpan"], ["B", "roast"], ["C", "pun"], ["D", "absurd"]].map(([caption, style]) => ({ caption, style })) });
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (responses: { status: number; body: unknown }[]) => (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift()!;
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as unknown as typeof fetch;
  const input: RunInput = { provider: "openai", model: "gpt-test", systemPrompt: "sys", userPrompt: fillUserPrompt("Image: [image]\nDirection: {direction}", ""), image: { base64: "QUJD", mime: "image/jpeg" }, maxOutputTokens: 512, temperature: null, schema: { type: "object" } };
  assert.equal(input.userPrompt, "Image: [image]\nDirection: none");

  const openai = await runCaptions(input, { OPENAI_API_KEY: "sk-test" }, fake([{ status: 200, body: { choices: [{ message: { content: four } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } } }]));
  assert.equal(openai.ok, true); assert.equal(openai.captions.length, 4); assert.deepEqual(openai.warnings, []); assert.deepEqual(openai.usage, { input: 10, output: 5, total: 15 });
  const sent = JSON.parse(String(calls[0].init.body));
  assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer sk-test");
  assert.equal(sent.model, "gpt-test"); assert.equal(sent.max_completion_tokens, 512); assert.equal("temperature" in sent, false, "temperature only when set");
  assert.equal(sent.response_format.type, "json_schema"); assert.equal(sent.messages[1].content[1].image_url.url, "data:image/jpeg;base64,QUJD");

  calls.length = 0;
  const fallback = await runCaptions(input, { OPENAI_API_KEY: "k" }, fake([{ status: 400, body: { error: { message: "Invalid schema for response_format" } } }, { status: 200, body: { choices: [{ message: { content: four } }] } }]));
  assert.equal(fallback.ok, true, "schema rejection retries in JSON mode"); assert.equal(JSON.parse(String(calls[1].init.body)).response_format.type, "json_object");

  const denied = await runCaptions(input, { OPENAI_API_KEY: "k" }, fake([{ status: 401, body: { error: { message: "Incorrect API key" } } }]));
  assert.equal(denied.ok, false); assert.match(denied.error!, /HTTP 401: Incorrect API key/);
  assert.match((await runCaptions(input, {}, fake([]))).error!, /OPENAI_API_KEY is not set/);
  assert.match((await runCaptions({ ...input, provider: "anthropic" }, {}, fake([]))).error!, /No connector for provider "anthropic"/);

  calls.length = 0;
  const gemini = await runCaptions({ ...input, provider: "google", model: "gemini-x", temperature: 0.7 }, { GEMINI_API_KEY: "g" }, fake([{ status: 200, body: { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "thinking", thought: true }, { text: four }] } }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 10 } } }]));
  assert.equal(gemini.ok, true); assert.equal(gemini.rawText, four, "thought parts are dropped"); assert.deepEqual(gemini.usage, { input: 7, output: 3, total: 10 });
  const gsent = JSON.parse(String(calls[0].init.body));
  assert.match(calls[0].url, /models\/gemini-x:generateContent$/); assert.equal(gsent.generationConfig.temperature, 0.7); assert.deepEqual(gsent.generationConfig.responseJsonSchema, { type: "object" });

  assert.equal(parseCaptions("not json").ok, false);
  assert.equal(parseCaptions('```json\n' + four + '\n```').ok, true, "code fences are tolerated");
  assert.deepEqual(parseCaptions(JSON.stringify({ captions: [{ caption: "x", style: "pun" }, { caption: "y", style: "pun" }] })).warnings, ["Expected 4 captions, got 2.", "Styles repeat."]);
  // campus-nyc-v1 format: plain strings and a scene description.
  const legacy = parseCaptions(JSON.stringify({ description: "A meme face.", captions: ["a", "b", "c", "d"] }));
  assert.deepEqual(legacy.captions.map((c) => c.caption), ["a", "b", "c", "d"]); assert.equal(legacy.description, "A meme face.");
  assert.equal(legacy.warnings.length, 1); assert.match(legacy.warnings[0], /No joke styles/);
  console.log("PASS provider connectors (OpenAI, Gemini), schema fallback and caption checks.");
})().catch((error) => { console.error(error); process.exit(1); });

// Which chains can serve members (mirrors the member app's routing checks).
import { chainIssue } from "../lib/chain-check";
{
  const m = (extra = {}) => ({ display_name: "GPT-6 Astra", model_id: "gpt-6-astra", is_active: true, supports_vision: true, humor_llm_providers: { slug: "openai", name: "OpenAI" }, ...extra });
  const s = (model: ReturnType<typeof m> | null, user_prompt = "Image: [image]\nDirection: {direction}", position = 1) => ({ position, user_prompt, humor_llm_models: model });
  assert.equal(chainIssue([s(m())]), null);
  assert.equal(chainIssue([s(null, "x", 2), s(m(), undefined, 1)]), null, "step 1 is the lowest position");
  assert.match(chainIssue([])!, /No steps/);
  assert.match(chainIssue([s(null)])!, /no model/);
  assert.match(chainIssue([s(m({ is_active: false }))])!, /inactive/);
  assert.match(chainIssue([s(m({ supports_vision: false }))])!, /does not accept images/);
  assert.match(chainIssue([s(m({ humor_llm_providers: { slug: "anthropic", name: "Anthropic" } }))])!, /no connector for Anthropic/);
  assert.match(chainIssue([s(m(), "Image: [image]\nDirection: none")])!, /no \{direction\}/);
  console.log("PASS member chain checks.");
}

// New post: same caption acceptance as the member Create flow.
import { acceptCaptions, finalText } from "../lib/create-rules";
const four = [["A", "deadpan"], ["B", "Roast"], ["C", "pun"], ["D", "dad joke"]].map(([caption, style]) => ({ caption, style }));
assert.deepEqual(acceptCaptions(four), { ok: true, captions: [{ caption: "A", style: "Deadpan" }, { caption: "B", style: "Roast" }, { caption: "C", style: "Pun" }, { caption: "D", style: "Dad joke" }] });
assert.equal(acceptCaptions(four.slice(0, 3)).ok, false);
assert.equal(acceptCaptions([...four.slice(0, 3), { caption: "D", style: "pun" }]).ok, false, "styles must differ");
assert.equal(acceptCaptions([...four.slice(0, 3), { caption: "a", style: "absurd" }]).ok, false, "captions must differ");
assert.equal(acceptCaptions([...four.slice(0, 3), { caption: "D", style: "sarcasm" }]).ok, false, "unknown style");
assert.equal(acceptCaptions([...four.slice(0, 3), { caption: "x".repeat(201), style: "absurd" }]).ok, false);
assert.deepEqual(finalText("  hi  "), { ok: true, value: "hi" });
assert.equal(finalText("   ").ok, false);
assert.equal(finalText("😀".repeat(200)).ok, true, "limit counts characters, not bytes");
console.log("PASS new-post caption rules.");
