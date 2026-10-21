import Link from "next/link";
import { Nav } from "@/components/Nav";
import { requireAdmin } from "@/lib/admin";
import { pendingRequestCount } from "@/lib/requests";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [admin, pending] = await Promise.all([requireAdmin(), pendingRequestCount()]);
  return (
    <div className="shell">
      <aside className="side">
        <Link href="/" className="brand">
          <span className="brand-mark">h.</span>
          <span>Humor Admin<small>Superadmin console</small></span>
        </Link>
        <Nav pending={pending} />
        <div className="side-foot">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mascot */}
          <img className="side-mascot" src="/baby/smug.webp" alt="" />
          <span className="who">{admin.email ?? admin.username ?? admin.id}</span>
          <form action="/auth/signout" method="post">
            <button className="btn" type="submit" style={{ width: "100%" }}>Sign out</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
