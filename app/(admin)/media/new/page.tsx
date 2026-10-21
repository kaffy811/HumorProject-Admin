import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { serviceClient } from "@/lib/supabase/service";
import { MediaForm } from "@/components/MediaForm";
export const metadata: Metadata = { title: "New media" };
export default async function NewMedia() {
  await requireAdmin();
  const { count } = await serviceClient().from("profiles").select("id", { count: "exact", head: true }).eq("is_official", true);
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <Link href="/media" className="muted">← All media</Link>
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Create</span>
          <h1>New AI media post</h1>
          <p>Publishes straight to the member feed: an image in private Storage plus its caption.</p>
        </div>
      </header>
      <div className="card"><MediaForm hasOfficial={!!count} /></div>
    </div>
  );
}
