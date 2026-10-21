import type { Metadata } from "next";
import { GoogleButton } from "@/components/GoogleButton";
export const metadata: Metadata = { title: "Sign in" };
const ERRORS: Record<string, string> = {
  session: "Google sign-in did not finish. Try again.",
  unavailable: "Sign-in is unavailable right now. Try again shortly.",
};
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="login">
      <div className="card login-card">
        <div className="brand" style={{ justifyContent: "center", padding: 0 }}>
          <span className="brand-mark">Ha</span>
          <span>Humor Admin<small>The Humor Project</small></span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Restricted console. Sign in with the Google account that holds superadmin rights on The Humor Project.
        </p>
        {error && ERRORS[error] && <div className="notice notice-bad" role="alert">{ERRORS[error]}</div>}
        <GoogleButton next={next} />
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>Every page and action checks <span className="mono">profiles.is_superadmin = true</span>.</p>
      </div>
    </main>
  );
}
