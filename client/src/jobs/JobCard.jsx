import { Link } from "react-router-dom";
import ScoreBadge from "./ScoreBadge.jsx";
import StatusSelect from "./StatusSelect.jsx";
import { formatDate, formatDateTime, portalName, postedAgeText } from "./format.js";

/**
 * One job. Works for dashboard cards ({ score, label }) and for /api/jobs items ({ match }).
 * Shows title, company, portal, score label, status, posted age (if known) and the date we received the alert.
 */
export default function JobCard({ job, onStatusChanged }) {
  const match = job.match ?? (job.score === null || job.score === undefined ? null : { score: job.score, label: job.label });
  const posted = postedAgeText(job);

  return (
    <li className="rounded-lg bg-white p-4 shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/jobs/${job.id}`} className="font-medium text-indigo-700 hover:underline">
            {job.title}
          </Link>
          <p className="mt-0.5 text-sm text-slate-600">
            {job.company} · {portalName(job.sourcePortal)}
          </p>
        </div>
        <ScoreBadge match={match} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        <label className="flex items-center gap-1.5">
          <span>Status</span>
          <StatusSelect userJobId={job.userJobId} status={job.status} title={job.title} onChanged={onStatusChanged} />
        </label>
        {posted && <span>{posted}</span>}
        <span>Received {formatDate(job.receivedAt)}</span>
        {job.interviewDate && (
          <span className="font-medium text-slate-700">Interview {formatDateTime(job.interviewDate)}</span>
        )}
      </div>
    </li>
  );
}
