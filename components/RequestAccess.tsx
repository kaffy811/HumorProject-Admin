"use client";
import { useActionState } from "react";
import { requestAccess, type RequestState } from "@/lib/request-actions";
export function RequestAccess({ again }: { again?: boolean }) {
  const [state, action, pending] = useActionState<RequestState, FormData>(requestAccess, null);
  if (state?.ok) return <div className="notice notice-good" role="status">{state.ok}</div>;
  return (
    <form action={action} className="form" style={{ textAlign: "left", gap: 10 }}>
      <label htmlFor="message" className="eyebrow">Why do you need admin access? (optional)</label>
      <textarea id="message" name="message" className="textarea" maxLength={500} style={{ minHeight: 72 }} placeholder="e.g. I'm on the course staff and moderate posts." />
      {state?.error && <div className="notice notice-bad" role="alert">{state.error}</div>}
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Sending…" : again ? "Request again" : "Request superadmin access"}</button>
    </form>
  );
}
