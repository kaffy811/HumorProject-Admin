import Link from "next/link";
const TABS = [
  { href: "/rankings/posts", label: "Hot posts" },
  { href: "/rankings/creators", label: "Hottest creators" },
  { href: "/rankings/most-posts", label: "Most posts" },
  { href: "/rankings/topics", label: "Topics" },
];
export function RankTabs({ current }: { current: string }) {
  return (
    <nav className="tabs" aria-label="Rankings">
      {TABS.map((t) => <Link key={t.href} className="tab" href={t.href} aria-current={current === t.href ? "page" : undefined}>{t.label}</Link>)}
    </nav>
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
