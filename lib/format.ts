export const STYLES = ["Deadpan", "Roast", "Pun", "Dad joke", "Absurd", "Wholesome", "HANDMADE"] as const;
export const SOURCES = ["ai", "handmade", "seed"] as const;
export const TIME_ZONE = "America/New_York";

export function n(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
export function pct(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}
export function when(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
export function day(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, dateStyle: "medium" }).format(new Date(value));
}
export function duration(ms: number | null) {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const minutes = ms / 60000;
  if (minutes < 1) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return hours < 48 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} d`;
}
export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
export function handle(profile: { username?: string | null; id: string } | null | undefined) {
  if (!profile) return "unknown";
  return "@" + (profile.username || `member_${profile.id.slice(0, 8)}`);
}
export function fullName(profile: { first_name?: string | null; last_name?: string | null; display_name?: string | null } | null | undefined) {
  if (!profile) return "";
  return profile.display_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ");
}
// Weekday (0 = Mon) and hour in the campus time zone.
export function slot(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(value));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.find((p) => p.type === "weekday")!.value);
  const hour = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  return { weekday, hour };
}
export function dateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(value));
}
// Gemini usage is stored as {attempts:[usageMetadata...]} or a bare usageMetadata.
export function tokenCount(usage: unknown): number {
  if (!usage || typeof usage !== "object") return 0;
  const record = usage as { attempts?: unknown; totalTokenCount?: unknown };
  if (Array.isArray(record.attempts)) return record.attempts.reduce((sum: number, item) => sum + tokenCount(item), 0);
  return typeof record.totalTokenCount === "number" ? record.totalTokenCount : 0;
}
export function clampPage(value: string | string[] | undefined) {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
}
export function text(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 120) ?? "";
}
