import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import AppHeader from "../components/AppHeader.jsx";
import AddPortalForm, { REVIEW_WINDOW_HOURS } from "../portals/AddPortalForm.jsx";
import PortalStatusBadge from "../portals/PortalStatusBadge.jsx";

const selectedIdsOf = (portals) => new Set(portals.filter((p) => p.selected).map((p) => p.id));
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

export default function Portals() {
  const [portals, setPortals] = useState(null);
  const [saved, setSaved] = useState(new Set()); // what the server has
  const [selected, setSelected] = useState(new Set()); // what's ticked now
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState({ busy: false, error: "", ok: false });

  useEffect(() => {
    let cancelled = false;
    api("/portals")
      .then((data) => {
        if (cancelled) return;
        setPortals(data.portals);
        setSaved(selectedIdsOf(data.portals));
        setSelected(selectedIdsOf(data.portals));
      })
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const approved = useMemo(() => (portals ?? []).filter((p) => p.status === "approved"), [portals]);
  const pending = useMemo(() => (portals ?? []).filter((p) => p.status === "pending"), [portals]);
  const dirty = !sameSet(saved, selected);

  function toggle(id) {
    setSaveState({ busy: false, error: "", ok: false });
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function onSave() {
    setSaveState({ busy: true, error: "", ok: false });
    try {
      const data = await api("/users/me/portals", { method: "PUT", body: { portalIds: [...selected] } });
      setPortals(data.portals);
      const now = selectedIdsOf(data.portals);
      setSaved(now);
      setSelected(now);
      setSaveState({ busy: false, error: "", ok: true });
    } catch (err) {
      setSaveState({ busy: false, error: err.message, ok: false });
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <AppHeader />
      <h1 className="mb-1 text-2xl font-semibold">Your job portals</h1>
      <p className="mb-6 text-sm text-slate-600">
        Pick the portals you use. We never ask for your portal passwords and never apply on your behalf.
      </p>

      {loadError && <p role="alert" className="text-red-600">{loadError}</p>}
      {!portals && !loadError && <p className="text-slate-500">Loading…</p>}

      {portals && (
        <div className="space-y-6">
          <section className="rounded-lg bg-white p-4 shadow">
            <ul className="divide-y divide-slate-100">
              {approved.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4"
                    />
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-slate-500">{new URL(p.baseUrl).host}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={onSave}
                disabled={!dirty || saveState.busy}
                className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {saveState.busy ? "Saving…" : "Save selection"}
              </button>
              {saveState.ok && !dirty && <span role="status" className="text-sm text-green-700">Saved</span>}
              {saveState.error && <span role="alert" className="text-sm text-red-600">{saveState.error}</span>}
            </div>
          </section>

          {pending.length > 0 && (
            <section className="rounded-lg bg-white p-4 shadow">
              <h2 className="mb-2 font-semibold">Your submissions</h2>
              <ul className="divide-y divide-slate-100">
                {pending.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-slate-500">{new URL(p.baseUrl).host}</span>
                    <PortalStatusBadge status={p.status} />
                    <span className="text-xs text-slate-500">
                      Under review, expected within {REVIEW_WINDOW_HOURS} hours
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <AddPortalForm onSubmitted={(portal) => setPortals((list) => [...list, portal])} />
        </div>
      )}
    </main>
  );
}
