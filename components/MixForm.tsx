"use client";
import { useActionState, useState } from "react";
import { updateMix, type CatalogState } from "@/lib/catalog-actions";

type Chain = { id: string; name: string; prompt_version: string; share: number };
export function MixForm({ chains }: { chains: Chain[] }) {
  const [state, action, pending] = useActionState<CatalogState, FormData>(updateMix, null);
  const [shares, setShares] = useState(() => Object.fromEntries(chains.map((c) => [c.id, String(c.share)])));
  const total = Object.values(shares).reduce((sum, value) => sum + (Number(value) || 0), 0);
  return (
    <form action={action} className="form">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Chain</th><th>Prompt version</th><th className="r">Share of new requests</th><th style={{ width: "30%" }} /></tr></thead>
          <tbody>
            {chains.map((c) => {
              const value = Number(shares[c.id]) || 0;
              return (
                <tr key={c.id}>
                  <td><label htmlFor={`share-${c.id}`} style={{ fontWeight: 700 }}>{c.name}</label></td>
                  <td className="mono">{c.prompt_version}</td>
                  <td className="r">
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <input id={`share-${c.id}`} name={`share:${c.id}`} className="input num" type="number" min={0} max={100} step={1} required
                        value={shares[c.id]} onChange={(e) => setShares((s) => ({ ...s, [c.id]: e.target.value }))} style={{ width: 90, minWidth: 0, textAlign: "right" }} />%
                    </span>
                  </td>
                  <td><div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${Math.min(100, value)}%` }} /></div></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={2}><b>Total</b></td><td className="r num"><b style={{ color: total === 100 ? undefined : "var(--tomato-dark)" }}>{total}%</b></td><td>{total === 100 ? <span className="badge badge-good">Balanced</span> : <span className="badge badge-bad">Must be 100%</span>}</td></tr>
          </tfoot>
        </table>
      </div>
      {state?.error && <div className="notice notice-bad" role="alert">{state.error}</div>}
      {state?.ok && <div className="notice notice-good" role="status">{state.ok}</div>}
      <div><button className="btn btn-primary" type="submit" disabled={pending || total !== 100}>{pending ? "Saving…" : "Save mix"}</button></div>
    </form>
  );
}
