"use server";
import sharp from "sharp";
import { requireAdmin } from "./admin";
import { MAX_UPLOAD_BYTES, sniffImage } from "./media-rules";
import { runChain, type ChainResult, type ChainRunStep } from "./llm";
import { serviceClient } from "./supabase/service";

export type TestRunState = (ChainResult & { model: string; provider: string; chain: string; chainId: string; prompt: string }) | { ok: false; error: string } | null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Runs every step of a prompt chain on one photo, like a member's generation,
// with the chain's own models or one chosen model for every step (for example
// the same chain on Gemini and on GPT). Admin-only and nothing is saved.
export async function testRun(_: TestRunState, form: FormData): Promise<TestRunState> {
  await requireAdmin();
  const modelId = String(form.get("model") ?? ""), chainId = String(form.get("chain") ?? "");
  const direction = String(form.get("direction") ?? "").trim().slice(0, 120);
  if ((modelId && !UUID.test(modelId)) || !UUID.test(chainId)) return { ok: false, error: "Choose a prompt chain." };
  const file = form.get("image");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a photo." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Photos must be 4 MB or smaller." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffImage(bytes)) return { ok: false, error: "Choose a JPG, PNG, WebP or GIF." };

  const db = serviceClient();
  const MODEL = "model_id,max_output_tokens,temperature,humor_llm_providers(slug)";
  const [{ data: override }, { data: chain }, { data: rows }] = await Promise.all([
    modelId ? db.from("humor_llm_models").select(MODEL).eq("id", modelId).maybeSingle() : Promise.resolve({ data: null }),
    db.from("humor_prompt_chains").select("name,prompt_version").eq("id", chainId).maybeSingle(),
    db.from("humor_prompt_chain_steps").select(`*,humor_llm_models(${MODEL})`).eq("chain_id", chainId).order("position"),
  ]);
  if (!chain || (modelId && !override)) return { ok: false, error: "That model or chain no longer exists." };
  type Model = { model_id: string; max_output_tokens: number | null; temperature: number | string | null; humor_llm_providers: { slug: string } | null };
  type Row = { system_prompt: string; user_prompt: string; output_schema: unknown; include_image?: boolean | null; output_kind?: string | null; humor_llm_models: Model | null };
  const list = (rows ?? []) as unknown as Row[];
  if (!list.length) return { ok: false, error: "This prompt chain has no steps yet." };
  const steps: ChainRunStep[] = [];
  for (const [i, row] of list.entries()) {
    const model = (override as unknown as Model | null) ?? row.humor_llm_models;
    if (!model) return { ok: false, error: `Step ${i + 1} has no model. Choose one model for every step, or set it in the chain.` };
    const schema = row.output_schema && typeof row.output_schema === "object" && !Array.isArray(row.output_schema) ? row.output_schema as object : null;
    steps.push({
      provider: model.humor_llm_providers?.slug ?? "", model: model.model_id, systemPrompt: row.system_prompt, userTemplate: row.user_prompt, schema,
      maxOutputTokens: model.max_output_tokens, temperature: model.temperature === null ? null : Number(model.temperature),
      // Older single-step chains (before 202611050001) always see the photo.
      includeImage: row.include_image ?? true, outputKind: i === list.length - 1 ? "captions" : "text",
    });
  }
  const providers = [...new Set(steps.map((s) => s.provider))].join(" + ");
  const models = [...new Set(steps.map((s) => s.model))].join(" + ");

  // Long side 1024 px JPEG keeps the request small for every provider.
  let image: Buffer;
  try {
    image = await sharp(bytes, { animated: false, limitInputPixels: 40_000_000 }).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    return { ok: false, error: "That image could not be read." };
  }
  const result = await runChain(steps, { base64: image.toString("base64"), mime: "image/jpeg" }, direction, process.env);
  return { ...result, model: models, provider: providers, chain: `${chain.name} (${chain.prompt_version})`, chainId };
}
