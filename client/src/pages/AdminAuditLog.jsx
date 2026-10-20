import { usePaged } from "../admin/usePaged.js";
import AppHeader from "../components/AppHeader.jsx";
import Pagination from "../components/Pagination.jsx";
import { formatDateTime } from "../jobs/format.js";

const ACTION_LABEL = {
  approve_portal: "Approved a portal",
  reject_portal: "Rejected a portal",
  hide_review: "Hid a review",
  unhide_review: "Unhid a review",
  flag_review: "Flagged a review",
  view_resume: "Viewed a resume",
};
const TARGET_LABEL = { portal: "Portal", review: "Review by", resume: "Resume of" };

export default function AdminAuditLog() {
  const { data, error, setPage } = usePaged("/admin/audit-log");

  return (
    <main className="mx-auto max-w-5xl p-8">
      <AppHeader withResumeNav={false} />
      <h1 className="mb-1 text-2xl font-semibold">Audit log</h1>
      <p className="mb-4 text-sm text-slate-600">What admins did, newest first. Entries can't be edited or deleted here.</p>

      {error && <p role="alert" className="text-red-600">{error}</p>}
      {!data && !error && <p className="text-slate-500">Loading…</p>}

      {data && (
        <>
          <div className="overflow-x-auto rounded-lg bg-white shadow">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Admin</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Target</th>
                </tr>
              </thead>
              <tbody>
                {data.actions.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="p-3 whitespace-nowrap">{formatDateTime(a.createdAt)}</td>
                    <td className="p-3">{a.adminEmail ?? <span className="text-slate-400">(deleted admin)</span>}</td>
                    <td className="p-3">{ACTION_LABEL[a.action] ?? a.action}</td>
                    <td className="p-3">
                      {TARGET_LABEL[a.targetType] ?? a.targetType}{" "}
                      <span className="font-medium">{a.targetLabel ?? "(no longer exists)"}</span>
                      <span className="ml-2 font-mono text-xs text-slate-400" title={a.targetId}>{a.targetId.slice(0, 8)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.actions.length === 0 && <p className="p-4 text-sm text-slate-500">Nothing has been logged yet.</p>}
          </div>
          <Pagination data={data} onPage={setPage} />
        </>
      )}
    </main>
  );
}
