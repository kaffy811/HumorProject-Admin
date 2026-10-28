"use client";
import Link from "next/link";
import { Fragment } from "react";
import { usePathname } from "next/navigation";
type Item = { href: string; label: string; icon: string; superadmin?: boolean };
const SECTIONS: { title: string; links: Item[] }[] = [
  { title: "Overview", links: [
    { href: "/", label: "Laugh Lab", icon: "☺" },
    { href: "/activity", label: "Activity log", icon: "☰" },
  ] },
  { title: "Members & content", links: [
    { href: "/users", label: "Users", icon: "◉" },
    { href: "/posts", label: "Posts & images", icon: "▣" },
    { href: "/rankings", label: "Rankings", icon: "★" },
  ] },
  { title: "AI pipeline", links: [
    { href: "/ai", label: "AI models & prompts", icon: "✦" },
    { href: "/prompt-chains", label: "Prompt chains", icon: "⛓" },
    { href: "/ai/runs", label: "Generation requests", icon: "→" },
    { href: "/ai/responses", label: "LLM responses", icon: "←" },
    { href: "/ai/media", label: "AI generated media", icon: "▦" },
    { href: "/catalog/llm-models", label: "LLM models", icon: "◆" },
    { href: "/catalog/llm-providers", label: "LLM providers", icon: "◇" },
    { href: "/catalog/terms", label: "Terms", icon: "Aa" },
    { href: "/catalog/examples", label: "Generation examples", icon: "❝" },
  ] },
  { title: "Access", links: [
    { href: "/catalog/signup-domains", label: "Sign-up domains", icon: "@" },
    { href: "/catalog/whitelisted-emails", label: "Whitelisted emails", icon: "✓" },
    { href: "/team", label: "Team & access", icon: "✉", superadmin: true },
  ] },
];
const ALL = SECTIONS.flatMap((s) => s.links);

export function Nav({ pending, role }: { pending: number | null; role: "superadmin" | "admin" }) {
  const path = usePathname();
  // The most specific link wins, so /ai/runs highlights "Generation requests", not "AI models".
  const active = ALL.filter((l) => (l.href === "/" ? path === "/" : path === l.href || path.startsWith(`${l.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="side-nav" aria-label="Admin sections">
      {SECTIONS.map((section) => (
        <Fragment key={section.title}>
          <span className="nav-section">{section.title}</span>
          {section.links.filter((link) => !link.superadmin || role === "superadmin").map((link) => {
            const count = link.href === "/team" ? pending : null;
            return (
              <Link key={link.href} href={link.href} className="nav-link" aria-current={active === link.href ? "page" : undefined}>
                <span aria-hidden="true" style={{ width: 16, textAlign: "center" }}>{link.icon}</span>
                {link.label}
                {!!count && <span className="nav-count" aria-label={`${count} waiting`}>{count}</span>}
              </Link>
            );
          })}
        </Fragment>
      ))}
    </nav>
  );
}
