import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { serviceClient } from "./supabase/service";
import { gateDecision } from "./gate";

export type Admin = { id: string; email: string | null; username: string | null };

// Every page and every Server Action calls this. The proxy is the first wall;
// this is the second, because actions are reachable by direct POST.
export const requireAdmin = cache(async (): Promise<Admin> => {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const { data: claims } = user ? await db.auth.getClaims() : { data: null };
  const { data: profile, error } = user
    ? await serviceClient().from("profiles").select("is_superadmin,username").eq("id", user.id).maybeSingle()
    : { data: null, error: null };
  if (error) throw new Error("Admin permissions could not be checked.");
  const result = gateDecision(user, claims?.claims, profile);
  if (result === "anonymous") redirect("/login");
  if (result !== "admin") redirect("/denied");
  return { id: user!.id, email: user!.email ?? null, username: profile?.username ?? null };
});
