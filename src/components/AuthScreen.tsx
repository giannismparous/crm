import { useState, type FormEvent } from "react";
import { signInWithEmail } from "../firebase/config";
import { ensureUserProfile } from "../firebase/ensureUserProfile";
import { registerWithSeed } from "../firebase/registerWithSeed";

export function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [seedCode, setSeedCode] = useState("");
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signin") {
        const cred = await signInWithEmail(email.trim(), password);
        await ensureUserProfile(cred.user);
      } else {
        await registerWithSeed(email.trim(), password, seedCode);
      }
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
        <p className="mt-1 text-sm text-slate-500">
          {mode === "signin"
            ? "Sign in with your team email to load live data."
            : "Create an account with a one-time seed from your team admin."}
        </p>

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
          {mode === "register" && (
            <label className="block text-xs font-medium text-slate-600">
              Registration seed
              <input
                type="text"
                autoComplete="off"
                required
                spellCheck={false}
                value={seedCode}
                onChange={(e) => setSeedCode(e.target.value)}
                placeholder="Paste one-time code"
                className="input-base mt-1 w-full py-2 font-mono text-sm"
              />
            </label>
          )}
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
