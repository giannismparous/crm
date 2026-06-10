import { useCallback, useEffect, useState } from "react";
import { Calendar, Loader2, Unlink } from "lucide-react";
import {
  disconnectGoogleCalendar,
  fetchGoogleCalendarStatus,
  startGoogleCalendarConnect,
  syncGoogleCalendarNow,
  updateGoogleCalendarSyncOptions,
  type GoogleCalendarStatus,
} from "../firebase/googleCalendar";

export function GoogleCalendarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22 12c0-.6-.1-1.2-.2-1.8H12v3.4h5.6c-.2 1.2-1 2.2-2.1 2.9v2.4h3.4c2-1.8 3.1-4.5 3.1-7.9z" />
      <path fill="#34A853" d="M12 23c2.8 0 5.2-.9 6.9-2.5l-3.4-2.4c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.1v2.5C3.8 20.4 7.6 23 12 23z" />
      <path fill="#FBBC05" d="M6.2 14.8c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8V8.7H2.1C1.4 10.2 1 11.9 1 13s.4 2.8 1.1 4.3l3.1-2.5z" />
      <path fill="#EA4335" d="M12 5.6c1.5 0 2.8.5 3.9 1.5l2.9-2.9C17.2 2.4 14.8 1 12 1 7.6 1 3.8 3.6 2.1 7.7l4.1 3.2C7 8.2 9.3 5.6 12 5.6z" />
    </svg>
  );
}

export function GoogleCalendarIntegration({
  active,
  oauthMessage,
}: {
  active: boolean;
  oauthMessage?: { text: string; error: boolean } | null;
}) {
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await fetchGoogleCalendarStatus());
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Could not load Google Calendar status.",
        error: true,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    setMessage(oauthMessage ?? null);
    void refresh();
  }, [active, oauthMessage, refresh]);

  async function handleConnect() {
    setBusy(true);
    setMessage(null);
    try {
      const authUrl = await startGoogleCalendarConnect();
      window.location.href = authUrl;
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Could not start Google sign-in.",
        error: true,
      });
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    const ok = window.confirm(
      "Disconnect Google Calendar?\n\nSync will stop and your CRM events will no longer update in Google Calendar. You can connect again anytime."
    );
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    try {
      await disconnectGoogleCalendar();
      await refresh();
      setMessage({ text: "Google Calendar disconnected.", error: false });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Could not disconnect.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncNow() {
    setBusy(true);
    setMessage(null);
    try {
      const count = await syncGoogleCalendarNow();
      await refresh();
      setMessage({
        text: `Synced ${count} upcoming item${count === 1 ? "" : "s"} to Google Calendar. Past and completed items were removed.`,
        error: false,
      });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Sync failed.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  async function toggleOption(
    key: "syncTasks" | "syncAppointments" | "syncReminders",
    value: boolean
  ) {
    if (!status?.connected) return;
    const next = {
      syncTasks: status.syncTasks,
      syncAppointments: status.syncAppointments,
      syncReminders: status.syncReminders,
      [key]: value,
    };
    setBusy(true);
    try {
      setStatus(await updateGoogleCalendarSyncOptions(next));
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Could not update sync options.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(status?.connected);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <GoogleCalendarIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">Google Calendar</p>
            {!loading && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  connected
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {connected ? "Connected" : "Not connected"}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
            {connected && status?.googleEmail ? (
              <>
                Linked as <span className="font-medium text-slate-700">{status.googleEmail}</span>. One-way sync to
                your <strong>SimasiaAI CRM</strong> calendar — upcoming items from today onward, updated automatically
                when you change tasks, meetings, or reminders in the CRM.
              </>
            ) : (
              <>
                Connect to sync tasks, meetings, and reminders from today onward to a separate{" "}
                <strong>SimasiaAI CRM</strong> calendar.
              </>
            )}
          </p>
        </div>
        {connected && !loading && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleDisconnect()}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
            Disconnect
          </button>
        )}
      </div>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
        Deleting or editing events in Google Calendar does <strong>not</strong> change the CRM. Manage items here —
        Google Calendar is a read-only view.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : connected && status ? (
        <>
          {status.lastSyncAt && (
            <p className="text-[10px] text-slate-500">
              Last sync: {new Date(status.lastSyncAt).toLocaleString()}
            </p>
          )}

          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Sync</p>
            {(
              [
                ["syncTasks", "Tasks (due dates)"],
                ["syncAppointments", "Appointments & meetings"],
                ["syncReminders", "Personal reminders"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 text-xs text-slate-700">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={status[key]}
                  disabled={busy}
                  onChange={(e) => void toggleOption(key, e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSyncNow()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
            Sync now
          </button>

          {status.lastError && <p className="text-[10px] text-amber-700">Last error: {status.lastError}</p>}
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleConnect()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleCalendarIcon className="h-4 w-4" />}
          Connect Google Calendar
        </button>
      )}

      {message && (
        <p
          className={`rounded-lg border px-3 py-2 text-xs ${
            message.error
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
          role={message.error ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
