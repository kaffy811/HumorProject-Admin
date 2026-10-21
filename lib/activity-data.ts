import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST builders are chained dynamically. */
import { PAGE_SIZE } from "./data";
import { CATEGORIES, RANGES } from "./activity";
import { serviceClient } from "./supabase/service";

export type LogRow = { id: number; created_at: string; actor_id: string | null; category: string; action: string; via: string; post_id: string | null; target_id: string | null; detail: Record<string, unknown> };
export type LogFilter = { category: string; action: string; range: string; q: string; user: string; page: number };

export async function activityPage(f: LogFilter) {
  const db = serviceClient();
  const hours = RANGES[f.range]?.hours ?? null;
  const since = hours ? new Date(Date.now() - hours * 3_600_000).toISOString() : null;
  let actors: string[] | null = f.user ? [f.user] : null;
  if (f.q && !f.user) {
    const { data } = await db.from("profiles").select("id").or(`username.ilike.%${f.q}%,first_name.ilike.%${f.q}%,last_name.ilike.%${f.q}%`).limit(100);
    actors = (data ?? []).map((r: { id: string }) => r.id);
  }
  const scope = (query: any, withCategory: boolean) => {
    if (since) query = query.gte("created_at", since);
    if (actors) query = query.in("actor_id", actors.length ? actors : ["00000000-0000-0000-0000-000000000000"]);
    if (withCategory && f.category) query = query.eq("category", f.category);
    if (withCategory && f.action) query = query.eq("action", f.action);
    return query;
  };
  const list = await scope(db.from("humor_activity_log").select("*", { count: "exact" }), true)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (list.error) return null;
  const counts = await Promise.all(["", ...Object.keys(CATEGORIES)].map(async (key) => {
    let query = scope(db.from("humor_activity_log").select("id", { count: "exact", head: true }), false);
    if (key) query = query.eq("category", key);
    return [key, (await query).count ?? 0] as const;
  }));
  return { rows: (list.data ?? []) as LogRow[], total: (list.count ?? 0) as number, counts, db };
}

export async function recentActivity(userId: string, limit = 25) {
  const { data, error } = await serviceClient().from("humor_activity_log").select("*").eq("actor_id", userId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  return error ? null : ((data ?? []) as LogRow[]);
}
