import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { useResume } from "../resume/ResumeContext.jsx";
import ResumeUpload from "../resume/ResumeUpload.jsx";
import ResumeForm from "../resume/ResumeForm.jsx";

const tabClass = (active) =>
  `rounded-t px-4 py-2 text-sm font-medium ${
    active ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
  }`;

export default function ResumeSetup() {
  const { user, logout } = useAuth();
  const { status, resume, setResume, error, retry } = useResume();
  const navigate = useNavigate();
  const [mode, setMode] = useState("upload");

  if (status === "loading") return <p className="p-8 text-slate-500">Loading…</p>;
  if (status === "error") {
    return (
      <main className="mx-auto mt-24 max-w-sm p-4 text-center">
        <p role="alert" className="mb-4 text-red-600">{error}</p>
        <button onClick={retry} className="rounded border border-slate-300 px-3 py-1 text-sm">
          Try again
        </button>
      </main>
    );
  }
  // Setup is a one-time step: once a resume exists, go on to the app.
  if (resume) return <Navigate to="/" replace />;

  async function onLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Set up your resume</h1>
          <p className="mt-1 text-sm text-slate-600">
            Welcome, {user.fullName}. We need a resume before you can continue. Upload one, or fill in the form.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user.isAdmin && (
            <Link to="/admin" className="text-sm text-indigo-600">Admin</Link>
          )}
          <button onClick={onLogout} className="rounded border border-slate-300 px-3 py-1 text-sm">
            Log out
          </button>
        </div>
      </header>

      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        <button role="tab" aria-selected={mode === "upload"} className={tabClass(mode === "upload")} onClick={() => setMode("upload")}>
          Upload a file
        </button>
        <button role="tab" aria-selected={mode === "form"} className={tabClass(mode === "form")} onClick={() => setMode("form")}>
          Fill in a form
        </button>
      </div>

      <div className="rounded-b bg-white p-6 shadow">
        {mode === "upload" ? <ResumeUpload onDone={setResume} /> : <ResumeForm onDone={setResume} />}
      </div>
    </main>
  );
}
