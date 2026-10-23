import Link from "next/link";
import { PAGE_SIZE, postRatings, profilesByIds } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/service";
import { n } from "@/lib/format";
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
          <thead><tr><th>#</th><th>Caption</th><th>Author</th>{head("ha", "Likes")}{head("dislikes", "Dislikes")}{head("net", "Net")}{head("velocity", "Likes / day")}{head("wilson", "Confidence")}{head("comments", "Comments")}</tr></thead>
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
