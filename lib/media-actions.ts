"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "./admin";
import { serviceClient } from "./supabase/service";
import { storageBucket } from "./supabase/schema";
import { parseMediaFields } from "./media-rules";

export type ActionState = { error?: string; ok?: string } | null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh(id?: string) {
  revalidatePath("/");
  revalidatePath("/posts");
  if (id) revalidatePath(`/posts/${id}`);
}

export async function updateMedia(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Unknown post." };
  const fields = parseMediaFields(form);
  if (!fields.ok) return { error: fields.error };
  const db = serviceClient(admin.id);
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
  const admin = await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  const { error } = await serviceClient(admin.id).from("humor_captions").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
  if (error) throw new Error(error.message);
  refresh(id);
  redirect(`/posts/${id}?deleted=1`);
}

export async function restoreMedia(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  const { error } = await serviceClient(admin.id).from("humor_captions").update({ deleted_at: null }).eq("id", id);
  if (error) throw new Error(error.message);
  refresh(id);
  redirect(`/posts/${id}?restored=1`);
}

// Permanent removal of an already-deleted post: rows cascade from the image,
// then its private files are removed from Storage.
export async function purgeMedia(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id) || form.get("confirm") !== "PURGE") redirect(`/posts/${id}?purge=confirm`);
  const db = serviceClient(admin.id);
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
