import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { mostPosts } from "@/lib/rankings";
import { day, n } from "@/lib/format";
import { RankTabs } from "@/components/RankTabs";
import { PersonLink } from "@/components/Person";
export const metadata: Metadata = { title: "Most posts" };

export default async function MostPosts() {
  await requireAdmin();
  const rows = await mostPosts();
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Rankings &amp; votes</span>
          <h1>Most posts.</h1>
          <p>Members ranked by how many live posts they have, all time. When tied, more Ha received ranks higher, then whoever posted most recently.</p>
        </div>
      </header>
      <RankTabs current="/rankings/most-posts" />
      <div className="table-wrap">
        <table>
          <thead><tr><th className="r">Rank</th><th>Member</th><th className="r">Live posts</th><th className="r">Ha received</th><th className="r">Ha / post</th><th>Latest post</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="r"><span className="rank">{r.rank}</span></td>
                <td><PersonLink profile={r.profile} id={r.id} /></td>
                <td className="r"><span className="badge badge-brand num">{n(r.posts)} posts</span></td>
                <td className="r num">{n(r.ha)}</td>
                <td className="r num">{(r.ha / r.posts).toFixed(2)}</td>
                <td className="muted">{day(r.latest)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="empty">No posts yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
