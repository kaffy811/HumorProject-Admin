import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin, requireSuperadmin } from "@/lib/admin";
import { catalogPath, isMissingTable, resource, type Field, type Resource } from "@/lib/catalog";
import { refOptions } from "@/lib/catalog-data";
import { PAGE_SIZE, searchTerm } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/service";
import { clampPage, text, when } from "@/lib/format";
import { CatalogForm, type RefOptions } from "@/components/CatalogForm";
import { MissingTable } from "@/components/MissingTable";
import { Pager } from "@/components/Pager";

export type ListSearch = Promise<{ q?: string; page?: string; deleted?: string }>;
export const catalogTitle = async (section: Resource["section"], params: Promise<{ resource: string }>) => ({ title: resource((await params).resource, section)?.title ?? "Not found" });

// List + search + create form for one catalog table, shown as a tab of its section.
// A companion table (providers for models) is listed above it on the same page.
export async function CatalogList({ section, params, searchParams }: { section: Resource["section"]; params: Promise<{ resource: string }>; searchParams: ListSearch }) {
  await (section === "team" ? requireSuperadmin() : requireAdmin());
  const def = resource((await params).resource, section);
  if (!def) notFound();
  if (def.listedOn) redirect(catalogPath(def));
  const base = catalogPath(def);
  const query = await searchParams;
  const q = searchTerm(text(query.q));
  const page = clampPage(query.page);
  const db = serviceClient();
  const companion = def.companion ? resource(def.companion, section) : null;
  let list = db.from(def.table).select("*", { count: "exact" }).order(def.order.column, { ascending: def.order.ascending });
  if (q) list = list.or(def.search.map((column) => `${column}.ilike.*${q}*`).join(","));
  const [{ data, count, error }, refs, extra] = await Promise.all([
    list.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    refOptions(db, def),
    companion
      ? Promise.all([db.from(companion.table).select("*").order(companion.order.column, { ascending: companion.order.ascending }).limit(200), refOptions(db, companion)])
      : null,
  ]);
  if (error && !isMissingTable(error)) throw new Error(error.message);
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Create · read · update · delete · <span className="mono">{def.table}</span>{companion && <> · <span className="mono">{companion.table}</span></>}</span>
          <h1>{companion ? `${def.title} & ${companion.title.replace(/^LLM /, "").toLowerCase()}` : def.title}.</h1>
          <p>{def.description}</p>
        </div>
      </header>
      {error ? <MissingTable table={def.table} /> : (
        <div className="stack">
          {query.deleted && <div className="notice notice-good" role="status">Deleted.</div>}
          {companion && extra && (
            <section className="card" id={companion.slug}>
              <h2>{companion.title}</h2>
              <p className="sub">{companion.description}</p>
              {extra[0].error ? <MissingTable table={companion.table} /> : (
                <div className="stack">
                  <details className="card" style={{ boxShadow: "none" }} open={!(extra[0].data ?? []).length}>
                    <summary style={{ cursor: "pointer", fontWeight: 800 }}>+ Add {companion.singular}</summary>
                    <div style={{ marginTop: 14 }}><CatalogForm slug={companion.slug} refs={extra[1]} /></div>
                  </details>
                  <CatalogTable def={companion} rows={(extra[0].data ?? []) as Record<string, unknown>[]} refs={extra[1]} empty={`No ${companion.title.toLowerCase()} yet.`} />
                </div>
              )}
            </section>
          )}
          {/* With a companion above, the main table gets a matching card. */}
          <div className={companion ? "card stack" : "stack"} id={def.slug}>
          {companion && <h2 style={{ margin: 0 }}>{def.title}</h2>}
          <details className="card" style={companion ? { boxShadow: "none" } : undefined} open={!(data ?? []).length && !q}>
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>+ Add {def.singular}</summary>
            <div style={{ marginTop: 14 }}><CatalogForm slug={def.slug} refs={refs} /></div>
          </details>
          <form className="toolbar" role="search">
            <input className="input" name="q" defaultValue={q} placeholder={`Search ${def.title.toLowerCase()}`} aria-label={`Search ${def.title.toLowerCase()}`} />
            <button className="btn" type="submit">Search</button>
            {q && <Link className="btn" href={base}>Clear</Link>}
          </form>
          <CatalogTable def={def} rows={(data ?? []) as Record<string, unknown>[]} refs={refs} empty={q ? "Nothing matches." : `No ${def.title.toLowerCase()} yet.`} />
          <Pager page={page} total={count ?? 0} size={PAGE_SIZE} base={base} params={{ q }} />
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogTable({ def, rows, refs, empty }: { def: Resource; rows: Record<string, unknown>[]; refs: RefOptions; empty: string }) {
  const columns = def.fields.filter((f) => f.list);
  const labels = Object.fromEntries(Object.entries(refs).map(([name, options]) => [name, new Map(options.map((o) => [o.value, o.label]))]));
  return (
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
          {!rows.length && <tr><td colSpan={columns.length + 2} className="empty">{empty}</td></tr>}
        </tbody>
      </table>
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
