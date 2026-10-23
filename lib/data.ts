import "server-only";
import { serviceClient, type ServiceClient } from "./supabase/service";
import { storageBucket } from "./supabase/schema";
import { computeStats, type CaptionRow, type ProfileRow } from "./stats";
import { computeAiStats, type AiCaptionRow, type GenerationRow, type ModerationRow } from "./ai-stats";

export const PAGE_SIZE = 25;
// "*" keeps working before and after role columns are added.
const PROFILE_COLUMNS = "*";

// Reads a whole table in 1,000-row pages (PostgREST's default cap).
export async function fetchAll<T>(db: ServiceClient, table: string, columns: string, limit = 50_000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < limit; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function dashboardStats() {
  const db = serviceClient();
  const [profiles, images, captions, votes, comments, commentVotes, generations, saves, reports] = await Promise.all([
    fetchAll<ProfileRow>(db, "profiles", PROFILE_COLUMNS),
    fetchAll(db, "humor_images", "id,user_id,status,created_at,storage_path"),
    fetchAll<CaptionRow>(db, "humor_captions", "id,image_id,content,style,source,created_at,deleted_at"),
    fetchAll(db, "humor_votes", "user_id,caption_id,value,created_at"),
    fetchAll(db, "humor_comments", "id,caption_id,user_id,created_at,deleted_at"),
    fetchAll(db, "humor_comment_votes", "comment_id,user_id,created_at"),
    fetchAll(db, "humor_generations", "image_id,status,model,failure_stage,usage_metadata,created_at,completed_at"),
    fetchAll(db, "humor_saves", "caption_id"),
    fetchAll(db, "humor_reports", "caption_id,reason"),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Rows are typed by computeStats.
  const stats = computeStats({ profiles, images, captions, votes, comments, commentVotes, generations, saves, reports } as any);
  const thumbs = await signedUrls(db, "humor-images", stats.hall.map((post) => post.imagePath));
  return { ...stats, thumbs };
}

// Private buckets: short-lived signed URLs, generated per admin request.
export async function signedUrls(db: ServiceClient, bucket: string, paths: (string | null | undefined)[], seconds = 600) {
  const unique = [...new Set(paths.filter((path): path is string => !!path))];
  const result: Record<string, string> = {};
  if (!unique.length) return result;
  const { data } = await db.storage.from(storageBucket(bucket)).createSignedUrls(unique, seconds);
  for (const item of data ?? []) if (item.path && item.signedUrl) result[item.path] = item.signedUrl;
  return result;
}

export async function profilesByIds(db: ServiceClient, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, ProfileRow>();
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await db.from("profiles").select(PROFILE_COLUMNS).in("id", unique.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as ProfileRow[]) map.set(row.id, row);
  }
  return map;
}

// Auth emails / providers / last sign-in live in auth.users, not profiles.
export async function authUsers(db: ServiceClient) {
  const map = new Map<string, { email: string | null; lastSignIn: string | null; providers: string[]; banned: boolean }>();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const user of data.users)
      map.set(user.id, {
        email: user.email ?? null,
        lastSignIn: user.last_sign_in_at ?? null,
        providers: (user.app_metadata?.providers as string[] | undefined) ?? [],
        banned: !!user.banned_until && new Date(user.banned_until) > new Date(),
      });
    if (data.users.length < 1000) break;
  }
  return map;
}

// PostgREST or() filters cannot escape these, so search text drops them.
export function searchTerm(value: string) {
  return value.replace(/[%_,()\\*:"]/g, " ").replace(/\s+/g, " ").trim();
}
// Per-post rating table for the Votes page, sorted server-side.
export async function postRatings(db: ServiceClient, sort: string) {
  const [captions, images, votes, comments] = await Promise.all([
    fetchAll<{ id: string; image_id: string; content: string; style: string; created_at: string; deleted_at: string | null }>(db, "humor_captions", "id,image_id,content,style,created_at,deleted_at"),
    fetchAll<{ id: string; user_id: string }>(db, "humor_images", "id,user_id"),
    fetchAll<{ caption_id: string; value: number }>(db, "humor_votes", "caption_id,value"),
    fetchAll<{ caption_id: string; deleted_at: string | null }>(db, "humor_comments", "caption_id,deleted_at"),
  ]);
  const owner = new Map(images.map((i) => [i.id, i.user_id]));
  const tally = new Map<string, { up: number; down: number; comments: number }>();
  const get = (id: string) => tally.get(id) ?? (tally.set(id, { up: 0, down: 0, comments: 0 }), tally.get(id)!);
  votes.forEach((v) => (v.value === 1 ? get(v.caption_id).up++ : get(v.caption_id).down++));
  comments.forEach((c) => { if (!c.deleted_at) get(c.caption_id).comments++; });
  const now = Date.now();
  const rows = captions.filter((c) => !c.deleted_at).map((c) => {
    const t = tally.get(c.id) ?? { up: 0, down: 0, comments: 0 };
    const ageDays = Math.max(1, (now - new Date(c.created_at).getTime()) / 86_400_000);
    // Lower bound of a 95% Wilson interval: rewards consistent laughs, not just volume.
    const total = t.up + t.down;
    const z = 1.96, p = total ? t.up / total : 0;
    const wilson = total ? (p + (z * z) / (2 * total) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / (1 + (z * z) / total) : 0;
    return { ...c, ...t, net: t.up - t.down, perDay: t.up / ageDays, wilson, author: owner.get(c.image_id) ?? "" };
  });
  const sorts: Record<string, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
    ha: (a, b) => b.up - a.up, net: (a, b) => b.net - a.net, velocity: (a, b) => b.perDay - a.perDay,
    comments: (a, b) => b.comments - a.comments, wilson: (a, b) => b.wilson - a.wilson,
  };
  const key = sort in sorts ? sort : "ha";
  rows.sort((a, b) => sorts[key](a, b) || b.created_at.localeCompare(a.created_at));
  return { rows, key };
}
export const GENERATION_COLUMNS = "id,image_id,user_id,provider,model,prompt_version,status,failure_stage,usage_metadata,caption_candidates,joke_style,created_at,completed_at";
export async function aiOverview() {
  const db = serviceClient();
  const [generations, captions, votes, moderation] = await Promise.all([
    fetchAll<GenerationRow>(db, "humor_generations", GENERATION_COLUMNS),
    fetchAll<AiCaptionRow>(db, "humor_captions", "id,image_id,content,source,deleted_at"),
    fetchAll<{ caption_id: string; value: number }>(db, "humor_votes", "caption_id,value"),
    // Optional table (moderation was added later); absent → no rows.
    fetchAll<ModerationRow>(db, "humor_moderation_checks", "model,allowed").catch(() => []),
  ]);
  const stats = computeAiStats({ generations, captions, votes, moderation });
  // The exact prompt text of the newest run for each prompt version.
  const prompts = await Promise.all(stats.versions.map(async (v) => {
    const { data } = await db.from("humor_generations").select("id,system_prompt,user_prompt,generation_config,model,created_at")
      .eq("prompt_version", v.version).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return [v.version, data as { id: string; system_prompt: string; user_prompt: string; generation_config: unknown; model: string; created_at: string } | null] as const;
  }));
  return { ...stats, prompts: new Map(prompts) };
}
export { PROFILE_COLUMNS };
