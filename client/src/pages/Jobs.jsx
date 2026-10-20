import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import AppHeader from "../components/AppHeader.jsx";
import ScoreBadge from "../jobs/ScoreBadge.jsx";

/**
 * Minimal jobs list: just enough to reach a job's page.
 * TODO: status filter, sort control, Gmail connect/sync buttons, pagination.
 */
export default function Jobs() {
  const [showAll, setShowAll] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    // By default the server hides jobs scoring below 80; min_score=0 shows everything.
    api(showAll ? "/jobs?min_score=0" : "/jobs")
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [showAll]);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <AppHeader />
      <h1 className="mb-1 text-2xl font-semibold">Your jobs</h1>
      <p className="mb-4 text-sm text-slate-600">
        Best matches first. You apply on each job portal yourself; this app never applies for you.
      </p>

      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4" />
        Show jobs below the 80-point threshold
      </label>

      {error && <p role="alert" className="text-red-600">{error}</p>}
      {!data && !error && <p className="text-slate-500">Loading…</p>}

      {data && (
        <>
          {data.jobs.length === 0 && (
            <p className="rounded bg-white p-4 text-sm text-slate-600 shadow">
              No jobs to show.
              {data.hiddenBelowMinScore > 0 && ` ${data.hiddenBelowMinScore} below the threshold are hidden.`}
            </p>
          )}
          <ul className="space-y-3">
            {data.jobs.map((job) => (
              <li key={job.id} className="rounded-lg bg-white p-4 shadow">
                <Link to={`/jobs/${job.id}`} className="font-medium text-indigo-700 hover:underline">
                  {job.title}
                </Link>
                <p className="mt-0.5 text-sm text-slate-600">
                  {job.company}
                  {job.location ? ` · ${job.location}` : ""}
                </p>
                <div className="mt-2">
                  <ScoreBadge match={job.match} />
                </div>
              </li>
            ))}
          </ul>
          {(data.unscored > 0 || (!showAll && data.hiddenBelowMinScore > 0 && data.jobs.length > 0)) && (
            <p className="mt-4 text-xs text-slate-500">
              {data.unscored > 0 && `${data.unscored} job${data.unscored === 1 ? " is" : "s are"} still waiting to be scored. `}
              {!showAll && data.hiddenBelowMinScore > 0 && `${data.hiddenBelowMinScore} below the threshold are hidden.`}
            </p>
          )}
        </>
      )}
    </main>
  );
}
