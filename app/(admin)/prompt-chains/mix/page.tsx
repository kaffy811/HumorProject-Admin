import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { isMissingTable, shareOf } from "@/lib/catalog";
import { profilesByIds } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/service";
import { when } from "@/lib/format";
import { MissingTable } from "@/components/MissingTable";
import { MixForm } from "@/components/MixForm";
import { PersonLink } from "@/components/Person";
export const metadata: Metadata = { title: "Prompt chain mix" };

type Mix = { share: number; updated_at: string; updated_by: string | null };
export default async function PromptChainMix() {
  await requireAdmin();
  const db = serviceClient();
  const { data, error } = await db.from("humor_prompt_chains")
    .select("id,name,prompt_version,humor_prompt_chain_mix(share,updated_at,updated_by)").order("created_at");
  if (error && !isMissingTable(error)) throw new Error(error.message);
  const chains = ((data ?? []) as unknown as { id: string; name: string; prompt_version: string; humor_prompt_chain_mix: Mix | Mix[] | null }[]);
  const mixes = chains.map((c) => (Array.isArray(c.humor_prompt_chain_mix) ? c.humor_prompt_chain_mix[0] : c.humor_prompt_chain_mix)).filter((m): m is Mix => !!m);
  const latest = mixes.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const editor = latest?.updated_by ? (await profilesByIds(db, [latest.updated_by])).get(latest.updated_by) ?? null : null;
  return (
    <div>
      <Link href="/prompt-chains" className="muted">← Prompt chains</Link>
      <header className="page-head" style={{ marginTop: 12 }}>
        <div>
          <span className="eyebrow">Read · update · <span className="mono">humor_prompt_chain_mix</span></span>
          <h1>Prompt chain mix.</h1>
          <p>How new generation requests are split between prompt chains, e.g. 80% on the current prompt and 20% on a challenger. Shares must add up to 100%; the database re-checks the total when you save.</p>
          <p className="muted">Note: the member app does not read this mix yet. It still runs its built-in <span className="mono">caption-styles-v3</span> prompt on every request.</p>
        </div>
      </header>
      {error ? <MissingTable table="humor_prompt_chain_mix" /> : (
        <div className="stack">
          {latest && <div className="muted" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>Last changed {when(latest.updated_at)}{latest.updated_by && <> by <PersonLink profile={editor} id={latest.updated_by} /></>}</div>}
          {chains.length ? <MixForm chains={chains.map((c) => ({ id: c.id, name: c.name, prompt_version: c.prompt_version, share: shareOf(c.humor_prompt_chain_mix) }))} /> : <p className="empty">No prompt chains yet.</p>}
        </div>
      )}
    </div>
  );
}
