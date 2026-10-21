"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const LINKS = [
  { href: "/", label: "Laugh Lab", icon: "☺" },
  { href: "/users", label: "Users", icon: "◉" },
  { href: "/posts", label: "Posts", icon: "▣" },
  { href: "/ai", label: "AI models & prompts", icon: "✦" },
  { href: "/rankings", label: "Rankings & votes", icon: "★" },
  { href: "/activity", label: "Activity log", icon: "☰" },
  { href: "/requests", label: "Access requests", icon: "✉" },
];
export function Nav({ pending }: { pending: number | null }) {
  const path = usePathname();
  return (
    <nav className="side-nav" aria-label="Admin sections">
      {LINKS.map((link) => {
        const active = link.href === "/" ? path === "/" : path.startsWith(link.href);
        const count = link.href === "/requests" ? pending : null;
        return (
          <Link key={link.href} href={link.href} className="nav-link" aria-current={active ? "page" : undefined}>
            <span aria-hidden="true" style={{ width: 16, textAlign: "center" }}>{link.icon}</span>
            {link.label}
            {!!count && <span className="nav-count" aria-label={`${count} waiting`}>{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
