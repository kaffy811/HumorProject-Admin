"use server";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "./admin";
import { serviceClient } from "./supabase/service";
import { storageBucket } from "./supabase/schema";
import { MAX_UPLOAD_BYTES, sniffImage } from "./media-rules";
import { runCaptions } from "./llm";
import { BUILTIN_VERSION, fillPrompt, loadGenerationRoute, type GenerationRoute } from "./generation-route";
import { BUILTIN_USER_TEMPLATE, GENERATION_CONFIG, SYSTEM_PROMPT, builtinModel } from "./builtin-prompt";
import { acceptCaptions, finalText, MAX_DIRECTION, type Candidate } from "./create-rules";

// The admin version of the member Create flow: upload → let the model write
// (same prompt-chain routing and fallback as members) or write it yourself →
// pick and edit → publish. Unpublished uploads stay "processing", which members
// never see, until they are published or discarded.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Draft = { imageId: string; previewUrl: string; width: number; height: number; owner: string };
export type StartResult = { ok: true; draft: Draft } | { ok: false; error: string };
export type GenerateResult =
  | { ok: true; generationId: string; candidates: Candidate[]; scene: string; provider: string; model: string; promptVersion: string; note?: string }
  | { ok: false; error: string };

export async function startDraft(form: FormData): Promise<StartResult> {
  const admin = await requireAdmin();
  const file = form.get("image");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a photo." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "That photo is still too large after resizing. Try a smaller one." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffImage(bytes)) return { ok: false, error: "Choose a JPG, PNG, WebP or GIF." };
  const db = serviceClient(admin.id);
  // Admin posts are always published from the admin's own account.
  const owner = admin.id;
  let prepared: { data: Buffer; info: { width: number; height: number } };
  let locked: Buffer;
  try {
    prepared = await sharp(bytes, { animated: false, limitInputPixels: 40_000_000 }).rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
    // The blurred preview signed-out visitors see, like member uploads.
    locked = await sharp(prepared.data).resize({ width: 48, height: 48, fit: "inside" }).blur(6).webp({ quality: 25 }).toBuffer();
  } catch {
    return { ok: false, error: "That image could not be read." };
  }
  const imageId = randomUUID();
  const path = `${owner}/${imageId}.webp`, lockedPath = `${imageId}/locked.webp`;
  const images = db.storage.from(storageBucket("humor-images"));
  const { error: reserve } = await db.from("humor_images").insert({ id: imageId, user_id: owner, status: "processing" });
  if (reserve) return { ok: false, error: `Could not create the image record: ${reserve.message}` };
  const steps = [
    () => images.upload(path, prepared.data, { contentType: "image/webp", upsert: false }),
    () => db.storage.from(storageBucket("humor-previews")).upload(lockedPath, locked, { contentType: "image/webp", upsert: true }),
    () => db.from("humor_images").update({ storage_path: path, image_width: prepared.info.width, image_height: prepared.info.height, locked_thumbnail_path: lockedPath }).eq("id", imageId),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) {
      await removeDraft(imageId);
      return { ok: false, error: `Upload failed: ${error.message}` };
    }
  }
  const { data: signed } = await images.createSignedUrl(path, 3600);
  return { ok: true, draft: { imageId, previewUrl: signed?.signedUrl ?? "", width: prepared.info.width, height: prepared.info.height, owner } };
}

async function draftImage(imageId: string) {
  if (!UUID.test(imageId)) return null;
  const { data } = await serviceClient().from("humor_images").select("id,user_id,status,storage_path,description").eq("id", imageId).maybeSingle();
  return data && data.status === "processing" && data.storage_path ? data as { id: string; user_id: string; status: string; storage_path: string; description: string | null } : null;
}

type Attempt = { provider: string; model: string; promptVersion: string; promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number; latencyMs: number; error?: string };

export async function generateCaptions(imageId: string, directionInput: string): Promise<GenerateResult> {
  const admin = await requireAdmin();
  const image = await draftImage(imageId);
  if (!image) return { ok: false, error: "This photo is no longer a draft. Start over." };
  const direction = directionInput.trim().slice(0, MAX_DIRECTION);
  const db = serviceClient(admin.id);
  const { data: file, error: download } = await db.storage.from(storageBucket("humor-images")).download(image.storage_path);
  if (download || !file) return { ok: false, error: "Could not read the uploaded photo." };
  const stored = Buffer.from(await file.arrayBuffer());
  // Long side 1024 px JPEG keeps the request small for every provider.
  const jpeg = await sharp(stored).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();

  // Same choice as a member's generation: the admin prompt-chain mix, else the built-in prompt.
  const builtin: GenerationRoute = {
    provider: "google", model: builtinModel(), systemPrompt: SYSTEM_PROMPT, userTemplate: BUILTIN_USER_TEMPLATE,
    schema: GENERATION_CONFIG.responseJsonSchema, maxOutputTokens: GENERATION_CONFIG.maxOutputTokens, temperature: null,
    promptVersion: BUILTIN_VERSION, configured: false,
  };
  const chosen = await loadGenerationRoute(db).catch((e: Error) => ({ route: null, reason: e.message }));
  const routes = chosen.route ? [chosen.route, builtin] : [builtin, builtin];
  const first = routes[0];
  const generationId = randomUUID();
  const { error: reserve } = await db.from("humor_generations").insert({
    id: generationId, image_id: image.id, user_id: image.user_id, provider: first.provider, model: first.model,
    system_prompt: first.systemPrompt, user_prompt: fillPrompt(first.userTemplate, direction),
    generation_config: { maxOutputTokens: first.maxOutputTokens, temperature: first.temperature, responseJsonSchema: first.schema, via: "admin" },
    image_path: image.storage_path, image_mime: "image/webp", image_sha256: createHash("sha256").update(stored).digest("hex"),
    prompt_version: first.promptVersion, status: "processing", joke_style: "AUTO", extra_context: direction || null,
  });
  if (reserve) return { ok: false, error: `Could not record the generation: ${reserve.message}` };

  const attempts: Attempt[] = [];
  for (const route of routes) {
    const userPrompt = fillPrompt(route.userTemplate, direction);
    const result = await runCaptions({
      provider: route.provider, model: route.model, systemPrompt: route.systemPrompt, userPrompt,
      image: { base64: jpeg.toString("base64"), mime: "image/jpeg" },
      maxOutputTokens: route.maxOutputTokens, temperature: route.temperature, schema: route.schema,
    }, process.env);
    const accepted = result.ok ? acceptCaptions(result.captions) : null;
    attempts.push({
      provider: route.provider, model: route.model, promptVersion: route.promptVersion, latencyMs: result.latencyMs,
      promptTokenCount: result.usage.input, candidatesTokenCount: result.usage.output, totalTokenCount: result.usage.total,
      error: !result.ok ? result.error : accepted && !accepted.ok ? `rejected: ${accepted.reason}` : undefined,
    });
    if (!accepted?.ok) continue;
    const candidates: Candidate[] = accepted.captions.map((c) => ({ id: randomUUID(), style: c.style, text: c.caption, originalText: c.caption, source: "generated" }));
    const scene = result.description ?? "";
    // The record names the route that actually answered, like the member app.
    const { error } = await db.from("humor_generations").update({
      provider: route.provider, model: route.model, prompt_version: route.promptVersion, system_prompt: route.systemPrompt, user_prompt: userPrompt,
      generation_config: { maxOutputTokens: route.maxOutputTokens, temperature: route.temperature, responseJsonSchema: route.schema, via: "admin" },
      status: "completed", caption_candidates: candidates, scene: scene || null, usage_metadata: { attempts }, completed_at: new Date().toISOString(), failure_stage: null,
    }).eq("id", generationId);
    if (error) return { ok: false, error: `Could not save the captions: ${error.message}` };
    const note = route.configured ? undefined
      : chosen.route ? "Used the built-in prompt because the configured model failed."
      : `Used the built-in prompt${chosen.reason ? ` (${chosen.reason})` : ""}.`;
    return { ok: true, generationId, candidates, scene, provider: route.provider, model: route.model, promptVersion: route.promptVersion, note };
  }
  const last = attempts.at(-1)?.error ?? "unknown error";
  await db.from("humor_generations").update({ status: "failed", failure_stage: /rejected/.test(last) ? "validation" : "provider", usage_metadata: { attempts } }).eq("id", generationId);
  return { ok: false, error: `The model could not write captions: ${last}` };
}

export type PublishInput = { imageId: string; mode: "ai" | "handmade"; generationId?: string; candidateId?: string; text: string; description: string };
export async function publishDraft(input: PublishInput): Promise<{ ok: false; error: string }> {
  const admin = await requireAdmin();
  const image = await draftImage(input.imageId);
  if (!image) return { ok: false, error: "This photo is no longer a draft. Start over." };
  const text = finalText(input.text);
  if (!text.ok) return text;
  const description = input.description.trim().slice(0, 2000) || null;
  const db = serviceClient(admin.id);
  let style = "HANDMADE", source = "handmade", scene: string | null = null;
  if (input.mode === "ai") {
    const { data: run } = UUID.test(input.generationId ?? "")
      ? await db.from("humor_generations").select("image_id,status,caption_candidates,scene").eq("id", input.generationId!).maybeSingle()
      : { data: null };
    const pick = ((run?.caption_candidates ?? []) as Candidate[]).find((c) => c.id === input.candidateId);
    if (!run || run.image_id !== image.id || run.status !== "completed" || !pick) return { ok: false, error: "Pick one of the generated captions." };
    // Edited AI captions stay AI captions, as in the member app.
    style = pick.style; source = "ai"; scene = run.scene;
  }
  const { data: caption, error } = await db.from("humor_captions")
    .insert({ image_id: image.id, content: text.value, style, source }).select("id").single();
  if (error || !caption) return { ok: false, error: `Could not publish: ${error?.message}` };
  const { error: ready } = await db.from("humor_images").update({ status: "ready", description: description ?? scene }).eq("id", image.id);
  if (ready) {
    await db.from("humor_captions").delete().eq("id", caption.id);
    return { ok: false, error: `Could not publish: ${ready.message}` };
  }
  revalidatePath("/");
  revalidatePath("/posts");
  redirect(`/posts/${caption.id}?created=1`);
}

async function removeDraft(imageId: string) {
  const db = serviceClient();
  const { data } = await db.from("humor_images").select("storage_path,locked_thumbnail_path,status").eq("id", imageId).maybeSingle();
  if (!data || data.status !== "processing") return;
  await db.from("humor_images").delete().eq("id", imageId);
  if (data.storage_path) await db.storage.from(storageBucket("humor-images")).remove([data.storage_path]);
  if (data.locked_thumbnail_path) await db.storage.from(storageBucket("humor-previews")).remove([data.locked_thumbnail_path]);
}

// "Start over": remove an unpublished upload and its generation records.
export async function discardDraft(imageId: string) {
  await requireAdmin();
  if (UUID.test(imageId)) await removeDraft(imageId);
}
