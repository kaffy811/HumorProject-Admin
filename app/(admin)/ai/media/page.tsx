import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { PAGE_SIZE, profilesByIds, signedUrls } from "@/lib/data";
import { candidatesOf } from "@/lib/ai-stats";
import { serviceClient } from "@/lib/supabase/service";
import { clampPage, handle, when } from "@/lib/format";
import { Pager } from "@/components/Pager";
export const metadata: Metadata = { title: "AI generated media" };

type Run = { id: string; image_id: string; user_id: string; image_path: string; model: string; caption_candidates: unknown; created_at: string };
// Photos the AI captioned, with what it wrote and whether a member published it.
export default async function AiMedia({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const page = clampPage((await searchParams).page);
  const db = serviceClient();
  const { data, count, error } = await db.from("humor_generations")
    .select("id,image_id,user_id,image_path,model,caption_candidates,created_at", { count: "exact" })
    .eq("status", "completed").order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const runs = (data ?? []) as Run[];
  const [urls, people, posts] = await Promise.all([
    signedUrls(db, "humor-images", runs.map((r) => r.image_path)),
    profilesByIds(db, runs.map((r) => r.user_id)),
    runs.length ? db.from("humor_captions").select("id,image_id,content,deleted_at").in("image_id", runs.map((r) => r.image_id)).eq("source", "ai") : { data: [] },
  ]);
  const postByImage = new Map(((posts.data ?? []) as { id: string; image_id: string; content: string; deleted_at: string | null }[]).map((p) => [p.image_id, p]));
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Read · view · AI output</span>
          <h1>AI generated media.</h1>
          <p>Every photo the AI captioned, newest first: the image, the captions it wrote, and the post a member published from it (if any). Images are private; previews are 10-minute signed links. Uploading, editing and deleting images happens in <Link href="/posts">Posts</Link>.</p>
        </div>
      </header>
      <div className="gallery">
        {runs.map((r) => {
          const post = postByImage.get(r.image_id);
          const captions = candidatesOf(r.caption_candidates);
          return (
            <article key={r.id} className="card gallery-item">
              <Link href={`/ai/runs/${r.id}`} aria-label="Open AI run">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
                {urls[r.image_path] ? <img src={urls[r.image_path]} alt="" className="gallery-image" /> : <span className="gallery-image" />}
              </Link>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {post ? <Link className={`badge ${post.deleted_at ? "badge-bad" : "badge-good"}`} href={`/posts/${post.id}`}>{post.deleted_at ? "Deleted post" : "Published"} →</Link> : <span className="badge">Not published</span>}
                <span className="muted mono" style={{ fontSize: 12 }}>{r.model}</span>
              </div>
              <p style={{ margin: 0, fontWeight: 700 }}>{post?.content ?? captions[0]?.original ?? "No captions recorded."}</p>
              {captions.length > 1 && <span className="muted" style={{ fontSize: 12 }}>+{captions.length - 1} other AI options</span>}
              <span className="muted" style={{ fontSize: 12 }}><Link href={`/users/${r.user_id}`}>{handle(people.get(r.user_id) ?? { id: r.user_id })}</Link> · {when(r.created_at)}</span>
            </article>
          );
        })}
      </div>
      {!runs.length && <p className="empty">No AI-captioned photos yet.</p>}
      <Pager page={page} total={count ?? 0} size={PAGE_SIZE} base="/ai/media" params={{}} />
    </div>
  );
}
