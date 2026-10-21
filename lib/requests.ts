import "server-only";
import { createClient } from "./supabase/server";
import { serviceClient } from "./supabase/service";
import { isGoogleSession } from "./google-session";

export type AccessRequest = { id: string; user_id: string; message: string | null; status: "pending" | "approved" | "rejected"; created_at: string; decided_at: string | null; decided_by: string | null };

// Signed-in Google member, admin or not. Used only by the request flow.
export async function googleMember() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data } = await db.auth.getClaims();
  return isGoogleSession(user, data?.claims) ? user : null;
}

export async function latestRequest(userId: string) {
  const { data, error } = await serviceClient().from("humor_admin_requests").select("*")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle<AccessRequest>();
  // A missing table (migration not applied) reads as "no request yet".
  return error ? { request: null, ready: false } : { request: data, ready: true };
}

// Shown as a badge in the sidebar; null when the migration is not applied yet.
export async function pendingRequestCount() {
  const { count, error } = await serviceClient().from("humor_admin_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  return error ? null : count ?? 0;
}
