import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { serviceClient } from "@/lib/supabase/service";
import { CreatePost } from "@/components/CreatePost";
export const metadata: Metadata = { title: "New post" };
// Caption generation can try a configured model and then the built-in one.
export const maxDuration = 120;

export default async function NewPost() {
  await requireAdmin();
  const { count } = await serviceClient().from("profiles").select("id", { count: "exact", head: true }).eq("is_official", true);
  return (
    <div className="stack">
      <Link href="/posts" className="muted">← All posts</Link>
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">The camera roll deserves better</span>
          <h1>Make something funny.</h1>
          <p>The same steps members use on Create, publishing straight to the feed. Captions come from the model and prompt chosen under AI models &amp; prompts, exactly as for members.</p>
        </div>
      </header>
      <CreatePost hasOfficial={!!count} />
    </div>
  );
}
