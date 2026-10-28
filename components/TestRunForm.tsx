"use client";
import { startTransition, useActionState, useState } from "react";
import { testRun, type TestRunState } from "@/lib/test-run-actions";
import { duration, n } from "@/lib/format";

type Option = { id: string; label: string };
export function TestRunForm({ models, chains, supported }: { models: (Option & { provider: string })[]; chains: Option[]; supported: string[] }) {
  const [state, action, pending] = useActionState<TestRunState, FormData>(testRun, null);
  const [preview, setPreview] = useState<string | null>(null);
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const provider = models.find((m) => m.id === modelId)?.provider ?? "";
  return (
    <section className="grid grid-2">
      {/* Submitted by hand so a failed run keeps the photo and choices (form actions reset the form). */}
      <form className="card form" onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => action(data)); }}>
        <div className="field">
          <label htmlFor="model">Model</label>
          <select id="model" name="model" className="select" required value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {provider && !supported.includes(provider) && <span className="hint">No API key or connector for “{provider}” on this deployment, so this run will fail.</span>}
        </div>
        <div className="field">
          <label htmlFor="chain">Prompt chain</label>
          <select id="chain" name="chain" className="select" required defaultValue={chains[0]?.id}>
            {chains.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <span className="hint">Its step 1 system and user prompts and output schema are used.</span>
        </div>
        <div className="field">
          <label htmlFor="direction">Direction <span className="muted">(optional)</span></label>
          <input id="direction" name="direction" className="input" maxLength={120} placeholder="e.g. midterms week" />
          <span className="hint">Replaces {"{direction}"} in the user prompt, like a member&apos;s direction.</span>
        </div>
        <div className="field">
          <label htmlFor="image">Photo</label>
          <input id="image" name="image" type="file" required accept="image/jpeg,image/png,image/webp,image/gif" className="input"
            onChange={(e) => { const f = e.target.files?.[0]; setPreview((old) => { if (old) URL.revokeObjectURL(old); return f ? URL.createObjectURL(f) : null; }); }} />
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          {preview && <img src={preview} alt="Selected photo" className="media-preview" style={{ maxHeight: 240 }} />}
        </div>
        <div><button className="btn btn-primary" type="submit" disabled={pending || !models.length || !chains.length}>{pending ? "Running… (up to 45 s)" : "Run"}</button></div>
      </form>
      <div className="card" aria-live="polite">
        <h2>Result</h2>
        {!state && <p className="empty">Choose a model, a chain and a photo, then run.</p>}
        {state && !state.ok && !("captions" in state && state.captions.length) && <div className="notice notice-bad" role="alert">{state.error}</div>}
        {state && "captions" in state && (
          <div className="stack">
            <p className="sub" style={{ margin: 0 }}><span className="mono">{state.provider} · {state.model}</span> · {state.chain} · {duration(state.latencyMs)} · {n(state.usage.input)} in / {n(state.usage.output)} out tokens</p>
            {!!state.captions.length && (
              <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
                {state.captions.map((c, i) => <li key={i}><b>{c.caption}</b>{c.style && <span className="badge" style={{ marginLeft: 6 }}>{c.style}</span>}</li>)}
              </ol>
            )}
            {state.warnings.map((w) => <div key={w} className="notice notice-warn">{w}</div>)}
            {state.rawText && <details><summary style={{ cursor: "pointer" }}>Raw response</summary><pre className="prompt">{state.rawText}</pre></details>}
            <details><summary style={{ cursor: "pointer" }}>User prompt sent</summary><pre className="prompt">{state.prompt}</pre></details>
          </div>
        )}
      </div>
    </section>
  );
}
