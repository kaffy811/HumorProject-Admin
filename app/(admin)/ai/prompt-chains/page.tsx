import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { isMissingTable, shareOf } from "@/lib/catalog";
import { fetchAll } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/service";
import { n, pct, text, when } from "@/lib/format";
import { firstStep, type ChainStep } from "@/lib/chain-check";
import { CatalogForm } from "@/components/CatalogForm";
import { MissingTable } from "@/components/MissingTable";
export const metadata: Metadata = { title: "Prompt chains" };

type Chain = { id: string; prompt_version: string; name: string; description: string | null; updated_at: string; humor_prompt_chain_steps: ChainStep[]; humor_prompt_chain_mix: { share: number } | { share: number }[] | null };

// Chains (create here, edit and delete on each chain's page), tabbed by the
// provider of their step 1 model, e.g. Gemini vs GPT.
export default async function PromptChains({ searchParams }: { searchParams: Promise<{ deleted?: string; provider?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const db = serviceClient();
  const { data, error } = await db.from("humor_prompt_chains")
    .select("id,prompt_version,name,description,updated_at,humor_prompt_chain_steps(position,user_prompt,humor_llm_models(display_name,model_id,is_active,supports_vision,humor_llm_providers(slug,name))),humor_prompt_chain_mix(share)")
    .order("created_at", { ascending: false });
  if (error && !isMissingTable(error)) throw new Error(error.message);
  const all = (data ?? []) as unknown as Chain[];
  const modelOf = (c: Chain) => firstStep(c.humor_prompt_chain_steps)?.humor_llm_models ?? null;
  const providerOf = (c: Chain) => modelOf(c)?.humor_llm_providers ?? null;
  // One tab per provider that some chain uses, plus chains with no model yet.
  const tabs = [...new Map(all.map((c) => [providerOf(c)?.slug ?? "none", providerOf(c)?.name ?? "No model"])).entries()];
  const provider = tabs.some(([slug]) => slug === text(params.provider)) ? text(params.provider) : "";
  const chains = provider ? all.filter((c) => (providerOf(c)?.slug ?? "none") === provider) : all;
  // Real usage per chain: runs recorded with its prompt_version.
  const runs = await fetchAll<{ prompt_version: string; status: string; created_at: string }>(db, "humor_generations", "prompt_version,status,created_at");
  const usage = new Map<string, { runs: number; completed: number; last: string | null }>();
  for (const run of runs) {
    const entry = usage.get(run.prompt_version) ?? { runs: 0, completed: 0, last: null };
    entry.runs++;
    if (run.status === "completed") entry.completed++;
    if (!entry.last || run.created_at > entry.last) entry.last = run.created_at;
    usage.set(run.prompt_version, entry);
  }
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Create · read · update · delete · <span className="mono">humor_prompt_chains</span></span>
          <h1>Prompt chains.</h1>
          <p>Each chain is a versioned recipe of LLM steps that turns a photo into four captions; its step 1 model decides whether it is a Gemini or a GPT chain. Its prompt version is stamped on every run, so the usage below is real. Open a chain to edit it and its steps. Which chain members get is chosen in <Link href="/ai#members">Overview</Link> or <Link href="/ai/llm-models#members">LLM models &amp; providers</Link>.</p>
        </div>
      </header>
      {error ? <MissingTable table="humor_prompt_chains" /> : (
        <div className="stack">
          {params.deleted && <div className="notice notice-good" role="status">Prompt chain deleted.</div>}
          <details className="card">
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>+ Add prompt chain</summary>
            <p className="sub" style={{ marginTop: 10 }}>Add its steps on its page (step 1 picks the model), then choose it for members in Overview.</p>
            <CatalogForm slug="prompt-chains" refs={{}} />
          </details>
          {tabs.length > 1 && (
            <nav className="tabs" aria-label="Provider" style={{ marginBottom: 0 }}>
              <Link className="tab" href="/ai/prompt-chains" aria-current={!provider ? "page" : undefined}>All <span className="muted num">{n(all.length)}</span></Link>
              {tabs.map(([slug, name]) => (
                <Link key={slug} className="tab" href={`/ai/prompt-chains?provider=${encodeURIComponent(slug)}`} aria-current={provider === slug ? "page" : undefined}>
                  {name} <span className="muted num">{n(all.filter((c) => (providerOf(c)?.slug ?? "none") === slug).length)}</span>
                </Link>
              ))}
            </nav>
          )}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Chain</th><th>Model</th><th>Prompt version</th><th className="r">Steps</th><th>Members</th><th className="r">Runs</th><th className="r">Success</th><th>Last run</th><th /></tr></thead>
              <tbody>
                {chains.map((c) => {
                  const u = usage.get(c.prompt_version) ?? { runs: 0, completed: 0, last: null };
                  const model = modelOf(c);
                  const share = shareOf(c.humor_prompt_chain_mix);
                  return (
                    <tr key={c.id}>
                      <td><Link href={`/ai/prompt-chains/${c.id}`} style={{ fontWeight: 700 }}>{c.name}</Link>{c.description && <><br /><span className="muted clip" style={{ fontSize: 12 }}>{c.description}</span></>}</td>
                      <td>{model ? <><span className="badge">{model.humor_llm_providers?.name ?? "No provider"}</span><br /><span className="mono" style={{ fontSize: 12 }}>{model.model_id}</span></> : <span className="muted">No model</span>}</td>
                      <td className="mono">{c.prompt_version}</td>
                      <td className="r num">{n((c.humor_prompt_chain_steps ?? []).length)}</td>
                      <td>{share === 100 ? <span className="badge badge-good">In use</span> : share ? <span className="badge">{share}%</span> : <span className="muted">—</span>}</td>
                      <td className="r num">{u.runs ? <Link href={`/ai/runs?version=${encodeURIComponent(c.prompt_version)}`}>{n(u.runs)}</Link> : 0}</td>
                      <td className="r num">{pct(u.completed, u.runs)}</td>
                      <td className="muted">{when(u.last)}</td>
                      <td><Link className="btn" href={`/ai/prompt-chains/${c.id}`}>Edit</Link></td>
                    </tr>
                  );
                })}
                {!chains.length && <tr><td colSpan={9} className="empty">No prompt chains yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
