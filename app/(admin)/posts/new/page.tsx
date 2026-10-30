import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { serviceClient } from "@/lib/supabase/service";
import { signedUrls } from "@/lib/data";
import { CreatePost } from "@/components/CreatePost";
export const metadata: Metadata = { title: "New post" };
// Caption generation can try a configured model and then the built-in one.
export const maxDuration = 120;

export default async function NewPost() {
  const admin = await requireAdmin();
  const db = serviceClient();
  const { data: profile } = await db.from("profiles").select("username,avatar_path").eq("id", admin.id).maybeSingle();
  const avatars = await signedUrls(db, "humor-avatars", [profile?.avatar_path]);
  return (
    <div className="stack">
      <Link href="/posts" className="muted">← All posts</Link>
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">The camera roll deserves better</span>
          <h1>Make something funny.</h1>
          <p>The same steps members use on Create, posted from your own account straight to the feed. Captions come from the model and prompt chosen under AI models &amp; prompts, exactly as for members.</p>
        </div>
      </header>
      <CreatePost me={{ username: profile?.username ?? admin.username ?? "you", avatarUrl: profile?.avatar_path ? avatars[profile.avatar_path] ?? null : null }} />
    </div>
  );
}
