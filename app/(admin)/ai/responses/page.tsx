import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { fetchAll, PAGE_SIZE } from "@/lib/data";
import { candidatesOf, usageOf } from "@/lib/ai-stats";
import { serviceClient } from "@/lib/supabase/service";
import { clampPage, duration, n, nyLocalToIso, text, when } from "@/lib/format";
import { Pager } from "@/components/Pager";
import { RunStatus } from "@/components/RunStatus";
export const metadata: Metadata = { title: "LLM responses" };

type Row = { id: string; provider: string; model: string; prompt_version: string; status: string; failure_stage: string | null; caption_candidates: unknown; scene: string | null; usage_metadata: unknown; created_at: string; completed_at: string | null };
type Search = Promise<{ status?: string; model?: string; from?: string; to?: string; page?: string }>;
// What each model call returned: the parsed captions, scene, tokens and latency.
export default async function Responses({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const params = await searchParams;
  const status = ["completed", "failed"].includes(text(params.status)) ? text(params.status) : "";
  const model = text(params.model);
  // datetime-local values, read as New York time like the activity log.
  const from = text(params.from), to = text(params.to);
  const fromIso = nyLocalToIso(from), toIso = nyLocalToIso(to);
  const page = clampPage(params.page);
  const db = serviceClient();
  // Model choices: every model with recorded runs plus the ones configured in the catalog.
  const [recorded, configured] = await Promise.all([
    fetchAll<{ provider: string; model: string }>(db, "humor_generations", "provider,model"),
    db.from("humor_llm_models").select("model_id,display_name,humor_llm_providers(slug)"),
  ]);
  const models = new Map<string, string>();
  for (const r of recorded) models.set(r.model, r.model);
  for (const m of ((configured.error ? [] : configured.data) ?? []) as { model_id: string; display_name: string }[]) models.set(m.model_id, m.display_name === m.model_id ? m.model_id : `${m.display_name} (${m.model_id})`);
  let query = db.from("humor_generations")
    .select("id,provider,model,prompt_version,status,failure_stage,caption_candidates,scene,usage_metadata,created_at,completed_at", { count: "exact" })
    .neq("status", "processing").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (model) query = query.eq("model", model);
  if (fromIso) query = query.gte("created_at", fromIso);
  if (toIso) query = query.lte("created_at", toIso);
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Read · <span className="mono">humor_generations</span> responses</span>
          <h1>LLM responses.</h1>
          <p>Every finished model call and what came back: the four captions with their styles, token usage and latency. Failed calls show the stage where they stopped. Requests still processing are under <Link href="/ai/runs?status=processing">generation requests</Link>.</p>
        </div>
      </header>
      <form className="log-filters" role="search">
        <div className="field">
          <label htmlFor="model">Model</label>
          <select id="model" className="select" name="model" defaultValue={model}>
            <option value="">All models</option>
            {[...models.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" className="select" name="status" defaultValue={status}>
            <option value="">Completed and failed</option><option value="completed">Completed</option><option value="failed">Failed</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" className="input" type="datetime-local" name="from" defaultValue={from} max={to || undefined} />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" className="input" type="datetime-local" name="to" defaultValue={to} min={from || undefined} />
        </div>
        <div className="log-filter-actions">
          <button className="btn btn-primary" type="submit">Apply</button>
          {(model || status || from || to) && <Link className="btn" href="/ai/responses">Clear</Link>}
        </div>
      </form>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: 12.5 }}>
        {n(count ?? 0)} {count === 1 ? "response" : "responses"}{model && <> from <span className="mono">{model}</span></>}
        {from || to ? <> · {from ? from.replace("T", " ") : "beginning"} → {to ? to.replace("T", " ") : "now"} (New York time)</> : " · all time"}
      </p>
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
      <Pager page={page} total={count ?? 0} size={PAGE_SIZE} base="/ai/responses" params={{ status, model, from, to }} />
    </div>
  );
}
