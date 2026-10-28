import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { resource } from "@/lib/catalog";
import { deleteRecord } from "@/lib/catalog-actions";
import { profilesByIds } from "@/lib/data";
import { refOptions } from "@/lib/catalog-data";
import { serviceClient } from "@/lib/supabase/service";
import { when } from "@/lib/format";
import { CatalogForm } from "@/components/CatalogForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PersonLink } from "@/components/Person";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = Promise<{ resource: string; id: string }>;
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: `Edit ${resource((await params).resource)?.singular ?? "record"}` };
}

export default async function CatalogRecord({ params, searchParams }: { params: Params; searchParams: Promise<{ blocked?: string }> }) {
  await requireAdmin();
  const { resource: slug, id } = await params;
  const def = resource(slug);
  if (!def || !UUID.test(id)) notFound();
  const { blocked } = await searchParams;
  const db = serviceClient();
  const [{ data: row }, refs] = await Promise.all([db.from(def.table).select("*").eq("id", id).maybeSingle(), refOptions(db, def)]);
  if (!row) notFound();
  const creator = typeof row.created_by === "string" ? row.created_by : null;
  const people = creator ? await profilesByIds(db, [creator]) : new Map();
  const title = String(row[def.fields[0].name] ?? def.singular);
  return (
    <div className="stack">
      <Link href={`/catalog/${def.slug}`} className="muted">← All {def.title.toLowerCase()}</Link>
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">{def.singular} · <span className="mono">{def.table}</span></span>
          <h1 style={{ maxWidth: "36ch", overflowWrap: "anywhere" }}>{title}</h1>
          <p>Created {when(row.created_at)} · updated {when(row.updated_at)}{creator && <> · by <PersonLink profile={people.get(creator) ?? null} id={creator} /></>}</p>
        </div>
      </header>
      {blocked && <div className="notice notice-bad" role="alert">{def.inUse ?? "Another record still points at this one."}</div>}
      <section className="grid grid-2">
        <div className="card">
          <h2>Edit</h2>
          <p className="sub">Changes are saved to the database immediately and recorded in the activity log.</p>
          <CatalogForm slug={def.slug} initial={row} refs={refs} />
        </div>
        <div className="card" style={{ alignSelf: "start" }}>
          <h2>Delete</h2>
          <p className="sub">Removes this {def.singular} permanently.</p>
          <form action={deleteRecord}>
            <input type="hidden" name="resource" value={def.slug} />
            <input type="hidden" name="id" value={id} />
            <ConfirmButton message={`Delete this ${def.singular}? This cannot be undone.`}>Delete {def.singular}</ConfirmButton>
          </form>
        </div>
      </section>
    </div>
  );
}
