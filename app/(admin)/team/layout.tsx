import { requireSuperadmin } from "@/lib/admin";
import { SectionTabs } from "@/components/SectionTabs";
const TABS = [
  { href: "/team", label: "Team & requests" },
  { href: "/team/signup-domains", label: "Allowed sign-up domains" },
  { href: "/team/whitelisted-emails", label: "Whitelisted emails" },
];
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin();
  return <><SectionTabs label="Team & access" tabs={TABS} />{children}</>;
}
