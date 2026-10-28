import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { resource, shareOf, STEP_RESOURCE } from "@/lib/catalog";
import { deleteRecord, deleteStep } from "@/lib/catalog-actions";
import { refOptions } from "@/lib/catalog-data";
import { serviceClient } from "@/lib/supabase/service";
import { n, when } from "@/lib/format";
import { CatalogForm } from "@/components/CatalogForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { RunStatus } from "@/components/RunStatus";
export const metadata: Metadata = { title: "Prompt chain" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTICES: Record<string, [string, string]> = {
  "blocked=mix": ["bad", "Members are using this chain. Choose another model for members (Overview) first, then delete it."],
  "blocked=1": ["bad", "Another record still points at this chain."],
  "step=deleted": ["good", "Step deleted."],
};
type Step = {
  id: string; position: number; name: string; llm_model_id: string | null; system_prompt: string; user_prompt: string; output_schema: unknown; updated_at: string;
  humor_llm_models: { id: string; display_name: string; humor_llm_providers: { name: string } | null } | null;
};

export default async function PromptChain({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const query = await searchParams;
  const db = serviceClient();
  const { data: chain } = await db.from("humor_prompt_chains").select("*,humor_prompt_chain_mix(share)").eq("id", id).maybeSingle();
  if (!chain) notFound();
  const [{ data: steps }, { data: runs, count }, { count: examples }, refs] = await Promise.all([
    db.from("humor_prompt_chain_steps")
      .select("id,position,name,llm_model_id,system_prompt,user_prompt,output_schema,updated_at,humor_llm_models(id,display_name,humor_llm_providers(name))")
      .eq("chain_id", id).order("position"),
    db.from("humor_generations").select("id,model,status,failure_stage,created_at", { count: "exact" })
      .eq("prompt_version", chain.prompt_version).order("created_at", { ascending: false }).limit(10),
    db.from("humor_generation_examples").select("id", { count: "exact", head: true }).eq("chain_id", id),
    refOptions(db, STEP_RESOURCE),
  ]);
  const stepRows = (steps ?? []) as unknown as Step[];
  const share = shareOf(chain.humor_prompt_chain_mix);
  const notice = Object.keys(NOTICES).find((key) => query[key.split("=")[0]] === key.split("=")[1]);
  return (
    <div className="stack">
      <Link href="/ai/prompt-chains" className="muted">← All prompt chains</Link>
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Prompt chain · <span className="mono">{chain.prompt_version}</span></span>
          <h1>{chain.name}.</h1>
          <p>{chain.description ?? "No description."}</p>
        </div>
        <Link className="btn" href="/ai#members">{share === 100 ? "In use for members" : share ? `${share}% of members` : "Not used by members"} →</Link>
      </header>
      {notice && <div className={`notice notice-${NOTICES[notice][0]}`} role="status">{NOTICES[notice][1]}</div>}

      <section className="card">
        <h2>Steps</h2>
        <p className="sub">Run in order; each step&apos;s output feeds the next. Open a step to edit or delete it.</p>
        <div className="stack">
          {stepRows.map((step) => (
            <details key={step.id} className="card" style={{ boxShadow: "none" }}>
              <summary style={{ cursor: "pointer", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="badge badge-brand">Step {step.position}</span><b>{step.name}</b>
                <span className="muted">
                  {step.humor_llm_models
                    ? <Link href={`/ai/llm-models/${step.humor_llm_models.id}`}>{step.humor_llm_models.display_name}</Link>
                    : "No model"}
                  {step.humor_llm_models?.humor_llm_providers && ` · ${step.humor_llm_models.humor_llm_providers.name}`} · updated {when(step.updated_at)}
                </span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <CatalogForm slug={STEP_RESOURCE.slug} chainId={id} initial={step} refs={refs} />
                <form action={deleteStep} style={{ marginTop: 10 }}>
                  <input type="hidden" name="chain_id" value={id} />
                  <input type="hidden" name="id" value={step.id} />
                  <ConfirmButton message={`Delete step ${step.position}? This cannot be undone.`}>Delete step</ConfirmButton>
                </form>
              </div>
            </details>
          ))}
          {!stepRows.length && <p className="empty">This chain has no steps yet.</p>}
          <details className="card" style={{ boxShadow: "none" }} open={!stepRows.length}>
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>+ Add step</summary>
            <div style={{ marginTop: 12 }}>
              <CatalogForm slug={STEP_RESOURCE.slug} chainId={id} refs={refs} defaults={{ position: (stepRows.at(-1)?.position ?? 0) + 1 }} />
            </div>
          </details>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <h2>Edit chain</h2>
          <p className="sub">Created {when(chain.created_at)} · updated {when(chain.updated_at)} · <Link href="/ai/examples">{n(examples ?? 0)} examples written for it</Link></p>
          <CatalogForm slug="prompt-chains" initial={chain} refs={{}} />
          <form action={deleteRecord} style={{ marginTop: 14, borderTop: "2px solid var(--line)", paddingTop: 14 }}>
            <input type="hidden" name="resource" value={resource("prompt-chains")!.slug} />
            <input type="hidden" name="id" value={id} />
            <p className="sub">Deleting removes the chain and its steps. Recorded runs stay; examples lose their link to it.{share ? " Members are using it: choose another model for members first." : ""}</p>
            <ConfirmButton message="Delete this prompt chain and all its steps? This cannot be undone.">Delete chain</ConfirmButton>
          </form>
        </div>
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
      </section>
    </div>
  );
}
