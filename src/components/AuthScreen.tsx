import { useState, type FormEvent } from "react";
import { registerWithEmail, signInWithEmail } from "../firebase/config";

export function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signin") await signInWithEmail(email.trim(), password);
      else await registerWithEmail(email.trim(), password);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="font-display text-xl font-semibold text-slate-900">Team CRM</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in with your team email to load live data.</p>

        <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-slate-100/90 p-0.5">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              mode === "signin" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              mode === "register" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-base mt-1 w-full py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Password
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-base mt-1 w-full py-2 text-sm"
            />
          </label>
          {message && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{message}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-dim disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
