import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { GENERATION_COLUMNS, PAGE_SIZE, profilesByIds, signedUrls } from "@/lib/data";
import { usageOf, type GenerationRow } from "@/lib/ai-stats";
import { serviceClient } from "@/lib/supabase/service";
import { clampPage, duration, n, text, when } from "@/lib/format";
import { PersonLink } from "@/components/Person";
import { Pager } from "@/components/Pager";
import { RunStatus } from "@/components/RunStatus";
export const metadata: Metadata = { title: "AI runs" };

type Search = Promise<{ status?: string; model?: string; version?: string; page?: string }>;
export default async function Runs({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const params = await searchParams;
  const status = ["completed", "failed", "processing"].includes(text(params.status)) ? text(params.status) : "";
  const model = text(params.model), version = text(params.version);
  const page = clampPage(params.page);
  const db = serviceClient();
  let query = db.from("humor_generations").select(`${GENERATION_COLUMNS},image_path`, { count: "exact" }).order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (model) query = query.eq("model", model);
  if (version) query = query.eq("prompt_version", version);
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (GenerationRow & { image_path: string })[];
  const [people, urls, posts] = await Promise.all([
    profilesByIds(db, rows.map((r) => r.user_id)),
    signedUrls(db, "humor-images", rows.map((r) => r.image_path)),
    rows.length ? db.from("humor_captions").select("id,image_id").in("image_id", rows.map((r) => r.image_id)).eq("source", "ai") : { data: [] },
  ]);
  const postByImage = new Map(((posts.data ?? []) as { id: string; image_id: string }[]).map((p) => [p.image_id, p.id]));
  return (
    <div>
      <Link href="/ai" className="muted">← Models &amp; prompts</Link>
      <header className="page-head" style={{ marginTop: 12 }}>
        <div>
          <span className="eyebrow">humor_generations</span>
          <h1>AI runs.</h1>
          <p>Every generation request: who asked, which model and prompt version, what it cost and whether it became a post.</p>
        </div>
      </header>
      <form className="toolbar">
        <select className="select" name="status" defaultValue={status} aria-label="Status">
          <option value="">All statuses</option><option value="completed">Completed</option><option value="failed">Failed</option><option value="processing">Processing</option>
        </select>
        <input className="input" name="model" defaultValue={model} placeholder="Model (exact)" aria-label="Model" />
        <input className="input" name="version" defaultValue={version} placeholder="Prompt version" aria-label="Prompt version" />
        <button className="btn" type="submit">Apply</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Photo</th><th>Member</th><th>Model</th><th>Prompt</th><th>Status</th><th className="r">Tokens</th><th className="r">Time</th><th>Post</th><th>When</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
                <td><Link href={`/ai/runs/${r.id}`} aria-label="Open run">{urls[r.image_path] ? <img className="thumb" src={urls[r.image_path]} alt="" /> : <span className="thumb" />}</Link></td>
                <td><PersonLink profile={people.get(r.user_id) ?? null} id={r.user_id} /></td>
                <td><Link href={`/ai/runs/${r.id}`} className="mono" style={{ fontWeight: 700 }}>{r.model}</Link><br /><span className="muted" style={{ fontSize: 12 }}>{r.provider}</span></td>
                <td className="mono">{r.prompt_version}</td>
                <td><RunStatus run={r} /></td>
                <td className="r num">{n(usageOf(r.usage_metadata).total)}</td>
                <td className="r num">{duration(r.completed_at ? new Date(r.completed_at).getTime() - new Date(r.created_at).getTime() : null)}</td>
                <td>{postByImage.get(r.image_id) ? <Link className="badge badge-good" href={`/posts/${postByImage.get(r.image_id)}`}>Post →</Link> : <span className="muted">—</span>}</td>
                <td className="muted">{when(r.created_at)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="empty">No runs match.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={count ?? 0} size={PAGE_SIZE} base="/ai/runs" params={{ status, model, version }} />
    </div>
  );
}
