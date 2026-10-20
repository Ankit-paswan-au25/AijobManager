import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import AppHeader from "../components/AppHeader.jsx";
import PendingPortalCard from "../admin/PendingPortalCard.jsx";

export default function Admin() {
  const [portals, setPortals] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    api("/admin/portals/pending")
      .then((data) => setPortals(data.portals))
      .catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  return (
    <main className="mx-auto max-w-3xl p-8">
      {/* Admins may not have finished resume setup; don't link them to pages that would bounce them. */}
      <AppHeader withResumeNav={false} />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Portals awaiting review</h1>
        <button onClick={load} className="rounded border border-slate-300 px-3 py-1 text-sm">Refresh</button>
      </div>
      <p className="mb-4 text-sm text-slate-600">
        Nothing is approved automatically. Users are told to expect a decision within 48 hours.
      </p>

      {error && <p role="alert" className="text-red-600">{error}</p>}
      {!portals && !error && <p className="text-slate-500">Loading…</p>}
      {portals && portals.length === 0 && <p className="text-slate-600">The queue is empty.</p>}
      {portals && portals.length > 0 && (
        <ul className="space-y-4">
          {portals.map((p) => (
            <PendingPortalCard
              key={p.id}
              portal={p}
              onReviewed={(id) => setPortals((list) => list.filter((x) => x.id !== id))}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
