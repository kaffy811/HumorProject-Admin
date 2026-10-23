import type { User } from "@supabase/supabase-js";
import { isGoogleSession } from "./google-session";

export type GateResult = "anonymous" | "not-google" | "forbidden" | "admin";
export type ConsoleRole = "superadmin" | "admin";
type RoleFlags = { is_superadmin?: unknown; is_admin?: unknown } | null;

// Superadmin = owner (team management); admin = everything else in the console.
// Flags must be strictly TRUE; null, missing or "true" strings never pass.
export function consoleRole(profile: RoleFlags): ConsoleRole | null {
  if (profile?.is_superadmin === true) return "superadmin";
  if (profile?.is_admin === true) return "admin";
  return null;
}

// Pure decision so the proxy, pages, actions and tests all agree.
export function gateDecision(
  user: Pick<User, "id" | "identities" | "is_anonymous"> | null,
  claims: unknown,
  profile: RoleFlags,
): GateResult {
  if (!user) return "anonymous";
  if (!isGoogleSession(user, claims)) return "not-google";
  return consoleRole(profile) ? "admin" : "forbidden";
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
