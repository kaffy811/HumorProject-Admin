// Copied from the member app (kaffy811/HumorProject lib/generation-route.ts) so the
// admin Create flow picks the same chain members get. Keep in sync.
// Which models and prompts a member's caption generation uses. Admins set this
// in Humor Admin / the Prompt Chain Tool: the prompt-chain mix picks a chain by
// weight, and its steps run in order, each output feeding later steps through
// {previous} / {stepN}; the last step returns the four styled captions
// (tables from migrations 202610280001 and 202611050001). Anything missing or
// unusable falls back to the built-in Gemini prompt, so members never see a
// configuration error. The picker is pure; loading is in loadGenerationRoute.

export type RouteStep = {
  provider: string;
  model: string;
  systemPrompt: string;
  userTemplate: string;
  schema: object | null;
  maxOutputTokens: number | null;
  temperature: number | null;
  includeImage: boolean;
  outputKind: "text" | "captions";
};
// Top-level fields are the final (captions) step, which is what gets recorded.
export type GenerationRoute = RouteStep & {
  steps: RouteStep[];
  promptVersion: string;
  // false = the built-in prompt from lib/gemini.ts.
  configured: boolean;
};

export type MixRow = {
  share: number;
  humor_prompt_chains: {
    prompt_version: string;
    humor_prompt_chain_steps: {
      position: number;
      // Added by 202611050001; absent before it, meaning a single caption step that sees the photo.
      output_kind?: string;
      include_image?: boolean;
      system_prompt: string;
      user_prompt: string;
      output_schema: unknown;
      humor_llm_models: {
        model_id: string;
        is_active: boolean;
        supports_vision: boolean;
        max_output_tokens: number | null;
        temperature: number | string | null;
        humor_llm_providers: { slug: string } | null;
      } | null;
    }[];
  } | null;
};

export const BUILTIN_VERSION = "caption-styles-v3";
// Members wait for every step, so long chains stay in the Prompt Chain Tool.
export const MAX_MEMBER_STEPS = 4;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/;
const PLACEHOLDER = /\{(direction|previous|step(\d{1,2}))\}/g;
// Provider slug → environment variable with its key. Only these have connectors.
export const PROVIDER_KEYS: Record<string, string> = { google: "GEMINI_API_KEY", openai: "OPENAI_API_KEY" };

// {direction} = the member's direction; {previous} = the step before; {stepN} = step N's output.
export function fillPrompt(template: string, direction: string, outputs: string[] = []) {
  return template.replace(PLACEHOLDER, (_token, name: string, step?: string) => {
    if (name === "direction") return direction.trim() || "none";
    if (name === "previous") return outputs.at(-1) ?? "";
    return outputs[Number(step) - 1] ?? "";
  });
}

// Turns one mix row into a route, or explains why it cannot be used.
export function routeFromRow(row: MixRow, env: Record<string, string | undefined>): GenerationRoute | string {
  const chain = row.humor_prompt_chains;
  if (!chain) return "chain missing";
  const v = chain.prompt_version;
  const ordered = [...(chain.humor_prompt_chain_steps ?? [])].sort((a, b) => a.position - b.position);
  if (!ordered.length) return `${v} has no steps`;
  if (ordered.length > MAX_MEMBER_STEPS) return `${v} has more than ${MAX_MEMBER_STEPS} steps`;
  const steps: RouteStep[] = [];
  for (const [index, step] of ordered.entries()) {
    const n = index + 1, last = n === ordered.length;
    const outputKind = step.output_kind === "text" ? "text" : "captions";
    if (last !== (outputKind === "captions")) return last ? `${v} last step does not return captions` : `${v} step ${n} returns captions before the last step`;
    const includeImage = step.include_image ?? true;
    const model = step.humor_llm_models;
    if (!model) return `${v} step ${n} has no model`;
    const provider = model.humor_llm_providers?.slug ?? "";
    if (!model.is_active) return `${model.model_id} is inactive`;
    if (includeImage && !model.supports_vision) return `${model.model_id} does not accept images`;
    if (!MODEL_ID.test(model.model_id)) return `${model.model_id} is not a valid model id`;
    if (!PROVIDER_KEYS[provider]) return `no connector for provider ${provider || "(none)"}`;
    if (!env[PROVIDER_KEYS[provider]]) return `${PROVIDER_KEYS[provider]} is not set`;
    if (!step.system_prompt.trim() || !step.user_prompt.trim()) return `${v} step ${n} prompts are empty`;
    for (const m of step.user_prompt.matchAll(PLACEHOLDER)) {
      if (m[1] === "previous" && n === 1) return `${v} step 1 uses {previous}`;
      if (m[2] && Number(m[2]) >= n) return `${v} step ${n} uses ${m[0]}, which has not run yet`;
    }
    const schema = step.output_schema && typeof step.output_schema === "object" && !Array.isArray(step.output_schema) ? (step.output_schema as object) : null;
    const temperature = model.temperature === null ? null : Number(model.temperature);
    steps.push({
      provider, model: model.model_id, systemPrompt: step.system_prompt, userTemplate: step.user_prompt, schema,
      maxOutputTokens: model.max_output_tokens, temperature: Number.isFinite(temperature) ? temperature : null, includeImage, outputKind,
    });
  }
  // The member's photo and direction must reach the chain (steps imported from
  // old runs held a literal prompt that dropped the direction).
  if (!steps.some((s) => s.includeImage)) return `${v} has no step that sees the photo`;
  if (!steps.some((s) => s.userTemplate.includes("{direction}"))) return `${v} never uses {direction}`;
  return { ...steps[steps.length - 1], steps, promptVersion: v, configured: true };
}

// Weighted pick by share (0–100). Returns null when nothing has a share.
export function pickRow(rows: MixRow[], random: number) {
  const weighted = rows.filter((r) => r.share > 0);
  const total = weighted.reduce((sum, r) => sum + r.share, 0);
  if (!total) return null;
  let point = random * total;
  for (const row of weighted) {
    point -= row.share;
    if (point < 0) return row;
  }
  return weighted[weighted.length - 1];
}

export function chooseRoute(rows: MixRow[], env: Record<string, string | undefined>, random: number): { route: GenerationRoute | null; reason?: string } {
  const row = pickRow(rows, random);
  if (!row) return { route: null, reason: "no chain has a share in the mix" };
  const route = routeFromRow(row, env);
  return typeof route === "string" ? { route: null, reason: route } : { route };
}

type Db = { from: (table: string) => { select: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> } };

// Reads the mix; null (use the built-in prompt) when the tables are absent or unusable.
export async function loadGenerationRoute(db: Db, env: Record<string, string | undefined> = process.env, random = Math.random()) {
  const { data, error } = await db.from("humor_prompt_chain_mix").select(
    "share,humor_prompt_chains(prompt_version,humor_prompt_chain_steps(*,humor_llm_models(model_id,is_active,supports_vision,max_output_tokens,temperature,humor_llm_providers(slug))))",
  );
  if (error) return { route: null, reason: `mix unavailable: ${error.message}` };
  return chooseRoute((data ?? []) as MixRow[], env, random);
}
