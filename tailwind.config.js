/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        display: ["Instrument Sans", "system-ui", "sans-serif"],
      },
      colors: {
        surface: {
          50: "#fafbfc",
          100: "#f4f6f8",
          200: "#e8ecf1",
          300: "#cfd8e3",
          400: "#94a3b8",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
        accent: {
          DEFAULT: "#4f46e5",
          dim: "#4338ca",
          glow: "#6366f1",
        },
        mint: "#059669",
        coral: "#e11d48",
        amber: "#d97706",
      },
      boxShadow: {
        glass: "0 1px 3px rgba(15, 23, 42, 0.06), 0 8px 24px -4px rgba(15, 23, 42, 0.08)",
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px -2px rgba(15, 23, 42, 0.06)",
        glow: "0 2px 12px -2px rgba(79, 70, 229, 0.25)",
      },
      backgroundImage: {
        "mesh-gradient":
          "radial-gradient(at 20% 0%, rgba(79, 70, 229, 0.06) 0px, transparent 45%), radial-gradient(at 90% 10%, rgba(5, 150, 105, 0.05) 0px, transparent 40%), radial-gradient(at 0% 80%, rgba(225, 29, 72, 0.04) 0px, transparent 45%)",
      },
    },
  },
  plugins: [],
};
