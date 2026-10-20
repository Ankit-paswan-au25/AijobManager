import { useState } from "react";

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  // Fallback for browsers/contexts without the async clipboard API.
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(area);
  if (!ok) throw new Error("copy failed");
}

/**
 * One document tab. `doc` is the latest stored version or null. `children` renders doc.content.
 * Shows the limited-details note whenever the server says the document was made from a short snippet.
 */
export default function DocumentTab({ label, hint, doc, busy, error, onGenerate, children }) {
  const [copyState, setCopyState] = useState("");

  async function onCopy() {
    try {
      await copyToClipboard(doc.content.text);
      setCopyState("Copied");
    } catch {
      setCopyState("Couldn't copy. Select the text and copy it manually.");
    }
    setTimeout(() => setCopyState(""), 2500);
  }

  const errorLine = error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>;
  const busyLine = busy && <p role="status" className="mt-3 text-sm text-slate-500">Generating… this can take a few seconds.</p>;

  if (!doc) {
    return (
      <div>
        <p className="mb-4 text-sm text-slate-600">{hint}</p>
        <button
          onClick={onGenerate}
          disabled={busy}
          className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {busy ? "Generating…" : `Generate ${label}`}
        </button>
        {busyLine}
        {errorLine}
      </div>
    );
  }

  return (
    <div>
      {doc.limitedInfo && (
        <p role="note" className="mb-4 rounded bg-amber-50 p-3 text-sm text-amber-900">{doc.limitedInfoNote}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onGenerate}
          disabled={busy}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {busy ? "Regenerating…" : "Regenerate"}
        </button>
        <button onClick={onCopy} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white">
          Copy
        </button>
        <span role="status" className="text-sm text-green-700">{copyState}</span>
        <span className="ml-auto text-xs text-slate-500">
          Version {doc.version} · {new Date(doc.generatedAt).toLocaleString()}
        </span>
      </div>
      {busyLine}
      {errorLine}

      <div className="mt-2">{children}</div>
      <p className="mt-4 text-xs text-slate-500">
        Written by AI from your resume and the job details. Read it and edit it before you use it.
      </p>
    </div>
  );
}
