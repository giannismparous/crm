import { useState, type FormEvent } from "react";
import { useT } from "../contexts/I18nContext";
import { AppBrand } from "./AppBrand";
import { signInWithTeamAccess } from "../firebase/authSession";
import { formatAuthError } from "../firebase/authErrors";
import {
  normalizeSeedCode,
  validateRegistrationCredentials,
  validateSignInCredentials,
} from "../firebase/authValidation";
import { registerWithSeed } from "../firebase/registerWithSeed";

export function AuthScreen() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [seedCode, setSeedCode] = useState("");
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: "signin" | "register") {
    setMode(next);
    setMessage(null);
    if (next === "signin") setSeedCode("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signin") {
        const creds = validateSignInCredentials(email, password);
        await signInWithTeamAccess(creds.email, creds.password);
      } else {
        const creds = validateRegistrationCredentials(email, password, seedCode);
        await registerWithSeed(creds.email, creds.password, creds.seedCode);
      }
    } catch (err) {
      setMessage(formatAuthError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1>
          <AppBrand size="auth" />
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "signin" ? t("auth.signInSubtitle") : t("auth.registerSubtitle")}
        </p>

        <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-slate-100/90 p-0.5">
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              mode === "signin" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600"
            }`}
          >
            {t("auth.signIn")}
          </button>
          <button
            type="button"
            onClick={() => switchMode("register")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              mode === "register" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600"
            }`}
          >
            {t("auth.register")}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3" noValidate>
          {mode === "register" && (
            <label className="block text-xs font-medium text-slate-600">
              {t("auth.registrationSeed")}
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                value={seedCode}
                onChange={(e) => setSeedCode(normalizeSeedCode(e.target.value))}
                placeholder={t("auth.seedPlaceholder")}
                className="input-base mt-1 w-full py-2 font-mono text-sm"
                disabled={busy}
              />
            </label>
          )}
          <label className="block text-xs font-medium text-slate-600">
            {t("common.email")}
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-base mt-1 w-full py-2 text-sm"
              disabled={busy}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            {t("auth.password")}
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-base mt-1 w-full py-2 text-sm"
              disabled={busy}
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
            {busy ? t("common.pleaseWait") : mode === "signin" ? t("auth.signIn") : t("auth.createAccount")}
          </button>
        </form>
      </div>
    </div>
  );
}
