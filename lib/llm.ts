// Provider connectors for admin test runs. One function per provider turns
// (prompts, image, settings) into a request and the response into captions.
// Pure apart from the injected fetch, so it is unit-tested without network.

export type RunInput = {
  provider: string; model: string; systemPrompt: string; userPrompt: string;
  image: { base64: string; mime: string };
  maxOutputTokens: number | null; temperature: number | null; schema: object | null;
};
export type RunCaption = { caption: string; style: string };
export type RunResult = {
  ok: boolean; error?: string; captions: RunCaption[]; warnings: string[]; description?: string;
  usage: { input: number; output: number; total: number }; latencyMs: number; rawText: string;
};
type Fetch = typeof fetch;

// Which environment variable holds each provider's key. Keys stay server-side.
export const PROVIDER_KEYS: Record<string, string> = { google: "GEMINI_API_KEY", openai: "OPENAI_API_KEY" };
export const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_KEYS);
const TIMEOUT_MS = 45_000;
const STYLES = ["deadpan", "roast", "pun", "dad joke", "absurd", "wholesome"];

export function fillUserPrompt(template: string, direction: string) {
  return template.replaceAll("{direction}", direction.trim() || "none");
}

export async function runCaptions(input: RunInput, env: Record<string, string | undefined>, fetcher: Fetch = fetch): Promise<RunResult> {
  const started = Date.now();
  const empty = { captions: [], warnings: [], usage: { input: 0, output: 0, total: 0 }, rawText: "" };
  const keyName = PROVIDER_KEYS[input.provider];
  if (!keyName) return { ok: false, error: `No connector for provider "${input.provider}" yet. Supported: ${SUPPORTED_PROVIDERS.join(", ")}.`, latencyMs: 0, ...empty };
  const key = env[keyName];
  if (!key) return { ok: false, error: `${keyName} is not set on this deployment.`, latencyMs: 0, ...empty };
  try {
    const { text, usage } = input.provider === "openai" ? await callOpenAI(input, key, fetcher) : await callGemini(input, key, fetcher);
    return { ...parseCaptions(text), usage, latencyMs: Date.now() - started, rawText: text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The provider call failed.", latencyMs: Date.now() - started, ...empty };
  }
}

async function callGemini(input: RunInput, key: string, fetcher: Fetch) {
  const config: Record<string, unknown> = { responseMimeType: "application/json" };
  if (input.maxOutputTokens) config.maxOutputTokens = input.maxOutputTokens;
  if (input.temperature !== null) config.temperature = input.temperature;
  if (input.schema) config.responseJsonSchema = input.schema;
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: input.userPrompt }, { inlineData: { mimeType: input.image.mime, data: input.image.base64 } }] }],
      generationConfig: config,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}: ${body?.error?.message ?? "no details"}`);
  const candidate = body?.candidates?.[0];
  if (body?.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request (${body.promptFeedback.blockReason}).`);
  const text = (candidate?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new Error(`Gemini returned no text (finish reason ${candidate?.finishReason ?? "unknown"}).`);
  const u = body.usageMetadata ?? {};
  return { text, usage: { input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), total: u.totalTokenCount ?? 0 } };
}

async function callOpenAI(input: RunInput, key: string, fetcher: Fetch): Promise<{ text: string; usage: RunResult["usage"] }> {
  try {
    return await callOpenAIOnce(input, key, fetcher);
  } catch (error) {
    // Strict mode accepts only part of JSON Schema; fall back to plain JSON mode once.
    if (input.schema && error instanceof SchemaRejected) return callOpenAIOnce({ ...input, schema: null }, key, fetcher);
    throw error;
  }
}
class SchemaRejected extends Error {}

async function callOpenAIOnce(input: RunInput, key: string, fetcher: Fetch) {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: [{ type: "text", text: input.userPrompt }, { type: "image_url", image_url: { url: `data:${input.image.mime};base64,${input.image.base64}` } }] },
    ],
    // A strict schema when the step has one; otherwise plain JSON mode.
    response_format: input.schema ? { type: "json_schema", json_schema: { name: "captions", strict: true, schema: input.schema } } : { type: "json_object" },
  };
  if (input.maxOutputTokens) body.max_completion_tokens = input.maxOutputTokens;
  if (input.temperature !== null) body.temperature = input.temperature;
  const response = await fetcher("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = String(json?.error?.message ?? "no details");
    if (response.status === 400 && input.schema && /schema|response_format/i.test(detail)) throw new SchemaRejected(detail);
    throw new Error(`OpenAI returned HTTP ${response.status}: ${detail}`);
  }
  const message = json?.choices?.[0]?.message;
  if (message?.refusal) throw new Error(`OpenAI refused: ${message.refusal}`);
  const text = typeof message?.content === "string" ? message.content : "";
  if (!text) throw new Error(`OpenAI returned no text (finish reason ${json?.choices?.[0]?.finish_reason ?? "unknown"}).`);
  const u = json.usage ?? {};
  return { text, usage: { input: u.prompt_tokens ?? 0, output: u.completion_tokens ?? 0, total: u.total_tokens ?? 0 } };
}

// Lenient: shows whatever captions came back and lists what the member app would reject.
// Accepts both formats chains have used: objects {caption, style} (caption-styles-v3)
// and plain strings plus a scene description (campus-nyc-v1).
export function parseCaptions(text: string): Pick<RunResult, "ok" | "error" | "captions" | "warnings" | "description"> {
  let value: unknown;
  try { value = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { return { ok: false, error: "The response was not valid JSON.", captions: [], warnings: [] }; }
  const list = (value as { captions?: unknown })?.captions;
  if (!Array.isArray(list)) return { ok: false, error: 'The response has no "captions" list.', captions: [], warnings: [] };
  const captions = list.map((item) => {
    if (typeof item === "string") return { caption: item.trim(), style: "" };
    const c = (item ?? {}) as Record<string, unknown>;
    return { caption: String(c.caption ?? c.text ?? "").trim(), style: String(c.style ?? "").trim() };
  });
  const rawDescription = (value as { description?: unknown }).description;
  const description = typeof rawDescription === "string" && rawDescription.trim() ? rawDescription.trim() : undefined;
  const styled = captions.some((c) => c.style);
  const warnings: string[] = [];
  if (captions.length !== 4) warnings.push(`Expected 4 captions, got ${captions.length}.`);
  if (captions.some((c) => !c.caption)) warnings.push("Some captions are empty.");
  if (captions.some((c) => [...c.caption].length > 200)) warnings.push("Some captions are longer than 200 characters.");
  if (!styled) warnings.push("No joke styles returned: this chain's format has none, so the member app's caption-styles-v3 check would reject it.");
  else {
    if (captions.some((c) => !STYLES.includes(c.style.toLowerCase()))) warnings.push(`Some styles are not one of: ${STYLES.join(", ")}.`);
    if (new Set(captions.map((c) => c.style.toLowerCase())).size !== captions.length) warnings.push("Styles repeat.");
  }
  return { ok: true, captions, warnings, description };
}
