import Link from "next/link";
import { PAGE_SIZE, postRatings, profilesByIds } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/service";
import { n, when } from "@/lib/format";
import { PersonLink } from "@/components/Person";
import { Pager } from "@/components/Pager";
export async function Ratings({ page, sort }: { page: number; sort: string }) {
  const db = serviceClient();
  const { rows, key } = await postRatings(db, sort);
  const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const people = await profilesByIds(db, slice.map((r) => r.author));
  const head = (k: string, label: string) => (
    <th className="r"><Link href={`/rankings/ratings?sort=${k}`} aria-current={key === k ? "true" : undefined} style={{ textDecoration: key === k ? "underline" : "none" }}>{label}</Link></th>
  );
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Caption</th><th>Author</th>{head("ha", "Ha")}<th className="r">Down</th>{head("net", "Net")}{head("velocity", "Ha / day")}{head("wilson", "Confidence")}{head("comments", "Comments")}</tr></thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={r.id}>
                <td className="muted num">{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td><Link className="clip" href={`/posts/${r.id}`} style={{ fontWeight: 600 }}>{r.content}</Link><span className="muted" style={{ fontSize: 12 }}>{r.style}</span></td>
                <td><PersonLink profile={people.get(r.author) ?? null} id={r.author} /></td>
                <td className="r num">{n(r.up)}</td>
                <td className="r num">{n(r.down)}</td>
                <td className="r num">{n(r.net)}</td>
                <td className="r num">{r.perDay.toFixed(2)}</td>
                <td className="r num" title="Wilson lower bound on share of positive votes">{r.up + r.down ? `${Math.round(r.wilson * 100)}%` : "—"}</td>
                <td className="r num">{n(r.comments)}</td>
              </tr>
            ))}
            {!slice.length && <tr><td colSpan={9} className="empty">No live posts.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={rows.length} size={PAGE_SIZE} base="/rankings/ratings" params={{ sort: key }} />
    </>
  );
}

export async function HaVotes({ page, value }: { page: number; value: string }) {
  const db = serviceClient();
  let query = db.from("humor_votes").select("id,user_id,caption_id,value,created_at,humor_captions(content,deleted_at)", { count: "exact" }).order("created_at", { ascending: false });
  if (value === "up") query = query.eq("value", 1);
  if (value === "down") query = query.eq("value", -1);
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { id: string; user_id: string; caption_id: string; value: number; created_at: string; humor_captions: { content: string; deleted_at: string | null } | null }[];
  const people = await profilesByIds(db, rows.map((r) => r.user_id));
  return (
    <>
      <form className="toolbar">
        <select className="select" name="value" defaultValue={value} aria-label="Vote value">
          <option value="">All votes</option><option value="up">Ha (+1)</option><option value="down">Downvotes (−1)</option>
        </select>
        <button className="btn" type="submit">Apply</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Voter</th><th>Vote</th><th>Post</th><th>When</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><PersonLink profile={people.get(r.user_id) ?? null} id={r.user_id} /></td>
                <td>{r.value === 1 ? <span className="badge badge-good">Ha +1</span> : <span className="badge badge-bad">−1</span>}</td>
                <td><Link className="clip" href={`/posts/${r.caption_id}`}>{r.humor_captions?.content ?? r.caption_id}</Link></td>
                <td className="muted">{when(r.created_at)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="empty">No votes yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={count ?? 0} size={PAGE_SIZE} base="/rankings/votes" params={{ value }} />
    </>
  );
}

export async function Hearts({ page }: { page: number }) {
  const db = serviceClient();
  const { data, count, error } = await db.from("humor_comment_votes")
    .select("comment_id,user_id,created_at,humor_comments(content,caption_id,user_id)", { count: "exact" })
    .order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { comment_id: string; user_id: string; created_at: string; humor_comments: { content: string; caption_id: string; user_id: string } | null }[];
  const people = await profilesByIds(db, rows.flatMap((r) => [r.user_id, r.humor_comments?.user_id ?? ""]));
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Hearted by</th><th>Comment</th><th>Comment author</th><th>When</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.comment_id}-${r.user_id}`}>
                <td><PersonLink profile={people.get(r.user_id) ?? null} id={r.user_id} /></td>
                <td>{r.humor_comments ? <Link className="clip" href={`/posts/${r.humor_comments.caption_id}`}>{r.humor_comments.content}</Link> : "—"}</td>
                <td>{r.humor_comments ? <PersonLink profile={people.get(r.humor_comments.user_id) ?? null} id={r.humor_comments.user_id} /> : "—"}</td>
                <td className="muted">{when(r.created_at)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="empty">No comment hearts yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={count ?? 0} size={PAGE_SIZE} base="/rankings/hearts" params={{}} />
    </>
  );
}
