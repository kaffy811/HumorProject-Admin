import { dateKey, median } from "./format";

export type GenerationRow = {
  id: string; image_id: string; user_id: string; provider: string; model: string; prompt_version: string;
  status: string; failure_stage: string | null; usage_metadata: unknown; caption_candidates: unknown;
  joke_style: string | null; created_at: string; completed_at: string | null;
};
export type AiCaptionRow = { id: string; image_id: string; content: string; source: string; deleted_at: string | null };
export type ModerationRow = { model: string; allowed: boolean };

export type Usage = { prompt: number; output: number; thoughts: number; total: number };
// Gemini usageMetadata, stored either bare or as {attempts:[...]}; other
// providers can map their own fields here when they are added.
export function usageOf(value: unknown): Usage {
  const empty = { prompt: 0, output: 0, thoughts: 0, total: 0 };
  if (!value || typeof value !== "object") return empty;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.attempts))
    return record.attempts.map(usageOf).reduce((a, b) => ({ prompt: a.prompt + b.prompt, output: a.output + b.output, thoughts: a.thoughts + b.thoughts, total: a.total + b.total }), empty);
  const num = (key: string) => (typeof record[key] === "number" ? (record[key] as number) : 0);
  const prompt = num("promptTokenCount") || num("input_tokens") || num("prompt_tokens");
  const output = num("candidatesTokenCount") || num("output_tokens") || num("completion_tokens");
  const thoughts = num("thoughtsTokenCount");
  return { prompt, output, thoughts, total: num("totalTokenCount") || num("total_tokens") || prompt + output + thoughts };
}

export function candidatesOf(value: unknown): { text: string; original: string; style: string }[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return { text: item, original: item, style: "" };
    const c = (item ?? {}) as Record<string, unknown>;
    const text = String(c.text ?? c.caption ?? "");
    return { text, original: String(c.originalText ?? text), style: String(c.style ?? "") };
  });
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};
const latency = (g: GenerationRow) => (g.completed_at ? new Date(g.completed_at).getTime() - new Date(g.created_at).getTime() : null);

export function computeAiStats(input: { generations: GenerationRow[]; captions: AiCaptionRow[]; votes: { caption_id: string; value: number }[]; moderation: ModerationRow[]; now?: Date }) {
  const now = input.now ?? new Date();
  const ha = new Map<string, number>();
  for (const v of input.votes) if (v.value === 1) ha.set(v.caption_id, (ha.get(v.caption_id) || 0) + 1);
  const aiCaptionByImage = new Map<string, AiCaptionRow>();
  for (const c of input.captions) if (c.source === "ai") aiCaptionByImage.set(c.image_id, c);
  // The run whose candidates became the post: the latest completed run for that photo.
  const latestDone = new Map<string, GenerationRow>();
  for (const g of input.generations)
    if (g.status === "completed" && (!latestDone.get(g.image_id) || latestDone.get(g.image_id)!.created_at < g.created_at)) latestDone.set(g.image_id, g);
  const publishedRun = new Set([...latestDone.values()].filter((g) => aiCaptionByImage.has(g.image_id)).map((g) => g.id));

  const groups = new Map<string, GenerationRow[]>();
  for (const g of input.generations) {
    const key = `${g.provider}\u0000${g.model}`;
    groups.set(key, [...(groups.get(key) ?? []), g]);
  }
  const models = [...groups.entries()].map(([key, runs]) => {
    const [provider, model] = key.split("\u0000");
    const done = runs.filter((g) => g.status === "completed");
    const usage = runs.map((g) => usageOf(g.usage_metadata)).reduce((a, b) => ({ prompt: a.prompt + b.prompt, output: a.output + b.output, thoughts: a.thoughts + b.thoughts, total: a.total + b.total }), { prompt: 0, output: 0, thoughts: 0, total: 0 });
    const times = done.map(latency).filter((t): t is number => t !== null);
    const posts = runs.filter((g) => publishedRun.has(g.id)).map((g) => aiCaptionByImage.get(g.image_id)!).filter((c) => !c.deleted_at);
    return {
      provider, model, runs: runs.length, completed: done.length,
      failed: runs.filter((g) => g.status === "failed").length,
      processing: runs.filter((g) => g.status === "processing").length,
      usage, tokensPerRun: done.length ? usage.total / done.length : 0,
      medianLatency: median(times), p90Latency: percentile(times, 0.9),
      published: runs.filter((g) => publishedRun.has(g.id)).length,
      haPerPost: posts.length ? posts.reduce((s, c) => s + (ha.get(c.id) || 0), 0) / posts.length : 0,
      lastUsed: runs.map((g) => g.created_at).sort().at(-1) ?? null,
    };
  }).sort((a, b) => b.runs - a.runs);

  const versions = [...new Set(input.generations.map((g) => g.prompt_version))].map((version) => {
    const runs = input.generations.filter((g) => g.prompt_version === version);
    const done = runs.filter((g) => g.status === "completed");
    const posts = runs.filter((g) => publishedRun.has(g.id)).map((g) => aiCaptionByImage.get(g.image_id)!).filter((c) => !c.deleted_at);
    const dates = runs.map((g) => g.created_at).sort();
    return {
      version, runs: runs.length, completed: done.length, published: runs.filter((g) => publishedRun.has(g.id)).length,
      haPerPost: posts.length ? posts.reduce((s, c) => s + (ha.get(c.id) || 0), 0) / posts.length : 0,
      firstSeen: dates[0] ?? null, lastSeen: dates.at(-1) ?? null,
      models: [...new Set(runs.map((g) => g.model))],
    };
  }).sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));

  // One request returns four captions in four different styles, in no meaningful
  // order, so compare styles: how often a style is chosen when it is offered.
  const offered = new Map<string, number>(), chosen = new Map<string, number>();
  let edited = 0, matched = 0, singleStyle = 0;
  for (const g of latestDone.values()) {
    const caption = aiCaptionByImage.get(g.image_id);
    if (!caption) continue;
    const options = candidatesOf(g.caption_candidates);
    const pick = options.find((c) => c.original.trim() === caption.content.trim() || c.text.trim() === caption.content.trim());
    if (!pick) { edited++; continue; }
    matched++;
    // Only runs that really offered four different styles (prompt caption-styles-v3+);
    // older runs used one member-chosen style for all four.
    if (new Set(options.map((c) => c.style).filter(Boolean)).size !== 4) { singleStyle++; continue; }
    for (const c of options) offered.set(c.style || "Unknown", (offered.get(c.style || "Unknown") || 0) + 1);
    chosen.set(pick.style || "Unknown", (chosen.get(pick.style || "Unknown") || 0) + 1);
  }
  const styleWins = [...offered.entries()].map(([style, times]) => ({ style, offered: times, picked: chosen.get(style) || 0, rate: (chosen.get(style) || 0) / times }))
    .sort((a, b) => b.rate - a.rate || b.offered - a.offered);
  const runsPerPhoto = [...aiCaptionByImage.keys()].map((image) => input.generations.filter((g) => g.image_id === image).length).filter(Boolean);

  const days: { date: string; completed: number; failed: number }[] = [];
  for (let offset = 29; offset >= 0; offset--) days.push({ date: dateKey(new Date(now.getTime() - offset * 86_400_000)), completed: 0, failed: 0 });
  const index = new Map(days.map((d, i) => [d.date, i]));
  for (const g of input.generations) {
    const i = index.get(dateKey(g.created_at));
    if (i === undefined) continue;
    if (g.status === "completed") days[i].completed++;
    if (g.status === "failed") days[i].failed++;
  }

  const count = <T,>(rows: T[], key: (row: T) => string) => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(key(row), (map.get(key(row)) || 0) + 1);
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const totals = input.generations.map((g) => usageOf(g.usage_metadata)).reduce((a, b) => ({ prompt: a.prompt + b.prompt, output: a.output + b.output, thoughts: a.thoughts + b.thoughts, total: a.total + b.total }), { prompt: 0, output: 0, thoughts: 0, total: 0 });
  return {
    totals: {
      runs: input.generations.length,
      completed: input.generations.filter((g) => g.status === "completed").length,
      failed: input.generations.filter((g) => g.status === "failed").length,
      published: publishedRun.size,
      usage: totals,
      providers: new Set(input.generations.map((g) => g.provider)).size,
    },
    models, versions, styleWins, edited, matched, singleStyle, days,
    regenerations: median(runsPerPhoto),
    failures: count(input.generations.filter((g) => g.status === "failed"), (g) => g.failure_stage || "unknown"),
    moderation: count(input.moderation, (m) => `${m.model}\u0000${m.allowed ? "allowed" : "blocked"}`).map((r) => {
      const [model, verdict] = r.label.split("\u0000");
      return { model, verdict, count: r.value };
    }),
  };
}
export type AiStats = ReturnType<typeof computeAiStats>;
