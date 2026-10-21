import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST builders are chained dynamically. */
import { PAGE_SIZE } from "./data";
import { serviceClient } from "./supabase/service";

export type LogRow = { id: number; created_at: string; actor_id: string | null; category: string; action: string; via: string; post_id: string | null; target_id: string | null; detail: Record<string, unknown> };
export type LogFilter = { category: string; action: string; from: string | null; to: string | null; q: string; user: string; page: number };

export async function activityPage(f: LogFilter) {
  const db = serviceClient();
  let actors: string[] | null = f.user ? [f.user] : null;
  if (f.q && !f.user) {
    const { data } = await db.from("profiles").select("id").or(`username.ilike.%${f.q}%,first_name.ilike.%${f.q}%,last_name.ilike.%${f.q}%`).limit(100);
    actors = (data ?? []).map((r: { id: string }) => r.id);
  }
  let query: any = db.from("humor_activity_log").select("*", { count: "exact" });
  if (f.from) query = query.gte("created_at", f.from);
  if (f.to) query = query.lt("created_at", f.to);
  if (actors) query = query.in("actor_id", actors.length ? actors : ["00000000-0000-0000-0000-000000000000"]);
  if (f.category) query = query.eq("category", f.category);
  if (f.action) query = query.eq("action", f.action);
  const list = await query
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (list.error) return null;
  return { rows: (list.data ?? []) as LogRow[], total: (list.count ?? 0) as number, db };
}

export async function recentActivity(userId: string, limit = 25) {
  const { data, error } = await serviceClient().from("humor_activity_log").select("*").eq("actor_id", userId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  return error ? null : ((data ?? []) as LogRow[]);
}
