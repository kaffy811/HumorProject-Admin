"use client";
import { useActionState } from "react";
import { chooseChainForMembers, type CatalogState } from "@/lib/catalog-actions";

export type MemberOption = { id: string; name: string; promptVersion: string; model: string | null; provider: string | null; issue: string | null };
// Pick the one chain (prompt + model) every member's generation uses.
export function MemberModelForm({ options, current }: { options: MemberOption[]; current: string | null }) {
  const [state, action, pending] = useActionState<CatalogState, FormData>(chooseChainForMembers, null);
  return (
    <form action={action} className="form">
      <div className="stack" role="radiogroup" aria-label="Model for members">
        {options.map((o) => (
          <label key={o.id} className="card" style={{ boxShadow: "none", display: "flex", gap: 12, alignItems: "center", cursor: o.issue ? "not-allowed" : "pointer", opacity: o.issue ? 0.65 : 1 }}>
            <input type="radio" name="chain" value={o.id} defaultChecked={o.id === current} disabled={!!o.issue} required />
            <span style={{ display: "grid", gap: 2, flex: 1 }}>
              <b>{o.model ? `${o.model} · ${o.provider ?? "no provider"}` : "No model"}{o.id === current && <span className="badge badge-good" style={{ marginLeft: 8 }}>In use</span>}</b>
              <span className="muted" style={{ fontSize: 13 }}>{o.name} · <span className="mono">{o.promptVersion}</span></span>
              {o.issue && <span className="hint">{o.issue}</span>}
            </span>
          </label>
        ))}
      </div>
      {state?.error && <div className="notice notice-bad" role="alert">{state.error}</div>}
      {state?.ok && <div className="notice notice-good" role="status">{state.ok}</div>}
      <div><button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Use for all members"}</button></div>
    </form>
  );
}
