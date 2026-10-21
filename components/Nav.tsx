"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const LINKS = [
  { href: "/", label: "Dashboard", icon: "◎" },
  { href: "/users", label: "Users", icon: "☺" },
  { href: "/media", label: "AI media", icon: "▣" },
  { href: "/votes", label: "Votes & ratings", icon: "♥" },
];
export function Nav() {
  const path = usePathname();
  return (
    <>
      {LINKS.map((link) => {
        const active = link.href === "/" ? path === "/" : path.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} className="nav-link" aria-current={active ? "page" : undefined}>
            <span aria-hidden="true" style={{ width: 16, textAlign: "center" }}>{link.icon}</span>
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
