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

function GoogleCalendarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22 12c0-.6-.1-1.2-.2-1.8H12v3.4h5.6c-.2 1.2-1 2.2-2.1 2.9v2.4h3.4c2-1.8 3.1-4.5 3.1-7.9z" />
      <path fill="#34A853" d="M12 23c2.8 0 5.2-.9 6.9-2.5l-3.4-2.4c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.1v2.5C3.8 20.4 7.6 23 12 23z" />
      <path fill="#FBBC05" d="M6.2 14.8c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8V8.7H2.1C1.4 10.2 1 11.9 1 13s.4 2.8 1.1 4.3l3.1-2.5z" />
      <path fill="#EA4335" d="M12 5.6c1.5 0 2.8.5 3.9 1.5l2.9-2.9C17.2 2.4 14.8 1 12 1 7.6 1 3.8 3.6 2.1 7.7l4.1 3.2C7 8.2 9.3 5.6 12 5.6z" />
    </svg>
  );
}

export function GoogleCalendarModal({
  open,
  onClose,
  oauthMessage,
}: {
  open: boolean;
  onClose: () => void;
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
    if (!open) return;
    setMessage(oauthMessage ?? null);
    void refresh();
  }, [open, oauthMessage, refresh]);

  if (!open) return null;

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
      setMessage({ text: `Synced ${count} item${count === 1 ? "" : "s"} to Google Calendar.`, error: false });
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

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <GoogleCalendarIcon />
            <h2 className="text-sm font-semibold text-slate-800">Google Calendar</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <p className="text-xs leading-relaxed text-slate-600">
            One-way sync: CRM → Google Calendar only. Items you can see sync to a separate{" "}
            <strong>SimasiaAI CRM</strong> calendar (toggle it on/off in Google Calendar).
          </p>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
            Deleting or editing events in Google Calendar does <strong>not</strong> change the CRM.
            Manage tasks, meetings, and reminders in the CRM — Google Calendar is a read-only view.
            If you delete an event in Google, it reappears on the next CRM update or Sync now.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading…
            </div>
          ) : status?.connected ? (
            <>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                Connected{status.googleEmail ? ` as ${status.googleEmail}` : ""}.
                {status.lastSyncAt && (
                  <span className="block text-[10px] text-emerald-800/80">
                    Last sync: {new Date(status.lastSyncAt).toLocaleString()}
                  </span>
                )}
              </div>

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

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSyncNow()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
                  Sync now
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDisconnect()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Unlink className="h-3.5 w-3.5" />
                  Disconnect
                </button>
              </div>

              {status.lastError && (
                <p className="text-[10px] text-amber-700">Last error: {status.lastError}</p>
              )}
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
      </div>
    </div>
  );
}
