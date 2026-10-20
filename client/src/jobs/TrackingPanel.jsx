import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import StatusSelect from "./StatusSelect.jsx";
import { formatDateTime, fromLocalInput, statusLabel, toLocalInput } from "./format.js";

/**
 * Status, interview date/notes and status history for one job.
 * Everything here is entered by the user. Interview dates are never read from email.
 * Adding a date does not change the status; the user changes that themselves.
 */
export default function TrackingPanel({ job, onJobChanged }) {
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState("");
  const [date, setDate] = useState(toLocalInput(job.interviewDate));
  const [notes, setNotes] = useState(job.interviewNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ kind: "", text: "" });

  const loadHistory = useCallback(() => {
    api(`/user-jobs/${job.userJobId}/history`)
      .then((d) => {
        setHistory(d.history);
        setHistoryError("");
      })
      .catch((err) => setHistoryError(err.message));
  }, [job.userJobId]);

  useEffect(loadHistory, [loadHistory]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMessage({ kind: "", text: "" });
    try {
      const { userJob } = await api(`/user-jobs/${job.userJobId}`, {
        method: "PATCH",
        body: { interview_date: fromLocalInput(date), interview_notes: notes.trim() === "" ? null : notes },
      });
      onJobChanged({ interviewDate: userJob.interviewDate, interviewNotes: userJob.interviewNotes });
      setMessage({ kind: "ok", text: "Saved." });
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  function onStatusChanged(userJob) {
    onJobChanged({ status: userJob.status });
    loadHistory();
  }

  const showsInInterviews = job.interviewDate && job.status !== "interview";

  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4" aria-label="Status and interview">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">Status</h2>
        <StatusSelect userJobId={job.userJobId} status={job.status} title={job.title} onChanged={onStatusChanged} />
        <span className="text-xs text-slate-500">Only you change this. Nothing here updates it automatically.</span>
      </div>

      <form onSubmit={save} className="mt-5 space-y-3">
        <h2 className="text-sm font-semibold">Interview</h2>
        <p className="text-xs text-slate-500">
          Enter the date yourself. The app doesn't read your email for interview invitations.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">Interview date and time</span>
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <div className="flex items-center gap-3">
          <button disabled={saving} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-60">
            {saving ? "Saving…" : "Save interview details"}
          </button>
          {date && (
            <button
              type="button"
              onClick={() => setDate("")}
              className="text-sm text-slate-600 underline"
            >
              Clear date
            </button>
          )}
          {message.text && (
            <span role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700"}`}>
              {message.text}
            </span>
          )}
        </div>
        {showsInInterviews && (
          <p className="text-xs text-slate-500">
            This job shows under Interviews on your dashboard. Its status is still “{statusLabel(job.status)}”.
          </p>
        )}
      </form>

      <div className="mt-5">
        <h2 className="mb-2 text-sm font-semibold">History</h2>
        {historyError && <p role="alert" className="text-sm text-red-600">{historyError}</p>}
        {!history && !historyError && <p className="text-sm text-slate-500">Loading…</p>}
        {history && history.length === 0 && <p className="text-sm text-slate-500">No status changes yet.</p>}
        {history && history.length > 0 && (
          <ol className="space-y-1 text-sm text-slate-700">
            {history.map((h) => (
              <li key={h.id}>
                {statusLabel(h.fromStatus)} → <span className="font-medium">{statusLabel(h.toStatus)}</span>
                <span className="ml-2 text-xs text-slate-500">{formatDateTime(h.changedAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
