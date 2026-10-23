import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin";
import { authUsers, profilesByIds, signedUrls } from "@/lib/data";
import { decideRequest } from "@/lib/request-actions";
import type { AccessRequest } from "@/lib/requests";
import type { ProfileRow } from "@/lib/stats";
import { serviceClient } from "@/lib/supabase/service";
import { handle, when } from "@/lib/format";
import { PersonLink } from "@/components/Person";
import { ConfirmButton } from "@/components/ConfirmButton";
import { RemoveAdmin } from "@/components/RemoveAdmin";
export const metadata: Metadata = { title: "Team & access" };

export default async function Team() {
  const me = await requireSuperadmin();
  const db = serviceClient();
  const [requests, team, accounts] = await Promise.all([
    db.from("humor_admin_requests").select("*").order("created_at", { ascending: false }).limit(200),
    db.from("profiles").select("*").or("is_superadmin.eq.true,is_admin.eq.true"),
    authUsers(db),
  ]);
  const rolesReady = !team.error;
  const rows = (requests.data ?? []) as AccessRequest[];
  const pending = rows.filter((r) => r.status === "pending");
  const history = rows.filter((r) => r.status !== "pending");
  const members = ((team.data ?? []) as ProfileRow[]).sort((a, b) => Number(b.is_superadmin) - Number(a.is_superadmin) || (a.username ?? "").localeCompare(b.username ?? ""));
  const people = await profilesByIds(db, rows.flatMap((r) => [r.user_id, r.decided_by ?? ""]));
  const avatars = await signedUrls(db, "humor-avatars", [...pending.map((r) => people.get(r.user_id)?.avatar_path), ...members.map((m) => m.avatar_path)]);
  const posts = new Map(await Promise.all(pending.map(async (r) => {
    const { count } = await db.from("humor_images").select("id", { count: "exact", head: true }).eq("user_id", r.user_id).eq("status", "ready");
    return [r.user_id, count ?? 0] as const;
  })));
  const avatar = (p: ProfileRow | null | undefined) => (p?.avatar_path ? avatars[p.avatar_path] : undefined);
  return (
    <div className="stack">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Superadmins only</span>
          <h1>Team &amp; access.</h1>
          <p><b>Superadmins</b> own the console: they approve requests and add or remove admins. <b>Admins</b> can use everything else — posts, users, AI, rankings and the activity log. When someone leaves, remove their admin role here; they lose access on their next click.</p>
        </div>
      </header>
      {!rolesReady && <div className="notice notice-warn">Admin roles need the migration <span className="mono">202610230001_admin_roles.sql</span>. Run it in the Supabase SQL editor, then reload.</div>}
      {requests.error && <div className="notice notice-warn">Access requests need the migration <span className="mono">202610210001_superadmin_requests.sql</span>.</div>}

      <section className="stack" aria-label="Waiting for review">
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)" }}>Requests {pending.length > 0 && <span className="nav-count" style={{ marginLeft: 6 }}>{pending.length}</span>}</h2>
        {pending.map((r) => {
          const profile = people.get(r.user_id) ?? null;
          return (
            <div className="card" key={r.id} style={{ display: "grid", gap: 14 }}>
              <div className="notice-row">
                <PersonLink profile={profile} id={r.user_id} avatarUrl={avatar(profile)} />
                <span className="badge badge-warn">Waiting · {when(r.created_at)}</span>
              </div>
              <dl className="kv">
                <dt>Email</dt><dd>{accounts.get(r.user_id)?.email ?? "—"}</dd>
                <dt>Posts</dt><dd className="num">{posts.get(r.user_id) ?? 0}</dd>
                <dt>Message</dt><dd>{r.message ? <q>{r.message}</q> : <span className="muted">No message</span>}</dd>
              </dl>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <form action={decideRequest}>
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="approve" />
                  <ConfirmButton className="btn btn-good" message={`Make ${handle(profile ?? { id: r.user_id })} an admin? They will see every user's data. You can remove them later.`}>✓ Approve as admin</ConfirmButton>
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
            <img src="/baby/wink.webp" alt="" width={56} height={56} />
            <p style={{ margin: 0, fontWeight: 700 }}>Inbox zero. Nobody is waiting for access.</p>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Current team</h2>
        <p className="sub">Everyone who can open this console.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td><PersonLink profile={m} id={m.id} avatarUrl={avatar(m)} /></td>
                  <td className="muted">{accounts.get(m.id)?.email ?? "—"}</td>
                  <td>{m.is_superadmin ? <span className="badge badge-brand">Superadmin</span> : <span className="badge">Admin</span>}{m.id === me.id && <span className="muted"> · you</span>}</td>
                  <td className="muted">{when(accounts.get(m.id)?.lastSignIn)}</td>
                  <td className="r">
                    {m.is_superadmin
                      ? <span className="muted" style={{ fontSize: 12 }} title="Change superadmins in the Supabase SQL editor">Owner role · SQL only</span>
                      : <RemoveAdmin id={m.id} name={handle(m)} />}
                  </td>
                </tr>
              ))}
              {!members.length && <tr><td colSpan={5} className="empty">No team members found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="notice-row">
          <div><h2>Decisions</h2><p className="sub" style={{ margin: 0 }}>Requests you or other superadmins decided. Role removals are in the activity log.</p></div>
          <Link className="btn" href="/activity?action=cat:admin">Admin activity →</Link>
        </div>
        <div className="table-wrap" style={{ marginTop: 14 }}>
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
