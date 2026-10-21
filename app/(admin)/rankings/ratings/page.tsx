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
          <span className="eyebrow">Rankings &amp; votes</span>
          <h1>Post scores.</h1>
          <p>Every live post with its vote totals. Sort by Ha, net score (Ha − downvotes), Ha per day since posting, confidence (a fair share-of-positive-votes score that does not over-reward posts with very few votes) or comments.</p>
        </div>
      </header>
      <RankTabs current="/rankings/ratings" />
      <Ratings page={clampPage(params.page)} sort={text(params.sort)} />
    </div>
  );
}
