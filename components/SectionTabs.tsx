"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Tabs across the top of a console section. The most specific tab wins,
// so /ai/runs/<id> highlights "Generation requests", not "Overview".
export function SectionTabs({ label, tabs }: { label: string; tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  const root = tabs[0].href;
  const active = tabs.filter((t) => (t.href === root ? path === root : path === t.href || path.startsWith(`${t.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="tabs tabs-wrap" aria-label={label}>
      {tabs.map((t) => <Link key={t.href} className="tab" href={t.href} aria-current={active === t.href ? "page" : undefined}>{t.label}</Link>)}
    </nav>
  );
}
