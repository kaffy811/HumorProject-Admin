import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { PROFILE_COLUMNS, signedUrls } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/service";
import { day, fullName, handle, n, when } from "@/lib/format";
import type { ProfileRow } from "@/lib/stats";
import { recentActivity } from "@/lib/activity-data";
import { CATEGORIES, describe, detailText } from "@/lib/activity";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = serviceClient();
  const { data: profile } = await db.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle<ProfileRow>();
  if (!profile) notFound();
  const count = (table: string, column: string, extra?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const q = base(table).eq(column, id);
    return extra ? extra(q) : q;
  };
  function base(table: string) { return db.from(table).select("*", { count: "exact", head: true }); }
  const [{ data: auth }, images, given, comments, hearts, generations] = await Promise.all([
    db.auth.admin.getUserById(id),
    db.from("humor_images").select("id,storage_path,status,created_at,humor_captions(id,content,style,deleted_at,created_at)").eq("user_id", id).order("created_at", { ascending: false }).limit(60),
    count("humor_votes", "user_id", (q) => q.eq("value", 1)),
    count("humor_comments", "user_id", (q) => q.is("deleted_at", null)),
    count("humor_comment_votes", "user_id"),
    count("humor_generations", "user_id"),
  ]);
  type Img = { id: string; storage_path: string | null; status: string; created_at: string; humor_captions: { id: string; content: string; style: string; deleted_at: string | null; created_at: string }[] };
  const rows = (images.data ?? []) as Img[];
  const posts = rows.flatMap((image) => image.humor_captions.map((caption) => ({ ...caption, image })));
  const haCounts = new Map<string, number>();
  await Promise.all(posts.map(async (post) => {
    const { count: c } = await db.from("humor_votes").select("id", { count: "exact", head: true }).eq("caption_id", post.id).eq("value", 1);
    haCounts.set(post.id, c ?? 0);
  }));
  const [urls, avatar, activity] = await Promise.all([
    signedUrls(db, "humor-images", rows.map((row) => row.storage_path)),
    signedUrls(db, "humor-avatars", [profile.avatar_path]),
    recentActivity(id),
  ]);
  const user = auth?.user;
  const received = [...haCounts.values()].reduce((a, b) => a + b, 0);
  return (
    <div className="stack">
      <Link href="/users" className="muted">← All users</Link>
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div className="who-cell" style={{ gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
          {profile.avatar_path && avatar[profile.avatar_path] ? <img src={avatar[profile.avatar_path]} alt="" className="avatar" style={{ width: 64, height: 64 }} /> : <span className="avatar" style={{ width: 64, height: 64, fontSize: 22 }}>{handle(profile).slice(1, 2).toUpperCase()}</span>}
          <div>
            <h1>{handle(profile)}</h1>
            <p>{fullName(profile) || "No name yet"} · joined {day(profile.created_at)}</p>
          </div>
        </div>
        <span style={{ display: "flex", gap: 6 }}>
          {profile.is_superadmin && <span className="badge badge-brand">Superadmin</span>}
          {profile.is_official && <span className="badge">Official</span>}
          {profile.onboarded_at ? <span className="badge badge-good">Onboarded</span> : <span className="badge badge-warn">Onboarding incomplete</span>}
        </span>
      </header>
      <section className="grid grid-kpi">
        {[["Posts", posts.filter((p) => !p.deleted_at).length], ["Ha received", received], ["Ha given", given.count ?? 0], ["Comments", comments.count ?? 0], ["Comment hearts given", hearts.count ?? 0], ["Gemini runs", generations.count ?? 0]].map(([label, value]) => (
          <div className="card kpi" key={label as string}><span className="eyebrow">{label}</span><div className="value num">{n(value as number)}</div></div>
        ))}
      </section>
      <section className="grid grid-2">
        <div className="card">
          <h2>Profile record</h2>
          <p className="sub">public.profiles</p>
          <dl className="kv">
            <dt>ID</dt><dd className="mono">{profile.id}</dd>
            <dt>Username</dt><dd>{profile.username ?? "—"}</dd>
            <dt>First name</dt><dd>{profile.first_name ?? "—"}</dd>
            <dt>Last name</dt><dd>{profile.last_name ?? "—"}</dd>
            <dt>Display name</dt><dd>{profile.display_name ?? "—"}</dd>
            <dt>Avatar path</dt><dd className="mono">{profile.avatar_path ?? "—"}</dd>
            <dt>Onboarded</dt><dd>{when(profile.onboarded_at)}</dd>
            <dt>is_superadmin</dt><dd className="mono">{String(profile.is_superadmin)}</dd>
            <dt>is_official</dt><dd className="mono">{String(profile.is_official)}</dd>
          </dl>
        </div>
        <div className="card">
          <h2>Auth account</h2>
          <p className="sub">auth.users</p>
          <dl className="kv">
            <dt>Email</dt><dd>{user?.email ?? "—"}</dd>
            <dt>Providers</dt><dd>{((user?.app_metadata?.providers as string[] | undefined) ?? []).join(", ") || "—"}</dd>
            <dt>Created</dt><dd>{when(user?.created_at)}</dd>
            <dt>Last sign-in</dt><dd>{when(user?.last_sign_in_at)}</dd>
            <dt>Email confirmed</dt><dd>{when(user?.email_confirmed_at)}</dd>
            <dt>Banned until</dt><dd>{user?.banned_until ? when(user.banned_until) : "—"}</dd>
          </dl>
        </div>
      </section>
      <section className="card">
        <div className="notice-row">
          <div><h2>Recent activity</h2><p className="sub" style={{ margin: 0 }}>Latest 25 actions by this member.</p></div>
          <Link className="btn" href={`/activity?user=${id}&range=all`}>Full log →</Link>
        </div>
        {activity === null ? <p className="empty">Activity logging is not set up yet (migration 202610220002).</p> : activity.length ? (
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table>
              <thead><tr><th>When</th><th>Category</th><th>What</th><th>Details</th></tr></thead>
              <tbody>
                {activity.map((r) => (
                  <tr key={r.id}>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{when(r.created_at)}</td>
                    <td><span className="badge">{CATEGORIES[r.category] ?? r.category}</span></td>
                    <td>{r.post_id && r.action !== "purge" ? <Link href={`/posts/${r.post_id}`}><b>{describe(r.action)}</b></Link> : <b>{describe(r.action)}</b>}{r.via === "admin" && <> <span className="badge badge-brand">via admin</span></>}</td>
                    <td className="muted"><span className="clip">{detailText(r.action, r.detail)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">No activity recorded.</p>}
      </section>
      <section className="card">
        <h2>Posts</h2>
        <p className="sub">Latest 60 uploads by this member, including deleted ones.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Image</th><th>Caption</th><th>Style</th><th className="r">Ha</th><th>Status</th><th>Posted</th></tr></thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
                  <td>{post.image.storage_path && urls[post.image.storage_path] ? <img className="thumb" src={urls[post.image.storage_path]} alt="" /> : <span className="thumb" />}</td>
                  <td><Link href={`/posts/${post.id}`} className="clip">{post.content}</Link></td>
                  <td>{post.style}</td>
                  <td className="r num">{n(haCounts.get(post.id) ?? 0)}</td>
                  <td>{post.deleted_at ? <span className="badge badge-bad">Deleted</span> : <span className="badge badge-good">Live</span>}</td>
                  <td className="muted">{when(post.created_at)}</td>
                </tr>
              ))}
              {!posts.length && <tr><td colSpan={6} className="empty">No posts.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
