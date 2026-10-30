// Same acceptance rules as the member Create flow (lib/gemini.ts validateCaptions,
// publish limits), kept pure so they are unit-tested.
export const STYLE_DISPLAY: Record<string, string> = {
  deadpan: "Deadpan", roast: "Roast", pun: "Pun", "dad joke": "Dad joke", absurd: "Absurd", wholesome: "Wholesome",
};
export const MAX_CAPTION = 200;
export const MAX_DIRECTION = 120;
export const chars = (text: string) => [...text].length;

export type Candidate = { id: string; style: string; text: string; originalText: string; source: "generated" };

// Four distinct captions in four distinct known styles, each 1–200 characters.
export function acceptCaptions(captions: { caption: string; style: string }[]): { ok: true; captions: { caption: string; style: string }[] } | { ok: false; reason: string } {
  if (captions.length !== 4) return { ok: false, reason: `expected 4 captions, got ${captions.length}` };
  const clean = captions.map((c) => ({ caption: c.caption.trim(), style: STYLE_DISPLAY[c.style.trim().toLowerCase()] ?? "" }));
  if (clean.some((c) => !c.caption || chars(c.caption) > MAX_CAPTION)) return { ok: false, reason: "a caption is empty or longer than 200 characters" };
  if (clean.some((c) => !c.style)) return { ok: false, reason: "a caption has no known joke style" };
  if (new Set(clean.map((c) => c.caption.toLowerCase())).size !== 4) return { ok: false, reason: "captions repeat" };
  if (new Set(clean.map((c) => c.style)).size !== 4) return { ok: false, reason: "styles repeat" };
  return { ok: true, captions: clean };
}

export function finalText(text: string) {
  const value = text.trim();
  if (!value) return { ok: false as const, error: "Write a caption first." };
  if (chars(value) > MAX_CAPTION) return { ok: false as const, error: "Captions can be at most 200 characters." };
  return { ok: true as const, value };
}
