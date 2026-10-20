import { useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { buildResumePayload } from "./buildResumePayload.js";

const input = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm";

function Field({ label, hint, children }) {
  return (
    <label className="block text-sm">
      {label}
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

/** A list of repeatable entries with add/remove buttons. */
function Repeatable({ title, items, blank, onChange, addLabel, render }) {
  const update = (i, patch) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">{title}</legend>
      {items.map((item, i) => (
        <div key={i} className="space-y-3 rounded border border-slate-200 p-3">
          {render(item, (patch) => update(i, patch))}
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="text-xs text-red-600"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { ...blank }])}
        className="rounded border border-slate-300 px-3 py-1 text-sm"
      >
        + {addLabel}
      </button>
    </fieldset>
  );
}

export default function ResumeForm({ onDone }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: user.fullName,
    email: user.email,
    phone: "",
    location: "",
    links: "",
    summary: "",
    skills: "",
    experience: [],
    education: [],
    projects: [],
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const bind = (key) => ({ value: form[key], onChange: (e) => set({ [key]: e.target.value }) });

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await api("/resumes/create", { method: "POST", body: buildResumePayload(form) });
      onDone(data.resume);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <input required maxLength={100} className={input} {...bind("name")} />
        </Field>
        <Field label="Email">
          <input type="email" className={input} {...bind("email")} />
        </Field>
        <Field label="Phone">
          <input className={input} {...bind("phone")} />
        </Field>
        <Field label="Location">
          <input className={input} {...bind("location")} />
        </Field>
      </div>
      <Field label="Links" hint="Optional. Separate with commas, e.g. your GitHub or portfolio.">
        <input className={input} {...bind("links")} />
      </Field>
      <Field label="Summary">
        <textarea rows={3} maxLength={2000} className={input} {...bind("summary")} />
      </Field>
      <Field label="Skills" hint="Separate with commas.">
        <textarea rows={2} className={input} {...bind("skills")} />
      </Field>

      <Repeatable
        title="Experience"
        items={form.experience}
        blank={{ role: "", company: "", dates: "", bullets: "" }}
        addLabel="Add experience"
        onChange={(experience) => set({ experience })}
        render={(item, up) => (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Role">
                <input className={input} value={item.role} onChange={(e) => up({ role: e.target.value })} />
              </Field>
              <Field label="Company">
                <input className={input} value={item.company} onChange={(e) => up({ company: e.target.value })} />
              </Field>
              <Field label="Dates">
                <input className={input} value={item.dates} onChange={(e) => up({ dates: e.target.value })} />
              </Field>
            </div>
            <Field label="Achievements" hint="One per line.">
              <textarea rows={3} className={input} value={item.bullets} onChange={(e) => up({ bullets: e.target.value })} />
            </Field>
          </>
        )}
      />

      <Repeatable
        title="Education"
        items={form.education}
        blank={{ institution: "", degree: "", dates: "" }}
        addLabel="Add education"
        onChange={(education) => set({ education })}
        render={(item, up) => (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Institution">
              <input className={input} value={item.institution} onChange={(e) => up({ institution: e.target.value })} />
            </Field>
            <Field label="Degree">
              <input className={input} value={item.degree} onChange={(e) => up({ degree: e.target.value })} />
            </Field>
            <Field label="Dates">
              <input className={input} value={item.dates} onChange={(e) => up({ dates: e.target.value })} />
            </Field>
          </div>
        )}
      />

      <Repeatable
        title="Projects"
        items={form.projects}
        blank={{ name: "", description: "" }}
        addLabel="Add project"
        onChange={(projects) => set({ projects })}
        render={(item, up) => (
          <>
            <Field label="Name">
              <input className={input} value={item.name} onChange={(e) => up({ name: e.target.value })} />
            </Field>
            <Field label="Description">
              <textarea rows={2} className={input} value={item.description} onChange={(e) => up({ description: e.target.value })} />
            </Field>
          </>
        )}
      />

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Save resume"}
      </button>
    </form>
  );
}
