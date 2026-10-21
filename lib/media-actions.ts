"use server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "./admin";
import { serviceClient } from "./supabase/service";
import { storageBucket } from "./supabase/schema";
import { MAX_UPLOAD_BYTES, parseMediaFields, sniffImage } from "./media-rules";

export type ActionState = { error?: string; ok?: string } | null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh(id?: string) {
  revalidatePath("/");
  revalidatePath("/posts");
  if (id) revalidatePath(`/posts/${id}`);
}

export async function createMedia(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const fields = parseMediaFields(form);
  if (!fields.ok) return { error: fields.error };
  const file = form.get("image");
  if (!(file instanceof File) || !file.size) return { error: "Choose an image." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Images must be 4 MB or smaller." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffImage(bytes)) return { error: "Choose a JPG, PNG, WebP or GIF." };

  const db = serviceClient();
  let owner = admin.id;
  if (form.get("author") === "official") {
    const { data } = await db.from("profiles").select("id").eq("is_official", true).maybeSingle();
    if (!data) return { error: "No official account exists in this database." };
    owner = data.id;
  }

  let prepared: { data: Buffer; info: { width: number; height: number } };
  let locked: Buffer;
  try {
    prepared = await sharp(bytes, { animated: false, limitInputPixels: 40_000_000 }).rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
    // Same blurred preview the member app shows to signed-out visitors.
    locked = await sharp(prepared.data).resize({ width: 48, height: 48, fit: "inside" }).blur(6).webp({ quality: 25 }).toBuffer();
  } catch {
    return { error: "That image could not be read." };
  }

  const imageId = randomUUID();
  const imagePath = `${owner}/${imageId}.webp`;
  const lockedPath = `${imageId}/locked.webp`;
  const images = db.storage.from(storageBucket("humor-images"));
  const previews = db.storage.from(storageBucket("humor-previews"));
  const cleanup = async () => {
    await db.from("humor_images").delete().eq("id", imageId);
    await images.remove([imagePath]);
    await previews.remove([lockedPath]);
  };

  const { error: reserve } = await db.from("humor_images").insert({ id: imageId, user_id: owner, status: "processing", description: fields.value.description });
  if (reserve) return { error: `Could not create the image record: ${reserve.message}` };
  const steps = [
    () => images.upload(imagePath, prepared.data, { contentType: "image/webp", upsert: false }),
    () => previews.upload(lockedPath, locked, { contentType: "image/webp", upsert: true }),
    () => db.from("humor_images").update({ storage_path: imagePath, status: "ready", image_width: prepared.info.width, image_height: prepared.info.height, locked_thumbnail_path: lockedPath }).eq("id", imageId),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) { await cleanup(); return { error: `Upload failed: ${error.message}` }; }
  }
  const { data: caption, error } = await db.from("humor_captions")
    .insert({ image_id: imageId, content: fields.value.content, style: fields.value.style, source: fields.value.source })
    .select("id").single();
  if (error || !caption) { await cleanup(); return { error: `Could not publish the caption: ${error?.message}` }; }
  refresh();
  redirect(`/posts/${caption.id}?created=1`);
}

export async function updateMedia(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Unknown post." };
  const fields = parseMediaFields(form);
  if (!fields.ok) return { error: fields.error };
  const db = serviceClient();
  const { data: caption, error } = await db.from("humor_captions")
    .update({ content: fields.value.content, style: fields.value.style, source: fields.value.source })
    .eq("id", id).select("image_id").maybeSingle();
  if (error) return { error: error.message };
  if (!caption) return { error: "This post no longer exists." };
  const { error: image } = await db.from("humor_images").update({ description: fields.value.description }).eq("id", caption.image_id);
  if (image) return { error: image.message };
  refresh(id);
  return { ok: "Saved." };
}

// Soft delete, exactly like an author deleting their own post: database
// triggers remove its votes, comments, saves and reports and notify members.
export async function deleteMedia(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  const { error } = await serviceClient().from("humor_captions").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
  if (error) throw new Error(error.message);
  refresh(id);
  redirect(`/posts/${id}?deleted=1`);
}

export async function restoreMedia(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  const { error } = await serviceClient().from("humor_captions").update({ deleted_at: null }).eq("id", id);
  if (error) throw new Error(error.message);
  refresh(id);
  redirect(`/posts/${id}?restored=1`);
}

// Permanent removal of an already-deleted post: rows cascade from the image,
// then its private files are removed from Storage.
export async function purgeMedia(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id) || form.get("confirm") !== "PURGE") redirect(`/posts/${id}?purge=confirm`);
  const db = serviceClient();
  const { data: caption } = await db.from("humor_captions").select("image_id,deleted_at,og_path").eq("id", id).maybeSingle();
  if (!caption) redirect("/posts");
  if (!caption.deleted_at) redirect(`/posts/${id}?purge=live`);
  const { count: live } = await db.from("humor_captions").select("id", { count: "exact", head: true }).eq("image_id", caption.image_id).is("deleted_at", null);
  if (live) redirect(`/posts/${id}?purge=shared`);
  const [{ data: image }, { data: drafts }, { data: generations }, { data: siblings }] = await Promise.all([
    db.from("humor_images").select("storage_path,locked_thumbnail_path").eq("id", caption.image_id).maybeSingle(),
    db.from("humor_drafts").select("image_path,ai_path").eq("image_id", caption.image_id),
    db.from("humor_generations").select("image_path").eq("image_id", caption.image_id),
    db.from("humor_captions").select("og_path").eq("image_id", caption.image_id),
  ]);
  const { error } = await db.from("humor_images").delete().eq("id", caption.image_id);
  if (error) throw new Error(`Purge blocked by the database: ${error.message}`);
  const originals = [image?.storage_path, ...(drafts ?? []).flatMap((d) => [d.image_path, d.ai_path]), ...(generations ?? []).map((g) => g.image_path)];
  const previews = [image?.locked_thumbnail_path, ...(siblings ?? []).map((s) => s.og_path)];
  const clean = (list: (string | null | undefined)[]) => [...new Set(list.filter((p): p is string => !!p))];
  await Promise.all([
    clean(originals).length ? db.storage.from(storageBucket("humor-images")).remove(clean(originals)) : null,
    clean(previews).length ? db.storage.from(storageBucket("humor-previews")).remove(clean(previews)) : null,
  ]);
  refresh();
  redirect("/posts?purged=1");
}
