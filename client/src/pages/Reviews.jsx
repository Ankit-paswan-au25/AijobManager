import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { usePaged } from "../admin/usePaged.js";
import AppHeader from "../components/AppHeader.jsx";
import Pagination from "../components/Pagination.jsx";
import { formatDate } from "../jobs/format.js";

const MAX = 1000;

export default function Reviews() {
  const [portals, setPortals] = useState([]);
  const [filter, setFilter] = useState(""); // "", "app", or a portal id
  const [body, setBody] = useState("");
  const [about, setAbout] = useState("app");
  const [posting, setPosting] = useState(false);
  const [message, setMessage] = useState({ kind: "", text: "" });

  const params = filter === "app" ? { about: "app" } : filter ? { portal_id: filter } : {};
  const { data, error, setPage, reload } = usePaged("/reviews", params, 10);

  useEffect(() => {
    // Only approved portals can be reviewed.
    api("/portals")
      .then((d) => setPortals(d.portals.filter((p) => p.status === "approved")))
      .catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setPosting(true);
    setMessage({ kind: "", text: "" });
    try {
      await api("/reviews", { method: "POST", body: { body, portal_id: about === "app" ? null : about } });
      setBody("");
      setMessage({ kind: "ok", text: "Thanks! Your review was posted." });
      reload();
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    } finally {
      setPosting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <AppHeader />
      <h1 className="mb-1 text-2xl font-semibold">Reviews</h1>
      <p className="mb-6 text-sm text-slate-600">
        Share what worked for you, about a job portal or about this app. Reviews don't show your name. Don't post personal details.
      </p>

      <form onSubmit={submit} className="mb-8 space-y-3 rounded-lg bg-white p-4 shadow">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">About</span>
          <select value={about} onChange={(e) => setAbout(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
            <option value="app">This app</option>
            {portals.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">Your review</span>
          <textarea
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MAX}
            rows={4}
            className="w-full rounded border border-slate-300 px-2 py-1"
          />
          <span className="text-xs text-slate-500">{body.length} / {MAX}</span>
        </label>
        <div className="flex items-center gap-3">
          <button disabled={posting || !body.trim()} className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60">
            {posting ? "Posting…" : "Post review"}
          </button>
          {message.text && (
            <span role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700"}`}>
              {message.text}
            </span>
          )}
        </div>
      </form>

      <label className="mb-4 flex items-center gap-2 text-sm">
        Show reviews of
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
          <option value="">Everything</option>
          <option value="app">This app</option>
          {portals.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>

      {error && <p role="alert" className="text-red-600">{error}</p>}
      {!data && !error && <p className="text-slate-500">Loading…</p>}
      {data && data.reviews.length === 0 && <p className="text-slate-600">No reviews yet.</p>}
      {data && (
        <>
          <ul className="space-y-3">
            {data.reviews.map((r) => (
              <li key={r.id} className="rounded-lg bg-white p-4 shadow">
                <p className="text-xs text-slate-500">
                  About {r.portal ? r.portal.name : "the app"} · {formatDate(r.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{r.body}</p>
              </li>
            ))}
          </ul>
          <Pagination data={data} onPage={setPage} />
        </>
      )}
    </main>
  );
}
