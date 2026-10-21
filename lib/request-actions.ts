"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./admin";
import { googleMember } from "./requests";
import { serviceClient } from "./supabase/service";

export type RequestState = { error?: string; ok?: string } | null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Any Google-signed-in member may ask; nothing is granted until a superadmin approves.
export async function requestAccess(_: RequestState, form: FormData): Promise<RequestState> {
  const user = await googleMember();
  if (!user) return { error: "Sign in with Google first." };
  const message = String(form.get("message") ?? "").trim().slice(0, 500) || null;
  const db = serviceClient();
  const { data: profile } = await db.from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
  if (!profile) return { error: "Sign in to the member app once so your profile exists, then try again." };
  if (profile.is_superadmin) return { ok: "You are already a superadmin. Reload the page." };
  const { error } = await db.from("humor_admin_requests").insert({ user_id: user.id, message });
  if (error?.code === "23505") return { ok: "Your request is already waiting for review." };
  if (error) return { error: "Requests are not available yet. Ask a superadmin to apply the latest database migration." };
  revalidatePath("/denied");
  return { ok: "Request sent. A superadmin will review it." };
}

export async function decideRequest(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const approve = form.get("decision") === "approve";
  if (!UUID.test(id)) return;
  const { error } = await serviceClient(admin.id).rpc("humor_decide_admin_request", { request_id: id, approver: admin.id, approve });
  if (error && !/already decided/.test(error.message)) throw new Error(error.message);
  revalidatePath("/", "layout");
}
