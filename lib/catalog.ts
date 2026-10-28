// Admin-managed configuration tables (migration 202610280001_admin_catalog in
// kaffy811/HumorProject). One definition per table drives its list, forms,
// validation and server actions. Pure: no database, safe to unit test.

export type FieldKind = "text" | "textarea" | "int" | "decimal" | "checkbox" | "select" | "ref" | "email" | "domain" | "url";
export type Field = {
  name: string; label: string; kind: FieldKind;
  required?: boolean; max?: number; min?: number; maxValue?: number; step?: number;
  pattern?: RegExp; patternHint?: string; options?: readonly string[]; defaultValue?: string | boolean;
  // kind "ref": the referenced table and the column shown to admins.
  ref?: { table: string; label: string };
  hint?: string; list?: boolean; mono?: boolean;
};
export type Resource = {
  // Where it lives: a tab of "AI models & prompts" or of "Team & access" (superadmin only).
  section: "ai" | "team";
  slug: string; table: string; title: string; singular: string; description: string;
  fields: Field[]; order: { column: string; ascending: boolean }; search: string[];
  // Shown when the unique constraint fires.
  unique: string; stampCreator?: boolean;
  // Rows elsewhere that block a delete (foreign key RESTRICT).
  inUse?: string;
};

export const CAPTION_STYLES = ["Deadpan", "Roast", "Pun", "Dad joke", "Absurd", "Wholesome"] as const;
// Same expressions as the database checks.
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const EMAIL = /^[^@\s]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RESOURCES: Resource[] = [
  {
    section: "ai", slug: "terms", table: "humor_terms", title: "Terms", singular: "term",
    description: "Campus and city vocabulary the caption prompt leans on (Butler, Low Steps, the 1 train…). Keep definitions short and true.",
    fields: [
      { name: "term", label: "Term", kind: "text", required: true, max: 80, list: true },
      { name: "category", label: "Category", kind: "select", required: true, options: ["campus", "nyc", "slang", "other"], defaultValue: "campus", list: true },
      { name: "definition", label: "Definition", kind: "textarea", required: true, max: 500, list: true },
      { name: "example", label: "Example", kind: "textarea", max: 300, hint: "Optional: how it shows up in a photo or caption." },
    ],
    order: { column: "term", ascending: true }, search: ["term", "definition"], unique: "That term already exists (terms are case-insensitive).",
  },
  {
    section: "ai", slug: "examples", table: "humor_generation_examples", title: "AI generation examples", singular: "example",
    description: "Hand-picked examples of a scene and the caption that nails it, per joke style — the few-shot material for prompt chains.",
    fields: [
      { name: "caption", label: "Caption", kind: "textarea", required: true, max: 200, list: true },
      { name: "style", label: "Style", kind: "select", required: true, options: CAPTION_STYLES, defaultValue: "Deadpan", list: true },
      { name: "scene", label: "Scene", kind: "textarea", required: true, max: 500, hint: "What is in the photo.", list: true },
      { name: "chain_id", label: "Prompt chain", kind: "ref", ref: { table: "humor_prompt_chains", label: "name" }, hint: "Optional: the chain this example is written for.", list: true },
      { name: "is_active", label: "Active", kind: "checkbox", defaultValue: true, list: true },
      { name: "notes", label: "Notes", kind: "textarea", max: 300 },
    ],
    order: { column: "created_at", ascending: false }, search: ["caption", "scene"], unique: "This example already exists.",
  },
  {
    section: "ai", slug: "llm-models", table: "humor_llm_models", title: "LLM models", singular: "model",
    description: "Models the caption pipeline can call. A prompt-chain step points at one of these.",
    fields: [
      { name: "display_name", label: "Name", kind: "text", required: true, max: 80, list: true },
      { name: "provider_id", label: "Provider", kind: "ref", required: true, ref: { table: "humor_llm_providers", label: "name" }, list: true },
      { name: "model_id", label: "API model id", kind: "text", required: true, max: 120, pattern: /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/, patternHint: "letters, digits and . _ : / -", mono: true, list: true, hint: "Exactly what the provider API expects, e.g. gemini-3.8-flash." },
      { name: "is_active", label: "Active", kind: "checkbox", defaultValue: true, list: true },
      { name: "supports_vision", label: "Accepts images", kind: "checkbox", defaultValue: true, list: true },
      { name: "max_output_tokens", label: "Max output tokens", kind: "int", min: 1, maxValue: 65536, list: true },
      { name: "temperature", label: "Temperature", kind: "decimal", min: 0, maxValue: 2, step: 0.01 },
      { name: "notes", label: "Notes", kind: "textarea", max: 500 },
    ],
    order: { column: "display_name", ascending: true }, search: ["display_name", "model_id"], unique: "This provider already has a model with that API id.",
  },
  {
    section: "ai", slug: "llm-providers", table: "humor_llm_providers", title: "LLM providers", singular: "provider",
    description: "Companies or services that host the models. The slug matches humor_generations.provider on recorded runs.",
    fields: [
      { name: "name", label: "Name", kind: "text", required: true, max: 80, list: true },
      { name: "slug", label: "Slug", kind: "text", required: true, max: 40, pattern: /^[a-z0-9][a-z0-9-]{1,39}$/, patternHint: "2–40 lowercase letters, digits or dashes", mono: true, list: true },
      { name: "api_base_url", label: "API base URL", kind: "url", max: 200, mono: true, list: true },
      { name: "notes", label: "Notes", kind: "textarea", max: 500 },
    ],
    order: { column: "name", ascending: true }, search: ["name", "slug"], unique: "A provider with that slug already exists.",
    inUse: "This provider still has models. Delete or move its models first.",
  },
  {
    section: "team", slug: "signup-domains", table: "humor_allowed_signup_domains", title: "Allowed sign-up domains", singular: "domain",
    description: "Email domains allowed to sign up, e.g. columbia.edu. Subdomains are separate entries. The member app does not enforce this list yet: Google sign-in is still open to everyone.",
    fields: [
      { name: "domain", label: "Domain", kind: "domain", required: true, max: 253, mono: true, list: true },
      { name: "note", label: "Note", kind: "text", max: 300, list: true },
    ],
    order: { column: "domain", ascending: true }, search: ["domain", "note"], unique: "That domain is already allowed.", stampCreator: true,
  },
  {
    section: "team", slug: "whitelisted-emails", table: "humor_whitelisted_emails", title: "Whitelisted emails", singular: "email",
    description: "Individual addresses allowed in even when their domain is not on the allowed list (guests, alumni, reviewers). Not enforced by the member app yet.",
    fields: [
      { name: "email", label: "Email", kind: "email", required: true, max: 254, mono: true, list: true },
      { name: "note", label: "Note", kind: "text", max: 300, list: true },
    ],
    order: { column: "email", ascending: true }, search: ["email", "note"], unique: "That email is already whitelisted.", stampCreator: true,
  },
];

export function resource(slug: string, section?: Resource["section"]) {
  return RESOURCES.find((r) => r.slug === slug && (!section || r.section === section)) ?? null;
}
export const catalogPath = (def: Resource, id?: string) => `/${def.section}/${def.slug}${id ? `/${id}` : ""}`;

export type Parsed = { ok: true; value: Record<string, string | number | boolean | null> } | { ok: false; error: string };

// Mirrors the table checks so admins get a readable message, not a Postgres error.
export function parseRecord(def: Resource, form: FormData): Parsed {
  const value: Record<string, string | number | boolean | null> = {};
  for (const field of def.fields) {
    if (field.kind === "checkbox") { value[field.name] = form.get(field.name) === "on"; continue; }
    let raw = String(form.get(field.name) ?? "").trim();
    if (field.kind === "email" || field.kind === "domain") raw = raw.toLowerCase();
    if (field.kind === "domain") raw = raw.replace(/^@/, "");
    if (!raw) {
      if (field.required) return { ok: false, error: `${field.label} is required.` };
      value[field.name] = null;
      continue;
    }
    if (field.max && [...raw].length > field.max) return { ok: false, error: `${field.label} must be at most ${field.max} characters.` };
    if (field.pattern && !field.pattern.test(raw)) return { ok: false, error: `${field.label} may only use ${field.patternHint}.` };
    if (field.kind === "select" && !field.options?.includes(raw)) return { ok: false, error: `Choose a valid ${field.label.toLowerCase()}.` };
    if (field.kind === "ref" && !UUID.test(raw)) return { ok: false, error: `Choose a valid ${field.label.toLowerCase()}.` };
    if (field.kind === "domain" && !DOMAIN.test(raw)) return { ok: false, error: "Enter a domain like columbia.edu (no @, no https://)." };
    if (field.kind === "email" && !EMAIL.test(raw)) return { ok: false, error: "Enter a valid email address." };
    if (field.kind === "url" && !/^https:\/\/[^\s]{3,200}$/.test(raw)) return { ok: false, error: `${field.label} must start with https://.` };
    if (field.kind === "int" || field.kind === "decimal") {
      const number = Number(raw);
      const whole = field.kind === "int" ? /^-?\d+$/.test(raw) : /^-?\d+(\.\d{1,2})?$/.test(raw);
      if (!whole || (field.min !== undefined && number < field.min) || (field.maxValue !== undefined && number > field.maxValue))
        return { ok: false, error: `${field.label} must be ${field.kind === "int" ? "a whole number" : "a number with at most 2 decimals"} from ${field.min} to ${field.maxValue}.` };
      value[field.name] = number;
      continue;
    }
    value[field.name] = raw;
  }
  return { ok: true, value };
}

// Postgres error → message for the form.
export function dbErrorMessage(def: Resource, error: { code?: string; message: string }) {
  if (error.code === "23505") return def.unique;
  if (error.code === "23503") return def.inUse ?? "Another record still points at this one.";
  if (error.code === "23514") return "One of the values is not allowed. Check the hints under each field.";
  return error.message;
}

// Table not created yet (migration not applied) → explain instead of crashing.
export function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message ?? ""));
}

// Prompt-chain mix: whole numbers 0–100 per chain that add up to exactly 100.
export function parseMix(chainIds: string[], form: FormData): { ok: true; shares: Record<string, number> } | { ok: false; error: string } {
  if (!chainIds.length) return { ok: false, error: "There are no prompt chains yet." };
  const shares: Record<string, number> = {};
  for (const id of chainIds) {
    const raw = String(form.get(`share:${id}`) ?? "0").trim() || "0";
    const share = Number(raw);
    if (!/^\d{1,3}$/.test(raw) || share > 100) return { ok: false, error: "Each share must be a whole number from 0 to 100." };
    shares[id] = share;
  }
  const total = Object.values(shares).reduce((a, b) => a + b, 0);
  if (total !== 100) return { ok: false, error: `Shares must add up to 100% (now ${total}%).` };
  return { ok: true, shares };
}

// A chain's mix row comes back as an object (one-to-one) or a one-item array.
export function shareOf(mix: { share: number } | { share: number }[] | null | undefined) {
  return (Array.isArray(mix) ? mix[0]?.share : mix?.share) ?? 0;
}
