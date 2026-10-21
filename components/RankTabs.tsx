import Link from "next/link";
// Individual votes and hearts are browsed in the activity log.
const GROUPS = [
  { title: "Rankings", hint: "who and what is winning", tabs: [
    { href: "/rankings/posts", label: "Hot posts" },
    { href: "/rankings/creators", label: "Hottest creators" },
    { href: "/rankings/most-posts", label: "Most posts" },
    { href: "/rankings/topics", label: "Topics" },
    { href: "/rankings/ratings", label: "Post scores" },
  ] },
];
export function RankTabs({ current }: { current: string }) {
  return (
    <div className="rank-groups">
      {GROUPS.map((g) => (
        <nav key={g.title} className="rank-group" aria-label={g.title}>
          <span className="eyebrow">{g.title} <span className="muted" style={{ textTransform: "none", letterSpacing: 0 }}>· {g.hint}</span></span>
          <div className="tabs" style={{ marginBottom: 0 }}>
            {g.tabs.map((t) => <Link key={t.href} className="tab" href={t.href} aria-current={current === t.href ? "page" : undefined}>{t.label}</Link>)}
          </div>
        </nav>
      ))}
    </div>
  );
}
export function PeriodTabs({ base, period }: { base: string; period: string }) {
  return (
    <div className="toolbar" role="group" aria-label="Time window">
      {(["week", "month", "all"] as const).map((p) => (
        <Link key={p} href={`${base}?period=${p}`} className={`btn${period === p ? " btn-primary" : ""}`} aria-current={period === p ? "true" : undefined}>
          {p === "week" ? "Last 7 days" : p === "month" ? "Last 30 days" : "All time"}
        </Link>
      ))}
    </div>
  );
}
