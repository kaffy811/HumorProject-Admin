import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { serviceClient } from "@/lib/supabase/service";
import { MediaForm } from "@/components/MediaForm";
export const metadata: Metadata = { title: "New post" };
export default async function NewMedia() {
  await requireAdmin();
  const { count } = await serviceClient().from("profiles").select("id", { count: "exact", head: true }).eq("is_official", true);
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <Link href="/posts" className="muted">← All posts</Link>
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Create</span>
          <h1>New post.</h1>
          <p>Publishes straight to the member feed: an image in private Storage plus its caption. Pick the source that matches who wrote the caption.</p>
        </div>
      </header>
      <div className="card"><MediaForm hasOfficial={!!count} /></div>
    </div>
  );
}
