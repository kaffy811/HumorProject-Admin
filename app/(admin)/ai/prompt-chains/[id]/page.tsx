import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { resource, shareOf } from "@/lib/catalog";
import { deleteRecord } from "@/lib/catalog-actions";
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
};
type Step = {
  id: string; position: number; name: string; llm_model_id: string | null; system_prompt: string; user_prompt: string; output_schema: unknown; updated_at: string;
  include_image?: boolean; output_kind?: string;
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
  const [{ data: steps }, { data: runs, count }, { count: examples }] = await Promise.all([
    // "*": include_image / output_kind exist once the Prompt Chain Tool migration is applied.
    db.from("humor_prompt_chain_steps")
      .select("*,humor_llm_models(id,display_name,humor_llm_providers(name))")
      .eq("chain_id", id).order("position"),
    db.from("humor_generations").select("id,model,status,failure_stage,created_at", { count: "exact" })
      .eq("prompt_version", chain.prompt_version).order("created_at", { ascending: false }).limit(10),
    db.from("humor_generation_examples").select("id", { count: "exact", head: true }).eq("chain_id", id),
  ]);
  const tool = process.env.PROMPT_CHAIN_TOOL_URL?.startsWith("https://") ? `${process.env.PROMPT_CHAIN_TOOL_URL.replace(/\/$/, "")}/chains/${id}` : null;
  const models = [...new Set((steps ?? []).map((s) => (s as unknown as Step).humor_llm_models?.display_name ?? "No model"))];
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <h2>Steps</h2>
            <p className="sub">Read-only here. Steps, their order and the chain&apos;s model ({models.length ? models.join(" + ") : "none yet"}) are edited in the Prompt Chain Tool, which checks placeholders and keeps a version of every change.</p>
          </div>
          {tool ? <a className="btn btn-primary" href={tool}>Edit in Prompt Chain Tool →</a> : <span className="badge badge-warn">Set PROMPT_CHAIN_TOOL_URL to link the Prompt Chain Tool</span>}
        </div>
        <div className="stack">
          {stepRows.map((step) => (
            <details key={step.id} className="card" style={{ boxShadow: "none" }}>
              <summary style={{ cursor: "pointer", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="badge badge-brand">Step {step.position}</span><b>{step.name}</b>
                {step.include_image !== false && <span className="badge">Sees photo</span>}
                <span className="badge">{step.output_kind === "text" ? "Returns text" : "Returns captions"}</span>
                <span className="muted">
                  {step.humor_llm_models
                    ? <Link href={`/ai/llm-models/${step.humor_llm_models.id}`}>{step.humor_llm_models.display_name}</Link>
                    : "No model"}
                  {step.humor_llm_models?.humor_llm_providers && ` · ${step.humor_llm_models.humor_llm_providers.name}`} · updated {when(step.updated_at)}
                </span>
              </summary>
              <div className="stack" style={{ marginTop: 12, gap: 10 }}>
                <div><span style={{ fontWeight: 800, fontSize: 13 }}>System prompt</span><pre className="prompt">{step.system_prompt}</pre></div>
                <div><span style={{ fontWeight: 800, fontSize: 13 }}>User prompt</span><pre className="prompt">{step.user_prompt}</pre></div>
                {step.output_schema != null && <div><span style={{ fontWeight: 800, fontSize: 13 }}>Output JSON schema</span><pre className="prompt">{JSON.stringify(step.output_schema, null, 2)}</pre></div>}
              </div>
            </details>
          ))}
          {!stepRows.length && <p className="empty">This chain has no steps yet. Add them in the Prompt Chain Tool.</p>}
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
