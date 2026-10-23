import { redirect } from "next/navigation";
// Old links: scores live under Rankings & votes, individual votes in the activity log.
export default async function Votes({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(tab === "ha" ? "/activity?action=cat:reaction" : tab === "hearts" ? "/activity?action=heart" : "/rankings/ratings");
}
