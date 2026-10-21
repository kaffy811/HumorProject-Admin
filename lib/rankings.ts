import "server-only";
import { fetchAll, profilesByIds, signedUrls } from "./data";
import { serviceClient } from "./supabase/service";
import { classify, TOPICS, type TopicKey } from "./topics";

export const PERIODS = { week: "Last 7 days", month: "Last 30 days", all: "All time" } as const;
export type Period = keyof typeof PERIODS;
export const periodOf = (value: string): Period => (value in PERIODS ? (value as Period) : "all");

type Author = { id: string; username: string; name: string; isOfficial: boolean };
export type RankedPost = { rank: number; id: string; caption: string; style: string; createdAt: string; haCount: number; commentCount: number; author: Author };
export type RankedPerson = { rank: number; user: Author; haReceived: number; postCount: number; bestPost: { id: string; caption: string } };

// The member Top page's own database function, so ranks are identical by construction.
export async function leaderboard(period: Period, viewer: string) {
  const db = serviceClient();
  const { data, error } = await db.rpc("humor_leaderboard", { period, viewer });
  if (error) throw new Error(`Ranking unavailable: ${error.message}`);
  const board = data as { posts: RankedPost[]; people: RankedPerson[]; computedAt: string; startsAt: string | null };
  const { data: images } = board.posts.length
    ? await db.from("humor_captions").select("id,humor_images!inner(storage_path)").in("id", board.posts.map((p) => p.id))
    : { data: [] };
  const paths = new Map(((images ?? []) as unknown as { id: string; humor_images: { storage_path: string | null } }[]).map((r) => [r.id, r.humor_images.storage_path]));
  const urls = await signedUrls(db, "humor-images", [...paths.values()]);
  return { ...board, thumb: (id: string) => { const p = paths.get(id); return p ? urls[p] : undefined; } };
}

type Live = { id: string; image_id: string; content: string; created_at: string; deleted_at: string | null };
async function liveContent() {
  const db = serviceClient();
  const [captions, images, votes] = await Promise.all([
    fetchAll<Live>(db, "humor_captions", "id,image_id,content,created_at,deleted_at"),
    fetchAll<{ id: string; user_id: string; status: string; description: string | null; storage_path: string | null }>(db, "humor_images", "id,user_id,status,description,storage_path"),
    fetchAll<{ caption_id: string; value: number }>(db, "humor_votes", "caption_id,value"),
  ]);
  const image = new Map(images.map((i) => [i.id, i]));
  const ha = new Map<string, number>();
  for (const v of votes) if (v.value === 1) ha.set(v.caption_id, (ha.get(v.caption_id) || 0) + 1);
  const posts = captions.filter((c) => !c.deleted_at && image.get(c.image_id)?.status === "ready")
    .map((c) => ({ ...c, author: image.get(c.image_id)!.user_id, description: image.get(c.image_id)!.description, path: image.get(c.image_id)!.storage_path, ha: ha.get(c.id) || 0 }));
  return { db, posts };
}

// Most posts: live posts, then Ha received, then whoever posted most recently.
export async function mostPosts() {
  const { db, posts } = await liveContent();
  const by = new Map<string, { id: string; posts: number; ha: number; latest: string }>();
  for (const p of posts) {
    const row = by.get(p.author) ?? { id: p.author, posts: 0, ha: 0, latest: "" };
    row.posts++; row.ha += p.ha; if (p.created_at > row.latest) row.latest = p.created_at;
    by.set(p.author, row);
  }
  const rows = [...by.values()].sort((a, b) => b.posts - a.posts || b.ha - a.ha || b.latest.localeCompare(a.latest) || a.id.localeCompare(b.id));
  const people = await profilesByIds(db, rows.map((r) => r.id));
  return rows.map((r, i) => ({ ...r, rank: i + 1, profile: people.get(r.id) ?? null }));
}

export async function topicStats() {
  const { db, posts } = await liveContent();
  const tagged = posts.map((p) => ({ ...p, ...classify(p.content, p.description) }));
  const keys: TopicKey[] = [...TOPICS.map((t) => t.key), "other"];
  const topics = keys.map((key) => {
    const list = tagged.filter((p) => p.topic === key).sort((a, b) => b.ha - a.ha || b.created_at.localeCompare(a.created_at));
    const words = new Map<string, number>();
    for (const p of list) for (const w of p.matches) words.set(w, (words.get(w) || 0) + 1);
    const ha = list.reduce((s, p) => s + p.ha, 0);
    return { key, posts: list.length, ha, haPerPost: list.length ? ha / list.length : 0, words: [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8), top: list.slice(0, 10) };
  });
  const ranked = topics.filter((t) => t.key !== "other").sort((a, b) => b.ha - a.ha || b.posts - a.posts);
  const [people, urls] = await Promise.all([
    profilesByIds(db, topics.flatMap((t) => t.top.map((p) => p.author))),
    signedUrls(db, "humor-images", topics.flatMap((t) => t.top.map((p) => p.path))),
  ]);
  return { ranked, other: topics.find((t) => t.key === "other")!, total: posts.length, people, urls };
}
