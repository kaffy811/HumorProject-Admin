// Mirrors the member app's lib/generation-route.ts: why a chain's step 1
// cannot serve members (they would get the built-in Gemini prompt instead).
// The member app also needs the provider's API key; the admin cannot see that.
export type ChainStep = {
  position: number; user_prompt: string;
  humor_llm_models: { display_name: string; model_id: string; is_active: boolean; supports_vision: boolean; humor_llm_providers: { slug: string; name: string } | null } | null;
};
export const MEMBER_PROVIDERS = ["google", "openai"];

export function firstStep(steps: ChainStep[] | null | undefined) {
  return [...(steps ?? [])].sort((a, b) => a.position - b.position)[0] ?? null;
}

export function chainIssue(steps: ChainStep[] | null | undefined): string | null {
  const step = firstStep(steps);
  if (!step) return "No steps yet.";
  const model = step.humor_llm_models;
  if (!model) return "Step 1 has no model.";
  if (!model.is_active) return `${model.display_name} is inactive.`;
  if (!model.supports_vision) return `${model.display_name} does not accept images.`;
  if (!MEMBER_PROVIDERS.includes(model.humor_llm_providers?.slug ?? "")) return `The member app has no connector for ${model.humor_llm_providers?.name ?? "this provider"}.`;
  if (!step.user_prompt.includes("{direction}")) return "Step 1 user prompt has no {direction}, so members' directions would be lost.";
  return null;
}
