import { redirect } from "next/navigation";
// Votes now live under Rankings & votes; keep old links working.
export default async function Votes({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(tab === "ha" ? "/rankings/votes" : tab === "hearts" ? "/rankings/hearts" : "/rankings/ratings");
}
