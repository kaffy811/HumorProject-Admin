import type { Metadata } from "next";
import Link from "next/link";
import { RequestAccess } from "@/components/RequestAccess";
import { googleMember, latestRequest } from "@/lib/requests";
import { when } from "@/lib/format";
export const metadata: Metadata = { title: "Access denied" };
const COPY: Record<string, string> = {
  forbidden: "You're signed in, but this account isn't a superadmin yet.",
  "not-google": "Only Google sign-in is accepted here. Sign out and continue with Google.",
  unavailable: "Admin permissions could not be checked, so access is closed. Try again shortly.",
};
export default async function Denied({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason = "forbidden" } = await searchParams;
  const user = reason === "unavailable" ? null : await googleMember();
  const { request, ready } = user ? await latestRequest(user.id) : { request: null, ready: false };
  return (
    <main className="login">
      <div className="card login-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- static mascot */}
        <img className="login-mascot" src={request?.status === "pending" ? "/baby/thinking.webp" : "/baby/pout.webp"} alt="" />
        <span className="badge badge-bad" style={{ justifySelf: "center" }}>Superadmins only</span>
        <h1>Nice try, bestie.</h1>
        <p className="muted" style={{ margin: 0 }}>{COPY[reason] ?? COPY.forbidden}</p>
        {user?.email && <p style={{ margin: 0, fontSize: 13 }}>Signed in as <b>{user.email}</b></p>}
        {user && reason === "forbidden" && (
          request?.status === "pending" ? (
            <div className="notice notice-warn">Request sent {when(request.created_at)}. You&apos;ll get in as soon as a superadmin approves it — just come back and reload.</div>
          ) : request?.status === "approved" ? (
            <div className="notice notice-good">Approved! <Link href="/">Open the console →</Link></div>
          ) : (
            <>
              {request?.status === "rejected" && <div className="notice notice-bad">Your last request was declined {when(request.decided_at)}.</div>}
              {ready || !request ? <RequestAccess again={request?.status === "rejected"} /> : null}
            </>
          )
        )}
        <form action="/auth/signout" method="post">
          <button className="btn" type="submit">Sign out</button>
        </form>
      </div>
    </main>
  );
}
