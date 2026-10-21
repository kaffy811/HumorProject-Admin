import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { authUsers, profilesByIds, signedUrls } from "@/lib/data";
import { decideRequest } from "@/lib/request-actions";
import type { AccessRequest } from "@/lib/requests";
import { serviceClient } from "@/lib/supabase/service";
import { when } from "@/lib/format";
import { PersonLink } from "@/components/Person";
import { ConfirmButton } from "@/components/ConfirmButton";
export const metadata: Metadata = { title: "Access requests" };

export default async function Requests() {
  await requireAdmin();
  const db = serviceClient();
  const { data, error } = await db.from("humor_admin_requests").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) {
    return (
      <div>
        <Head />
        <div className="notice notice-warn">Access requests need the migration <span className="mono">202610210001_superadmin_requests.sql</span>. Run it in the Supabase SQL editor, then reload.</div>
      </div>
    );
  }
  const rows = (data ?? []) as AccessRequest[];
  const pending = rows.filter((r) => r.status === "pending");
  const history = rows.filter((r) => r.status !== "pending");
  const [people, accounts] = await Promise.all([
    profilesByIds(db, rows.flatMap((r) => [r.user_id, r.decided_by ?? ""])),
    authUsers(db),
  ]);
  const avatars = await signedUrls(db, "humor-avatars", pending.map((r) => people.get(r.user_id)?.avatar_path));
  const counts = new Map(await Promise.all(pending.map(async (r) => {
    const { count } = await db.from("humor_images").select("id", { count: "exact", head: true }).eq("user_id", r.user_id).eq("status", "ready");
    return [r.user_id, count ?? 0] as const;
  })));
  return (
    <div className="stack">
      <Head />
      <section className="stack" aria-label="Waiting for review">
        {pending.map((r) => {
          const profile = people.get(r.user_id) ?? null;
          const path = profile?.avatar_path;
          return (
            <div className="card" key={r.id} style={{ display: "grid", gap: 14 }}>
              <div className="notice-row">
                <PersonLink profile={profile} id={r.user_id} avatarUrl={path ? avatars[path] : undefined} />
                <span className="badge badge-warn">Waiting · {when(r.created_at)}</span>
              </div>
              <dl className="kv">
                <dt>Email</dt><dd>{accounts.get(r.user_id)?.email ?? "—"}</dd>
                <dt>Posts</dt><dd className="num">{counts.get(r.user_id) ?? 0}</dd>
                <dt>Message</dt><dd>{r.message ? <q>{r.message}</q> : <span className="muted">No message</span>}</dd>
              </dl>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <form action={decideRequest}>
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="approve" />
                  <ConfirmButton className="btn btn-good" message={`Make ${profile?.username ? "@" + profile.username : "this member"} a superadmin? They will see every user's data.`}>✓ Approve</ConfirmButton>
                </form>
                <form action={decideRequest}>
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="reject" />
                  <ConfirmButton className="btn btn-danger" message="Decline this request?">✕ Decline</ConfirmButton>
                </form>
              </div>
            </div>
          );
        })}
        {!pending.length && (
          <div className="card" style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static mascot */}
            <img src="/baby/wink.webp" alt="" width={64} height={64} />
            <p style={{ margin: 0, fontWeight: 700 }}>Inbox zero. Nobody is waiting for access.</p>
          </div>
        )}
      </section>
      <section className="card">
        <h2>Decisions</h2>
        <p className="sub">Latest 200 requests, newest first.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Member</th><th>Decision</th><th>Decided by</th><th>Requested</th><th>Decided</th></tr></thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td><PersonLink profile={people.get(r.user_id) ?? null} id={r.user_id} /></td>
                  <td>{r.status === "approved" ? <span className="badge badge-good">Approved</span> : <span className="badge badge-bad">Declined</span>}</td>
                  <td>{r.decided_by ? <PersonLink profile={people.get(r.decided_by) ?? null} id={r.decided_by} /> : "—"}</td>
                  <td className="muted">{when(r.created_at)}</td>
                  <td className="muted">{when(r.decided_at)}</td>
                </tr>
              ))}
              {!history.length && <tr><td colSpan={5} className="empty">No decisions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Head() {
  return (
    <header className="page-head" style={{ marginBottom: 0 }}>
      <div>
        <span className="eyebrow">Superadmin inbox</span>
        <h1>Access requests.</h1>
        <p>Members who signed in and asked to become superadmins. Approving gives them the full console, including every user&apos;s data.</p>
      </div>
    </header>
  );
}
