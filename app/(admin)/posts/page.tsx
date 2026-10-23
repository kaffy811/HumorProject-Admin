import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { PAGE_SIZE, profilesByIds, searchTerm, signedUrls } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/service";
import { clampPage, n, SOURCE_LABELS, sourceLabel, SOURCES, STYLES, text, when } from "@/lib/format";
import { PersonLink } from "@/components/Person";
import { Pager } from "@/components/Pager";
export const metadata: Metadata = { title: "Posts" };

type Row = { id: string; content: string; style: string; source: string; created_at: string; deleted_at: string | null; humor_images: { id: string; user_id: string; storage_path: string | null; status: string } };
type Search = Promise<{ q?: string; status?: string; style?: string; source?: string; page?: string; purged?: string }>;
export default async function Media({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const params = await searchParams;
  const q = searchTerm(text(params.q));
  const status = ["live", "deleted", "all"].includes(text(params.status)) ? text(params.status) : "live";
  const style = (STYLES as readonly string[]).includes(text(params.style)) ? text(params.style) : "";
  const source = (SOURCES as readonly string[]).includes(text(params.source)) ? text(params.source) : "";
  const page = clampPage(params.page);
  const db = serviceClient();
  let query = db.from("humor_captions")
    .select("id,content,style,source,created_at,deleted_at,humor_images!inner(id,user_id,storage_path,status)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (q) query = query.ilike("content", `%${q}%`);
  if (status === "live") query = query.is("deleted_at", null);
  if (status === "deleted") query = query.not("deleted_at", "is", null);
  if (style) query = query.eq("style", style);
  if (source) query = query.eq("source", source);
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];
  const [authors, urls, tallies] = await Promise.all([
    profilesByIds(db, rows.map((row) => row.humor_images.user_id)),
    signedUrls(db, "humor-images", rows.map((row) => row.humor_images.storage_path)),
    Promise.all(rows.map(async (row) => {
      const [ha, comments] = await Promise.all([
        db.from("humor_votes").select("id", { count: "exact", head: true }).eq("caption_id", row.id).eq("value", 1),
        db.from("humor_comments").select("id", { count: "exact", head: true }).eq("caption_id", row.id).is("deleted_at", null),
      ]);
      return [row.id, { ha: ha.count ?? 0, comments: comments.count ?? 0 }] as const;
    })),
  ]);
  const counts = new Map(tallies);
  const sourceCounts = await Promise.all(["", ...SOURCES].map(async (key) => {
    let q = db.from("humor_captions").select("id", { count: "exact", head: true });
    if (status === "live") q = q.is("deleted_at", null);
    if (status === "deleted") q = q.not("deleted_at", "is", null);
    if (key) q = q.eq("source", key);
    return [key, (await q).count ?? 0] as const;
  }));
  const tabHref = (key: string) => `/posts?${new URLSearchParams(Object.entries({ status, style, q, source: key }).filter(([, v]) => v))}`;
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Create · read · update · delete</span>
          <h1>Posts.</h1>
          <p>Every post in the feed — AI-captioned, member-written and official seeds. Edit captions, soft-delete posts, restore them or purge them permanently.</p>
        </div>
        <Link className="btn btn-primary" href="/posts/new">+ New post</Link>
      </header>
      {params.purged && <div className="notice notice-good" role="status" style={{ marginBottom: 14 }}>Post purged permanently.</div>}
      <nav className="tabs" aria-label="Caption source">
        {/* Seeds are import-only and usually absent: show the tab only when some exist. */}
        {sourceCounts.filter(([key, total]) => key !== "seed" || total > 0 || source === "seed").map(([key, total]) => (
          <Link key={key || "all"} className="tab" href={tabHref(key)} aria-current={source === key ? "page" : undefined} title={key ? SOURCE_LABELS[key].hint : undefined}>
            {key ? sourceLabel(key) : "All posts"} <span className="muted num">{n(total)}</span>
          </Link>
        ))}
      </nav>
      <form className="toolbar" role="search">
        <input className="input" name="q" defaultValue={q} placeholder="Search captions" aria-label="Search captions" />
        <select className="select" name="status" defaultValue={status} aria-label="Status">
          <option value="live">Live</option><option value="deleted">Deleted</option><option value="all">All</option>
        </select>
        <select className="select" name="style" defaultValue={style} aria-label="Style">
          <option value="">All styles</option>{STYLES.map((s) => <option key={s}>{s}</option>)}
        </select>
        {source && <input type="hidden" name="source" value={source} />}
        <button className="btn" type="submit">Apply</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Image</th><th>Caption</th><th>Author</th><th>Style · source</th><th className="r">Likes</th><th className="r">Comments</th><th>Status</th><th>Posted</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/posts/${row.id}`} aria-label="Open post">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
                    {row.humor_images.storage_path && urls[row.humor_images.storage_path] ? <img className="thumb" src={urls[row.humor_images.storage_path]} alt="" /> : <span className="thumb" />}
                  </Link>
                </td>
                <td><Link href={`/posts/${row.id}`} className="clip" style={{ fontWeight: 600 }}>{row.content}</Link></td>
                <td><PersonLink profile={authors.get(row.humor_images.user_id) ?? null} id={row.humor_images.user_id} /></td>
                <td><span className="badge">{row.style}</span><br /><span className="muted" style={{ fontSize: 12 }}>{sourceLabel(row.source)}</span></td>
                <td className="r num">{n(counts.get(row.id)?.ha ?? 0)}</td>
                <td className="r num">{n(counts.get(row.id)?.comments ?? 0)}</td>
                <td>{row.deleted_at ? <span className="badge badge-bad">Deleted</span> : row.humor_images.status === "ready" ? <span className="badge badge-good">Live</span> : <span className="badge badge-warn">{row.humor_images.status}</span>}</td>
                <td className="muted">{when(row.created_at)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="empty">No posts match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={count ?? 0} size={PAGE_SIZE} base="/posts" params={{ q, status, style, source }} />
    </div>
  );
}
