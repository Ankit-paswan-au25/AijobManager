import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import AdminRoute from "./auth/AdminRoute.jsx";
import RequireResume from "./resume/RequireResume.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ResumeSetup from "./pages/ResumeSetup.jsx";
import Portals from "./pages/Portals.jsx";
import Admin from "./pages/Admin.jsx";
import Jobs from "./pages/Jobs.jsx";
import JobDetail from "./pages/JobDetail.jsx";
import Reviews from "./pages/Reviews.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";
import AdminUserResume from "./pages/AdminUserResume.jsx";
import AdminReviews from "./pages/AdminReviews.jsx";
import AdminAuditLog from "./pages/AdminAuditLog.jsx";

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
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/users/:id/resume" element={<AdminUserResume />} />
          <Route path="/admin/reviews" element={<AdminReviews />} />
          <Route path="/admin/audit-log" element={<AdminAuditLog />} />
        </Route>
        {/* Everything below requires a resume. Add new app pages here. */}
        <Route element={<RequireResume />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/portals" element={<Portals />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/reviews" element={<Reviews />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
