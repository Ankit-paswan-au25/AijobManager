import { Navigate, Outlet } from "react-router-dom";
import { useResume } from "./ResumeContext.jsx";

/** Blocks every nested page until the user has a resume. Mount inside ProtectedRoute. */
export default function RequireResume() {
  const { status, resume, error, retry } = useResume();

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
  return resume ? <Outlet /> : <Navigate to="/resume-setup" replace />;
}
