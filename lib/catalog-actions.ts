"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireSuperadmin } from "./admin";
import { catalogPath, dbErrorMessage, parseRecord, resource, type Resource } from "./catalog";
import { chainIssue, modelIssue, withModel, type ChainModel, type ChainStep } from "./chain-check";
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

// Steps are edited only in the Prompt Chain Tool (one model per chain,
// placeholders checked, every change versioned); this console shows them read-only.

// Model for members: one prompt chain serves every member (100% of the mix) and
// the chosen model goes on every step of it. Afterwards the database is read
// back, so the message confirms what members will really get.
export async function chooseModelForMembers(_: CatalogState, form: FormData): Promise<CatalogState> {
  const admin = await requireAdmin();
  const chainId = String(form.get("chain") ?? ""), modelId = String(form.get("model") ?? "");
  if (!UUID.test(chainId)) return { error: "Choose a prompt chain." };
  if (!UUID.test(modelId)) return { error: "Choose a model." };
  const db = serviceClient(admin.id);
  const STEPS = "humor_prompt_chain_steps(*,humor_llm_models(id,display_name,model_id,is_active,supports_vision,humor_llm_providers(slug,name)))";
  const [{ data: chains, error: read }, { data: model }] = await Promise.all([
    db.from("humor_prompt_chains").select(`id,name,${STEPS}`),
    db.from("humor_llm_models").select("id,display_name,model_id,is_active,supports_vision,humor_llm_providers(slug,name)").eq("id", modelId).maybeSingle(),
  ]);
  if (read) return { error: read.message };
  const chain = (chains ?? []).find((c) => c.id === chainId);
  if (!chain) return { error: "That prompt chain no longer exists." };
  if (!model) return { error: "That model no longer exists." };
  const m = model as unknown as ChainModel;
  const steps = chain.humor_prompt_chain_steps as unknown as ChainStep[];
  const issue = modelIssue(m, steps) ?? chainIssue(withModel(steps, m));
  if (issue) return { error: `${m.display_name} cannot run ${chain.name} for members: ${issue}` };

  // Every step (one statement), then the chain's own model setting where it exists.
  const { error: stepsError } = await db.from("humor_prompt_chain_steps").update({ llm_model_id: modelId }).eq("chain_id", chainId);
  if (stepsError) return { error: stepsError.message };
  const { error: chainError } = await db.from("humor_prompt_chains").update({ llm_model_id: modelId }).eq("id", chainId);
  if (chainError && !/llm_model_id|column|schema cache/i.test(chainError.message)) return { error: chainError.message };
  const shares = Object.fromEntries((chains ?? []).map((c) => [c.id as string, c.id === chainId ? 100 : 0]));
  const { error } = await db.rpc("humor_set_prompt_chain_mix", { shares, actor: admin.id });
  if (error) return { error: error.message };
  // Version history in the Prompt Chain Tool (best effort; needs migration 202611060002).
  await db.rpc("humor_save_prompt_chain_version", { chain: chainId, label: `Every step on ${m.display_name} (Humor Admin → Model for members)`, actor: admin.id });

  // Read back what members will get.
  const [{ data: saved }, { data: mix }] = await Promise.all([
    db.from("humor_prompt_chain_steps").select("llm_model_id").eq("chain_id", chainId),
    db.from("humor_prompt_chain_mix").select("share").eq("chain_id", chainId).maybeSingle(),
  ]);
  const rows = saved ?? [];
  revalidateMemberPicker();
  if (!rows.length || rows.some((r) => r.llm_model_id !== modelId) || mix?.share !== 100)
    return { error: `Saved, but the check failed: ${rows.filter((r) => r.llm_model_id === modelId).length} of ${rows.length} steps use ${m.display_name} and the chain has ${mix?.share ?? 0}% of members. Reload and try again.` };
  return { ok: `Confirmed: members now get ${chain.name} on ${m.display_name} (all ${rows.length} steps checked in the database).` };
}

// The picker appears on Overview and LLM models & providers.
function revalidateMemberPicker() {
  revalidatePath("/ai");
  revalidatePath("/ai/llm-models");
  revalidatePath("/ai/prompt-chains", "layout");
}

// Delete button in the picker: removes the model from LLM models. The model
// members are using cannot be deleted; other chains' steps that used it are
// left without a model (the Prompt Chain Tool flags them).
export async function deleteModelFromPicker(_: CatalogState, form: FormData): Promise<CatalogState> {
  const admin = await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Unknown model." };
  const db = serviceClient(admin.id);
  const { data: mix } = await db.from("humor_prompt_chain_mix").select("chain_id").eq("share", 100).maybeSingle();
  if (mix) {
    const { data: used } = await db.from("humor_prompt_chain_steps").select("id").eq("chain_id", mix.chain_id).eq("llm_model_id", id).limit(1);
    if (used?.length) return { error: "Members are using this model. Choose another one first." };
  }
  const { error } = await db.from("humor_llm_models").delete().eq("id", id);
  if (error) return { error: error.code === "23503" ? "Recorded data still points at this model; deactivate it instead." : error.message };
  revalidateMemberPicker();
  return { ok: "Deleted." };
}
