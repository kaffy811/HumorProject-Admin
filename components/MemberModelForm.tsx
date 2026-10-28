"use client";
import { useActionState } from "react";
import { chooseChainForMembers, deleteChainFromPicker, type CatalogState } from "@/lib/catalog-actions";

export type MemberOption = { id: string; name: string; promptVersion: string; model: string | null; provider: string | null; issue: string | null };
// Pick the one chain (prompt + model) every member's generation uses, or delete one.
// Each row's delete button is its own form, so the radios join the save form by id.
export function MemberModelForm({ options, current, formId }: { options: MemberOption[]; current: string | null; formId: string }) {
  const [state, action, pending] = useActionState<CatalogState, FormData>(chooseChainForMembers, null);
  return (
    <div className="stack">
      <div className="stack" role="radiogroup" aria-label="Model for members">
        {options.map((o) => (
          <div key={o.id} className="card" style={{ boxShadow: "none", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 220, cursor: o.issue ? "not-allowed" : "pointer", opacity: o.issue ? 0.65 : 1 }}>
              <input type="radio" name="chain" value={o.id} form={formId} defaultChecked={o.id === current} disabled={!!o.issue} required />
              <span style={{ display: "grid", gap: 2 }}>
                <b>{o.model ? `${o.model} · ${o.provider ?? "no provider"}` : "No model"}{o.id === current && <span className="badge badge-good" style={{ marginLeft: 8 }}>In use</span>}</b>
                <span className="muted" style={{ fontSize: 13 }}>{o.name} · <span className="mono">{o.promptVersion}</span></span>
                {o.issue && <span className="hint">{o.issue}</span>}
              </span>
            </label>
            <DeleteChain id={o.id} name={o.name} inUse={o.id === current} />
          </div>
        ))}
      </div>
      <form id={formId} action={action} className="form">
        {state?.error && <div className="notice notice-bad" role="alert">{state.error}</div>}
        {state?.ok && <div className="notice notice-good" role="status">{state.ok}</div>}
        <div><button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Use for all members"}</button></div>
      </form>
    </div>
  );
}

function DeleteChain({ id, name, inUse }: { id: string; name: string; inUse: boolean }) {
  const [state, action, pending] = useActionState<CatalogState, FormData>(deleteChainFromPicker, null);
  return (
    <form action={action} style={{ display: "grid", gap: 4, justifyItems: "end" }}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn btn-danger" disabled={pending || inUse} title={inUse ? "Members are using this one. Choose another first." : undefined}
        onClick={(e) => { if (!window.confirm(`Delete the prompt chain “${name}” and its steps? The model stays in LLM models. This cannot be undone.`)) e.preventDefault(); }}>
        {pending ? "Deleting…" : "Delete"}
      </button>
      {state?.error && <span className="hint" role="alert" style={{ color: "var(--tomato-dark)" }}>{state.error}</span>}
    </form>
  );
}
