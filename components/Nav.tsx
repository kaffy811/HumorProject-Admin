"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const LINKS = [
  { href: "/", label: "Laugh Lab", icon: "☺" },
  { href: "/users", label: "Users", icon: "◉" },
  { href: "/posts", label: "Posts", icon: "▣" },
  { href: "/ai", label: "AI models & prompts", icon: "✦" },
  { href: "/rankings", label: "Rankings", icon: "★" },
  { href: "/activity", label: "Activity log", icon: "☰" },
  { href: "/team", label: "Team & access", icon: "✉", superadmin: true },
];
export function Nav({ pending, role }: { pending: number | null; role: "superadmin" | "admin" }) {
  const path = usePathname();
  return (
    <nav className="side-nav" aria-label="Admin sections">
      {LINKS.filter((link) => !("superadmin" in link) || role === "superadmin").map((link) => {
        const active = link.href === "/" ? path === "/" : path.startsWith(link.href);
        const count = link.href === "/team" ? pending : null;
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
