import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { PAGE_SIZE, profilesByIds, searchTerm } from "@/lib/data";
import { activityPage } from "@/lib/activity-data";
import { ACTIONS, CATEGORIES, describe, detailText, RANGES } from "@/lib/activity";
import { clampPage, n, text, when } from "@/lib/format";
import { PersonLink } from "@/components/Person";
import { Pager } from "@/components/Pager";
export const metadata: Metadata = { title: "Activity log" };

type Search = Promise<{ category?: string; action?: string; user?: string; q?: string; range?: string; page?: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Activity({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const params = await searchParams;
  const category = text(params.category) in CATEGORIES ? text(params.category) : "";
  const action = text(params.action) in ACTIONS ? text(params.action) : "";
  const range = text(params.range) in RANGES ? text(params.range) : "7d";
  const q = searchTerm(text(params.q));
  const user = UUID.test(text(params.user)) ? text(params.user) : "";
  const page = clampPage(params.page);
  const result = await activityPage({ category, action, range, q, user, page });
  if (!result) {
    return (
      <div>
        <Head />
        <div className="notice notice-warn">The activity log needs the migration <span className="mono">202610220002_activity_log.sql</span>. Run it in the Supabase SQL editor, then reload.</div>
      </div>
    );
  }
  const { rows, total, counts, db } = result;
  const people = await profilesByIds(db, rows.flatMap((r) => [r.actor_id ?? "", typeof r.detail.ownerId === "string" ? r.detail.ownerId : "", typeof r.detail.memberId === "string" ? r.detail.memberId : ""]));
  const link = (extra: Record<string, string>) => `/activity?${new URLSearchParams(Object.entries({ range, q, user, category, action, ...extra }).filter(([, v]) => v))}`;
  const actionsInCategory = Object.keys(ACTIONS).filter((a) => !category || ACTION_CATEGORY[a] === category);
  return (
    <div>
      <Head />
      <nav className="tabs" aria-label="Categories">
        {counts.map(([key, count]) => (
          <Link key={key || "all"} className="tab" href={link({ category: key, action: "", page: "" })} aria-current={category === key ? "page" : undefined}>
            {key ? CATEGORIES[key] : "Everything"} <span className="muted num">{n(count)}</span>
          </Link>
        ))}
      </nav>
      <form className="toolbar" role="search">
        {category && <input type="hidden" name="category" value={category} />}
        {user && <input type="hidden" name="user" value={user} />}
        {!user && <input className="input" name="q" defaultValue={q} placeholder="Member name or username" aria-label="Member" />}
        <select className="select" name="action" defaultValue={action} aria-label="Action">
          <option value="">All actions</option>
          {actionsInCategory.map((a) => <option key={a} value={a}>{describe(a)}</option>)}
        </select>
        <select className="select" name="range" defaultValue={range} aria-label="Time range">
          {Object.entries(RANGES).map(([key, r]) => <option key={key} value={key}>{r.label}</option>)}
        </select>
        <button className="btn" type="submit">Apply</button>
        {user && <Link className="btn" href={link({ user: "" })}>✕ {people.get(user)?.username ? `@${people.get(user)!.username}` : "This member"}</Link>}
      </form>
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
                  <td><Link className="badge" href={link({ category: r.category, action: "", page: "" })}>{CATEGORIES[r.category] ?? r.category}</Link></td>
                  <td>
                    <b>{describe(r.action)}</b>
                    {r.via === "admin" && <> <span className="badge badge-brand">via admin</span></>}
                    {r.detail.backfilled === true && <> <span className="badge" title="Reconstructed from existing data when logging started">history</span></>}
                    {owner && <div className="muted" style={{ fontSize: 12 }}>on {people.get(owner)?.username ? `@${people.get(owner)!.username}` : "a member"}&apos;s post</div>}
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
      <Pager page={page} total={total} size={PAGE_SIZE} base="/activity" params={{ range, q, user, category, action }} />
    </div>
  );
}

const ACTION_CATEGORY: Record<string, string> = {
  login: "auth", logout: "auth", signup: "auth", admin_login: "auth",
  upload: "post", publish: "post", edit: "post", delete: "post", restore: "post", purge: "post",
  generate: "ai", generate_failed: "ai",
  ha: "reaction", unha: "reaction", downvote: "reaction", heart: "reaction", unheart: "reaction",
  comment: "comment", reply: "comment", delete_comment: "comment",
  save: "save", unsave: "save", report_post: "report", report_comment: "report",
  onboard: "profile", update_profile: "profile",
  request_superadmin: "admin", approve_request: "admin", reject_request: "admin", grant_superadmin: "admin", revoke_superadmin: "admin",
};

function Head() {
  return (
    <header className="page-head">
      <div>
        <span className="eyebrow">Activity log · every action, recorded by the database</span>
        <h1>Who did what, when.</h1>
        <p>Sign-ins, posts, AI generations, Ha, comments, saves, reports, profile changes and admin decisions — from the member site and this console alike. Rows marked “history” were reconstructed from existing data when logging started.</p>
      </div>
    </header>
  );
}
