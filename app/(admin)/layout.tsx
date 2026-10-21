import Link from "next/link";
import { Nav } from "@/components/Nav";
import { requireAdmin } from "@/lib/admin";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="shell">
      <aside className="side">
        <Link href="/" className="brand">
          <span className="brand-mark">Ha</span>
          <span>Humor Admin<small>Superadmin console</small></span>
        </Link>
        <Nav />
        <div className="side-foot">
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
