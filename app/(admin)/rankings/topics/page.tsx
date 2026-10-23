import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { topicStats } from "@/lib/rankings";
import { TOPICS, topicLabel } from "@/lib/topics";
import { handle, n, pct } from "@/lib/format";
import { TopicTable } from "@/components/TopicTable";
import { RankTabs } from "@/components/RankTabs";
export const metadata: Metadata = { title: "Topics" };

export default async function Topics() {
  await requireAdmin();
  const s = await topicStats();
  const all = [...s.ranked, s.other];
  return (
    <div className="stack">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Rankings</span>
          <h1>Columbia or New York?</h1>
          <p>What the jokes are about, across {n(s.total)} live posts. Each post is matched by keywords in its caption and scene description; if it fits several topics, Columbia counts first, then New York City, then general student life. Topics are ranked by total likes.</p>
        </div>
      </header>
      <RankTabs current="/rankings/topics" />
      <section className="card">
        <h2>Topic ranking</h2>
        <p className="sub">Ranked by total likes. “Other” has no Columbia, NYC or student-life keyword and is listed last.</p>
        <TopicTable topics={all} total={s.total} />
      </section>
      {all.map((t, index) => {
        const meta = TOPICS.find((x) => x.key === t.key);
        return (
          <section className="card" key={t.key}>
            <div className="notice-row">
              <div>
                <span className="eyebrow">{t.key === "other" ? "Unranked" : `#${index + 1} by likes`}</span>
                <h2 style={{ fontSize: 22 }}>{topicLabel(t.key)}</h2>
                <p className="sub" style={{ margin: 0 }}>{meta?.hint ?? "No Columbia, NYC or student-life keywords"}</p>
              </div>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="badge">{n(t.posts)} posts · {pct(t.posts, s.total)}</span>
                <span className="badge badge-brand">{n(t.ha)} likes</span>
                <span className="badge">{t.haPerPost.toFixed(2)} likes/post</span>
              </span>
            </div>
            {t.words.length > 0 && <p style={{ margin: "12px 0 0" }}><span className="eyebrow">Top keywords </span>{t.words.map(([w, c]) => <span key={w} className="badge" style={{ marginRight: 6 }}>{w} · {c}</span>)}</p>}
            {t.top.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 14 }}>
                <table>
                  <thead><tr><th>Photo</th><th>Caption</th><th>Author</th><th>Matched</th><th className="r">Likes</th></tr></thead>
                  <tbody>
                    {t.top.map((p) => (
                      <tr key={p.id}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
                        <td><Link href={`/posts/${p.id}`}>{p.path && s.urls[p.path] ? <img className="thumb" src={s.urls[p.path]} alt="" /> : <span className="thumb" />}</Link></td>
                        <td><Link className="clip" href={`/posts/${p.id}`} style={{ fontWeight: 700 }}>{p.content}</Link></td>
                        <td><Link href={`/users/${p.author}`}>{handle(s.people.get(p.author) ?? { id: p.author })}</Link></td>
                        <td className="muted">{p.matches.join(", ") || "—"}</td>
                        <td className="r num">{n(p.ha)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
