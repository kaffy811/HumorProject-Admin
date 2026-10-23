import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { PAGE_SIZE, profilesByIds, searchTerm } from "@/lib/data";
import { activityPage } from "@/lib/activity-data";
import { ACTIONS, CATEGORIES, describe, detailText } from "@/lib/activity";
import { clampPage, n, nyLocalToIso, text, when } from "@/lib/format";
import { PersonLink } from "@/components/Person";
import { Pager } from "@/components/Pager";
export const metadata: Metadata = { title: "Activity log" };

type Search = Promise<{ action?: string; user?: string; q?: string; from?: string; to?: string; page?: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Activity({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const params = await searchParams;
  // One dropdown: "" = everything, "cat:<category>" = a whole category, else one action.
  const pick = text(params.action);
  const category = pick.startsWith("cat:") && pick.slice(4) in CATEGORIES ? pick.slice(4) : "";
  const action = pick in ACTIONS ? pick : "";
  const selected = category ? `cat:${category}` : action;
  const from = text(params.from), to = text(params.to);
  const fromIso = nyLocalToIso(from), toIso = nyLocalToIso(to);
  const q = searchTerm(text(params.q));
  const user = UUID.test(text(params.user)) ? text(params.user) : "";
  const page = clampPage(params.page);
  const result = await activityPage({ category, action, from: fromIso, to: toIso, q, user, page });
  if (!result) {
    return (
      <div>
        <Head />
        <div className="notice notice-warn">The activity log needs the migration <span className="mono">202610220002_activity_log.sql</span>. Run it in the Supabase SQL editor, then reload.</div>
      </div>
    );
  }
  const { rows, total, db } = result;
  const people = await profilesByIds(db, rows.flatMap((r) => [r.actor_id ?? "", typeof r.detail.ownerId === "string" ? r.detail.ownerId : "", typeof r.detail.memberId === "string" ? r.detail.memberId : ""]));
  const link = (extra: Record<string, string>) => `/activity?${new URLSearchParams(Object.entries({ from, to, q, user, action: selected, ...extra }).filter(([, v]) => v))}`;
  return (
    <div>
      <Head />
      <form className="log-filters" role="search">
        {user && <input type="hidden" name="user" value={user} />}
        <div className="field">
          <label htmlFor="action">Action</label>
          <select id="action" className="select" name="action" defaultValue={selected}>
            <option value="">All actions</option>
            {Object.entries(CATEGORIES).map(([key, label]) => (
              <optgroup key={key} label={label}>
                <option value={`cat:${key}`}>All {label.toLowerCase()}</option>
                {Object.keys(ACTIONS).filter((a) => ACTION_CATEGORY[a] === key).map((a) => <option key={a} value={a}>{describe(a)}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" className="input" type="datetime-local" name="from" defaultValue={from} max={to || undefined} />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" className="input" type="datetime-local" name="to" defaultValue={to} min={from || undefined} />
        </div>
        {!user && (
          <div className="field">
            <label htmlFor="q">Member</label>
            <input id="q" className="input" name="q" defaultValue={q} placeholder="Name or username" />
          </div>
        )}
        <div className="log-filter-actions">
          <button className="btn btn-primary" type="submit">Apply</button>
          {(selected || from || to || q || user) && <Link className="btn" href="/activity">Clear</Link>}
        </div>
      </form>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: 12.5 }}>
        {n(total)} {total === 1 ? "entry" : "entries"}
        {user && <> by <b>{people.get(user)?.username ? `@${people.get(user)!.username}` : "this member"}</b></>}
        {from || to ? <> · {from ? from.replace("T", " ") : "beginning"} → {to ? to.replace("T", " ") : "now"} (New York time)</> : " · all time"}
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Category</th><th>What happened</th><th>Details</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const owner = typeof r.detail.ownerId === "string" ? r.detail.ownerId : null;
              const member = typeof r.detail.memberId === "string" ? r.detail.memberId : null;
              return (
                <tr key={r.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{when(r.created_at)}</td>
                  <td>{r.actor_id ? <PersonLink profile={people.get(r.actor_id) ?? null} id={r.actor_id} /> : <span className="muted">System</span>}</td>
                  <td><Link className="badge" href={link({ action: `cat:${r.category}`, page: "" })}>{CATEGORIES[r.category] ?? r.category}</Link></td>
                  <td>
                    <b>{describe(r.action)}</b>
                    {r.via === "admin" && <> <span className="badge badge-brand">via admin</span></>}
                    {r.detail.backfilled === true && <> <span className="badge" title="Reconstructed from existing data when logging started">history</span></>}
                    {owner && <div className="muted" style={{ fontSize: 12 }}>{r.category === "admin" || r.category === "profile" ? "for" : "on"} {people.get(owner)?.username ? `@${people.get(owner)!.username}` : "a member"}{r.category === "admin" || r.category === "profile" ? "" : "\u2019s post"}</div>}
                    {member && <div className="muted" style={{ fontSize: 12 }}>for {people.get(member)?.username ? `@${people.get(member)!.username}` : "a member"}</div>}
                  </td>
                  <td className="muted"><span className="clip">{detailText(r.action, r.detail)}</span></td>
                  <td>{r.post_id && r.action !== "purge" ? <Link className="btn" href={`/posts/${r.post_id}`}>Post →</Link> : r.category === "ai" && r.target_id ? <Link className="btn" href={`/ai/runs/${r.target_id}`}>Run →</Link> : null}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} className="empty">Nothing matches these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} size={PAGE_SIZE} base="/activity" params={{ from, to, q, user, action: selected }} />
    </div>
  );
}

const ACTION_CATEGORY: Record<string, string> = {
  login: "auth", logout: "auth", signup: "auth", admin_login: "auth",
  upload: "post", publish: "post", edit: "post", delete: "post", restore: "post", purge: "post",
  generate: "ai", generate_failed: "ai",
  like: "reaction", unlike: "reaction", dislike: "reaction", undislike: "reaction", heart: "reaction", unheart: "reaction",
  comment: "comment", reply: "comment", delete_comment: "comment",
  save: "save", unsave: "save", report_post: "report", report_comment: "report",
  onboard: "profile", update_profile: "profile",
  request_superadmin: "admin", approve_request: "admin", reject_request: "admin", grant_superadmin: "admin", revoke_superadmin: "admin", grant_admin: "admin", revoke_admin: "admin",
};

function Head() {
  return (
    <header className="page-head">
      <div>
        <span className="eyebrow">Activity log · every action, recorded by the database</span>
        <h1>Who did what, when.</h1>
        <p>Sign-ins, posts, AI generations, likes and dislikes, comments, saves, reports, profile changes and admin decisions — from the member site and this console alike. Rows marked “history” were reconstructed from existing data when logging started.</p>
      </div>
    </header>
  );
}
