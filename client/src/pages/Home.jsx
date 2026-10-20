import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { useResume } from "../resume/ResumeContext.jsx";
import AppHeader from "../components/AppHeader.jsx";

export default function Home() {
  const { user } = useAuth();
  const { resume } = useResume();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <AppHeader />
      <p className="text-lg">Welcome, {user.fullName}!</p>
      <p className="mt-1 text-sm text-slate-500">{user.email}</p>
      <p className="mt-6 text-sm text-slate-600">
        Resume on file: {resume.source === "uploaded" ? "uploaded file" : "created in the app"}.
      </p>
      <p className="mt-2 text-sm text-slate-600">
        <Link className="text-indigo-600" to="/portals">Choose your job portals</Link>
      </p>
    </main>
  );
}
