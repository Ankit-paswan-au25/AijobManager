import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

const linkClass = ({ isActive }) =>
  `text-sm ${isActive ? "font-semibold text-indigo-700" : "text-slate-600 hover:text-slate-900"}`;

/** `withResumeNav` is false while the user hasn't finished resume setup (those pages are blocked). */
export default function AppHeader({ withResumeNav = true }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="mb-8 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link to="/" className="text-xl font-semibold">AI Job Manager</Link>
        <nav className="flex gap-4">
          {withResumeNav && <NavLink to="/" end className={linkClass}>Home</NavLink>}
          {withResumeNav && <NavLink to="/jobs" className={linkClass}>Jobs</NavLink>}
          {withResumeNav && <NavLink to="/portals" className={linkClass}>Portals</NavLink>}
          {user.isAdmin && <NavLink to="/admin" className={linkClass}>Admin</NavLink>}
        </nav>
      </div>
      <button onClick={onLogout} className="rounded border border-slate-300 px-3 py-1 text-sm">
        Log out
      </button>
    </header>
  );
}
