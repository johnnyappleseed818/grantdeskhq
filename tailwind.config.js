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
          50: "#eff6f2",
          100: "#ddebe2",
          500: "#5d806b",
          600: "#486b57",
          700: "#355442"
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
        canvas: "#f5f6f2"
      },
      boxShadow: {
        panel: "0 14px 35px rgba(16,35,63,.08)",
        lift: "0 24px 60px rgba(8,20,38,.13)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
      }
    }
  },
  plugins: []
};
