import { useState } from "react";
import { api } from "../api/client.js";

export const REVIEW_WINDOW_HOURS = 48;

export default function AddPortalForm({ onSubmitted }) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const data = await api("/portals/submit", { method: "POST", body: { name, baseUrl } });
      onSubmitted(data.portal);
      setName("");
      setBaseUrl("");
      setNotice(`Thanks! "${data.portal.name}" is under review, expected within ${REVIEW_WINDOW_HOURS} hours.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg bg-white p-4 shadow">
      <h2 className="font-semibold">Add a portal</h2>
      <p className="text-xs text-slate-500">
        Don't see your job site? Submit it for review. We only need its name and website address, never your login.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          Website address
          <input
            required
            placeholder="https://www.example.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Submit for review"}
      </button>
    </form>
  );
}
