import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { clampPage } from "@/lib/format";
import { RankTabs } from "@/components/RankTabs";
import { Hearts } from "@/components/VoteTables";
export const metadata: Metadata = { title: "Comment hearts" };
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Rankings &amp; votes · read only</span>
          <h1>Comment hearts.</h1>
          <p>Every heart on a comment, newest first. Rows in <span className="mono">humor_comment_votes</span>.</p>
        </div>
      </header>
      <RankTabs current="/rankings/hearts" />
      <Hearts page={clampPage(params.page)} />
    </div>
  );
}
