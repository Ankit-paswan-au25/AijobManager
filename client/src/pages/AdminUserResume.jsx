import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import AppHeader from "../components/AppHeader.jsx";
import { formatDateTime } from "../jobs/format.js";

/**
 * The resume is fetched only when the admin clicks the button, never on page load.
 * Each fetch is one audit-log entry, so a reload or a prefetch must not create one by accident.
 */
export default function AdminUserResume() {
  const { id } = useParams();
  const [state, setState] = useState({ status: "idle", data: null, error: "" });

  async function open() {
    setState({ status: "loading", data: null, error: "" });
    try {
      setState({ status: "done", data: await api(`/admin/users/${id}/resume`), error: "" });
    } catch (err) {
      setState({ status: "error", data: null, error: err.message });
    }
  }

  const { data } = state;
  return (
    <main className="mx-auto max-w-3xl p-8">
      <AppHeader withResumeNav={false} />
      <p className="mb-3 text-sm"><Link className="text-indigo-600" to="/admin/users">← Users</Link></p>
      <h1 className="mb-4 text-2xl font-semibold">User resume</h1>

      {state.status !== "done" && (
        <div className="rounded-lg bg-white p-5 shadow">
          <p className="mb-4 text-sm text-slate-600">
            This is private information. Opening it is recorded in the audit log with your name and the time.
          </p>
          <button
            onClick={open}
            disabled={state.status === "loading"}
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {state.status === "loading" ? "Opening…" : "Open resume"}
          </button>
          {state.error && <p role="alert" className="mt-3 text-sm text-red-600">{state.error}</p>}
        </div>
      )}

      {data && (
        <section className="rounded-lg bg-white p-5 shadow">
          <p className="font-medium">{data.user.fullName}</p>
          <p className="text-sm text-slate-600">{data.user.email}</p>
          <p className="mt-1 text-xs text-slate-500">
            {data.resume.source === "uploaded" ? "Uploaded file (text extracted)" : "Created in the app"} · updated{" "}
            {formatDateTime(data.resume.updatedAt)}
          </p>
          <p className="mt-1 text-xs text-slate-500">This view was recorded in the audit log.</p>
          <pre className="mt-4 whitespace-pre-wrap rounded bg-slate-50 p-4 font-sans text-sm text-slate-800">
            {data.resume.text}
          </pre>
        </section>
      )}
    </main>
  );
}
