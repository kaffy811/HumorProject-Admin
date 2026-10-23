import Link from "next/link";
import { Nav } from "@/components/Nav";
import { requireAdmin } from "@/lib/admin";
import { pendingRequestCount } from "@/lib/requests";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const pending = admin.role === "superadmin" ? await pendingRequestCount() : null;
  return (
    <div className="shell">
      <aside className="side">
        <Link href="/" className="brand">
          <span className="brand-mark">h.</span>
          <span>Humor Admin<small>{admin.role === "superadmin" ? "Superadmin" : "Admin"} console</small></span>
        </Link>
        <Nav pending={pending} role={admin.role} />
        <div className="side-foot">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mascot */}
          <img className="side-mascot" src="/baby/smug.webp" alt="" />
          <span className="who" style={{ display: "grid", gap: 6, justifyItems: "start" }}><span className={`badge${admin.role === "superadmin" ? " badge-brand" : ""}`}>{admin.role}</span>{admin.email ?? admin.username ?? admin.id}</span>
          <form action="/auth/signout" method="post">
            <button className="btn" type="submit" style={{ width: "100%" }}>Sign out</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
