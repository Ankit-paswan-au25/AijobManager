import { useState } from "react";
import { api } from "../api/client.js";
import { usePaged } from "../admin/usePaged.js";
import AppHeader from "../components/AppHeader.jsx";
import Pagination from "../components/Pagination.jsx";
import { formatDateTime } from "../jobs/format.js";

const FILTERS = [
  { id: "", label: "All" },
  { id: "visible", label: "Visible" },
  { id: "hidden", label: "Hidden" },
  { id: "flagged", label: "Flagged" },
];
const BADGE = {
  visible: "bg-green-100 text-green-800",
  hidden: "bg-slate-200 text-slate-700",
  flagged: "bg-amber-100 text-amber-800",
};

function ReviewCard({ review, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function setStatus(status) {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/reviews/${review.id}`, { method: "PATCH", body: { status } });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const btn = "rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-60";
  return (
    <li className="rounded-lg bg-white p-4 shadow">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[review.status]}`}>{review.status}</span>
        <span className="font-medium">{review.author.name}</span>
        <span className="text-slate-500">{review.author.email}</span>
        <span className="ml-auto text-xs text-slate-500">{formatDateTime(review.createdAt)}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">About: {review.portal ? review.portal.name : "the app"}</p>
      {/* Plain text only: React escapes it, and whitespace is kept. */}
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{review.body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {review.status !== "hidden" && <button className={btn} disabled={busy} onClick={() => setStatus("hidden")}>Hide</button>}
        {review.status !== "visible" && (
          <button className={btn} disabled={busy} onClick={() => setStatus("visible")}>
            {review.status === "hidden" ? "Unhide" : "Clear flag"}
          </button>
        )}
        {review.status !== "flagged" && <button className={btn} disabled={busy} onClick={() => setStatus("flagged")}>Flag</button>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}

export default function AdminReviews() {
  const [status, setStatus] = useState("");
  const { data, error, setPage, reload } = usePaged("/admin/reviews", { status });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <AppHeader withResumeNav={false} />
      <h1 className="mb-1 text-2xl font-semibold">Reviews</h1>
      <p className="mb-4 text-sm text-slate-600">
        Only visible reviews are shown to users. Hidden and flagged reviews are not. Every change is recorded in the audit log.
      </p>

      <label className="mb-4 flex items-center gap-2 text-sm">
        Show
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
          {FILTERS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </label>

      {error && <p role="alert" className="text-red-600">{error}</p>}
      {!data && !error && <p className="text-slate-500">Loading…</p>}
      {data && data.reviews.length === 0 && <p className="text-slate-600">No reviews here.</p>}
      {data && (
        <>
          <ul className="space-y-3">
            {data.reviews.map((r) => (
              <ReviewCard key={r.id} review={r} onChanged={reload} />
            ))}
          </ul>
          <Pagination data={data} onPage={setPage} />
        </>
      )}
    </main>
  );
}
