"use client";
import Link from "next/link";
import { useState } from "react";
import { saveExample } from "@/lib/example-actions";
import { CAPTION_STYLES } from "@/lib/catalog";
import { STYLE_DISPLAY } from "@/lib/create-rules";

// Test run → AI generation examples: pick the captions worth keeping.
export function SaveExamples({ captions, scene: initialScene, chainId, source }: { captions: { caption: string; style: string }[]; scene: string; chainId: string; source: string }) {
  const [scene, setScene] = useState(initialScene);
  const [styles, setStyles] = useState(() => captions.map((c) => STYLE_DISPLAY[c.style.toLowerCase()] ?? "Deadpan"));
  const [status, setStatus] = useState<Record<number, string>>({});
  const save = async (i: number) => {
    setStatus((s) => ({ ...s, [i]: "Saving…" }));
    const result = await saveExample({ caption: captions[i].caption, style: styles[i], scene, chainId, source });
    setStatus((s) => ({ ...s, [i]: result.ok ? "saved" : result.error }));
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="field">
        <label htmlFor="example-scene">Scene for saved examples</label>
        <textarea id="example-scene" className="textarea" maxLength={500} value={scene} onChange={(e) => setScene(e.target.value)} placeholder="What is in the photo (required to save)." style={{ minHeight: 64 }} />
      </div>
      <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10 }}>
        {captions.map((c, i) => (
          <li key={i}>
            <b>{c.caption}</b>
            <div className="toolbar" style={{ margin: "6px 0 0", gap: 8 }}>
              <select className="select" aria-label="Joke style" value={styles[i]} onChange={(e) => setStyles(styles.map((s, j) => (j === i ? e.target.value : s)))} style={{ minHeight: 34 }}>
                {CAPTION_STYLES.map((s) => <option key={s}>{s}</option>)}
              </select>
              {status[i] === "saved"
                ? <span className="badge badge-good">Saved ✓ <Link href="/ai/examples" style={{ marginLeft: 4 }}>view</Link></span>
                : <button type="button" className="btn" style={{ minHeight: 34 }} disabled={status[i] === "Saving…" || !scene.trim() || !c.caption} onClick={() => save(i)}>{status[i] === "Saving…" ? "Saving…" : "Save as example"}</button>}
              {status[i] && !["saved", "Saving…"].includes(status[i]) && <span className="notice notice-bad" style={{ padding: "4px 8px" }}>{status[i]}</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
