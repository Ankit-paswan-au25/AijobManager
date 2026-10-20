import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import AppHeader from "../components/AppHeader.jsx";
import JobCard from "../jobs/JobCard.jsx";
import { formatDate } from "../jobs/format.js";

function Section({ title, hint, count, empty, children }) {
  return (
    <section className="mb-8" aria-label={title}>
      <h2 className="text-lg font-semibold">
        {title} <span className="text-sm font-normal text-slate-500">({count})</span>
      </h2>
      {hint && <p className="mb-3 text-sm text-slate-500">{hint}</p>}
      {count === 0 ? <p className="rounded bg-white p-3 text-sm text-slate-500 shadow">{empty}</p> : children}
    </section>
  );
}

function JobList({ jobs, onChanged }) {
  return (
    <ul className="space-y-3">
      {jobs.map((job) => (
        <JobCard key={job.userJobId} job={job} onStatusChanged={onChanged} />
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    return api("/dashboard")
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <AppHeader />
      <h1 className="mb-1 text-2xl font-semibold">Dashboard</h1>
      <p className="mb-6 text-sm text-slate-600">
        You apply on each job portal yourself. This app never applies for you, and only you change a job's status.
      </p>

      {error && <p role="alert" className="mb-4 text-red-600">{error}</p>}
      {!data && !error && <p className="text-slate-500">Loading…</p>}

      {data && (
        <>
          <Section
            title="Top matches"
            hint="Scored 90 or more, not applied yet."
            count={data.topMatches.length}
            empty="No top matches right now."
          >
            <JobList jobs={data.topMatches} onChanged={load} />
          </Section>

          <Section
            title="Strong matches"
            hint="Scored 80–89. Check the skill gaps before you apply."
            count={data.strongMatches.length}
            empty="No strong matches right now."
          >
            <JobList jobs={data.strongMatches} onChanged={load} />
          </Section>

          <Section title="Applied" count={data.applied.length} empty="You haven't marked any job as applied.">
            <JobList jobs={data.applied} onChanged={load} />
          </Section>

          <Section
            title="Pending portal review"
            hint="Portals you suggested that an admin hasn't decided on yet. Only you can see these."
            count={data.pendingPortals.length}
            empty="You have no portals waiting for review."
          >
            <ul className="space-y-3">
              {data.pendingPortals.map((p) => (
                <li key={p.id} className="rounded-lg bg-white p-4 shadow">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-slate-600">{p.baseUrl}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {p.submittedAt ? `Submitted ${formatDate(p.submittedAt)}. ` : ""}Waiting for an admin.
                  </p>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Interviews"
            hint="Jobs you moved to Interview, or gave an interview date. Upcoming ones come first."
            count={data.interviews.length}
            empty="No interviews yet. Add a date on a job's page when you have one."
          >
            <JobList jobs={data.interviews} onChanged={load} />
          </Section>

          <p className="text-sm text-slate-600">
            {data.otherOpenJobs > 0 && `${data.otherOpenJobs} open job${data.otherOpenJobs === 1 ? " is" : "s are"} below 80 or not scored yet. `}
            <Link className="text-indigo-600" to="/jobs">See all jobs</Link>
            {" · "}
            <Link className="text-indigo-600" to="/portals">Choose your job portals</Link>
          </p>
        </>
      )}
    </main>
  );
}
