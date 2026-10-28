import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { PAGE_SIZE } from "@/lib/data";
import { candidatesOf, usageOf } from "@/lib/ai-stats";
import { serviceClient } from "@/lib/supabase/service";
import { clampPage, duration, n, text, when } from "@/lib/format";
import { Pager } from "@/components/Pager";
import { RunStatus } from "@/components/RunStatus";
export const metadata: Metadata = { title: "LLM responses" };

type Row = { id: string; provider: string; model: string; prompt_version: string; status: string; failure_stage: string | null; caption_candidates: unknown; scene: string | null; usage_metadata: unknown; created_at: string; completed_at: string | null };
type Search = Promise<{ status?: string; model?: string; page?: string }>;
// What each model call returned: the parsed captions, scene, tokens and latency.
export default async function Responses({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const params = await searchParams;
  const status = ["completed", "failed"].includes(text(params.status)) ? text(params.status) : "";
  const model = text(params.model);
  const page = clampPage(params.page);
  let query = serviceClient().from("humor_generations")
    .select("id,provider,model,prompt_version,status,failure_stage,caption_candidates,scene,usage_metadata,created_at,completed_at", { count: "exact" })
    .neq("status", "processing").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (model) query = query.eq("model", model);
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  return (
    <div>
      <Link href="/ai" className="muted">← Models &amp; prompts</Link>
      <header className="page-head" style={{ marginTop: 12 }}>
        <div>
          <span className="eyebrow">Read · <span className="mono">humor_generations</span> responses</span>
          <h1>LLM responses.</h1>
          <p>Every finished model call and what came back: the four captions with their styles, token usage and latency. Failed calls show the stage where they stopped. Requests still processing are under <Link href="/ai/runs?status=processing">generation requests</Link>.</p>
        </div>
      </header>
      <form className="toolbar">
        <select className="select" name="status" defaultValue={status} aria-label="Status">
          <option value="">Completed and failed</option><option value="completed">Completed</option><option value="failed">Failed</option>
        </select>
        <input className="input" name="model" defaultValue={model} placeholder="Model (exact)" aria-label="Model" />
        <button className="btn" type="submit">Apply</button>
      </form>
      <div className="stack">
        {rows.map((r) => {
          const usage = usageOf(r.usage_metadata);
          const captions = candidatesOf(r.caption_candidates);
          return (
            <article key={r.id} className="card">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <RunStatus run={r} />
                <Link href={`/ai/runs/${r.id}`} className="mono" style={{ fontWeight: 700 }}>{r.model}</Link>
                <span className="muted">{r.provider} · <span className="mono">{r.prompt_version}</span> · {when(r.created_at)}</span>
                <span className="muted num" style={{ marginLeft: "auto" }}>{n(usage.prompt)} in · {n(usage.output)} out{usage.thoughts ? ` · ${n(usage.thoughts)} thinking` : ""} · {duration(r.completed_at ? new Date(r.completed_at).getTime() - new Date(r.created_at).getTime() : null)}</span>
              </div>
              {captions.length ? (
                <ol style={{ margin: "12px 0 0", paddingLeft: 20, display: "grid", gap: 6 }}>
                  {captions.map((c, i) => <li key={i}>{c.original}{c.style && <span className="badge" style={{ marginLeft: 6 }}>{c.style}</span>}</li>)}
                </ol>
              ) : <p className="muted" style={{ margin: "12px 0 0" }}>{r.status === "failed" ? `No response kept — failed at ${r.failure_stage ?? "an unknown stage"}.` : "No captions recorded."}</p>}
              {r.scene && <p className="muted" style={{ margin: "10px 0 0" }}>Scene: {r.scene}</p>}
            </article>
          );
        })}
        {!rows.length && <p className="empty">No responses match.</p>}
      </div>
      <Pager page={page} total={count ?? 0} size={PAGE_SIZE} base="/ai/responses" params={{ status, model }} />
    </div>
  );
}
