import "server-only";
import type { ServiceClient } from "./supabase/service";
import type { Resource } from "./catalog";

// Dropdown choices for every reference field (provider of a model, chain of an example).
export async function refOptions(db: ServiceClient, def: Resource) {
  const entries = await Promise.all(def.fields.filter((f) => f.kind === "ref" && f.ref).map(async (f) => {
    const { data } = await db.from(f.ref!.table).select(`id,${f.ref!.label}`).order(f.ref!.label).limit(500);
    return [f.name, ((data ?? []) as unknown as Record<string, string>[]).map((row) => ({ value: row.id, label: row[f.ref!.label] }))] as const;
  }));
  return Object.fromEntries(entries) as Record<string, { value: string; label: string }[]>;
}
