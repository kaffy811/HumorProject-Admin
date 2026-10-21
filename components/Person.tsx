import Link from "next/link";
import { fullName, handle } from "@/lib/format";
type P = { id: string; username?: string | null; first_name?: string | null; last_name?: string | null; display_name?: string | null } | null;
export function Initials({ profile }: { profile: P }) {
  const label = (fullName(profile) || profile?.username || "?").slice(0, 1).toUpperCase();
  return <span className="avatar" aria-hidden="true">{label}</span>;
}
export function PersonLink({ profile, id, avatarUrl }: { profile: P; id: string; avatarUrl?: string }) {
  return (
    <Link href={`/users/${id}`} className="who-cell" style={{ textDecoration: "none" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
      {avatarUrl ? <img className="avatar" src={avatarUrl} alt="" /> : <Initials profile={profile} />}
      <span style={{ minWidth: 0 }}>
        <b style={{ display: "block" }}>{handle(profile ?? { id })}</b>
        <span className="muted" style={{ fontSize: 12 }}>{fullName(profile) || "No name yet"}</span>
      </span>
    </Link>
  );
}
