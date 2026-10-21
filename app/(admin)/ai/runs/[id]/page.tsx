import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { profilesByIds, signedUrls } from "@/lib/data";
import { candidatesOf, usageOf } from "@/lib/ai-stats";
import { serviceClient } from "@/lib/supabase/service";
import { duration, n, when } from "@/lib/format";
import { PersonLink } from "@/components/Person";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function Run({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = serviceClient();
  const { data: run } = await db.from("humor_generations").select("*").eq("id", id).maybeSingle();
  if (!run) notFound();
  const [people, urls, post, siblings] = await Promise.all([
    profilesByIds(db, [run.user_id]),
    signedUrls(db, "humor-images", [run.image_path]),
    db.from("humor_captions").select("id,content,deleted_at").eq("image_id", run.image_id).eq("source", "ai").maybeSingle(),
    db.from("humor_generations").select("id,created_at,status").eq("image_id", run.image_id).order("created_at"),
  ]);
  const usage = usageOf(run.usage_metadata);
  const candidates = candidatesOf(run.caption_candidates);
  const published = post.data as { id: string; content: string; deleted_at: string | null } | null;
  const attempt = (siblings.data ?? []).findIndex((s) => s.id === run.id) + 1;
  return (
    <div className="stack">
      <Link href="/ai/runs" className="muted">← All runs</Link>
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Run {run.id.slice(0, 8)} · attempt {attempt} of {(siblings.data ?? []).length} for this photo</span>
          <h1 className="mono" style={{ fontFamily: "var(--font-display)" }}>{run.model}.</h1>
          <p>{run.provider} · prompt <span className="mono">{run.prompt_version}</span> · {when(run.created_at)}</p>
        </div>
      </header>
      <section className="grid grid-2">
        <div className="card">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
          {urls[run.image_path] ? <img src={urls[run.image_path]} alt="" className="media-preview" /> : <div className="empty">Image unavailable.</div>}
          <dl className="kv" style={{ marginTop: 14 }}>
            <dt>Member</dt><dd><PersonLink profile={people.get(run.user_id) ?? null} id={run.user_id} /></dd>
            <dt>Status</dt><dd>{run.status}{run.failure_stage ? ` · failed at ${run.failure_stage}` : ""}</dd>
            <dt>Time</dt><dd>{duration(run.completed_at ? new Date(run.completed_at).getTime() - new Date(run.created_at).getTime() : null)}</dd>
            <dt>Tokens</dt><dd className="num">{n(usage.total)} total · {n(usage.prompt)} in · {n(usage.output)} out{usage.thoughts ? ` · ${n(usage.thoughts)} thinking` : ""}</dd>
            <dt>Requested style</dt><dd>{run.joke_style ?? "Auto"}{run.extra_context ? ` · “${run.extra_context}”` : ""}</dd>
            <dt>Image</dt><dd className="mono">{run.image_mime} · sha256 {String(run.image_sha256).slice(0, 16)}…</dd>
            <dt>Post</dt><dd>{published ? <Link href={`/posts/${published.id}`}>{published.deleted_at ? "Deleted post →" : "Live post →"}</Link> : "Not published"}</dd>
          </dl>
        </div>
        <div className="card">
          <h2>Candidates</h2>
          <p className="sub">What the model returned. The highlighted one became the post.</p>
          {candidates.length ? (
            <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10 }}>
              {candidates.map((c, i) => {
                const chosen = published && (published.content.trim() === c.original.trim() || published.content.trim() === c.text.trim());
                return <li key={i} style={chosen ? { background: "var(--warn-bg)", border: "2px solid var(--ink)", padding: "6px 8px" } : undefined}>{c.text}{c.style && <span className="muted"> · {c.style}</span>}</li>;
              })}
            </ol>
          ) : <p className="empty">No candidates (run failed or still processing).</p>}
          {published && !candidates.some((c) => published.content.trim() === c.original.trim() || published.content.trim() === c.text.trim()) && candidates.length > 0 && (
            <p style={{ marginTop: 12 }}><span className="badge badge-warn">Rewritten</span> Published as: “{published.content}”</p>
          )}
          {run.scene && <><h2 style={{ marginTop: 18 }}>Scene description</h2><p style={{ margin: 0 }}>{run.scene}</p></>}
        </div>
      </section>
      <section className="grid grid-2">
        <div className="card"><h2>System prompt</h2><pre className="prompt" style={{ maxHeight: 420 }}>{run.system_prompt}</pre></div>
        <div className="card"><h2>User prompt</h2><pre className="prompt" style={{ maxHeight: 420 }}>{run.user_prompt}</pre></div>
      </section>
      <section className="grid grid-2">
        <div className="card"><h2>Generation config</h2><pre className="prompt">{JSON.stringify(run.generation_config, null, 2)}</pre></div>
        <div className="card"><h2>Raw usage</h2><pre className="prompt">{JSON.stringify(run.usage_metadata, null, 2)}</pre></div>
      </section>
    </div>
  );
}
