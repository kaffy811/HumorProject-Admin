import { isMissingTable, shareOf } from "@/lib/catalog";
import { chainIssue, orderedSteps, withModel, type ChainModel, type ChainStep } from "@/lib/chain-check";
import { serviceClient } from "@/lib/supabase/service";
import { MemberModelForm, type MemberChain, type MemberModel } from "@/components/MemberModelForm";
import { MissingTable } from "@/components/MissingTable";

type Chain = { id: string; name: string; prompt_version: string; humor_prompt_chain_steps: ChainStep[]; humor_prompt_chain_mix: { share: number } | { share: number }[] | null };
type Model = ChainModel & { id: string };
// "Model for members", shown on Overview and on LLM models & providers: every
// model in LLM models is an option (grouped by provider), applied to every step
// of the prompt chain members use.
export async function MemberModelCard({ formId }: { formId: string }) {
  const db = serviceClient();
  const [chainsResult, modelsResult] = await Promise.all([
    db.from("humor_prompt_chains").select("id,name,prompt_version,humor_prompt_chain_steps(*,humor_llm_models(id,display_name,model_id,is_active,supports_vision,humor_llm_providers(slug,name))),humor_prompt_chain_mix(share)").order("created_at"),
    db.from("humor_llm_models").select("id,display_name,model_id,is_active,supports_vision,humor_llm_providers(slug,name)").order("display_name"),
  ]);
  const error = chainsResult.error ?? modelsResult.error;
  if (error && !isMissingTable(error)) throw new Error(error.message);
  const chains = (chainsResult.data ?? []) as unknown as Chain[];
  const models = (modelsResult.data ?? []) as unknown as Model[];
  const inUse = chains.find((c) => shareOf(c.humor_prompt_chain_mix) === 100)?.id ?? null;
  // Problems a chain has whatever the model (order, placeholders, no step sees the photo…).
  const anyModel: ChainModel = { display_name: "", model_id: "", is_active: true, supports_vision: true, humor_llm_providers: { slug: "google", name: "" } };
  const options: MemberChain[] = chains.map((c) => {
    const steps = orderedSteps(c.humor_prompt_chain_steps);
    const ids = [...new Set(steps.map((s) => (s.humor_llm_models as Model | null)?.id ?? null))];
    return {
      id: c.id, name: c.name, promptVersion: c.prompt_version, steps: steps.length,
      seeing: steps.map((s, i) => ((s.include_image ?? true) ? i + 1 : 0)).filter(Boolean),
      issue: chainIssue(withModel(steps, anyModel)),
      modelId: ids.length === 1 ? ids[0] : null, mixed: ids.length > 1,
    };
  });
  const modelOptions: MemberModel[] = models.map((m) => ({
    id: m.id, name: m.display_name, modelId: m.model_id, provider: m.humor_llm_providers?.slug ?? "", providerName: m.humor_llm_providers?.name ?? "No provider",
    active: m.is_active, vision: m.supports_vision,
  }));
  return (
    <section className="card" id="members">
      <h2>Model for members</h2>
      <p className="sub">Choose the model every member&apos;s captions are written with; members never choose. It goes on every step of the members&apos; prompt chain (Gemini and GPT can run the same chain). Every model added under LLM models appears here; ones that cannot run the chain are greyed out with the reason. After saving, the database is read back to confirm. If the model fails on a request (for example no credits, or no API key on the member app), that request falls back to the built-in Gemini prompt.</p>
      {error ? <MissingTable table="humor_prompt_chains" /> : !chains.length ? <p className="empty">No prompt chains yet. Create one in the Prompt Chain Tool.</p> : !models.length ? <p className="empty">No models yet. Add one under LLM models below.</p> : (
        <MemberModelForm formId={formId} chains={options} models={modelOptions} current={inUse} />
      )}
    </section>
  );
}
