import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { leaderboard, PERIODS, periodOf } from "@/lib/rankings";
import { n, when } from "@/lib/format";
import { PeriodTabs, RankTabs } from "@/components/RankTabs";
export const metadata: Metadata = { title: "Hot posts" };

export default async function HotPosts({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const admin = await requireAdmin();
  const period = periodOf((await searchParams).period ?? "all");
  const board = await leaderboard(period, admin.id);
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Rankings · same list as the member Top page</span>
          <h1>Hot posts.</h1>
          <p>Top 50 live posts, {PERIODS[period].toLowerCase()}. Ranked by likes: more likes rank higher. When likes are tied, the more recently published post ranks higher — newer posts that collected the same laughs faster are hotter.</p>
        </div>
      </header>
      <RankTabs current="/rankings/posts" />
      <PeriodTabs base="/rankings/posts" period={period} />
      <p className="muted" style={{ margin: "0 0 14px", fontSize: 12.5 }}>Order recalculated {when(board.computedAt)} (refreshes every 5 minutes, like the member site); like counts are live.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th className="r">Rank</th><th>Photo</th><th>Caption</th><th>Author</th><th className="r">Likes</th><th className="r">Comments</th><th>Published</th></tr></thead>
          <tbody>
            {board.posts.map((p) => (
              <tr key={p.id}>
                <td className="r"><span className="rank">{p.rank}</span></td>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
                <td><Link href={`/posts/${p.id}`}>{board.thumb(p.id) ? <img className="thumb" src={board.thumb(p.id)} alt="" /> : <span className="thumb" />}</Link></td>
                <td><Link href={`/posts/${p.id}`} className="clip" style={{ fontWeight: 700 }}>{p.caption}</Link><span className="muted" style={{ fontSize: 12 }}>{p.style}</span></td>
                <td><Link href={`/users/${p.author.id}`}><b>{p.author.name}</b></Link></td>
                <td className="r"><span className="badge badge-brand num">{n(p.haCount)} likes</span></td>
                <td className="r num">{n(p.commentCount)}</td>
                <td className="muted">{when(p.createdAt)}</td>
              </tr>
            ))}
            {!board.posts.length && <tr><td colSpan={7} className="empty">No posts in this window.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
