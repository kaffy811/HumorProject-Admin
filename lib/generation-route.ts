// Copied from the member app (kaffy811/HumorProject lib/generation-route.ts) so the
// admin Create flow picks the same model and prompt members get. Keep in sync.
// Which model and prompt a member's caption generation uses. Admins set this
// in the Humor Admin console: the prompt-chain mix picks a chain by weight, and
// that chain's step 1 supplies the model, prompts and output schema
// (tables from migration 202610280001_admin_catalog). Anything missing or
// unusable falls back to the built-in Gemini prompt, so members never see a
// configuration error. The picker is pure; loading is in loadGenerationRoute.

export type GenerationRoute = {
  provider: string;
  model: string;
  systemPrompt: string;
  userTemplate: string;
  schema: object | null;
  maxOutputTokens: number | null;
  temperature: number | null;
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
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/;
// Provider slug → environment variable with its key. Only these have connectors.
export const PROVIDER_KEYS: Record<string, string> = { google: "GEMINI_API_KEY", openai: "OPENAI_API_KEY" };

export function fillPrompt(template: string, direction: string) {
  return template.replaceAll("{direction}", direction.trim() || "none");
}

// Turns one mix row into a route, or explains why it cannot be used.
export function routeFromRow(row: MixRow, env: Record<string, string | undefined>): GenerationRoute | string {
  const chain = row.humor_prompt_chains;
  if (!chain) return "chain missing";
  const step = [...(chain.humor_prompt_chain_steps ?? [])].sort((a, b) => a.position - b.position)[0];
  if (!step) return `${chain.prompt_version} has no steps`;
  const model = step.humor_llm_models;
  if (!model) return `${chain.prompt_version} step 1 has no model`;
  const provider = model.humor_llm_providers?.slug ?? "";
  if (!model.is_active) return `${model.model_id} is inactive`;
  if (!model.supports_vision) return `${model.model_id} does not accept images`;
  if (!MODEL_ID.test(model.model_id)) return `${model.model_id} is not a valid model id`;
  if (!PROVIDER_KEYS[provider]) return `no connector for provider ${provider || "(none)"}`;
  if (!env[PROVIDER_KEYS[provider]]) return `${PROVIDER_KEYS[provider]} is not set`;
  if (!step.system_prompt.trim() || !step.user_prompt.trim()) return `${chain.prompt_version} step 1 prompts are empty`;
  // Without the placeholder the member's direction would be dropped (steps
  // imported from old runs hold that run's literal prompt).
  if (!step.user_prompt.includes("{direction}")) return `${chain.prompt_version} step 1 user prompt has no {direction}`;
  const schema = step.output_schema && typeof step.output_schema === "object" && !Array.isArray(step.output_schema) ? (step.output_schema as object) : null;
  const temperature = model.temperature === null ? null : Number(model.temperature);
  return {
    provider, model: model.model_id, systemPrompt: step.system_prompt, userTemplate: step.user_prompt, schema,
    maxOutputTokens: model.max_output_tokens, temperature: Number.isFinite(temperature) ? temperature : null,
    promptVersion: chain.prompt_version, configured: true,
  };
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
    "share,humor_prompt_chains(prompt_version,humor_prompt_chain_steps(position,system_prompt,user_prompt,output_schema,humor_llm_models(model_id,is_active,supports_vision,max_output_tokens,temperature,humor_llm_providers(slug))))",
  );
  if (error) return { route: null, reason: `mix unavailable: ${error.message}` };
  return chooseRoute((data ?? []) as MixRow[], env, random);
}
