"use client";
import { useActionState, useEffect, useRef } from "react";
import { createRecord, saveStep, updateRecord, type CatalogState } from "@/lib/catalog-actions";
import { resource, STEP_RESOURCE, type Field } from "@/lib/catalog";

export type RefOptions = Record<string, { value: string; label: string }[]>;
type Values = Record<string, unknown>;

// Create (no initial) or edit form for any catalog table. The definition is
// looked up by slug here because RegExp patterns cannot cross to the client.
// With chainId it edits a prompt-chain step instead.
export function CatalogForm({ slug, initial, refs, chainId, defaults }: { slug: string; initial?: Values & { id: string }; refs: RefOptions; chainId?: string; defaults?: Values }) {
  const def = chainId ? STEP_RESOURCE : resource(slug)!;
  const [state, action, pending] = useActionState<CatalogState, FormData>(chainId ? saveStep : initial ? updateRecord : createRecord, null);
  const form = useRef<HTMLFormElement>(null);
  // A successful create clears the form for the next entry.
  useEffect(() => { if (state?.ok && !initial) form.current?.reset(); }, [state, initial]);
  return (
    <form ref={form} action={action} className="form">
      <input type="hidden" name="resource" value={def.slug} />
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {chainId && <input type="hidden" name="chain_id" value={chainId} />}
      {/* Remounted after each failed save so the fields show what was submitted. */}
      <div className="grid grid-2" style={{ gap: 12 }} key={state?.at ?? 0}>
        {def.fields.map((field) => (
          <div key={field.name} className="field" style={field.kind === "textarea" || field.kind === "json" ? { gridColumn: "1 / -1" } : undefined}>
            <Input field={field} value={state?.values ? state.values[field.name] : initial ? initial[field.name] : defaults?.[field.name]} options={refs[field.name]} />
          </div>
        ))}
      </div>
      {state?.error && <div className="notice notice-bad" role="alert">{state.error}</div>}
      {state?.ok && <div className="notice notice-good" role="status">{state.ok}</div>}
      <div><button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Saving…" : initial ? "Save changes" : `Add ${def.singular}`}</button></div>
    </form>
  );
}

function Input({ field, value, options }: { field: Field; value: unknown; options?: { value: string; label: string }[] }) {
  const id = `f-${field.name}`;
  const initial = value === undefined ? field.defaultValue : value;
  const label = <label htmlFor={id}>{field.label}{!field.required && field.kind !== "checkbox" && <span className="muted"> (optional)</span>}</label>;
  const hint = field.hint && <span className="hint">{field.hint}</span>;
  const common = { id, name: field.name, required: field.required, className: field.mono ? "input mono" : "input" };
  if (field.kind === "checkbox")
    return (
      <>
        <label htmlFor={id} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}>
          <input id={id} name={field.name} type="checkbox" defaultChecked={initial === true} /> {field.label}
        </label>
        {hint}
      </>
    );
  if (field.kind === "json")
    return <>{label}<textarea {...common} className="textarea mono" rows={8} defaultValue={initial == null ? "" : typeof initial === "string" ? initial : JSON.stringify(initial, null, 2)} />{hint}</>;
  if (field.kind === "textarea")
    return <>{label}<textarea {...common} className="textarea" maxLength={field.max} rows={field.max && field.max > 5000 ? 14 : undefined} defaultValue={String(initial ?? "")} />{hint}</>;
  if (field.kind === "select" || field.kind === "ref") {
    const choices = field.kind === "select" ? (field.options ?? []).map((o) => ({ value: o, label: o })) : options ?? [];
    return (
      <>
        {label}
        <select {...common} className="select" defaultValue={String(initial ?? "")}>
          {(field.kind === "ref" && !field.required) || initial === undefined || initial === null ? <option value="">{field.required ? "Choose…" : "None"}</option> : null}
          {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {hint}
      </>
    );
  }
  const type = field.kind === "email" ? "email" : field.kind === "url" ? "url" : field.kind === "int" || field.kind === "decimal" ? "number" : "text";
  return (
    <>
      {label}
      <input {...common} type={type} maxLength={field.max} min={field.min} max={field.maxValue} step={field.kind === "decimal" ? field.step : field.kind === "int" ? 1 : undefined}
        defaultValue={initial === null || initial === undefined ? "" : String(initial)} autoComplete="off" spellCheck={field.kind === "text" || undefined} />
      {hint}
    </>
  );
}
