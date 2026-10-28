import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { isMissingTable } from "@/lib/catalog";
import { PROVIDER_KEYS } from "@/lib/llm";
import { serviceClient } from "@/lib/supabase/service";
import { MissingTable } from "@/components/MissingTable";
import { TestRunForm } from "@/components/TestRunForm";
export const metadata: Metadata = { title: "Test run" };
// Provider calls can take a while; 45 s timeout plus image preparation.
export const maxDuration = 60;

type Model = { id: string; display_name: string; model_id: string; is_active: boolean; humor_llm_providers: { slug: string; name: string } | null };
export default async function TestRun() {
  await requireAdmin();
  const db = serviceClient();
  const [models, chains] = await Promise.all([
    db.from("humor_llm_models").select("id,display_name,model_id,is_active,humor_llm_providers(slug,name)").order("display_name"),
    db.from("humor_prompt_chains").select("id,name,prompt_version,humor_prompt_chain_mix(share)").order("created_at", { ascending: false }),
  ]);
  const missing = isMissingTable(models.error) || isMissingTable(chains.error);
  if (!missing && (models.error || chains.error)) throw new Error((models.error ?? chains.error)!.message);
  // Only whether a key is set ever reaches the page, never the key.
  const keys = Object.entries(PROVIDER_KEYS).map(([slug, name]) => ({ slug, name, set: !!process.env[name] }));
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Try a real model</span>
          <h1>Test run.</h1>
          <p>Run the first step of a prompt chain on one photo with any model from <Link href="/ai/llm-models">LLM models &amp; providers</Link>, and see exactly what comes back. Nothing is saved and members are not affected; each run is billed by the provider.</p>
        </div>
      </header>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {keys.map((k) => <span key={k.slug} className={`badge ${k.set ? "badge-good" : "badge-warn"}`}>{k.slug}: {k.name} {k.set ? "set" : "missing"}</span>)}
      </div>
      {missing ? <MissingTable table="humor_llm_models" /> : (
        <TestRunForm
          models={((models.data ?? []) as unknown as Model[]).map((m) => ({ id: m.id, label: `${m.display_name} · ${m.humor_llm_providers?.name ?? "no provider"}${m.is_active ? "" : " (inactive)"}`, provider: m.humor_llm_providers?.slug ?? "" }))}
          chains={((chains.data ?? []) as unknown as { id: string; name: string; prompt_version: string }[]).map((c) => ({ id: c.id, label: `${c.name} · ${c.prompt_version}` }))}
          supported={keys.filter((k) => k.set).map((k) => k.slug)}
        />
      )}
    </div>
  );
}
