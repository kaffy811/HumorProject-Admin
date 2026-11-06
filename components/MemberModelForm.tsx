"use client";
import { useActionState, useState } from "react";
import { chooseModelForMembers, deleteModelFromPicker, type CatalogState } from "@/lib/catalog-actions";
import { MEMBER_PROVIDERS } from "@/lib/chain-check";

export type MemberChain = { id: string; name: string; promptVersion: string; steps: number; seeing: number[]; issue: string | null; modelId: string | null; mixed: boolean };
export type MemberModel = { id: string; name: string; modelId: string; provider: string; providerName: string; active: boolean; vision: boolean };

// Why this model cannot run the chain for members (mirrors modelIssue in lib/chain-check).
function whyNot(m: MemberModel, chain: MemberChain | undefined) {
  if (!m.active) return "Inactive: activate it under LLM models first.";
  if (!MEMBER_PROVIDERS.includes(m.provider)) return `The member app has no connector for ${m.providerName}.`;
  if (chain?.seeing.length && !m.vision) return `Cannot read images, but step ${chain.seeing.join(", ")} sees the photo.`;
  return null;
}

// Choose the members' prompt chain (usually one) and the model for every step of it.
// Each row's delete button is its own form, so the radios join the save form by id.
export function MemberModelForm({ chains, models, current, formId }: { chains: MemberChain[]; models: MemberModel[]; current: string | null; formId: string }) {
  const [state, action, pending] = useActionState<CatalogState, FormData>(chooseModelForMembers, null);
  const [chainId, setChainId] = useState(current ?? chains[0]?.id ?? "");
  const chain = chains.find((c) => c.id === chainId);
  const [modelId, setModelId] = useState(chain?.modelId ?? "");
  const groups = [...new Map(models.map((m) => [m.providerName, models.filter((x) => x.providerName === m.providerName)])).entries()];
  const inUse = (m: MemberModel) => chainId === current && chain?.modelId === m.id;
  return (
    <div className="stack">
      <div className="field">
        <label htmlFor={`${formId}-chain`}>Prompt chain</label>
        <select id={`${formId}-chain`} name="chain" form={formId} className="select" value={chainId}
          onChange={(e) => { setChainId(e.target.value); setModelId(chains.find((c) => c.id === e.target.value)?.modelId ?? ""); }}>
          {chains.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.promptVersion} · {c.steps} step{c.steps === 1 ? "" : "s"}{c.id === current ? " (members use this)" : ""}</option>)}
        </select>
        {chain?.issue && <span className="hint" style={{ color: "var(--tomato-dark)" }}>This chain cannot serve members yet: {chain.issue} Fix it in the Prompt Chain Tool.</span>}
        {chain?.mixed && <span className="hint">Its steps use different models now; saving puts every step on the one you choose.</span>}
      </div>
      <div className="stack" role="radiogroup" aria-label="Model for members">
        {groups.map(([provider, list]) => (
          <div key={provider} className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">{provider}</span>
            {list.map((m) => {
              const why = whyNot(m, chain);
              return (
                <div key={m.id} className="card" style={{ boxShadow: "none", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 220, cursor: why ? "not-allowed" : "pointer", opacity: why ? 0.65 : 1 }}>
                    <input type="radio" name="model" value={m.id} form={formId} checked={modelId === m.id} onChange={() => setModelId(m.id)} disabled={!!why} required />
                    <span style={{ display: "grid", gap: 2 }}>
                      <b>{`${m.name} · ${m.providerName}`}{inUse(m) && <span className="badge badge-good" style={{ marginLeft: 8 }}>In use</span>}</b>
                      <span className="muted mono" style={{ fontSize: 12 }}>{m.modelId}</span>
                      {why && <span className="hint">{why}</span>}
                    </span>
                  </label>
                  <DeleteModel id={m.id} name={m.name} inUse={inUse(m)} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <form id={formId} action={action} className="form">
        {state?.error && <div className="notice notice-bad" role="alert">{state.error}</div>}
        {state?.ok && <div className="notice notice-good" role="status">{state.ok}</div>}
        <div><button className="btn btn-primary" type="submit" disabled={pending || !!chain?.issue || !modelId}>{pending ? "Saving…" : "Use for all members"}</button></div>
      </form>
    </div>
  );
}

function DeleteModel({ id, name, inUse }: { id: string; name: string; inUse: boolean }) {
  const [state, action, pending] = useActionState<CatalogState, FormData>(deleteModelFromPicker, null);
  return (
    <form action={action} style={{ display: "grid", gap: 4, justifyItems: "end" }}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn btn-danger" disabled={pending || inUse} title={inUse ? "Members are using this model. Choose another first." : undefined}
        onClick={(e) => { if (!window.confirm(`Delete the model “${name}” from LLM models? Prompt chain steps that use it are left without a model. This cannot be undone.`)) e.preventDefault(); }}>
        {pending ? "Deleting…" : "Delete"}
      </button>
      {state?.error && <span className="hint" role="alert" style={{ color: "var(--tomato-dark)" }}>{state.error}</span>}
    </form>
  );
}
