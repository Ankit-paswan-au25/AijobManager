import ScoreBadge from "./ScoreBadge.jsx";

const LIMITED_NOTE = "Based on limited job details. Open the posting for the full description.";

function Chips({ items, className, empty }) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((s) => (
        <li key={s} className={`rounded-full px-2.5 py-0.5 text-xs ${className}`}>{s}</li>
      ))}
    </ul>
  );
}

export default function MatchTab({ job }) {
  const { match } = job;
  return (
    <div className="space-y-5">
      {job.limitedInfo && <p role="note" className="rounded bg-amber-50 p-3 text-sm text-amber-900">{LIMITED_NOTE}</p>}

      {!match && <p className="text-sm text-slate-600">This job hasn't been scored yet. Scores appear shortly after a sync.</p>}

      {match && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-semibold">{match.score}</span>
            <span className="text-sm text-slate-500">/ 100</span>
            <ScoreBadge match={match} />
          </div>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Why</h3>
            <p className="text-sm text-slate-700">{match.reasoning}</p>
            {match.llmFailed && (
              <p className="mt-2 text-xs text-slate-500">
                AI scoring wasn't available for this job, so the score only compares skills.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Skills you have that the job mentions</h3>
            <Chips items={match.matchedSkills} className="bg-green-100 text-green-800" empty="None found." />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Skill gaps to review</h3>
            <Chips items={match.missingSkills} className="bg-amber-100 text-amber-800" empty="No gaps found." />
          </section>
        </>
      )}

      <section>
        <h3 className="mb-1 text-sm font-semibold">What we know about this job</h3>
        <p className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-700">
          {job.snippet || "Nothing beyond the title, company and location."}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Job alert emails only include a short excerpt, never the full description.
        </p>
      </section>
    </div>
  );
}
