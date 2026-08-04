/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#081426",
          900: "#10233f",
          800: "#183555",
          700: "#294b69"
        },
        slate: {
          925: "#182331"
        },
        emeraldMuted: {
          50: "#edf8f1",
          100: "#d9efe2",
          500: "#45a173",
          600: "#2f825a",
          700: "#215f43"
        },
        amberReview: {
          50: "#fff8e8",
          200: "#ecd49a",
          700: "#855f18"
        },
        redBlocked: {
          50: "#fff1f1",
          200: "#efc5c5",
          700: "#9b3838"
        },
        canvas: "#fbfaf6"
      },
      boxShadow: {
        panel: "0 12px 32px rgba(16,35,63,.07)",
        lift: "0 26px 70px rgba(8,20,38,.14)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
      }
    }
  },
  plugins: []
};
