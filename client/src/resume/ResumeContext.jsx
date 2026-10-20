import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";

const ResumeContext = createContext(null);

/** status: "loading" | "ready" | "error". When ready, `resume` is null if the user has none. */
export function ResumeProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState({ status: "loading", resume: null, error: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setState({ status: "loading", resume: null, error: "" });
    if (!userId) return;
    let cancelled = false;
    api("/resumes/me")
      .then((data) => !cancelled && setState({ status: "ready", resume: data.resume, error: "" }))
      .catch((err) => {
        if (cancelled) return;
        if (err.code === "RESUME_NOT_FOUND") setState({ status: "ready", resume: null, error: "" });
        else setState({ status: "error", resume: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const setResume = useCallback((resume) => setState({ status: "ready", resume, error: "" }), []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo(() => ({ ...state, setResume, retry }), [state, setResume, retry]);
  return <ResumeContext.Provider value={value}>{children}</ResumeContext.Provider>;
}

export function useResume() {
  const ctx = useContext(ResumeContext);
  if (!ctx) throw new Error("useResume must be used inside ResumeProvider");
  return ctx;
}
