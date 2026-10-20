const tone = (score) =>
  score >= 90 ? "bg-green-100 text-green-800" : score >= 80 ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-700";

/** `match` is the job's match ({ score, label }) or null when it hasn't been scored yet. */
export default function ScoreBadge({ match }) {
  if (!match) {
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Not scored yet</span>;
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone(match.score)}`}>
      {match.score} · {match.label}
    </span>
  );
}
