import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { aiOverview } from "@/lib/data";
import { day, duration, n, pct } from "@/lib/format";
import { Bars, Lines } from "@/components/charts";
export const metadata: Metadata = { title: "AI models & prompts" };

const PROVIDERS: Record<string, string> = { google: "Google Gemini", mock: "Local mock", anthropic: "Anthropic Claude", openai: "OpenAI" };

export default async function Ai() {
  await requireAdmin();
  const s = await aiOverview();
  const t = s.totals;
  const picked = s.matched + s.edited;
  return (
    <div className="stack">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">AI generation</span>
          <h1>Models &amp; prompts.</h1>
          <p>Every caption-generation run, grouped by provider and model, plus the prompt versions behind them. New providers and models show up here automatically as soon as their runs are recorded.</p>
        </div>
        <Link className="btn btn-primary" href="/ai/runs">All runs →</Link>
      </header>

      <section className="grid grid-kpi" aria-label="Totals">
        <Kpi label="Runs" value={n(t.runs)} note={`${n(t.providers)} provider${t.providers === 1 ? "" : "s"} · ${n(s.models.length)} model${s.models.length === 1 ? "" : "s"}`} />
        <Kpi label="Success rate" value={pct(t.completed, t.runs)} note={`${n(t.failed)} failed`} />
        <Kpi label="Became a post" value={pct(t.published, t.completed)} note={`${n(t.published)} of ${n(t.completed)} completed runs`} />
        <Kpi label="Tokens" value={n(t.usage.total)} note={t.usage.prompt + t.usage.output ? `${n(t.usage.prompt)} in · ${n(t.usage.output)} out${t.usage.thoughts ? ` · ${n(t.usage.thoughts)} thinking` : ""}` : "input/output split not reported"} />
        <Kpi label="Rewrites" value={pct(s.edited, picked)} note="of AI posts were edited before publishing" />
        <Kpi label="Tries per post" value={s.regenerations === null ? "—" : s.regenerations.toFixed(1)} note="median generations per published photo" />
      </section>

      <section className="card">
        <h2>Models</h2>
        <p className="sub">One row per provider + model. likes/post counts only live posts that came from that model.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Provider</th><th>Model</th><th className="r">Runs</th><th className="r">Success</th><th className="r">Tokens / run</th><th className="r">Median</th><th className="r">p90</th><th className="r">Published</th><th className="r">Likes / post</th><th>Last used</th></tr></thead>
            <tbody>
              {s.models.map((m) => (
                <tr key={m.provider + m.model}>
                  <td><span className="badge">{PROVIDERS[m.provider] ?? m.provider}</span></td>
                  <td><Link href={`/ai/runs?model=${encodeURIComponent(m.model)}`} className="mono" style={{ fontWeight: 700 }}>{m.model}</Link></td>
                  <td className="r num">{n(m.runs)}</td>
                  <td className="r num">{pct(m.completed, m.runs)}{m.failed > 0 && <span className="muted"> · {m.failed} failed</span>}</td>
                  <td className="r num">{n(Math.round(m.tokensPerRun))}</td>
                  <td className="r num">{duration(m.medianLatency)}</td>
                  <td className="r num">{duration(m.p90Latency)}</td>
                  <td className="r num">{n(m.published)}</td>
                  <td className="r num">{m.haPerPost.toFixed(2)}</td>
                  <td className="muted">{day(m.lastUsed)}</td>
                </tr>
              ))}
              {!s.models.length && <tr><td colSpan={10} className="empty">No AI runs recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <h2>Runs, last 30 days</h2>
          <p className="sub">Completed vs failed generations per day.</p>
          <Lines days={s.days} label="Generations per day" describe={(d) => `${d.completed} completed · ${d.failed} failed`}
            series={[{ key: "Completed", color: "var(--series-1)", pick: (d) => d.completed }, { key: "Failed", color: "var(--series-2)", pick: (d) => d.failed }]} />
        </div>
        <div className="card">
          <h2>Which style do members pick?</h2>
          <p className="sub">Each run asks the model for four captions in four different styles (it chooses which four of six). Pick rate = times chosen ÷ times offered, so styles the model offers more often are not favoured.</p>
          {s.styleWins.length ? (
            <div className="table-wrap" style={{ boxShadow: "none" }}>
              <table>
                <thead><tr><th>Style</th><th className="r">Offered</th><th className="r">Picked</th><th style={{ width: "45%" }}>Pick rate</th></tr></thead>
                <tbody>
                  {s.styleWins.map((w) => (
                    <tr key={w.style} style={w.offered < 5 ? { opacity: 0.6 } : undefined}>
                      <td><b>{w.style}</b></td>
                      <td className="r num">{n(w.offered)}</td>
                      <td className="r num">{n(w.picked)}</td>
                      <td>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="bar-fill" style={{ display: "block", height: 14, width: `${Math.max(1, w.rate * 80)}%` }} />
                          <span className="bar-value">{Math.round(w.rate * 100)}%</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">No four-style runs have been published yet.</p>}
          <p className="muted" style={{ margin: "12px 0 0", fontSize: 12.5 }}>
            Based on {n(s.matched - s.singleStyle)} posts published exactly as generated. Faded rows were offered fewer than 5 times — too few to trust.
            {" "}Not counted: {n(s.edited)} rewritten before publishing{s.singleStyle ? `, ${n(s.singleStyle)} from older runs where all four captions shared one style` : ""}.
          </p>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <h2>Where runs fail</h2>
          <p className="sub">failure_stage of failed runs.</p>
          {s.failures.length ? <Bars rows={s.failures} /> : <p className="empty">No failures. 🎉</p>}
        </div>
        <div className="card">
          <h2>Safety checks</h2>
          <p className="sub">AI moderation of member-written captions.</p>
          {s.moderation.length ? (
            <div className="table-wrap"><table><thead><tr><th>Model</th><th>Verdict</th><th className="r">Checks</th></tr></thead><tbody>
              {s.moderation.map((m) => <tr key={m.model + m.verdict}><td className="mono">{m.model}</td><td>{m.verdict === "allowed" ? <span className="badge badge-good">Allowed</span> : <span className="badge badge-bad">Blocked</span>}</td><td className="r num">{n(m.count)}</td></tr>)}
            </tbody></table></div>
          ) : <p className="empty">No moderation checks recorded.</p>}
        </div>
      </section>

      <section className="card">
        <h2>Prompt versions</h2>
        <p className="sub">The exact prompt text sent with the newest run of each version, and how that version performs. Prompts are set in the member app&apos;s code; bumping its prompt_version starts a new row here.</p>
        <div className="stack">
          {s.versions.map((v) => {
            const p = s.prompts.get(v.version);
            return (
              <details key={v.version} className="card" style={{ boxShadow: "none" }}>
                <summary style={{ cursor: "pointer", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <b className="mono" style={{ fontSize: 14 }}>{v.version}</b>
                  <span className="badge">{n(v.runs)} runs</span>
                  <span className="badge badge-good">{pct(v.completed, v.runs)} success</span>
                  <span className="badge">{n(v.published)} posts · {v.haPerPost.toFixed(2)} likes/post</span>
                  <span className="muted">{day(v.firstSeen)} – {day(v.lastSeen)} · {v.models.join(", ")}</span>
                </summary>
                {p ? (
                  <div className="stack" style={{ marginTop: 14, gap: 14 }}>
                    <div className="grid grid-2" style={{ gap: 14 }}>
                      <div><span className="eyebrow">System prompt</span><pre className="prompt">{p.system_prompt}</pre></div>
                      <div><span className="eyebrow">User prompt (latest run)</span><pre className="prompt">{p.user_prompt}</pre></div>
                    </div>
                    <div><span className="eyebrow">Generation config</span><pre className="prompt">{JSON.stringify(p.generation_config, null, 2)}</pre></div>
                    <Link href={`/ai/runs/${p.id}`} className="muted">Open that run →</Link>
                  </div>
                ) : null}
              </details>
            );
          })}
          {!s.versions.length && <p className="empty">No prompt versions yet.</p>}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card kpi">
      <span className="eyebrow">{label}</span>
      <div className="value num">{value}</div>
      <div className="note">{note}</div>
    </div>
  );
}
