"use client";
import { useActionState, useState } from "react";
import { createMedia, updateMedia, type ActionState } from "@/lib/media-actions";
import { SOURCE_LABELS, SOURCES, STYLES } from "@/lib/format";

type Initial = { id: string; content: string; style: string; source: string; description: string | null };
export function MediaForm({ initial, hasOfficial }: { initial?: Initial; hasOfficial?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(initial ? updateMedia : createMedia, null);
  const [preview, setPreview] = useState<string | null>(null);
  const [length, setLength] = useState(initial?.content.length ?? 0);
  const [source, setSource] = useState(initial?.source ?? "handmade");
  return (
    <form action={action} className="form">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {!initial && (
        <div className="field">
          <label htmlFor="image">Image</label>
          <input id="image" name="image" type="file" required accept="image/jpeg,image/png,image/webp,image/gif" className="input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setPreview((old) => { if (old) URL.revokeObjectURL(old); return file ? URL.createObjectURL(file) : null; });
            }} />
          <span className="hint">JPG, PNG, WebP or GIF up to 4 MB. Stored privately as WebP with a blurred preview, exactly like member uploads.</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          {preview && <img src={preview} alt="Selected upload preview" className="media-preview" style={{ maxHeight: 260 }} />}
        </div>
      )}
      <div className="field">
        <label htmlFor="content">Caption</label>
        <textarea id="content" name="content" className="textarea" required maxLength={240} defaultValue={initial?.content} onChange={(e) => setLength(e.target.value.trim().length)} />
        <span className="hint num">{length}/240 characters</span>
      </div>
      <div className="grid grid-3" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="style">Style</label>
          <select id="style" name="style" className="select" defaultValue={initial?.style ?? "Deadpan"}>
            {STYLES.map((style) => <option key={style}>{style}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="source">Source</label>
          <select id="source" name="source" className="select" defaultValue={initial?.source ?? "handmade"} onChange={(e) => setSource(e.target.value)}>
            {/* "seed" is only set by the seed import script; keep it only for posts that already have it. */}
            {SOURCES.filter((s) => s !== "seed" || initial?.source === "seed").map((s) => <option key={s} value={s}>{SOURCE_LABELS[s].label}</option>)}
          </select>
          <span className="hint">{SOURCE_LABELS[source]?.hint}</span>
        </div>
        {!initial && (
          <div className="field">
            <label htmlFor="author">Post as</label>
            <select id="author" name="author" className="select" defaultValue="me">
              <option value="me">My account</option>
              {hasOfficial && <option value="official">Official account (Little Mao)</option>}
            </select>
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="description">Scene description <span className="muted">(optional)</span></label>
        <textarea id="description" name="description" className="textarea" maxLength={2000} defaultValue={initial?.description ?? ""} />
        <span className="hint">Scene summary stored on humor_images.description (written by AI for AI-captioned posts).</span>
      </div>
      {state?.error && <div className="notice notice-bad" role="alert">{state.error}</div>}
      {state?.ok && <div className="notice notice-good" role="status">{state.ok}</div>}
      <div><button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Saving…" : initial ? "Save changes" : "Publish media"}</button></div>
    </form>
  );
}
