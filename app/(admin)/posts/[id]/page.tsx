import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { profilesByIds, signedUrls } from "@/lib/data";
import { deleteMedia, purgeMedia, restoreMedia } from "@/lib/media-actions";
import { serviceClient } from "@/lib/supabase/service";
import { duration, n, sourceLabel, tokenCount, when } from "@/lib/format";
import { MediaForm } from "@/components/MediaForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PersonLink } from "@/components/Person";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTICES: Record<string, [string, string]> = {
  created: ["good", "Published. It is live in the member feed."],
  deleted: ["good", "Deleted from the feed. Its votes, comments and saves were cleared by the database."],
  restored: ["good", "Restored to the feed. Votes and comments removed at deletion do not come back."],
  "purge=confirm": ["bad", "Type PURGE to confirm permanent deletion."],
  "purge=live": ["bad", "Delete the post before purging it."],
  "purge=shared": ["bad", "Another live caption still uses this image, so it cannot be purged."],
};
type Generation = { id: string; status: string; model: string; provider: string; system_prompt: string; user_prompt: string; joke_style: string | null; extra_context: string | null; caption_candidates: unknown; usage_metadata: unknown; failure_stage: string | null; created_at: string; completed_at: string | null; prompt_version: string };

export default async function MediaDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  if (!UUID.test(id)) notFound();
  const db = serviceClient();
  const { data: post } = await db.from("humor_captions")
    .select("id,content,style,source,created_at,deleted_at,image_id,humor_images!inner(id,user_id,storage_path,status,description,image_width,image_height,created_at)")
    .eq("id", id).maybeSingle();
  if (!post) notFound();
  const image = post.humor_images as unknown as { id: string; user_id: string; storage_path: string | null; status: string; description: string | null; image_width: number | null; image_height: number | null; created_at: string };
  const [votes, comments, generations, saves, reports] = await Promise.all([
    db.from("humor_votes").select("user_id,value,created_at").eq("caption_id", id).order("created_at", { ascending: false }).limit(200),
    db.from("humor_comments").select("id,user_id,content,created_at,deleted_at,reply_to_id").eq("caption_id", id).order("created_at", { ascending: false }).limit(100),
    db.from("humor_generations").select("id,status,model,provider,system_prompt,user_prompt,joke_style,extra_context,caption_candidates,usage_metadata,failure_stage,created_at,completed_at,prompt_version").eq("image_id", image.id).order("created_at", { ascending: false }),
    db.from("humor_saves").select("user_id", { count: "exact", head: true }).eq("caption_id", id),
    db.from("humor_reports").select("user_id,reason,created_at").eq("caption_id", id),
  ]);
  const voteRows = (votes.data ?? []) as { user_id: string; value: number; created_at: string }[];
  const commentRows = (comments.data ?? []) as { id: string; user_id: string; content: string; created_at: string; deleted_at: string | null; reply_to_id: string | null }[];
  const people = await profilesByIds(db, [image.user_id, ...voteRows.map((v) => v.user_id), ...commentRows.map((c) => c.user_id)]);
  const urls = await signedUrls(db, "humor-images", [image.storage_path]);
  const notice = Object.keys(NOTICES).find((key) => key.includes("=") ? query[key.split("=")[0]] === key.split("=")[1] : query[key]);
  const ha = voteRows.filter((v) => v.value === 1).length;
  return (
    <div className="stack">
      <Link href="/posts" className="muted">← All posts</Link>
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Post {post.id.slice(0, 8)}</span>
          <h1 style={{ maxWidth: "36ch" }}>{post.content}</h1>
          <p>{post.deleted_at ? <span className="badge badge-bad">Deleted {when(post.deleted_at)}</span> : <span className="badge badge-good">Live</span>} · {post.style} · {sourceLabel(post.source)} · posted {when(post.created_at)}</p>
        </div>
      </header>
      {notice && <div className={`notice notice-${NOTICES[notice][0]}`} role="status">{NOTICES[notice][1]}</div>}
      <section className="grid grid-2">
        <div className="stack">
          <div className="card">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
            {image.storage_path && urls[image.storage_path] ? <img src={urls[image.storage_path]} alt={image.description ?? "Post image"} className="media-preview" /> : <div className="empty">Image unavailable.</div>}
            <dl className="kv" style={{ marginTop: 14 }}>
              <dt>Author</dt><dd><PersonLink profile={people.get(image.user_id) ?? null} id={image.user_id} /></dd>
              <dt>Likes / dislikes</dt><dd className="num">{n(ha)} / {n(voteRows.length - ha)}</dd>
              <dt>Comments</dt><dd className="num">{n(commentRows.filter((c) => !c.deleted_at).length)}</dd>
              <dt>Saves</dt><dd className="num">{n(saves.count ?? 0)}</dd>
              <dt>Reports</dt><dd>{(reports.data ?? []).length ? (reports.data ?? []).map((r) => r.reason).join(", ") : "None"}</dd>
              <dt>Image</dt><dd className="mono">{image.storage_path ?? "—"} {image.image_width ? `· ${image.image_width}×${image.image_height}` : ""}</dd>
            </dl>
          </div>
          <div className="card">
            <h2>Danger zone</h2>
            <p className="sub">Deleting hides the post from members and clears its votes and comments (same as an author delete).</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {post.deleted_at ? (
                <>
                  <form action={restoreMedia}><input type="hidden" name="id" value={post.id} /><ConfirmButton className="btn" message="Restore this post to the feed?">Restore</ConfirmButton></form>
                  <form action={purgeMedia} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input type="hidden" name="id" value={post.id} />
                    <input className="input" name="confirm" placeholder="Type PURGE" aria-label="Type PURGE to confirm" style={{ minWidth: 140 }} autoComplete="off" />
                    <ConfirmButton message="Permanently delete this post, its image and its Gemini records? This cannot be undone.">Purge permanently</ConfirmButton>
                  </form>
                </>
              ) : (
                <form action={deleteMedia}><input type="hidden" name="id" value={post.id} /><ConfirmButton message="Delete this post? Its votes and comments will be removed.">Delete post</ConfirmButton></form>
              )}
            </div>
          </div>
        </div>
        <div className="card">
          <h2>Edit</h2>
          <p className="sub">Changes are live immediately.</p>
          <MediaForm initial={{ id: post.id, content: post.content, style: post.style, source: post.source, description: image.description }} />
        </div>
      </section>

      <section className="card">
        <h2>AI generation records</h2>
        <p className="sub">Every AI run for this photo (regenerations included) — open one for the full prompt, config and usage. <Link href="/ai">All models &amp; prompts →</Link></p>
        {(generations.data as Generation[] | null)?.length ? (
          <div className="stack">
            {(generations.data as Generation[]).map((g) => (
              <details key={g.id} className="card" style={{ boxShadow: "none" }}>
                <summary style={{ cursor: "pointer", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span className={`badge ${g.status === "completed" ? "badge-good" : g.status === "failed" ? "badge-bad" : "badge-warn"}`}>{g.status}</span>
                  <b>{g.model}</b><span className="muted">{g.provider} · {g.prompt_version} · {when(g.created_at)} · {n(tokenCount(g.usage_metadata))} tokens · {duration(g.completed_at ? new Date(g.completed_at).getTime() - new Date(g.created_at).getTime() : null)}</span>
                  {g.failure_stage && <span className="badge badge-bad">failed at {g.failure_stage}</span>}
                </summary>
                <div className="grid grid-2" style={{ marginTop: 12 }}>
                  <div><span className="eyebrow">System prompt</span><pre className="prompt">{g.system_prompt}</pre></div>
                  <div><span className="eyebrow">User prompt</span><pre className="prompt">{g.user_prompt}</pre></div>
                </div>
                {Array.isArray(g.caption_candidates) && (
                  <ol style={{ margin: "12px 0 0", paddingLeft: 20 }}>
                    {(g.caption_candidates as { text?: string; caption?: string }[]).map((c, i) => <li key={i}>{typeof c === "string" ? c : c.text ?? c.caption ?? JSON.stringify(c)}</li>)}
                  </ol>
                )}
                <p className="muted" style={{ margin: "10px 0 0" }}>Style {g.joke_style ?? "—"}{g.extra_context ? ` · context “${g.extra_context}”` : ""}</p>
              </details>
            ))}
          </div>
        ) : <p className="empty">No AI generation records — this caption was member-written, seeded or created here.</p>}
      </section>

      <section className="grid grid-2">
        <div className="card">
          <h2>Votes</h2>
          <p className="sub">Latest 200 votes on this post.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Member</th><th>Vote</th><th>When</th></tr></thead>
              <tbody>
                {voteRows.map((v) => (
                  <tr key={v.user_id}><td><PersonLink profile={people.get(v.user_id) ?? null} id={v.user_id} /></td><td>{v.value === 1 ? <span className="badge badge-good">Like</span> : <span className="badge badge-bad">Dislike</span>}</td><td className="muted">{when(v.created_at)}</td></tr>
                ))}
                {!voteRows.length && <tr><td colSpan={3} className="empty">No votes.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Comments</h2>
          <p className="sub">Latest 100, including deleted.</p>
          <div className="people">
            {commentRows.map((c) => (
              <div key={c.id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                <PersonLink profile={people.get(c.user_id) ?? null} id={c.user_id} />
                <p style={{ margin: "6px 0 0" }} className={c.deleted_at ? "muted" : undefined}>{c.reply_to_id && <span className="badge">reply</span>} {c.content}</p>
                <span className="muted" style={{ fontSize: 12 }}>{when(c.created_at)}{c.deleted_at && " · deleted"}</span>
              </div>
            ))}
            {!commentRows.length && <p className="empty">No comments.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
