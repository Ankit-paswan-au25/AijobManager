import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import AdminRoute from "./auth/AdminRoute.jsx";
import RequireResume from "./resume/RequireResume.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Home from "./pages/Home.jsx";
import ResumeSetup from "./pages/ResumeSetup.jsx";
import Portals from "./pages/Portals.jsx";
import Admin from "./pages/Admin.jsx";
import Jobs from "./pages/Jobs.jsx";
import JobDetail from "./pages/JobDetail.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route element={<ProtectedRoute />}>
        {/* Reachable without a resume: it's the step that creates one. */}
        <Route path="/resume-setup" element={<ResumeSetup />} />
        {/* Admin tools aren't part of the job-seeker flow, so they don't require a resume. */}
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<Admin />} />
        </Route>
        {/* Everything below requires a resume. Add new app pages here. */}
        <Route element={<RequireResume />}>
          <Route path="/" element={<Home />} />
          <Route path="/portals" element={<Portals />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
