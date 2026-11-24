/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/context/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        spa: {
          gold: "#d4af37",
          "gold-glow": "rgba(212, 175, 55, 0.15)",
          teal: "#14b8a6",
          "teal-glow": "rgba(20, 184, 166, 0.15)",
          dark: "#0c101f",
          deep: "#070a13",
          card: "rgba(20, 27, 48, 0.45)",
          "card-hover": "rgba(29, 39, 68, 0.6)",
        }
      },
      fontFamily: {
        display: ["var(--font-display)", "Outfit", "Sarabun", "sans-serif"],
        body: ["var(--font-body)", "Inter", "Sarabun", "sans-serif"],
      }
    },
  },
  plugins: [],
}
