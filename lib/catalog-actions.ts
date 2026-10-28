"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireSuperadmin } from "./admin";
import { catalogPath, dbErrorMessage, parseMix, parseRecord, resource, STEP_RESOURCE, type Resource } from "./catalog";
import { serviceClient } from "./supabase/service";

// On an error the submitted values come back so the form is refilled, not cleared.
export type CatalogState = { error?: string; ok?: string; values?: Record<string, string | boolean>; at?: number } | null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failed(def: Resource, form: FormData, error: string): CatalogState {
  const values = Object.fromEntries(def.fields.map((f) => [f.name, f.kind === "checkbox" ? form.get(f.name) === "on" : String(form.get(f.name) ?? "")]));
  return { error, values, at: Date.now() };
}

// Team & access tables (sign-up lists) are superadmin-only, like the rest of that page.
async function authorize(form: FormData) {
  const def = resource(String(form.get("resource") ?? ""));
  const admin = def?.section === "team" ? await requireSuperadmin() : await requireAdmin();
  return { admin, def };
}

export async function createRecord(_: CatalogState, form: FormData): Promise<CatalogState> {
  const { admin, def } = await authorize(form);
  if (!def) return { error: "Unknown table." };
  const parsed = parseRecord(def, form);
  if (!parsed.ok) return failed(def, form, parsed.error);
  const row = def.stampCreator ? { ...parsed.value, created_by: admin.id } : parsed.value;
  const { error } = await serviceClient(admin.id).from(def.table).insert(row);
  if (error) return failed(def, form, dbErrorMessage(def, error));
  revalidatePath(catalogPath(def));
  return { ok: `Added ${def.singular}.` };
}

export async function updateRecord(_: CatalogState, form: FormData): Promise<CatalogState> {
  const { admin, def } = await authorize(form);
  const id = String(form.get("id") ?? "");
  if (!def || !UUID.test(id)) return { error: "Unknown record." };
  const parsed = parseRecord(def, form);
  if (!parsed.ok) return failed(def, form, parsed.error);
  const { data, error } = await serviceClient(admin.id).from(def.table).update(parsed.value).eq("id", id).select("id").maybeSingle();
  if (error) return failed(def, form, dbErrorMessage(def, error));
  if (!data) return { error: `This ${def.singular} no longer exists.` };
  revalidatePath(catalogPath(def));
  revalidatePath(catalogPath(def, id));
  return { ok: "Saved." };
}

export async function deleteRecord(form: FormData) {
  const { admin, def } = await authorize(form);
  const id = String(form.get("id") ?? "");
  if (!def || !UUID.test(id)) redirect("/");
  const db = serviceClient(admin.id);
  // A chain still receiving traffic would leave the mix below 100%.
  if (def.slug === "prompt-chains") {
    const { data: mix } = await db.from("humor_prompt_chain_mix").select("share").eq("chain_id", id).maybeSingle();
    if (mix?.share) redirect(`${catalogPath(def, id)}?blocked=mix`);
  }
  const { error } = await db.from(def.table).delete().eq("id", id);
  if (error?.code === "23503") redirect(`${catalogPath(def, id)}?blocked=1`);
  if (error) throw new Error(error.message);
  revalidatePath(catalogPath(def));
  redirect(`${catalogPath(def)}?deleted=1`);
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
  revalidatePath("/ai/prompt-chains", "layout");
  return { ok: "Mix saved." };
}

// Steps are created and edited on their chain's page.
export async function saveStep(_: CatalogState, form: FormData): Promise<CatalogState> {
  const admin = await requireAdmin();
  const chainId = String(form.get("chain_id") ?? "");
  const id = String(form.get("id") ?? "");
  if (!UUID.test(chainId) || (id && !UUID.test(id))) return { error: "Unknown step." };
  const parsed = parseRecord(STEP_RESOURCE, form);
  if (!parsed.ok) return failed(STEP_RESOURCE, form, parsed.error);
  const db = serviceClient(admin.id).from(STEP_RESOURCE.table);
  const { data, error } = id
    ? await db.update(parsed.value).eq("id", id).eq("chain_id", chainId).select("id").maybeSingle()
    : await db.insert({ ...parsed.value, chain_id: chainId }).select("id").single();
  if (error) return failed(STEP_RESOURCE, form, dbErrorMessage(STEP_RESOURCE, error));
  if (!data) return { error: "This step no longer exists." };
  revalidatePath(`/ai/prompt-chains/${chainId}`);
  return { ok: id ? "Step saved." : "Step added." };
}

export async function deleteStep(form: FormData) {
  const admin = await requireAdmin();
  const chainId = String(form.get("chain_id") ?? "");
  const id = String(form.get("id") ?? "");
  if (!UUID.test(chainId) || !UUID.test(id)) redirect("/ai/prompt-chains");
  const { error } = await serviceClient(admin.id).from(STEP_RESOURCE.table).delete().eq("id", id).eq("chain_id", chainId);
  if (error) throw new Error(error.message);
  revalidatePath(`/ai/prompt-chains/${chainId}`);
  redirect(`/ai/prompt-chains/${chainId}?step=deleted`);
}
