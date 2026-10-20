import { useState } from "react";

const inputClass = "mt-1 w-full rounded border border-slate-300 px-3 py-2";

/** Shared form shell for Login and Signup. `onSubmit` receives the field values. */
export default function AuthForm({ title, submitLabel, showName = false, onSubmit, footer }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onSubmit({ fullName, email, password });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto mt-24 max-w-sm rounded-lg bg-white p-8 shadow">
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {showName && (
          <label className="block text-sm">
            Full name
            <input
              required
              maxLength={100}
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
            />
          </label>
        )}
        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            required
            minLength={showName ? 10 : undefined}
            autoComplete={showName ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          {showName && <span className="text-xs text-slate-500">At least 10 characters.</span>}
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-indigo-600 py-2 text-white disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-600">{footer}</p>
    </main>
  );
}
