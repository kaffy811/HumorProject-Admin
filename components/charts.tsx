import { n } from "@/lib/format";

// Horizontal bars, one series, value labelled at the end of each bar.
export function Bars({ rows, format = (v: number) => n(v), unit = "" }: { rows: { label: string; value: number; tip?: string }[]; format?: (value: number) => string; unit?: string }) {
  const max = Math.max(...rows.map((row) => row.value), 0);
  if (!rows.length) return <p className="empty">No data yet.</p>;
  return (
    <div className="bars" role="table">
      {rows.map((row) => (
        <div className="bar-row tip" role="row" key={row.label} data-tip={row.tip ?? `${row.label}: ${format(row.value)}${unit}`}>
          <span className="bar-label" role="cell" title={row.label}>{row.label}</span>
          <span className="bar-track" role="cell">
            <span className="bar-fill" style={{ display: "block", width: `${max ? (row.value / max) * 100 : 0}%` }} />
          </span>
          <span className="bar-value" role="cell">{format(row.value)}{unit}</span>
        </div>
      ))}
    </div>
  );
}

export function Funnel({ steps }: { steps: { label: string; count: number }[] }) {
  const max = Math.max(...steps.map((step) => step.count), 1);
  const shades = ["var(--seq-5)", "var(--seq-4)", "var(--seq-3)", "var(--seq-2)"];
  return (
    <div className="funnel">
      {steps.map((step, index) => {
        const previous = index ? steps[index - 1].count : null;
        return (
          <div className="funnel-step" key={step.label}>
            <span style={{ fontWeight: 650 }}>{step.label}</span>
            <span className="num muted">
              <b style={{ color: "var(--ink)" }}>{n(step.count)}</b>
              {previous !== null && ` · ${previous ? Math.round((step.count / previous) * 100) : 0}% of previous`}
            </span>
            <span className="funnel-bar tip" data-tip={`${step.label}: ${n(step.count)}`} style={{ width: `${Math.max(1, (step.count / max) * 100)}%`, background: shades[index] }} />
          </div>
        );
      })}
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(...grid.flat(), 0);
  const level = (value: number) => (value === 0 || !max ? 0 : Math.min(5, 1 + Math.floor((value / max) * 4.999)));
  const hourLabel = (hour: number) => (hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`);
  return (
    <div>
      <div className="heat" role="img" aria-label="Laughs by weekday and hour, New York time">
        <span />
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour} style={{ textAlign: "center" }}>{hour % 3 === 0 ? hourLabel(hour) : ""}</span>
        ))}
        {grid.map((row, weekday) => (
          <Row key={weekday} label={DAYS[weekday]}>
            {row.map((value, hour) => (
              <span key={hour} className="heat-cell tip" data-tip={`${DAYS[weekday]} ${hourLabel(hour)}: ${n(value)} laughs`} style={{ background: `var(--seq-${level(value)})` }} />
            ))}
          </Row>
        ))}
      </div>
      <div className="heat-legend" aria-hidden="true">
        Fewer {[0, 1, 2, 3, 4, 5].map((step) => <i key={step} style={{ background: `var(--seq-${step})` }} />)} More
      </div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span style={{ alignSelf: "center" }}>{label}</span>
      {children}
    </>
  );
}

type Series<T> = { key: string; color: string; pick: (d: T) => number };
// Daily lines on one shared count axis (same unit: events per day).
export function Lines<T extends { date: string }>({ days, series, label, describe }: { days: T[]; series: Series<T>[]; label: string; describe: (d: T) => string }) {
  const width = 640, height = 180, padX = 28, padY = 14;
  const max = Math.max(1, ...days.flatMap((d) => series.map((s) => s.pick(d))));
  const x = (index: number) => padX + (index / Math.max(1, days.length - 1)) * (width - padX * 2);
  const y = (value: number) => height - padY - (value / max) * (height - padY * 2);
  const short = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div className="trend">
      <div className="legend">
        {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.key}</span>)}
      </div>
      <svg viewBox={`0 0 ${width} ${height + 18}`} role="img" aria-label={label}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line className="axis" x1={padX} x2={width - padX} y1={y(max * t)} y2={y(max * t)} strokeDasharray={t ? "3 4" : undefined} />
            <text className="label" x={padX - 6} y={y(max * t) + 3} textAnchor="end">{Math.round(max * t)}</text>
          </g>
        ))}
        {series.map((s) => <path key={s.key} d={days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.pick(d)).toFixed(1)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {days.map((d, i) => (
          <g key={d.date}>
            <rect x={x(i) - (width - padX * 2) / days.length / 2} y={padY} width={(width - padX * 2) / days.length} height={height - padY * 2} fill="transparent">
              <title>{`${short(d.date)} — ${describe(d)}`}</title>
            </rect>
            {(i % 7 === 0 || (i === days.length - 1 && i % 7 >= 3)) && <text className="label" x={x(i)} y={height + 10} textAnchor="middle">{short(d.date)}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}

type Day = { date: string; ha: number; posts: number; comments: number };
export function Trend({ days }: { days: Day[] }) {
  return (
    <Lines days={days} label="Daily activity over the last 30 days"
      series={[{ key: "Likes", color: "var(--series-1)", pick: (d) => d.ha }, { key: "Posts + comments", color: "var(--series-2)", pick: (d) => d.posts + d.comments }]}
      describe={(d) => `${d.ha} likes · ${d.posts} posts · ${d.comments} comments`} />
  );
}
