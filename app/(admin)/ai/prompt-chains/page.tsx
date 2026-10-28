import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { isMissingTable, shareOf } from "@/lib/catalog";
import { fetchAll, profilesByIds } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/service";
import { n, pct, when } from "@/lib/format";
import { CatalogForm } from "@/components/CatalogForm";
import { MissingTable } from "@/components/MissingTable";
import { MixForm } from "@/components/MixForm";
import { PersonLink } from "@/components/Person";
export const metadata: Metadata = { title: "Prompt chains" };

type Mix = { share: number; updated_at: string; updated_by: string | null };
type Chain = { id: string; prompt_version: string; name: string; description: string | null; updated_at: string; humor_prompt_chain_steps: { id: string }[]; humor_prompt_chain_mix: Mix | Mix[] | null };

// Chains (create here, edit and delete on each chain's page) and the traffic mix between them.
export default async function PromptChains({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requireAdmin();
  const { deleted } = await searchParams;
  const db = serviceClient();
  const { data, error } = await db.from("humor_prompt_chains")
    .select("id,prompt_version,name,description,updated_at,humor_prompt_chain_steps(id),humor_prompt_chain_mix(share,updated_at,updated_by)")
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
  const mixes = chains.map((c) => (Array.isArray(c.humor_prompt_chain_mix) ? c.humor_prompt_chain_mix[0] : c.humor_prompt_chain_mix)).filter((m): m is Mix => !!m);
  const latest = [...mixes].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const editor = latest?.updated_by ? (await profilesByIds(db, [latest.updated_by])).get(latest.updated_by) ?? null : null;
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Create · read · update · delete · <span className="mono">humor_prompt_chains</span></span>
          <h1>Prompt chains.</h1>
          <p>Each chain is a versioned recipe of LLM steps that turns a photo into four captions. Its prompt version is stamped on every run, so the usage below is real. Open a chain to edit it and its steps.</p>
        </div>
      </header>
      {error ? <MissingTable table="humor_prompt_chains" /> : (
        <div className="stack">
          {deleted && <div className="notice notice-good" role="status">Prompt chain deleted.</div>}
          <details className="card">
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>+ Add prompt chain</summary>
            <p className="sub" style={{ marginTop: 10 }}>A new chain starts at 0% of traffic. Add its steps on its page, then give it a share in the mix below.</p>
            <CatalogForm slug="prompt-chains" refs={{}} />
          </details>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Chain</th><th>Prompt version</th><th className="r">Steps</th><th className="r">Mix</th><th className="r">Runs</th><th className="r">Success</th><th>Last run</th><th /></tr></thead>
              <tbody>
                {chains.map((c) => {
                  const u = usage.get(c.prompt_version) ?? { runs: 0, completed: 0, last: null };
                  return (
                    <tr key={c.id}>
                      <td><Link href={`/ai/prompt-chains/${c.id}`} style={{ fontWeight: 700 }}>{c.name}</Link>{c.description && <><br /><span className="muted clip" style={{ fontSize: 12 }}>{c.description}</span></>}</td>
                      <td className="mono">{c.prompt_version}</td>
                      <td className="r num">{n((c.humor_prompt_chain_steps ?? []).length)}</td>
                      <td className="r num">{shareOf(c.humor_prompt_chain_mix) ? <b>{shareOf(c.humor_prompt_chain_mix)}%</b> : <span className="muted">0%</span>}</td>
                      <td className="r num">{u.runs ? <Link href={`/ai/runs?version=${encodeURIComponent(c.prompt_version)}`}>{n(u.runs)}</Link> : 0}</td>
                      <td className="r num">{pct(u.completed, u.runs)}</td>
                      <td className="muted">{when(u.last)}</td>
                      <td><Link className="btn" href={`/ai/prompt-chains/${c.id}`}>Edit</Link></td>
                    </tr>
                  );
                })}
                {!chains.length && <tr><td colSpan={8} className="empty">No prompt chains yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <section className="card" id="mix">
            <h2>Mix</h2>
            <p className="sub">How new generation requests are split between chains, e.g. 80% on the current prompt and 20% on a challenger. Shares must add up to 100%; the database re-checks the total when you save. The member app does not read this mix yet: it still runs its built-in <span className="mono">caption-styles-v3</span> prompt on every request.</p>
            {latest && <div className="muted" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>Last changed {when(latest.updated_at)}{latest.updated_by && <> by <PersonLink profile={editor} id={latest.updated_by} /></>}</div>}
            {chains.length ? <MixForm chains={chains.map((c) => ({ id: c.id, name: c.name, prompt_version: c.prompt_version, share: shareOf(c.humor_prompt_chain_mix) }))} /> : <p className="empty">Add a prompt chain first.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
