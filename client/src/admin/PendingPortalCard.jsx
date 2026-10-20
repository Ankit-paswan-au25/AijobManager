import { useState } from "react";
import { api } from "../api/client.js";
import { formatDuration } from "../lib/formatDuration.js";

export default function PendingPortalCard({ portal, onReviewed }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action, body) {
    setError("");
    setBusy(true);
    try {
      await api(`/admin/portals/${portal.id}/${action}`, { method: "POST", body });
      onReviewed(portal.id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <li className="space-y-3 rounded-lg bg-white p-4 shadow">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold">{portal.name}</span>{" "}
          {/* baseUrl is validated server-side to be http(s) only */}
          <a
            href={portal.baseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-600 underline"
          >
            {portal.baseUrl}
          </a>
        </div>
        <span className={`text-sm ${portal.overdue ? "font-semibold text-red-600" : "text-slate-600"}`}>
          Pending for {formatDuration(portal.pendingMinutes)}
          {portal.overdue && " (past 48h)"}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Domain: {portal.domain} · Submitted by {portal.submittedByEmail ?? "unknown"}
      </p>

      <div className="flex flex-wrap items-start gap-3">
        <button
          onClick={() => act("approve")}
          disabled={busy}
          className="rounded bg-green-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          Approve
        </button>
        <div className="flex min-w-[16rem] flex-1 gap-2">
          <input
            aria-label={`Rejection reason for ${portal.name}`}
            placeholder="Reason (required to reject)"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => act("reject", { reason: reason.trim() })}
            disabled={busy || !reason.trim()}
            className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </li>
  );
}
