import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { subscribeActionFeedback } from "../utils/actionFeedback";

export function ActionFeedbackBanner() {
  const [banner, setBanner] = useState<{ text: string; kind: "error" | "warning" } | null>(null);

  useEffect(() => {
    return subscribeActionFeedback((text, kind) => {
      setBanner({ text, kind });
    });
  }, []);

  if (!banner) return null;

  const isError = banner.kind === "error";

  return (
    <div
      className={`fixed bottom-4 left-1/2 z-[200] flex max-w-md -translate-x-1/2 items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg ${
        isError
          ? "border-rose-200 bg-rose-50 text-rose-900"
          : "border-amber-200 bg-amber-50 text-amber-950"
      }`}
      role="alert"
    >
      <p className="min-w-0 flex-1 leading-snug">{banner.text}</p>
      <button
        type="button"
        onClick={() => setBanner(null)}
        className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
