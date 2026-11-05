// Mirrors the member app's lib/generation-route.ts: why a chain cannot serve
// members (they would get the built-in Gemini prompt instead). Steps run in
// order; earlier steps return text, the last returns the four captions.
// The member app also needs the provider's API key; the admin cannot see that.
export type ChainModel = { display_name: string; model_id: string; is_active: boolean; supports_vision: boolean; humor_llm_providers: { slug: string; name: string } | null };
export type ChainStep = {
  position: number; user_prompt: string;
  // Added by the Prompt Chain Tool migration (202611050001); absent before it,
  // meaning a single caption step that sees the photo.
  output_kind?: string | null; include_image?: boolean | null;
  humor_llm_models: ChainModel | null;
};
export const MEMBER_PROVIDERS = ["google", "openai"];
export const MAX_MEMBER_STEPS = 4;
const PLACEHOLDER = /\{(direction|previous|step(\d{1,2}))\}/g;

export function orderedSteps(steps: ChainStep[] | null | undefined) {
  return [...(steps ?? [])].sort((a, b) => a.position - b.position);
}

export function firstStep(steps: ChainStep[] | null | undefined) {
  return orderedSteps(steps)[0] ?? null;
}

// "Gemini 3.8 Flash" when every step uses it, otherwise "2 models".
export function chainModels(steps: ChainStep[] | null | undefined) {
  const models = orderedSteps(steps).map((s) => s.humor_llm_models).filter((m): m is ChainModel => !!m);
  const names = [...new Set(models.map((m) => m.display_name))];
  const providers = [...new Set(models.map((m) => m.humor_llm_providers?.name ?? "?"))];
  return { model: names.length > 1 ? `${names.length} models` : names[0] ?? null, provider: providers.length ? providers.join(" + ") : null };
}

export function chainIssue(steps: ChainStep[] | null | undefined): string | null {
  const ordered = orderedSteps(steps);
  if (!ordered.length) return "No steps yet.";
  if (ordered.length > MAX_MEMBER_STEPS) return `Has ${ordered.length} steps; members wait for every step, so the member app runs at most ${MAX_MEMBER_STEPS}.`;
  for (const [index, step] of ordered.entries()) {
    const n = index + 1, last = n === ordered.length;
    const captions = step.output_kind !== "text";
    if (last && !captions) return `The last step returns text; it must return the captions.`;
    if (!last && captions) return `Step ${n} returns captions before the last step.`;
    const model = step.humor_llm_models;
    if (!model) return `Step ${n} has no model.`;
    if (!model.is_active) return `${model.display_name} (step ${n}) is inactive.`;
    if ((step.include_image ?? true) && !model.supports_vision) return `${model.display_name} does not accept images (step ${n} sees the photo).`;
    if (!MEMBER_PROVIDERS.includes(model.humor_llm_providers?.slug ?? "")) return `The member app has no connector for ${model.humor_llm_providers?.name ?? "this provider"}.`;
    for (const m of step.user_prompt.matchAll(PLACEHOLDER)) {
      if (m[1] === "previous" && n === 1) return "Step 1 uses {previous}, but no step runs before it.";
      if (m[2] && Number(m[2]) >= n) return `Step ${n} uses ${m[0]}, which has not run yet.`;
    }
  }
  if (!ordered.some((s) => s.include_image ?? true)) return "No step sees the photo.";
  if (!ordered.some((s) => s.user_prompt.includes("{direction}"))) return "No user prompt has {direction}, so members' directions would be lost.";
  return null;
}
