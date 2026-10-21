import { SOURCES, STYLES } from "./format";

export const MAX_UPLOAD_BYTES = 4_000_000;
export type MediaFields = { content: string; style: string; source: string; description: string | null };

// Mirrors the humor_captions / humor_images check constraints so admins get
// a readable message instead of a Postgres error.
export function parseMediaFields(form: FormData): { ok: true; value: MediaFields } | { ok: false; error: string } {
  const content = String(form.get("content") ?? "").trim();
  const style = String(form.get("style") ?? "");
  const source = String(form.get("source") ?? "");
  const description = String(form.get("description") ?? "").trim();
  if (content.length < 1 || content.length > 240) return { ok: false, error: "Caption must be 1–240 characters." };
  if (!(STYLES as readonly string[]).includes(style)) return { ok: false, error: "Choose a valid style." };
  if (!(SOURCES as readonly string[]).includes(source)) return { ok: false, error: "Choose a valid source." };
  if (description.length > 2000) return { ok: false, error: "Scene description must be at most 2,000 characters." };
  return { ok: true, value: { content, style, source, description: description || null } };
}

export function sniffImage(bytes: Uint8Array) {
  const head = Buffer.from(bytes.subarray(0, 12));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (["GIF87a", "GIF89a"].includes(head.toString("ascii", 0, 6))) return "image/gif";
  return null;
}
