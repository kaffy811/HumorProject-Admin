import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { isMissingTable, shareOf } from "@/lib/catalog";
import { fetchAll } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/service";
import { n, pct, when } from "@/lib/format";
import { CatalogForm } from "@/components/CatalogForm";
import { promptChainToolUrl } from "@/lib/tool-url";
import { MissingTable } from "@/components/MissingTable";
export const metadata: Metadata = { title: "Prompt chains" };

type Chain = { id: string; prompt_version: string; name: string; description: string | null; updated_at: string; humor_prompt_chain_steps: { id: string }[]; humor_prompt_chain_mix: { share: number } | { share: number }[] | null };

// Chains (create here, edit and delete on each chain's page). A chain is not
// tied to a provider: its one model can be switched between Gemini and GPT in
// the Prompt Chain Tool, so chains are not grouped or labelled by model here.
export default async function PromptChains({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const db = serviceClient();
  const { data, error } = await db.from("humor_prompt_chains")
    .select("id,prompt_version,name,description,updated_at,humor_prompt_chain_steps(id),humor_prompt_chain_mix(share)")
    .order("created_at", { ascending: false });
  if (error && !isMissingTable(error)) throw new Error(error.message);
  const chains = (data ?? []) as unknown as Chain[];
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
          <p>Each chain is a versioned recipe of LLM steps that turns a photo into four captions; its one model (Gemini or GPT) is chosen and switched in the Prompt Chain Tool. A chain may have up to 4 steps for members (for example: look at the photo, find the angles, write the captions). Its prompt version is stamped on every run, so the usage below is real. Design ↗ opens a chain in the Prompt Chain Tool; Details shows its steps read-only and edits its name and description here. The model members get is chosen in <Link href="/ai#members">Overview</Link> or <Link href="/ai/llm-models#members">LLM models &amp; providers</Link>.</p>
        </div>
      </header>
      {error ? <MissingTable table="humor_prompt_chains" /> : (
        <div className="stack">
          {params.deleted && <div className="notice notice-good" role="status">Prompt chain deleted.</div>}
          {/* Chains are designed in the separate Prompt Chain Tool: canvas, steps, variables, test runs, history. */}
          <section className="card tool-banner">
            <div>
              <h2 style={{ margin: 0 }}>Design and edit chains in the Prompt Chain Tool</h2>
              <p className="sub" style={{ margin: "6px 0 0" }}>Steps, their order and prompts, the chain&apos;s model (Gemini or GPT), variables, single-step tests, full runs and version history all live there. Superadmins sign in with the same Google account.</p>
            </div>
            <div className="row">
              <a className="btn btn-primary" href={promptChainToolUrl("/chains")} target="_blank" rel="noopener">Open the Prompt Chain Tool ↗</a>
              <a className="btn" href={promptChainToolUrl("/chains?new=1")} target="_blank" rel="noopener">+ New chain in the tool ↗</a>
            </div>
          </section>
          <details className="card">
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>+ Add prompt chain</summary>
            <p className="sub" style={{ marginTop: 10 }}>Add its steps in the Prompt Chain Tool (the chain picks one model there), then choose it for members in Overview.</p>
            <CatalogForm slug="prompt-chains" refs={{}} />
          </details>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Chain</th><th>Prompt version</th><th className="r">Steps</th><th>Members</th><th className="r">Runs</th><th className="r">Success</th><th>Last run</th><th /></tr></thead>
              <tbody>
                {chains.map((c) => {
                  const u = usage.get(c.prompt_version) ?? { runs: 0, completed: 0, last: null };
                  const share = shareOf(c.humor_prompt_chain_mix);
                  return (
                    <tr key={c.id}>
                      <td><Link href={`/ai/prompt-chains/${c.id}`} style={{ fontWeight: 700 }}>{c.name}</Link>{c.description && <><br /><span className="muted clip" style={{ fontSize: 12 }}>{c.description}</span></>}</td>
                      <td className="mono">{c.prompt_version}</td>
                      <td className="r num">{n((c.humor_prompt_chain_steps ?? []).length)}</td>
                      <td>{share === 100 ? <span className="badge badge-good">In use</span> : share ? <span className="badge">{share}%</span> : <span className="muted">—</span>}</td>
                      <td className="r num">{u.runs ? <Link href={`/ai/runs?version=${encodeURIComponent(c.prompt_version)}`}>{n(u.runs)}</Link> : 0}</td>
                      <td className="r num">{pct(u.completed, u.runs)}</td>
                      <td className="muted">{when(u.last)}</td>
                      <td><div className="row" style={{ flexWrap: "nowrap" }}>
                        <a className="btn btn-primary" href={promptChainToolUrl(`/chains/${c.id}`)} target="_blank" rel="noopener" title="Edit steps in the Prompt Chain Tool">Design ↗</a>
                        <Link className="btn" href={`/ai/prompt-chains/${c.id}`}>Details</Link>
                      </div></td>
                    </tr>
                  );
                })}
                {!chains.length && <tr><td colSpan={8} className="empty">No prompt chains yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
