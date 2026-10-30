"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { discardDraft, generateCaptions, publishDraft, startDraft, type Draft, type GenerateResult } from "@/lib/create-actions";
import { MAX_CAPTION, MAX_DIRECTION, chars, type Candidate } from "@/lib/create-rules";

type Step = 1 | 2 | 3 | 4 | 5;
type Generated = Extract<GenerateResult, { ok: true }>;

// Shrinks big photos in the browser so the upload fits a Server Action (4 MB).
async function shrink(file: File): Promise<Blob> {
  if (file.size < 3_500_000 && file.type !== "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/jpeg", 0.9));
}

export function CreatePost({ me }: { me: { username: string; avatarUrl: string | null } }) {
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filename, setFilename] = useState("");
  const [mode, setMode] = useState<"ai" | "handmade">("ai");
  const [direction, setDirection] = useState("");
  const [handmade, setHandmade] = useState("");
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ step: Step; text: string } | null>(null);
  const [busy, setBusy] = useState<"upload" | "generate" | "publish" | null>(null);
  const [, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick: Candidate | undefined = generated?.candidates.find((c) => c.id === selected);
  const caption = mode === "ai" ? (pick ? edits[pick.id] ?? pick.text : "") : handmade;
  const locked = busy !== null;

  async function upload(file: File) {
    setError(null);
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return setError({ step: 1, text: "Choose a JPG, PNG, WebP or GIF." });
    if (file.size > 10_000_000) return setError({ step: 1, text: "Photos can be up to 10 MB." });
    setBusy("upload");
    try {
      if (draft) await discardDraft(draft.imageId);
      const form = new FormData();
      form.set("image", await shrink(file), file.name);
      const result = await startDraft(form);
      if (!result.ok) return setError({ step: 1, text: result.error });
      setDraft(result.draft); setFilename(file.name); setGenerated(null); setSelected(null); setEdits({});
      setStep(2);
    } catch {
      setError({ step: 1, text: "Upload needs another attempt." });
    } finally {
      setBusy(null);
    }
  }

  // Paste a photo anywhere on the page while step 1 is open.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (step !== 1 || locked) return;
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) { event.preventDefault(); void upload(file); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  async function generate() {
    if (!draft) return;
    setError(null); setBusy("generate"); setStep(3);
    const result = await generateCaptions(draft.imageId, direction);
    setBusy(null);
    if (!result.ok) return setError({ step: 3, text: result.error });
    // Like the member page: nothing is picked until the admin chooses.
    setGenerated(result); setSelected(null); setEdits({});
    setStep(4);
  }

  function publish() {
    if (!draft) return;
    setError(null); setBusy("publish");
    startTransition(async () => {
      const result = await publishDraft({ imageId: draft.imageId, mode, generationId: generated?.generationId, candidateId: pick?.id, text: caption, description: "" });
      // Success redirects to the new post; only failures come back.
      if (result && !result.ok) { setError({ step: 5, text: result.error }); setBusy(null); }
    });
  }

  async function startOver() {
    if (draft) await discardDraft(draft.imageId);
    setDraft(null); setFilename(""); setGenerated(null); setSelected(null); setEdits({}); setHandmade(""); setDirection(""); setError(null); setStep(1);
  }

  const open = (target: Step) => () => { if (!locked) setStep(target); };
  const tooLong = chars(caption.trim()) > MAX_CAPTION;

  return (
    <div className="create-flow">
      <Panel number={1} title="The evidence" summary={filename || "Choose a photo"} active={step === 1} enabled={!locked} onOpen={open(1)}>
        <button type="button" className={`dropzone${dragging ? " is-dragging" : ""}`} disabled={locked}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}>
          {draft?.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed private URL
            <img src={draft.previewUrl} alt="Your selected photo" className="dropzone-preview" />
          ) : (
            <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 22V4m-6 6 6-6 6 6M5 20v8h22v-8" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          )}
          <b>{busy === "upload" ? "Uploading. The baby is supervising." : draft ? "Uploaded. Already judging it." : "Drop a photo. Lower your expectations."}</b>
          <span className="muted">{draft ? "Click to choose another image." : "Or click to choose · Paste works too"}<br />JPG, PNG, WebP or GIF · Up to 10 MB</span>
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
        {error?.step === 1 && <p className="notice notice-bad" role="alert">{error.text}</p>}
        {draft && <button type="button" className="btn btn-primary" onClick={open(2)}>Next: the punchline</button>}
      </Panel>

      <Panel number={2} title="Who gets the mic?" summary={mode === "ai" ? "Let the baby write" : "I’ll write it"} active={step === 2} enabled={!!draft && !locked} onOpen={open(2)}>
        <div className="toolbar" role="group" aria-label="Who writes the caption">
          <button type="button" className={`btn${mode === "ai" ? " btn-primary" : ""}`} aria-pressed={mode === "ai"} onClick={() => setMode("ai")}>Let the baby write</button>
          <button type="button" className={`btn${mode === "handmade" ? " btn-primary" : ""}`} aria-pressed={mode === "handmade"} onClick={() => setMode("handmade")}>I&apos;ll write it</button>
        </div>
        {mode === "ai" ? (
          <>
            <label className="eyebrow" htmlFor="direction">A direction, if you have one</label>
            <input id="direction" className="input create-input" maxLength={MAX_DIRECTION} placeholder="Anything specific? (optional)" value={direction} onChange={(e) => setDirection(e.target.value)} />
            <button type="button" className="btn btn-primary create-cta" disabled={locked} onClick={generate}>{generated ? "Make it funny again" : "Make it funny"}</button>
          </>
        ) : (
          <>
            <label className="eyebrow" htmlFor="handmade">Your punchline</label>
            <textarea id="handmade" className="textarea create-input" maxLength={MAX_CAPTION * 2} placeholder="Prove the baby wrong." value={handmade} onChange={(e) => setHandmade(e.target.value)} />
            <span className="hint num">{chars(handmade.trim())}/{MAX_CAPTION}</span>
            <button type="button" className="btn btn-primary create-cta" disabled={!handmade.trim() || chars(handmade.trim()) > MAX_CAPTION} onClick={() => setStep(5)}>Preview it</button>
          </>
        )}
      </Panel>

      {mode === "ai" && (
        <Panel number={3} title="Let the baby think" summary={generated ? "Four candidates. One ego." : ""} active={step === 3} enabled={false} onOpen={open(3)}>
          {busy === "generate" && (
            <div className="thinking" role="status" aria-live="polite">
              {/* eslint-disable-next-line @next/next/no-img-element -- static mascot */}
              <img src="/baby/thinking.webp" alt="" className="thinking-baby" />
              <div>
                <p className="generation-status">Thinking<span className="thinking-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></p>
                <p className="muted" style={{ margin: 0 }}>An unfamiliar experience. Four punchlines are on the way.</p>
                <span className="thinking-bar" aria-hidden="true"><i /></span>
              </div>
            </div>
          )}
          {error?.step === 3 && (
            <>
              <p className="notice notice-bad" role="alert">{error.text}</p>
              <button type="button" className="btn btn-primary" onClick={generate}>Try again</button>
            </>
          )}
        </Panel>
      )}

      {mode === "ai" && (
        <Panel number={4} title="Choose the punchline" summary={pick ? caption : "Pick one. Make it yours."} active={step === 4} enabled={!!generated && !locked} onOpen={open(4)}>
          {generated && (
            <>
              <div className="punchline">
                <div className="candidates" role="radiogroup" aria-label="Caption candidates">
                  {generated.candidates.map((c, i) => (
                    <button key={c.id} type="button" role="radio" aria-checked={selected === c.id} className={`candidate${selected === c.id ? " is-selected" : ""}`} onClick={() => setSelected(c.id)}>
                      <span className="candidate-label"><span className="radio-dot" aria-hidden="true" />Option {i + 1} · {c.style}</span>
                      <span>{edits[c.id] ?? c.text}</span>
                      {edits[c.id] !== undefined && edits[c.id] !== c.text && <span className="muted" style={{ fontSize: 12 }}>Your edit, kept safe</span>}
                    </button>
                  ))}
                </div>
                <div className="final-cut">
                  <span className="eyebrow">The final cut</span>
                  <PostPreview me={me} caption={caption} image={draft?.previewUrl} />
                  {pick && (
                    <div className="field" style={{ width: "100%" }}>
                      <label htmlFor="edit" className="eyebrow">Make it yours</label>
                      <textarea id="edit" aria-label="Edit selected caption" className="textarea" value={edits[pick.id] ?? pick.text} onChange={(e) => setEdits({ ...edits, [pick.id]: e.target.value })} />
                      <span className={`hint num${tooLong ? " notice-bad" : ""}`}>{chars(caption.trim())}/{MAX_CAPTION}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="toolbar" style={{ marginTop: 6 }}>
                <button type="button" className="btn create-cta" onClick={generate}>Regenerate</button>
                <button type="button" className="btn btn-primary create-cta" disabled={!pick || tooLong || !caption.trim()} onClick={() => setStep(5)}>Looks funny enough</button>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                Written by <span className="mono">{generated.model}</span> ({generated.provider}) · prompt <span className="mono">{generated.promptVersion}</span>. {generated.note}
              </p>
            </>
          )}
        </Panel>
      )}

      <Panel number={mode === "ai" ? 5 : 3} title="Release it into the world" summary="Your call." active={step === 5} enabled={!!draft && !!caption.trim() && !locked} onOpen={open(5)}>
        {draft && (
          <>
            {mode === "handmade" && <PostPreview me={me} caption={caption} image={draft.previewUrl} />}
            <p style={{ margin: 0, fontSize: 16 }}>One photo. One punchline. An unreasonable amount of confidence.</p>
            {error?.step === 5 && <p className="notice notice-bad" role="alert">{error.text}</p>}
            <div className="toolbar" style={{ alignItems: "center", gap: 18 }}>
              <button type="button" className="btn btn-primary create-cta" disabled={locked || !caption.trim() || tooLong} onClick={publish}>{busy === "publish" ? "Posting…" : error?.step === 5 ? "Try posting again" : "Post it"}</button>
              <button type="button" className="link-button" disabled={locked} onClick={() => setStep(mode === "ai" ? 4 : 2)}>{mode === "ai" ? "Back to the punchline" : "Back to your caption"}</button>
              <button type="button" className="link-button" disabled={locked} onClick={startOver}>Start over</button>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

// The post card members see, as on the member Create page.
function PostPreview({ me, caption, image }: { me: { username: string; avatarUrl: string | null }; caption: string; image?: string }) {
  return (
    <figure className="post-preview" aria-label="Final post preview">
      <figcaption className="post-preview-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
        {me.avatarUrl ? <img src={me.avatarUrl} alt="" className="avatar" /> : <span className="avatar">{me.username.slice(0, 1).toUpperCase()}</span>}
        <span className="mono" style={{ fontWeight: 700 }}>@{me.username}</span>
      </figcaption>
      <p className={`post-preview-caption${caption.trim() ? "" : " is-placeholder"}`}>{caption.trim() || "A punchline goes here. No pressure."}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
      {image ? <img src={image} alt="" className="post-preview-image" /> : null}
    </figure>
  );
}

function Panel({ number, title, summary, active, enabled, onOpen, children }: { number: number; title: string; summary: string; active: boolean; enabled: boolean; onOpen: () => void; children: React.ReactNode }) {
  return (
    <section className={`create-step${active ? " is-active" : ""}${!enabled && !active ? " is-disabled" : ""}`}>
      <button type="button" className="create-step-head" onClick={onOpen} disabled={!enabled || active} aria-expanded={active}>
        <span className="create-step-number">{number}</span>
        <span className="create-step-title">{title}</span>
        {!active && <span className="create-step-summary">{summary}</span>}
      </button>
      {active && <div className="create-step-body">{children}</div>}
    </section>
  );
}
