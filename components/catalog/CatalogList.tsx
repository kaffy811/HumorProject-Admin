import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, requireSuperadmin } from "@/lib/admin";
import { catalogPath, isMissingTable, resource, type Field, type Resource } from "@/lib/catalog";
import { refOptions } from "@/lib/catalog-data";
import { PAGE_SIZE, searchTerm } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/service";
import { clampPage, text, when } from "@/lib/format";
import { CatalogForm } from "@/components/CatalogForm";
import { MissingTable } from "@/components/MissingTable";
import { Pager } from "@/components/Pager";

export type ListSearch = Promise<{ q?: string; page?: string; deleted?: string }>;
export const catalogTitle = async (section: Resource["section"], params: Promise<{ resource: string }>) => ({ title: resource((await params).resource, section)?.title ?? "Not found" });

// List + search + create form for one catalog table, shown as a tab of its section.
export async function CatalogList({ section, params, searchParams }: { section: Resource["section"]; params: Promise<{ resource: string }>; searchParams: ListSearch }) {
  await (section === "team" ? requireSuperadmin() : requireAdmin());
  const def = resource((await params).resource, section);
  if (!def) notFound();
  const base = catalogPath(def);
  const query = await searchParams;
  const q = searchTerm(text(query.q));
  const page = clampPage(query.page);
  const db = serviceClient();
  let list = db.from(def.table).select("*", { count: "exact" }).order(def.order.column, { ascending: def.order.ascending });
  if (q) list = list.or(def.search.map((column) => `${column}.ilike.*${q}*`).join(","));
  const [{ data, count, error }, refs] = await Promise.all([list.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1), refOptions(db, def)]);
  if (error && !isMissingTable(error)) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  const columns = def.fields.filter((f) => f.list);
  const labels = Object.fromEntries(Object.entries(refs).map(([name, options]) => [name, new Map(options.map((o) => [o.value, o.label]))]));
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Create · read · update · delete · <span className="mono">{def.table}</span></span>
          <h1>{def.title}.</h1>
          <p>{def.description}</p>
        </div>
      </header>
      {error ? <MissingTable table={def.table} /> : (
        <div className="stack">
          {query.deleted && <div className="notice notice-good" role="status">Deleted.</div>}
          <details className="card" open={!rows.length && !q}>
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>+ Add {def.singular}</summary>
            <div style={{ marginTop: 14 }}><CatalogForm slug={def.slug} refs={refs} /></div>
          </details>
          <form className="toolbar" role="search">
            <input className="input" name="q" defaultValue={q} placeholder={`Search ${def.title.toLowerCase()}`} aria-label={`Search ${def.title.toLowerCase()}`} />
            <button className="btn" type="submit">Search</button>
            {q && <Link className="btn" href={base}>Clear</Link>}
          </form>
          <div className="table-wrap">
            <table>
              <thead><tr>{columns.map((c) => <th key={c.name}>{c.label}</th>)}<th>Updated</th><th /></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)}>
                    {columns.map((c, i) => (
                      <td key={c.name}>
                        {i === 0 ? <Link href={catalogPath(def, String(row.id))} className={c.mono ? "mono" : "clip"} style={{ fontWeight: 700 }}>{display(c, row[c.name], labels[c.name])}</Link> : display(c, row[c.name], labels[c.name])}
                      </td>
                    ))}
                    <td className="muted">{when(String(row.updated_at ?? row.created_at ?? ""))}</td>
                    <td><Link className="btn" href={catalogPath(def, String(row.id))}>Edit</Link></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={columns.length + 2} className="empty">{q ? "Nothing matches." : `No ${def.title.toLowerCase()} yet.`}</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={count ?? 0} size={PAGE_SIZE} base={base} params={{ q }} />
        </div>
      )}
    </div>
  );
}

function display(field: Field, value: unknown, labels?: Map<string, string>) {
  if (field.kind === "checkbox") return value ? <span className="badge badge-good">Yes</span> : <span className="badge">No</span>;
  if (value === null || value === undefined || value === "") return <span className="muted">—</span>;
  if (field.kind === "ref") return labels?.get(String(value)) ?? <span className="mono muted">{String(value).slice(0, 8)}</span>;
  if (field.kind === "select") return <span className="badge">{String(value)}</span>;
  const content = String(value);
  return field.mono ? <span className="mono">{content}</span> : <span className="clip" title={content}>{content}</span>;
}
