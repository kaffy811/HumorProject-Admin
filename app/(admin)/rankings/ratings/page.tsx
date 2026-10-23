import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { clampPage, text } from "@/lib/format";
import { RankTabs } from "@/components/RankTabs";
import { Ratings } from "@/components/VoteTables";
export const metadata: Metadata = { title: "Post scores" };
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; sort?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Rankings</span>
          <h1>Post scores.</h1>
          <p>Every live post with its vote totals. Sort by likes, dislikes, net score (likes − dislikes), likes per day since posting, confidence (a fair share-of-positive-votes score that does not over-reward posts with very few votes) or comments. Who voted on a post: open it, or filter the activity log by “Liked a post” or “Disliked a post”.</p>
        </div>
      </header>
      <RankTabs current="/rankings/ratings" />
      <Ratings page={clampPage(params.page)} sort={text(params.sort)} />
    </div>
  );
}
