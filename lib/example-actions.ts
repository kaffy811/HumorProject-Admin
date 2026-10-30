"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./admin";
import { CAPTION_STYLES } from "./catalog";
import { chars, MAX_CAPTION } from "./create-rules";
import { serviceClient } from "./supabase/service";

export type SaveExampleResult = { ok: true; id: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Keeps a Test run caption as an AI generation example (few-shot material).
export async function saveExample(input: { caption: string; style: string; scene: string; chainId: string; source: string }): Promise<SaveExampleResult> {
  const admin = await requireAdmin();
  const caption = input.caption.trim(), scene = input.scene.trim();
  if (!caption || chars(caption) > MAX_CAPTION) return { ok: false, error: "Captions must be 1–200 characters." };
  if (!(CAPTION_STYLES as readonly string[]).includes(input.style)) return { ok: false, error: "Choose a joke style." };
  if (!scene || chars(scene) > 500) return { ok: false, error: "Describe the scene (1–500 characters)." };
  const { data, error } = await serviceClient(admin.id).from("humor_generation_examples").insert({
    caption, style: input.style, scene, chain_id: UUID.test(input.chainId) ? input.chainId : null, is_active: true,
    notes: input.source.slice(0, 300) || null,
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message.includes("does not exist") ? "AI generation examples are not set up in this database yet." : `Could not save: ${error?.message}` };
  revalidatePath("/ai/examples");
  return { ok: true, id: data.id };
}
