import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import AppHeader from "../components/AppHeader.jsx";
import JobCard from "../jobs/JobCard.jsx";

/**
 * Every job you have (best first), including rejected and archived ones, so nothing disappears.
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

  const onStatusChanged = (jobId) => (userJob) =>
    setData((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, status: userJob.status } : j)) }));

  return (
    <main className="mx-auto max-w-3xl p-8">
      <AppHeader />
      <h1 className="mb-1 text-2xl font-semibold">All jobs</h1>
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
              <JobCard key={job.userJobId} job={job} onStatusChanged={onStatusChanged(job.id)} />
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
