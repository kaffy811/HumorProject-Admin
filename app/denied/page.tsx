import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
export const metadata: Metadata = { title: "Access denied" };
const COPY: Record<string, string> = {
  forbidden: "This Google account is signed in, but its profile is not a superadmin.",
  "not-google": "Only Google sign-in is accepted here. Sign out and continue with Google.",
  unavailable: "Admin permissions could not be checked, so access is closed. Try again shortly.",
};
export default async function Denied({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason = "forbidden" } = await searchParams;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  return (
    <main className="login">
      <div className="card login-card">
        <span className="badge badge-bad" style={{ justifySelf: "center" }}>403 · Superadmins only</span>
        <h1 style={{ margin: 0, fontSize: 22 }}>You can&apos;t open the admin console</h1>
        <p className="muted" style={{ margin: 0 }}>{COPY[reason] ?? COPY.forbidden}</p>
        {user?.email && (
          <p style={{ margin: 0, fontSize: 13 }}>
            Signed in as <b>{user.email}</b>. A database owner can grant access with <span className="mono">npm run grant-superadmin -- {user.email}</span>.
          </p>
        )}
        <form action="/auth/signout" method="post">
          <button className="btn" type="submit">Sign out</button>
        </form>
      </div>
    </main>
  );
}
