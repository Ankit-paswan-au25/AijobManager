import { useState } from "react";
import { api } from "../api/client.js";
import { STATUSES } from "./format.js";

/**
 * Lets the user move a job to another status (PATCH /api/user-jobs/:id).
 * Statuses only ever change through this control; the app never changes one by itself.
 * `onChanged(userJob)` gets the server's updated row.
 */
export default function StatusSelect({ userJobId, status, title, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onChange(e) {
    const next = e.target.value;
    setBusy(true);
    setError("");
    try {
      const { userJob } = await api(`/user-jobs/${userJobId}`, { method: "PATCH", body: { status: next } });
      onChanged?.(userJob);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <select
        value={status}
        onChange={onChange}
        disabled={busy}
        aria-label={`Status of ${title}`}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-sm disabled:opacity-60"
      >
        {STATUSES.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      {error && <span role="alert" className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  );
}
