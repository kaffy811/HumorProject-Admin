import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { clampPage, text } from "@/lib/format";
import { RankTabs } from "@/components/RankTabs";
import { HaVotes } from "@/components/VoteTables";
export const metadata: Metadata = { title: "Ha votes" };
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; value?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Rankings &amp; votes · read only</span>
          <h1>Ha votes.</h1>
          <p>Every vote on a post, newest first: who voted, on which post, when. Rows in <span className="mono">humor_votes</span> (+1 = Ha; −1 = legacy downvote).</p>
        </div>
      </header>
      <RankTabs current="/rankings/votes" />
      <HaVotes page={clampPage(params.page)} value={text(params.value)} />
    </div>
  );
}
