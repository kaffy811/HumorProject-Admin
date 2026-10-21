import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { authUsers, PAGE_SIZE, PROFILE_COLUMNS, searchTerm, signedUrls } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/service";
import { clampPage, day, n, text, when } from "@/lib/format";
import type { ProfileRow } from "@/lib/stats";
import { PersonLink } from "@/components/Person";
import { Pager } from "@/components/Pager";
export const metadata: Metadata = { title: "Users" };

type Search = Promise<{ q?: string; role?: string; page?: string }>;
export default async function Users({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const params = await searchParams;
  const q = searchTerm(text(params.q));
  const role = ["superadmin", "official", "incomplete"].includes(text(params.role)) ? text(params.role) : "";
  const page = clampPage(params.page);
  const db = serviceClient();
  let query = db.from("profiles").select(PROFILE_COLUMNS, { count: "exact" }).order("created_at", { ascending: false });
  if (q) query = query.or(`username.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,display_name.ilike.%${q}%`);
  if (role === "superadmin") query = query.eq("is_superadmin", true);
  if (role === "official") query = query.eq("is_official", true);
  if (role === "incomplete") query = query.is("onboarded_at", null);
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ProfileRow[];
  const ids = rows.map((row) => row.id);
  const [auth, avatars, counts] = await Promise.all([
    authUsers(db),
    signedUrls(db, "humor-avatars", rows.map((row) => row.avatar_path)),
    Promise.all(ids.map(async (id) => {
      const [posts, given] = await Promise.all([
        db.from("humor_images").select("id", { count: "exact", head: true }).eq("user_id", id).eq("status", "ready"),
        db.from("humor_votes").select("id", { count: "exact", head: true }).eq("user_id", id).eq("value", 1),
      ]);
      return [id, { posts: posts.count ?? 0, given: given.count ?? 0 }] as const;
    })),
  ]);
  const tally = new Map(counts);
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Read only</span>
          <h1>Users &amp; profiles</h1>
          <p>Every account in the shared database. Emails and sign-in history come from Supabase Auth; profile fields from <span className="mono">public.profiles</span>.</p>
        </div>
      </header>
      <form className="toolbar" role="search">
        <input className="input" name="q" defaultValue={q} placeholder="Search username or name" aria-label="Search users" />
        <select className="select" name="role" defaultValue={role} aria-label="Filter">
          <option value="">All accounts</option>
          <option value="superadmin">Superadmins</option>
          <option value="official">Official accounts</option>
          <option value="incomplete">Onboarding incomplete</option>
        </select>
        <button className="btn" type="submit">Apply</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Member</th><th>Email</th><th>Status</th><th className="r">Posts</th><th className="r">Ha given</th><th>Joined</th><th>Last sign-in</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const account = auth.get(row.id);
              return (
                <tr key={row.id}>
                  <td>
                    <PersonLink profile={row} id={row.id} avatarUrl={row.avatar_path ? avatars[row.avatar_path] : undefined} />
                  </td>
                  <td className="muted">{account?.email ?? "—"}</td>
                  <td>
                    <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {row.is_superadmin && <span className="badge badge-brand">Superadmin</span>}
                      {row.is_official && <span className="badge">Official</span>}
                      {row.onboarded_at ? <span className="badge badge-good">Onboarded</span> : <span className="badge badge-warn">Incomplete</span>}
                      {account?.banned && <span className="badge badge-bad">Banned</span>}
                    </span>
                  </td>
                  <td className="r num">{n(tally.get(row.id)?.posts ?? 0)}</td>
                  <td className="r num">{n(tally.get(row.id)?.given ?? 0)}</td>
                  <td className="muted">{day(row.created_at)}</td>
                  <td className="muted">{when(account?.lastSignIn)}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="empty">No users match.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={count ?? 0} size={PAGE_SIZE} base="/users" params={{ q, role }} />
    </div>
  );
}
