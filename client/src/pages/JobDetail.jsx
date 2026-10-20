import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import AppHeader from "../components/AppHeader.jsx";
import DocumentTab from "../jobs/DocumentTab.jsx";
import { CoverNoteView, PrepKitView, ResumeView } from "../jobs/DocumentViews.jsx";
import MatchTab from "../jobs/MatchTab.jsx";
import ScoreBadge from "../jobs/ScoreBadge.jsx";

const TABS = [
  { id: "match", label: "Match" },
  { id: "resume", label: "Tailored Resume" },
  { id: "cover_note", label: "Cover Note" },
  { id: "prep_kit", label: "Prep Kit" },
];

const DOCS = {
  resume: {
    label: "tailored resume",
    hint: "Reorders and rephrases your own resume to emphasise what this job asks for. It never adds skills, employers, job titles or dates that aren't already in your resume.",
    View: ResumeView,
  },
  cover_note: {
    label: "cover note",
    hint: "A short cover note (120–180 words) based on this job and your resume.",
    View: CoverNoteView,
  },
  prep_kit: {
    label: "prep kit",
    hint: "A role summary, the 10 most likely interview questions with answer approaches from your experience, topics to review with YouTube search phrases, and 5 questions to ask the interviewer.",
    View: PrepKitView,
  },
};

const PORTAL_NAMES = { naukri: "Naukri", indeed: "Indeed", shine: "Shine", glassdoor: "Glassdoor", wellfound: "Wellfound", foundit: "foundit" };

/** Only ever link out to https addresses (the server already restricts them to the portal's own domain). */
const safePostingUrl = (url) => (typeof url === "string" && url.startsWith("https://") ? url : null);

export default function JobDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "match";

  const [job, setJob] = useState(null);
  const [docs, setDocs] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busyType, setBusyType] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let cancelled = false;
    setJob(null);
    setDocs(null);
    setLoadError("");
    Promise.all([api(`/jobs/${id}`), api(`/jobs/${id}/documents`)])
      .then(([j, d]) => {
        if (cancelled) return;
        setJob(j.job);
        setDocs(d.documents);
      })
      .catch((err) => !cancelled && setLoadError(err.status === 404 ? "We couldn't find that job." : err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function generate(type) {
    setBusyType(type);
    setErrors((e) => ({ ...e, [type]: "" }));
    try {
      const { document } = await api(`/jobs/${id}/documents`, { method: "POST", body: { type } });
      setDocs((d) => ({ ...d, [type]: document }));
    } catch (err) {
      setErrors((e) => ({ ...e, [type]: err.message }));
    } finally {
      setBusyType(null);
    }
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <AppHeader />
        <p role="alert" className="text-red-600">{loadError}</p>
        <p className="mt-3"><Link className="text-indigo-600" to="/jobs">Back to jobs</Link></p>
      </main>
    );
  }
  if (!job || !docs) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <AppHeader />
        <p className="text-slate-500">Loading…</p>
      </main>
    );
  }

  const postingUrl = safePostingUrl(job.jobUrl);
  const portal = PORTAL_NAMES[job.sourcePortal] ?? job.sourcePortal;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <AppHeader />
      <p className="mb-3 text-sm"><Link className="text-indigo-600" to="/jobs">← All jobs</Link></p>

      <header className="mb-4">
        <h1 className="text-2xl font-semibold">{job.title}</h1>
        <p className="mt-1 text-slate-700">
          {job.company}
          {job.location ? ` · ${job.location}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
          <span>From {portal}</span>
          <ScoreBadge match={job.match} />
        </div>
      </header>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          {postingUrl ? (
            <a
              href={postingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded bg-indigo-600 px-4 py-2 text-sm text-white"
            >
              Open job posting
            </a>
          ) : (
            <span className="text-sm text-slate-600">
              No clean link to this posting was found in the email. Search for it on {portal}.
            </span>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-600">
          You apply on the {portal} site yourself. This app never applies for you and never logs in to {portal}.
        </p>
      </section>

      <div role="tablist" aria-label="Job sections" className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              tab === t.id
                ? "border-indigo-600 font-semibold text-indigo-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="rounded-lg bg-white p-5 shadow"
      >
        {tab === "match" && <MatchTab job={job} />}
        {tab !== "match" && (
          <DocumentTab
            label={DOCS[tab].label}
            hint={DOCS[tab].hint}
            doc={docs[tab]}
            busy={busyType === tab}
            error={errors[tab]}
            onGenerate={() => generate(tab)}
          >
            {docs[tab] && (() => {
              const { View } = DOCS[tab];
              return <View content={docs[tab].content} />;
            })()}
          </DocumentTab>
        )}
      </section>
    </main>
  );
}
