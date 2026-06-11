export function AppBrand({ size = "nav" }: { size?: "nav" | "auth" }) {
  const isAuth = size === "auth";
  return (
    <span
      className={`inline-flex items-baseline gap-1 font-display leading-none ${
        isAuth ? "text-xl" : "text-sm sm:text-base"
      }`}
    >
      <span className="font-bold tracking-tight text-slate-900">
        Simasia<span className="text-accent">AI</span>
      </span>
      <span className="hidden items-baseline gap-1 min-[400px]:inline-flex">
        <span className="font-normal text-slate-300" aria-hidden>
          ·
        </span>
        <span className={`font-semibold text-slate-600 ${isAuth ? "" : "text-xs sm:text-sm"}`}>CRM</span>
      </span>
    </span>
  );
}
