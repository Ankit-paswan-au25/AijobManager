import { Link } from "react-router-dom";
import { usePaged } from "../admin/usePaged.js";
import AppHeader from "../components/AppHeader.jsx";
import Pagination from "../components/Pagination.jsx";
import { formatDate } from "../jobs/format.js";

const RESUME_LABEL = { none: "No resume", created: "Created in app", uploaded: "Uploaded file" };

export default function AdminUsers() {
  const { data, error, setPage } = usePaged("/admin/users");

  return (
    <main className="mx-auto max-w-5xl p-8">
      <AppHeader withResumeNav={false} />
      <h1 className="mb-1 text-2xl font-semibold">Users</h1>
      <p className="mb-4 text-sm text-slate-600">
        Newest signups first. Opening someone's resume is recorded in the audit log.
      </p>

      {error && <p role="alert" className="text-red-600">{error}</p>}
      {!data && !error && <p className="text-slate-500">Loading…</p>}

      {data && (
        <>
          <div className="overflow-x-auto rounded-lg bg-white shadow">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Signed up</th>
                  <th className="p-3">Country</th>
                  <th className="p-3">City</th>
                  <th className="p-3">Resume</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="p-3 font-medium">{u.fullName}</td>
                    <td className="p-3">{u.email}</td>
                    <td className="p-3 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                    <td className="p-3">{u.country ?? <span className="text-slate-400">–</span>}</td>
                    <td className="p-3">{u.city ?? <span className="text-slate-400">–</span>}</td>
                    <td className="p-3 whitespace-nowrap">
                      {RESUME_LABEL[u.resumeStatus]}
                      {u.resumeUrl && (
                        <>
                          {" · "}
                          <Link className="text-indigo-600 hover:underline" to={`/admin/users/${u.id}/resume`}>
                            View resume
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.users.length === 0 && <p className="p-4 text-sm text-slate-500">No users on this page.</p>}
          </div>
          <Pagination data={data} onPage={setPage} />
        </>
      )}
    </main>
  );
}
