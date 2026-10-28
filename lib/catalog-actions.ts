"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "./admin";
import { dbErrorMessage, parseMix, parseRecord, resource } from "./catalog";
import { serviceClient } from "./supabase/service";

export type CatalogState = { error?: string; ok?: string } | null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createRecord(_: CatalogState, form: FormData): Promise<CatalogState> {
  const admin = await requireAdmin();
  const def = resource(String(form.get("resource") ?? ""));
  if (!def) return { error: "Unknown table." };
  const parsed = parseRecord(def, form);
  if (!parsed.ok) return { error: parsed.error };
  const row = def.stampCreator ? { ...parsed.value, created_by: admin.id } : parsed.value;
  const { error } = await serviceClient(admin.id).from(def.table).insert(row);
  if (error) return { error: dbErrorMessage(def, error) };
  revalidatePath(`/catalog/${def.slug}`);
  return { ok: `Added ${def.singular}.` };
}

export async function updateRecord(_: CatalogState, form: FormData): Promise<CatalogState> {
  const admin = await requireAdmin();
  const def = resource(String(form.get("resource") ?? ""));
  const id = String(form.get("id") ?? "");
  if (!def || !UUID.test(id)) return { error: "Unknown record." };
  const parsed = parseRecord(def, form);
  if (!parsed.ok) return { error: parsed.error };
  const { data, error } = await serviceClient(admin.id).from(def.table).update(parsed.value).eq("id", id).select("id").maybeSingle();
  if (error) return { error: dbErrorMessage(def, error) };
  if (!data) return { error: `This ${def.singular} no longer exists.` };
  revalidatePath(`/catalog/${def.slug}`);
  revalidatePath(`/catalog/${def.slug}/${id}`);
  return { ok: "Saved." };
}

export async function deleteRecord(form: FormData) {
  const admin = await requireAdmin();
  const def = resource(String(form.get("resource") ?? ""));
  const id = String(form.get("id") ?? "");
  if (!def || !UUID.test(id)) redirect("/");
  const { error } = await serviceClient(admin.id).from(def.table).delete().eq("id", id);
  if (error?.code === "23503") redirect(`/catalog/${def.slug}/${id}?blocked=1`);
  if (error) throw new Error(error.message);
  revalidatePath(`/catalog/${def.slug}`);
  redirect(`/catalog/${def.slug}?deleted=1`);
}

// Replaces the whole mix in one database call, which re-checks the 100% total.
export async function updateMix(_: CatalogState, form: FormData): Promise<CatalogState> {
  const admin = await requireAdmin();
  const db = serviceClient(admin.id);
  const { data: chains, error: read } = await db.from("humor_prompt_chains").select("id");
  if (read) return { error: read.message };
  const parsed = parseMix((chains ?? []).map((c) => c.id as string), form);
  if (!parsed.ok) return { error: parsed.error };
  const { error } = await db.rpc("humor_set_prompt_chain_mix", { shares: parsed.shares, actor: admin.id });
  if (error) return { error: error.message };
  revalidatePath("/prompt-chains", "layout");
  return { ok: "Mix saved." };
}
