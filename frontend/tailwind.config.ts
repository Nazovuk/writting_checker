import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f7f4ef",
        ink: "#1c2428",
        accent: "#e07a4f",
        panel: "#fffaf2",
        cool: "#2a9d8f",
        warn: "#d1495b",
        minor: "#f4a261"
      },
      boxShadow: {
        soft: "0 10px 35px rgba(28,36,40,0.08)"
      }
    }
  },
  plugins: []
};

export default config;
