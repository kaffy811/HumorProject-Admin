import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { leaderboard, PERIODS, periodOf } from "@/lib/rankings";
import { n } from "@/lib/format";
import { PeriodTabs, RankTabs } from "@/components/RankTabs";
export const metadata: Metadata = { title: "Hottest creators" };

export default async function Creators({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const admin = await requireAdmin();
  const period = periodOf((await searchParams).period ?? "all");
  const board = await leaderboard(period, admin.id);
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Rankings &amp; votes · same list as the member Top page</span>
          <h1>Hottest creators.</h1>
          <p>Top 50 members by total Ha received on their live posts, {PERIODS[period].toLowerCase()}. When tied, the member who needed fewer posts ranks higher.</p>
        </div>
      </header>
      <RankTabs current="/rankings/creators" />
      <PeriodTabs base="/rankings/creators" period={period} />
      <div className="table-wrap">
        <table>
          <thead><tr><th className="r">Rank</th><th>Member</th><th className="r">Ha received</th><th className="r">Posts</th><th className="r">Ha / post</th><th>Best post</th></tr></thead>
          <tbody>
            {board.people.map((p) => (
              <tr key={p.user.id}>
                <td className="r"><span className="rank">{p.rank}</span></td>
                <td><Link href={`/users/${p.user.id}`}><b>{p.user.name}</b></Link>{p.user.isOfficial && <> <span className="badge">Official</span></>}</td>
                <td className="r"><span className="badge badge-brand num">{n(p.haReceived)} Ha</span></td>
                <td className="r num">{n(p.postCount)}</td>
                <td className="r num">{p.postCount ? (p.haReceived / p.postCount).toFixed(2) : "—"}</td>
                <td><Link href={`/posts/${p.bestPost.id}`} className="clip">{p.bestPost.caption}</Link></td>
              </tr>
            ))}
            {!board.people.length && <tr><td colSpan={6} className="empty">Nobody posted in this window.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
