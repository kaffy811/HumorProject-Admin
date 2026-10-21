import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/supabase/config";
import { gateDecision, safeNext } from "@/lib/gate";
import { serviceClient } from "@/lib/supabase/service";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const incoming = new URL(request.url);
  const response = NextResponse.redirect(new URL(safeNext(request.cookies.get("admin_next")?.value), request.url));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.delete("admin_next");
  const go = (target: string) => {
    response.headers.set("Location", new URL(target, request.url).toString());
    return response;
  };
  try {
    const { url, key } = config();
    const db = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const code = incoming.searchParams.get("code");
    if (!code) return go("/login?error=session");
    await db.auth.exchangeCodeForSession(code).catch(() => null);
    const { data: { user } } = await db.auth.getUser();
    const { data: claims } = user ? await db.auth.getClaims() : { data: null };
    const { data: profile, error } = user
      ? await serviceClient().from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle()
      : { data: null, error: null };
    if (error) return go("/denied?reason=unavailable");
    const result = gateDecision(user, claims?.claims, profile);
    if (result === "anonymous") return go("/login?error=session");
    if (result !== "admin") return go(`/denied?reason=${result}`);
    return response;
  } catch {
    // Never log codes, cookies or identity data.
    console.error("Admin sign-in callback failed");
    return go("/login?error=unavailable");
  }
}
