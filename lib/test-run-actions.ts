"use server";
import sharp from "sharp";
import { requireAdmin } from "./admin";
import { MAX_UPLOAD_BYTES, sniffImage } from "./media-rules";
import { fillUserPrompt, runCaptions, type RunResult } from "./llm";
import { serviceClient } from "./supabase/service";

export type TestRunState = (RunResult & { model: string; provider: string; chain: string; chainId: string; prompt: string }) | { ok: false; error: string } | null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Runs step 1 of a prompt chain on one photo with any configured model.
// Admin-only and nothing is saved: members and recorded runs are unaffected.
export async function testRun(_: TestRunState, form: FormData): Promise<TestRunState> {
  await requireAdmin();
  const modelId = String(form.get("model") ?? ""), chainId = String(form.get("chain") ?? "");
  const direction = String(form.get("direction") ?? "").trim().slice(0, 120);
  if (!UUID.test(modelId) || !UUID.test(chainId)) return { ok: false, error: "Choose a model and a prompt chain." };
  const file = form.get("image");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a photo." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Photos must be 4 MB or smaller." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffImage(bytes)) return { ok: false, error: "Choose a JPG, PNG, WebP or GIF." };

  const db = serviceClient();
  const [{ data: model }, { data: chain }, { data: step }] = await Promise.all([
    db.from("humor_llm_models").select("model_id,max_output_tokens,temperature,humor_llm_providers(slug)").eq("id", modelId).maybeSingle(),
    db.from("humor_prompt_chains").select("name,prompt_version").eq("id", chainId).maybeSingle(),
    db.from("humor_prompt_chain_steps").select("system_prompt,user_prompt,output_schema").eq("chain_id", chainId).order("position").limit(1).maybeSingle(),
  ]);
  if (!model || !chain) return { ok: false, error: "That model or chain no longer exists." };
  if (!step) return { ok: false, error: "This prompt chain has no steps yet." };
  const provider = (model.humor_llm_providers as unknown as { slug: string } | null)?.slug ?? "";

  // Long side 1024 px JPEG keeps the request small for every provider.
  let image: Buffer;
  try {
    image = await sharp(bytes, { animated: false, limitInputPixels: 40_000_000 }).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    return { ok: false, error: "That image could not be read." };
  }
  const prompt = fillUserPrompt(step.user_prompt, direction);
  const result = await runCaptions({
    provider, model: model.model_id, systemPrompt: step.system_prompt, userPrompt: prompt,
    image: { base64: image.toString("base64"), mime: "image/jpeg" },
    maxOutputTokens: model.max_output_tokens, temperature: model.temperature === null ? null : Number(model.temperature),
    schema: (step.output_schema as object | null) ?? null,
  }, process.env);
  return { ...result, model: model.model_id, provider, chain: `${chain.name} (${chain.prompt_version})`, chainId, prompt };
}
