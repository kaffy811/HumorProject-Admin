import { isMissingTable, shareOf } from "@/lib/catalog";
import { chainIssue, firstStep, type ChainStep } from "@/lib/chain-check";
import { serviceClient } from "@/lib/supabase/service";
import { MemberModelForm } from "@/components/MemberModelForm";
import { MissingTable } from "@/components/MissingTable";

type Chain = { id: string; name: string; prompt_version: string; humor_prompt_chain_steps: ChainStep[]; humor_prompt_chain_mix: { share: number } | { share: number }[] | null };
// "Model for members", shown on Overview and on LLM models & providers.
export async function MemberModelCard({ formId }: { formId: string }) {
  const { data, error } = await serviceClient().from("humor_prompt_chains")
    .select("id,name,prompt_version,humor_prompt_chain_steps(position,user_prompt,humor_llm_models(display_name,model_id,is_active,supports_vision,humor_llm_providers(slug,name))),humor_prompt_chain_mix(share)")
    .order("created_at");
  if (error && !isMissingTable(error)) throw new Error(error.message);
  const chains = (data ?? []) as unknown as Chain[];
  const inUse = chains.find((c) => shareOf(c.humor_prompt_chain_mix) === 100)?.id ?? null;
  const split = !inUse && chains.some((c) => shareOf(c.humor_prompt_chain_mix) > 0);
  return (
    <section className="card" id="members">
      <h2>Model for members</h2>
      <p className="sub">Choose the one model (with its prompt chain) that writes captions for every member; members never choose. Options the member app cannot run are greyed out with the reason. If the chosen model fails on a request (for example no credits, or no API key on the member app), that request falls back to the built-in Gemini prompt. Delete removes the prompt chain and its steps; the model stays in LLM models.</p>
      {error ? <MissingTable table="humor_prompt_chains" /> : !chains.length ? <p className="empty">No prompt chains yet. Add one in Prompt chains.</p> : (
        <>
          {split && <div className="notice notice-warn" style={{ marginBottom: 12 }}>Requests are currently split between several chains. Saving here sends everything to one.</div>}
          <MemberModelForm formId={formId} current={inUse} options={chains.map((c) => {
            const model = firstStep(c.humor_prompt_chain_steps)?.humor_llm_models;
            return { id: c.id, name: c.name, promptVersion: c.prompt_version, model: model?.display_name ?? null, provider: model?.humor_llm_providers?.name ?? null, issue: chainIssue(c.humor_prompt_chain_steps) };
          })} />
        </>
      )}
    </section>
  );
}
