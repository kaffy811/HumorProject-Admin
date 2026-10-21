import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { dashboardStats } from "@/lib/data";
import { duration, handle, n, pct, sourceLabel } from "@/lib/format";
import { Bars, Funnel, Heatmap, Trend } from "@/components/charts";
import { pendingRequestCount } from "@/lib/requests";
import { leaderboard, mostPosts, topicStats } from "@/lib/rankings";
import { TopicTable } from "@/components/TopicTable";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const hour = (h: number) => (h === 0 ? "midnight" : h < 12 ? `${h} AM` : h === 12 ? "noon" : `${h - 12} PM`);

export default async function Dashboard() {
  const admin = await requireAdmin();
  const [s, pending, board, posters, topics] = await Promise.all([dashboardStats(), pendingRequestCount(), leaderboard("all", admin.id), mostPosts(), topicStats()]);
  const t = s.totals;
  const bestStyle = s.styles.find((style) => style.posts >= 2) ?? s.styles[0];
  const bestLength = [...s.lengths].filter((l) => l.posts).sort((a, b) => b.average - a.average)[0];
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <span className="eyebrow">Laugh Lab</span>
          <h1>What&apos;s actually funny.</h1>
          <p>Live numbers from the shared Humor Project database. Times are New York time; deleted posts are excluded from laugh stats.</p>
        </div>
        <Link className="btn btn-primary" href="/posts/new">+ New post</Link>
      </header>

      {!!pending && (
        <div className="notice notice-warn notice-row" role="status">
          <span>✉ {pending} {pending === 1 ? "member is" : "members are"} waiting for superadmin approval.</span>
          <Link className="btn btn-primary" href="/requests">Review requests</Link>
        </div>
      )}

      <section className="hero">
        <div className="hero-card">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mascot */}
          <img className="hero-mascot" src="/baby/giggle.webp" alt="" />
          <span className="eyebrow">Laugh rate</span>
          <div className="big num">{pct(Math.round(t.laughRate * t.livePosts), t.livePosts)}</div>
          <p>of live posts have earned at least one Ha. The median post waits <b>{duration(s.medianFirstLaugh)}</b> for its first laugh.</p>
          <div className="hero-facts">
            <div><b className="num">{t.haPerPost.toFixed(1)}</b><span>Ha per post</span></div>
            <div><b className="num">{n(s.silent)}</b><span>posts met with silence (3+ days, 0 Ha)</span></div>
            <div><b className="num">{n(s.selfLaughs)}</b><span>self-Ha: members laughing at their own joke</span></div>
          </div>
        </div>
        <div className="card">
          <h2>Peak comedy hour</h2>
          <p className="sub">When Ha votes and comment hearts land.</p>
          {s.peak.count ? (
            <>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.6 }}>{DAYS[s.peak.weekday]}s around {hour(s.peak.hour)}</div>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                {n(s.peak.count)} laughs in that hour slot. {pct(s.lateNight, s.laughs)} of all laughs happen between midnight and 5 AM.
              </p>
            </>
          ) : <p className="empty">No laughs recorded yet.</p>}
          {bestStyle && (
            <p style={{ margin: "14px 0 0" }}>Funniest style: <b>{bestStyle.style}</b> at {bestStyle.average.toFixed(2)} Ha per post.{bestLength && <> Best caption length: <b>{bestLength.label.toLowerCase()}</b>.</>}</p>
          )}
        </div>
      </section>

      <section className="grid grid-kpi" aria-label="Totals">
        <Kpi label="Members" value={t.members} note={`${n(t.onboarded)} finished onboarding · ${n(t.superadmins)} superadmin`} />
        <Kpi label="Live posts" value={t.livePosts} note={`${n(t.deletedPosts)} deleted`} />
        <Kpi label="Ha votes" value={t.ha} note={t.boos ? `${n(t.boos)} downvotes` : "No downvotes recorded"} />
        <Kpi label="Comments" value={t.comments} note={`${n(t.commentHearts)} hearts on ${n(t.heartedComments)} comments`} />
        <Kpi label="Saves" value={t.saves} note={`${n(t.reports)} reports filed`} />
        <Kpi label="Gemini runs" value={s.gemini.total} note={`${pct(s.gemini.completed, s.gemini.total)} completed`} />
      </section>

      <section className="grid grid-2">
        <div className="card">
          <h2>Last 30 days</h2>
          <p className="sub">Ha votes vs. new posts and comments, per day.</p>
          <Trend days={s.days} />
        </div>
        <div className="card">
          <h2>When campus laughs</h2>
          <p className="sub">Ha votes + comment hearts by weekday and hour.</p>
          <Heatmap grid={s.heatmap} />
        </div>
      </section>

      <section className="grid grid-3">
        <div className="card">
          <h2>Which joke style wins?</h2>
          <p className="sub">Average Ha per live post, by caption style.</p>
          <Bars rows={s.styles.map((style) => ({ label: style.style, value: style.average, tip: `${style.style}: ${style.average.toFixed(2)} Ha/post over ${style.posts} posts` }))} format={(v) => v.toFixed(2)} />
        </div>
        <div className="card">
          <h2>Is brevity the soul of wit?</h2>
          <p className="sub">Average Ha per post, by caption length.</p>
          <Bars rows={s.lengths.map((l) => ({ label: l.label, value: l.average, tip: `${l.label}: ${l.average.toFixed(2)} Ha/post over ${l.posts} posts` }))} format={(v) => v.toFixed(2)} />
        </div>
        <div className="card">
          <h2>Photo → punchline funnel</h2>
          <p className="sub">How many uploads make it all the way to a laugh.</p>
          <Funnel steps={s.funnel} />
          <p className="muted" style={{ margin: "12px 0 0", fontSize: 12.5 }}>{n(s.aiCaptioned)} of {n(s.funnel[1].count)} published photos were captioned by Gemini; the rest are handmade or seeded.</p>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <div className="notice-row">
            <div>
              <h2>Columbia or New York?</h2>
              <p className="sub" style={{ margin: 0 }}>What the jokes are about, ranked by total Ha (keywords in caption and scene).</p>
            </div>
            <Link className="btn" href="/rankings/topics">Topic ranking →</Link>
          </div>
          <div style={{ marginTop: 14 }}><TopicTable topics={[...topics.ranked, topics.other]} total={topics.total} /></div>
        </div>
        <div className="card">
          <h2>Gemini meter</h2>
          <p className="sub">Caption generation health and spend proxy.</p>
          <dl className="kv">
            <dt>Completed</dt><dd className="num">{n(s.gemini.completed)} <span className="badge badge-good">{pct(s.gemini.completed, s.gemini.total)}</span></dd>
            <dt>Failed</dt><dd className="num">{n(s.gemini.failed)} {s.gemini.failed > 0 && <span className="badge badge-bad">{pct(s.gemini.failed, s.gemini.total)}</span>}</dd>
            <dt>In flight</dt><dd className="num">{n(s.gemini.processing)}</dd>
            <dt>Tokens used</dt><dd className="num">{n(s.gemini.tokens)}</dd>
            <dt>Per caption set</dt><dd className="num">{n(Math.round(s.gemini.tokensPerCaptionSet))} tokens</dd>
            <dt>Median latency</dt><dd className="num">{duration(s.gemini.medianLatency)}</dd>
            <dt>Models</dt><dd>{s.gemini.models.map((m) => `${m.model} (${m.count})`).join(", ") || "—"}</dd>
          </dl>
          {s.gemini.failures.length > 0 && (
            <>
              <h2 style={{ marginTop: 16 }}>Where generations fail</h2>
              <Bars rows={s.gemini.failures.map((f) => ({ label: f.stage, value: f.count }))} />
            </>
          )}
          {s.sources.length > 0 && (
            <p className="muted" style={{ margin: "14px 0 0", fontSize: 12.5 }}>
              Live posts by source: {s.sources.map((x) => `${sourceLabel(x.source)} ${n(x.count)}`).join(" · ")} · <Link href="/ai">AI details →</Link>
            </p>
          )}
        </div>
      </section>

      <section className="grid grid-3">
        <div className="card">
          <h2>Hall of fame</h2>
          <p className="sub">Top 5 of the member Top page (all time): more Ha first, ties go to the newer post.</p>
          {board.posts.length ? (
            <div className="hall">
              {board.posts.slice(0, 5).map((post) => (
                <Link className="hall-item" key={post.id} href={`/posts/${post.id}`}>
                  <span className="rank">{post.rank}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
                  {board.thumb(post.id) ? <img className="thumb" src={board.thumb(post.id)} alt="" /> : <span className="thumb" />}
                  <span style={{ minWidth: 0 }}>
                    <span className="clip" style={{ fontWeight: 600 }}>{post.caption}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{post.author.name} · {post.style}</span>
                  </span>
                  <span className="badge badge-brand num">{n(post.haCount)} Ha</span>
                </Link>
              ))}
            </div>
          ) : <p className="empty">No posts yet.</p>}
          <Link className="btn" href="/rankings/posts" style={{ marginTop: 14 }}>Full ranking →</Link>
        </div>
        <div className="card">
          <h2>Hottest creators</h2>
          <p className="sub">Most Ha received, all time — same as the member Top page.</p>
          <ol className="mini-rank">
            {board.people.slice(0, 5).map((p) => (
              <li key={p.user.id}><Link href={`/users/${p.user.id}`}><b>{p.user.name}</b></Link><span className="badge badge-brand num">{n(p.haReceived)} Ha</span></li>
            ))}
          </ol>
          {!board.people.length && <p className="empty">Nobody yet.</p>}
          <Link className="btn" href="/rankings/creators">Full ranking →</Link>
        </div>
        <div className="card">
          <h2>Most posts</h2>
          <p className="sub">Most live posts, all time.</p>
          <ol className="mini-rank">
            {posters.slice(0, 5).map((p) => (
              <li key={p.id}><Link href={`/users/${p.id}`}><b>{handle(p.profile ?? { id: p.id })}</b></Link><span className="badge num">{n(p.posts)} posts</span></li>
            ))}
          </ol>
          {!posters.length && <p className="empty">Nobody yet.</p>}
          <Link className="btn" href="/rankings/most-posts">Full ranking →</Link>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="card kpi">
      <span className="eyebrow">{label}</span>
      <div className="value num">{n(value)}</div>
      <div className="note">{note}</div>
    </div>
  );
}
