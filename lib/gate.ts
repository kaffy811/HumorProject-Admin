import type { User } from "@supabase/supabase-js";
import { isGoogleSession } from "./google-session";

export type GateResult = "anonymous" | "not-google" | "forbidden" | "admin";

// Pure decision so the proxy, pages, actions and tests all agree.
// The flag must be strictly TRUE; null, missing or "true" strings never pass.
export function gateDecision(
  user: Pick<User, "id" | "identities" | "is_anonymous"> | null,
  claims: unknown,
  profile: { is_superadmin?: unknown } | null,
): GateResult {
  if (!user) return "anonymous";
  if (!isGoogleSession(user, claims)) return "not-google";
  return profile?.is_superadmin === true ? "admin" : "forbidden";
}

export const PUBLIC_PATHS = ["/login", "/denied"];
export function isPublicPath(path: string) {
  return PUBLIC_PATHS.includes(path) || path.startsWith("/auth/");
}

// Only same-site relative paths survive the OAuth round trip.
export function safeNext(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  if (isPublicPath(value.split("?")[0])) return "/";
  return value;
}
