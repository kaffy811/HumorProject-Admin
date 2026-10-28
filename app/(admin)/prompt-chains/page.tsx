import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { isMissingTable, shareOf } from "@/lib/catalog";
import { fetchAll } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/service";
import { n, pct, when } from "@/lib/format";
import { MissingTable } from "@/components/MissingTable";
export const metadata: Metadata = { title: "Prompt chains" };

type Chain = { id: string; prompt_version: string; name: string; description: string | null; updated_at: string; humor_prompt_chain_steps: { id: string }[]; humor_prompt_chain_mix: { share: number } | { share: number }[] | null };

export default async function PromptChains() {
  await requireAdmin();
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
          <span className="eyebrow">Read · <span className="mono">humor_prompt_chains</span></span>
          <h1>Prompt chains.</h1>
          <p>Each chain is a versioned recipe of LLM steps that turns a photo into four captions. Its prompt version is stamped on every run, so usage below is real.</p>
        </div>
        <Link className="btn btn-primary" href="/prompt-chains/mix">Edit mix</Link>
      </header>
      {error ? <MissingTable table="humor_prompt_chains" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Chain</th><th>Prompt version</th><th className="r">Steps</th><th className="r">Mix</th><th className="r">Runs</th><th className="r">Success</th><th>Last run</th><th>Updated</th></tr></thead>
            <tbody>
              {chains.map((c) => {
                const u = usage.get(c.prompt_version) ?? { runs: 0, completed: 0, last: null };
                return (
                  <tr key={c.id}>
                    <td><Link href={`/prompt-chains/${c.id}`} style={{ fontWeight: 700 }}>{c.name}</Link>{c.description && <><br /><span className="muted clip" style={{ fontSize: 12 }}>{c.description}</span></>}</td>
                    <td className="mono">{c.prompt_version}</td>
                    <td className="r num">{n(c.humor_prompt_chain_steps.length)}</td>
                    <td className="r num">{shareOf(c.humor_prompt_chain_mix) ? <b>{shareOf(c.humor_prompt_chain_mix)}%</b> : <span className="muted">0%</span>}</td>
                    <td className="r num">{u.runs ? <Link href={`/ai/runs?version=${encodeURIComponent(c.prompt_version)}`}>{n(u.runs)}</Link> : 0}</td>
                    <td className="r num">{pct(u.completed, u.runs)}</td>
                    <td className="muted">{when(u.last)}</td>
                    <td className="muted">{when(c.updated_at)}</td>
                  </tr>
                );
              })}
              {!chains.length && <tr><td colSpan={8} className="empty">No prompt chains yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
