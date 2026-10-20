import { useState } from "react";
import { api } from "../api/client.js";

const MAX_BYTES = 5 * 1024 * 1024;

export default function ResumeUpload({ onDone }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function onPick(e) {
    const picked = e.target.files?.[0] ?? null;
    setError("");
    // Convenience checks only; the server validates the real file type and size.
    if (picked && picked.size > MAX_BYTES) {
      setFile(null);
      setError("File is too large (max 5 MB).");
      return;
    }
    if (picked && !/\.(pdf|docx)$/i.test(picked.name)) {
      setFile(null);
      setError("Please choose a PDF or DOCX file.");
      return;
    }
    setFile(picked);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setError("");
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const data = await api("/resumes/upload", { method: "POST", body });
      onDone(data.resume);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm">
        Resume file (PDF or DOCX, up to 5 MB)
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={onPick}
          className="mt-2 block w-full text-sm"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!file || submitting}
        className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-60"
      >
        {submitting ? "Uploading…" : "Upload resume"}
      </button>
    </form>
  );
}
