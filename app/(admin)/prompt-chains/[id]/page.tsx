import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { shareOf } from "@/lib/catalog";
import { serviceClient } from "@/lib/supabase/service";
import { n, when } from "@/lib/format";
import { RunStatus } from "@/components/RunStatus";
export const metadata: Metadata = { title: "Prompt chain" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Step = {
  id: string; position: number; name: string; system_prompt: string; user_prompt: string; output_schema: unknown; updated_at: string;
  humor_llm_models: { id: string; display_name: string; model_id: string; humor_llm_providers: { name: string } | null } | null;
};

export default async function PromptChain({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = serviceClient();
  const { data: chain } = await db.from("humor_prompt_chains").select("*,humor_prompt_chain_mix(share,updated_at)").eq("id", id).maybeSingle();
  if (!chain) notFound();
  const [{ data: steps }, { data: runs, count }, { count: examples }] = await Promise.all([
    db.from("humor_prompt_chain_steps")
      .select("id,position,name,system_prompt,user_prompt,output_schema,updated_at,humor_llm_models(id,display_name,model_id,humor_llm_providers(name))")
      .eq("chain_id", id).order("position"),
    db.from("humor_generations").select("id,model,status,failure_stage,created_at", { count: "exact" })
      .eq("prompt_version", chain.prompt_version).order("created_at", { ascending: false }).limit(10),
    db.from("humor_generation_examples").select("id", { count: "exact", head: true }).eq("chain_id", id),
  ]);
  const stepRows = (steps ?? []) as unknown as Step[];
  return (
    <div className="stack">
      <Link href="/prompt-chains" className="muted">← All prompt chains</Link>
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Prompt chain · <span className="mono">{chain.prompt_version}</span></span>
          <h1>{chain.name}.</h1>
          <p>{chain.description ?? "No description."}</p>
        </div>
        <Link className="btn" href="/prompt-chains/mix">Mix: {shareOf(chain.humor_prompt_chain_mix)}% →</Link>
      </header>
      <section className="card">
        <h2>Steps</h2>
        <p className="sub">Run in order; each step&apos;s output feeds the next. Read-only here — a new prompt is a new chain version so old runs stay comparable.</p>
        <div className="stack">
          {stepRows.map((step) => (
            <details key={step.id} className="card" style={{ boxShadow: "none" }} open={stepRows.length === 1}>
              <summary style={{ cursor: "pointer", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="badge badge-brand">Step {step.position}</span><b>{step.name}</b>
                <span className="muted">
                  {step.humor_llm_models
                    ? <Link href={`/catalog/llm-models/${step.humor_llm_models.id}`}>{step.humor_llm_models.display_name}</Link>
                    : "No model"}
                  {step.humor_llm_models?.humor_llm_providers && ` · ${step.humor_llm_models.humor_llm_providers.name}`} · updated {when(step.updated_at)}
                </span>
              </summary>
              <div className="grid grid-2" style={{ marginTop: 12 }}>
                <div><span className="eyebrow">System prompt</span><pre className="prompt">{step.system_prompt}</pre></div>
                <div><span className="eyebrow">User prompt</span><pre className="prompt">{step.user_prompt}</pre></div>
              </div>
              {step.output_schema != null && <div style={{ marginTop: 12 }}><span className="eyebrow">Output schema</span><pre className="prompt">{JSON.stringify(step.output_schema, null, 2)}</pre></div>}
            </details>
          ))}
          {!stepRows.length && <p className="empty">This chain has no steps.</p>}
        </div>
      </section>
      <section className="grid grid-2">
        <div className="card">
          <h2>Recent runs</h2>
          <p className="sub">{n(count ?? 0)} generation requests used this chain. <Link href={`/ai/runs?version=${encodeURIComponent(chain.prompt_version)}`}>All of them →</Link></p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Model</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {(runs ?? []).map((r) => (
                  <tr key={r.id}><td><Link className="mono" href={`/ai/runs/${r.id}`}>{r.model}</Link></td><td><RunStatus run={r} /></td><td className="muted">{when(r.created_at)}</td></tr>
                ))}
                {!(runs ?? []).length && <tr><td colSpan={3} className="empty">No runs yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Details</h2>
          <dl className="kv">
            <dt>Created</dt><dd>{when(chain.created_at)}</dd>
            <dt>Updated</dt><dd>{when(chain.updated_at)}</dd>
            <dt>Examples</dt><dd><Link href="/catalog/examples">{n(examples ?? 0)} written for this chain →</Link></dd>
            <dt>ID</dt><dd className="mono">{chain.id}</dd>
          </dl>
        </div>
      </section>
    </div>
  );
}
